-- COMPREHENSIVE BACKFILL SCRIPT FOR PAYMENT COMPONENTS AND DEPOSIT APPLICATIONS
-- This script populates the payment_components table with historical data
-- and creates proper deposit application records for existing final bills

-- PART 1: Backfill payment_components for existing regular payments
-- This uses the priority-based allocation algorithm from the documentation

WITH payment_bills AS (
  SELECT 
    p.id AS payment_id,
    p.bill_id,
    p.amount AS payment_amount,
    b.monthly_rent_amount,
    b.electricity_amount,
    b.water_amount,
    b.extra_fee,
    b.penalty_amount
  FROM public.payments p
  JOIN public.bills b ON p.bill_id = b.id
  WHERE NOT EXISTS (
    SELECT 1 FROM public.payment_components pc WHERE pc.payment_id = p.id
  )
  AND p.payment_method != 'deposit_application' -- Don't process deposit applications yet
)
INSERT INTO public.payment_components (payment_id, bill_id, component_type, amount)
SELECT
  pb.payment_id,
  pb.bill_id,
  component_type,
  CASE
    -- Priority-based allocation: penalty > extra_fee > electricity > water > rent
    WHEN component_type = 'penalty' THEN 
      LEAST(pb.payment_amount, pb.penalty_amount)
    WHEN component_type = 'extra_fee' THEN 
      LEAST(
        GREATEST(pb.payment_amount - LEAST(pb.penalty_amount, pb.payment_amount), 0),
        pb.extra_fee
      )
    WHEN component_type = 'electricity' THEN 
      LEAST(
        GREATEST(pb.payment_amount - LEAST(pb.penalty_amount + pb.extra_fee, pb.payment_amount), 0),
        pb.electricity_amount
      )
    WHEN component_type = 'water' THEN 
      LEAST(
        GREATEST(pb.payment_amount - LEAST(pb.penalty_amount + pb.extra_fee + pb.electricity_amount, pb.payment_amount), 0),
        pb.water_amount
      )
    WHEN component_type = 'rent' THEN 
      GREATEST(pb.payment_amount - LEAST(pb.penalty_amount + pb.extra_fee + pb.electricity_amount + pb.water_amount, pb.payment_amount), 0)
  END AS amount
FROM payment_bills pb
CROSS JOIN (
  VALUES 
    ('penalty'),
    ('extra_fee'),
    ('electricity'),
    ('water'),
    ('rent')
) AS components(component_type)
WHERE 
  CASE
    WHEN component_type = 'penalty' THEN 
      LEAST(pb.payment_amount, pb.penalty_amount) > 0
    WHEN component_type = 'extra_fee' THEN 
      LEAST(
        GREATEST(pb.payment_amount - LEAST(pb.penalty_amount, pb.payment_amount), 0),
        pb.extra_fee
      ) > 0
    WHEN component_type = 'electricity' THEN 
      LEAST(
        GREATEST(pb.payment_amount - LEAST(pb.penalty_amount + pb.extra_fee, pb.payment_amount), 0),
        pb.electricity_amount
      ) > 0
    WHEN component_type = 'water' THEN 
      LEAST(
        GREATEST(pb.payment_amount - LEAST(pb.penalty_amount + pb.extra_fee + pb.electricity_amount, pb.payment_amount), 0),
        pb.water_amount
      ) > 0
    WHEN component_type = 'rent' THEN 
      GREATEST(pb.payment_amount - LEAST(pb.penalty_amount + pb.extra_fee + pb.electricity_amount + pb.water_amount, pb.payment_amount), 0) > 0
  END;

-- PART 2: Handle existing final bills and create deposit application records
-- This creates the missing payment and payment_component records for deposit applications

WITH 
  -- Step 1: Identify final bills that need deposit application records
  final_bills_to_process AS (
    SELECT
      b.id AS bill_id,
      b.tenant_id,
      b.total_amount_due AS final_bill_total,
      -- Calculate total charges before deposits (reverse engineer from current state)
      (b.total_amount_due + COALESCE(b.advance_payment, 0) + COALESCE(b.security_deposit, 0)) AS total_charges,
      t.rent_start_date,
      COALESCE(b.advance_payment, t.advance_payment) AS original_advance_payment,
      COALESCE(b.security_deposit, t.security_deposit) AS original_security_deposit,
      t.move_out_date
    FROM public.bills b
    JOIN public.tenants t ON b.tenant_id = t.id
    WHERE b.is_final_bill = TRUE
      -- Only process bills that don't already have a deposit_application payment
      AND NOT EXISTS (
        SELECT 1
        FROM public.payments p
        WHERE p.bill_id = b.id AND p.payment_method = 'deposit_application'
      )
  ),
  -- Step 2: Calculate fully paid bill counts for each tenant
  tenant_bill_counts AS (
    SELECT
      tenant_id,
      COUNT(id) AS fully_paid_bill_count
    FROM public.bills
    WHERE status = 'fully_paid' AND is_final_bill = FALSE
    GROUP BY tenant_id
  ),
  -- Step 3: Apply business logic for deposit rules
  deposit_logic_applied AS (
    SELECT
      fb.bill_id,
      fb.tenant_id,
      fb.total_charges,
      fb.original_advance_payment,
      fb.original_security_deposit,
      fb.move_out_date,
      COALESCE(tbc.fully_paid_bill_count, 0) AS fully_paid_bill_count,
      -- Apply deposit rules based on fully paid bill count
      CASE
        WHEN COALESCE(tbc.fully_paid_bill_count, 0) >= 5 THEN
          LEAST(fb.total_charges, fb.original_advance_payment)
        ELSE
          LEAST(fb.total_charges, fb.original_advance_payment)
      END AS calculated_applied_advance,
      CASE
        WHEN COALESCE(tbc.fully_paid_bill_count, 0) >= 5 THEN
          LEAST(GREATEST(0, fb.total_charges - fb.original_advance_payment), fb.original_security_deposit)
        ELSE 0 -- Security deposit not available for tenants with < 5 fully paid bills
      END AS calculated_applied_security,
      CASE
        WHEN COALESCE(tbc.fully_paid_bill_count, 0) >= 5 THEN 0
        ELSE fb.original_security_deposit -- Security deposit forfeited
      END AS calculated_forfeited_amount
    FROM final_bills_to_process fb
    LEFT JOIN tenant_bill_counts tbc ON fb.tenant_id = tbc.tenant_id
  ),
  -- Step 4: Update final bills with calculated deposit values
  updated_bills AS (
    UPDATE public.bills b
    SET
      applied_advance_payment = dla.calculated_applied_advance,
      applied_security_deposit = dla.calculated_applied_security,
      forfeited_amount = dla.calculated_forfeited_amount,
      refund_amount = GREATEST(0, -(b.total_amount_due))
    FROM deposit_logic_applied dla
    WHERE b.id = dla.bill_id
    RETURNING b.id AS bill_id
  ),
  -- Step 5: Create deposit_application payment records
  inserted_payments AS (
    INSERT INTO public.payments (bill_id, tenant_id, amount, payment_date, payment_method, notes)
    SELECT
      dla.bill_id,
      dla.tenant_id,
      (dla.calculated_applied_advance + dla.calculated_applied_security) AS total_applied,
      COALESCE(dla.move_out_date, CURRENT_DATE),
      'deposit_application' AS payment_method,
      'Backfilled: Automated application of tenant deposits on move-out.' AS notes
    FROM deposit_logic_applied dla
    WHERE (dla.calculated_applied_advance + dla.calculated_applied_security) > 0
    RETURNING id AS payment_id, bill_id, amount
  ),
  -- Step 6a: Prepare component allocation data for deposit applications
  payment_allocations AS (
    SELECT
      ip.payment_id,
      ip.bill_id,
      ip.amount AS payment_amount,
      b.penalty_amount,
      b.extra_fee,
      b.electricity_amount,
      b.water_amount,
      b.monthly_rent_amount,
      -- Calculate penalty allocation
      LEAST(ip.amount, COALESCE(b.penalty_amount, 0)) AS penalty_allocation,
      -- Calculate extra fee allocation
      LEAST(
        GREATEST(0, ip.amount - COALESCE(b.penalty_amount, 0)),
        COALESCE(b.extra_fee, 0)
      ) AS extra_fee_allocation,
      -- Calculate electricity allocation
      LEAST(
        GREATEST(0, ip.amount - COALESCE(b.penalty_amount, 0) - COALESCE(b.extra_fee, 0)),
        COALESCE(b.electricity_amount, 0)
      ) AS electricity_allocation,
      -- Calculate water allocation
      LEAST(
        GREATEST(0, ip.amount - COALESCE(b.penalty_amount, 0) - COALESCE(b.extra_fee, 0) - COALESCE(b.electricity_amount, 0)),
        COALESCE(b.water_amount, 0)
      ) AS water_allocation,
      -- Calculate rent allocation (remaining amount)
      GREATEST(0, ip.amount - COALESCE(b.penalty_amount, 0) - COALESCE(b.extra_fee, 0) - COALESCE(b.electricity_amount, 0) - COALESCE(b.water_amount, 0)) AS rent_allocation
    FROM inserted_payments ip
    JOIN public.bills b ON ip.bill_id = b.id
  )
-- Step 6b: Create payment_components for the deposit application payments
INSERT INTO public.payment_components (payment_id, bill_id, component_type, amount)
SELECT payment_id, bill_id, 'penalty', penalty_allocation
FROM payment_allocations
WHERE penalty_allocation > 0

UNION ALL

SELECT payment_id, bill_id, 'extra_fee', extra_fee_allocation
FROM payment_allocations
WHERE extra_fee_allocation > 0

UNION ALL

SELECT payment_id, bill_id, 'electricity', electricity_allocation
FROM payment_allocations
WHERE electricity_allocation > 0

UNION ALL

SELECT payment_id, bill_id, 'water', water_allocation
FROM payment_allocations
WHERE water_allocation > 0

UNION ALL

SELECT payment_id, bill_id, 'rent', rent_allocation
FROM payment_allocations
WHERE rent_allocation > 0; 
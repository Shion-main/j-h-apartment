-- Add deposit fields to bills table for final bill calculations
-- These fields will store the deposit amounts at the time of bill generation
-- This ensures final bills have the correct deposit amounts even if tenant deposits change later

ALTER TABLE public.bills 
ADD COLUMN IF NOT EXISTS advance_payment numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS security_deposit numeric DEFAULT 0;

-- Add comment for clarity
COMMENT ON COLUMN public.bills.advance_payment IS 'Advance payment amount at time of bill generation (for final bills)';
COMMENT ON COLUMN public.bills.security_deposit IS 'Security deposit amount at time of bill generation (for final bills)';

-- Update existing final bills to have deposit amounts from tenant records
UPDATE public.bills 
SET 
    advance_payment = t.advance_payment,
    security_deposit = t.security_deposit
FROM public.tenants t
WHERE bills.tenant_id = t.id 
AND bills.is_final_bill = true 
AND (bills.advance_payment IS NULL OR bills.advance_payment = 0); 
-- Add columns to track deposit usage and settlement details for final bills
-- These columns provide a complete audit trail of how deposits are handled during move-out

ALTER TABLE public.bills
ADD COLUMN IF NOT EXISTS applied_advance_payment NUMERIC(10,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS applied_security_deposit NUMERIC(10,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS forfeited_amount NUMERIC(10,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS refund_amount NUMERIC(10,2) DEFAULT 0;

-- Add comments for clarity
COMMENT ON COLUMN public.bills.applied_advance_payment IS 'Amount of the advance payment deposit applied to the final bill';
COMMENT ON COLUMN public.bills.applied_security_deposit IS 'Amount of the security deposit applied to the final bill';
COMMENT ON COLUMN public.bills.forfeited_amount IS 'Amount of the security deposit forfeited by the tenant';
COMMENT ON COLUMN public.bills.refund_amount IS 'Amount refunded to the tenant after all charges and deposits are settled';

-- Add constraint to ensure deposit tracking values are non-negative
ALTER TABLE public.bills ADD CONSTRAINT check_applied_advance_payment CHECK (applied_advance_payment >= 0);
ALTER TABLE public.bills ADD CONSTRAINT check_applied_security_deposit CHECK (applied_security_deposit >= 0);
ALTER TABLE public.bills ADD CONSTRAINT check_forfeited_amount CHECK (forfeited_amount >= 0);
ALTER TABLE public.bills ADD CONSTRAINT check_refund_amount CHECK (refund_amount >= 0); 
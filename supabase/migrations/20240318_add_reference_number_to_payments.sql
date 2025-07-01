-- Add reference_number column to payments table
-- This field is required for GCash payments and optional for cash payments

ALTER TABLE payments 
ADD COLUMN reference_number TEXT;

-- Add comment to document the field
COMMENT ON COLUMN payments.reference_number IS 'Reference number for GCash payments (required for GCash, optional for cash)';

-- Update RLS policies to include the new column
-- (The existing policies should work with the new column automatically) 
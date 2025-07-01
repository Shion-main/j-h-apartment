-- Create payment_components table for accurate payment allocation tracking
-- This table breaks down each payment into its component parts for precise reporting

CREATE TABLE IF NOT EXISTS public.payment_components (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  payment_id UUID NOT NULL REFERENCES public.payments(id) ON DELETE CASCADE,
  bill_id UUID NOT NULL REFERENCES public.bills(id) ON DELETE CASCADE,
  component_type TEXT NOT NULL CHECK (component_type IN ('rent', 'electricity', 'water', 'extra_fee', 'penalty')),
  amount NUMERIC(10,2) NOT NULL CHECK (amount >= 0),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_payment_components_payment_id ON public.payment_components(payment_id);
CREATE INDEX IF NOT EXISTS idx_payment_components_bill_id ON public.payment_components(bill_id);
CREATE INDEX IF NOT EXISTS idx_payment_components_component_type ON public.payment_components(component_type);

-- Helper function to check if user has admin/staff privileges
-- Updated to work with Supabase Auth and user_roles table
CREATE OR REPLACE FUNCTION public.is_admin_or_staff()
RETURNS BOOLEAN AS $$
BEGIN
  -- Check if user is authenticated
  IF auth.uid() IS NULL THEN
    RETURN FALSE;
  END IF;
  
  -- Check if user has admin/staff role in user_roles table
  RETURN EXISTS (
    SELECT 1 
    FROM public.user_roles ur
    JOIN public.roles r ON ur.role_id = r.id
    WHERE ur.user_id = auth.uid()
    AND r.role_name IN ('super_admin', 'admin', 'staff', 'accountant', 'branch_manager')
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Enable RLS
ALTER TABLE public.payment_components ENABLE ROW LEVEL SECURITY;

-- RLS Policies for payment_components
-- Allow all authenticated users to read payment components
CREATE POLICY "Enable read access for authenticated users" ON public.payment_components 
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- Allow authenticated users to insert payment components
-- (This is more permissive for now to avoid blocking legitimate operations)
CREATE POLICY "Enable insert for authenticated users" ON public.payment_components 
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- Allow authenticated users to update payment components
CREATE POLICY "Enable update for authenticated users" ON public.payment_components 
  FOR UPDATE USING (auth.uid() IS NOT NULL) 
  WITH CHECK (auth.uid() IS NOT NULL);

-- Allow authenticated users to delete payment components
CREATE POLICY "Enable delete for authenticated users" ON public.payment_components 
  FOR DELETE USING (auth.uid() IS NOT NULL);

-- Add comments for documentation
COMMENT ON TABLE public.payment_components IS 'Tracks how each payment is allocated across different billing components';
COMMENT ON COLUMN public.payment_components.component_type IS 'Type of billing component: rent, electricity, water, extra_fee, penalty';
COMMENT ON COLUMN public.payment_components.amount IS 'Amount of payment allocated to this component'; 
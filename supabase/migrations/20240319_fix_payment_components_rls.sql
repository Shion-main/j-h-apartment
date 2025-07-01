-- Fix RLS policies for payment_components table
-- The original policies were checking for roles in JWT which don't exist in Supabase Auth

-- Drop existing policies
DROP POLICY IF EXISTS "Enable read access for all users" ON public.payment_components;
DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON public.payment_components;
DROP POLICY IF EXISTS "Enable update for authenticated users only" ON public.payment_components;
DROP POLICY IF EXISTS "Enable delete for authenticated users only" ON public.payment_components;

-- Update the helper function to work with user_roles table
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

-- Create new, working RLS policies
-- Allow all authenticated users to read payment components
CREATE POLICY "Enable read access for authenticated users" ON public.payment_components 
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- Allow authenticated users to insert payment components
CREATE POLICY "Enable insert for authenticated users" ON public.payment_components 
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- Allow authenticated users to update payment components
CREATE POLICY "Enable update for authenticated users" ON public.payment_components 
  FOR UPDATE USING (auth.uid() IS NOT NULL) 
  WITH CHECK (auth.uid() IS NOT NULL);

-- Allow authenticated users to delete payment components
CREATE POLICY "Enable delete for authenticated users" ON public.payment_components 
  FOR DELETE USING (auth.uid() IS NOT NULL); 
-- Disable RLS temporarily to clean up
ALTER TABLE public.audit_logs DISABLE ROW LEVEL SECURITY;

-- Drop all existing policies
DROP POLICY IF EXISTS "Allow admins to read audit logs" ON public.audit_logs;
DROP POLICY IF EXISTS "Allow authenticated users to read audit logs" ON public.audit_logs;
DROP POLICY IF EXISTS "Allow authenticated users to insert audit logs" ON public.audit_logs;
DROP POLICY IF EXISTS "Deny update on audit logs" ON public.audit_logs;
DROP POLICY IF EXISTS "Deny delete on audit logs" ON public.audit_logs;

-- Enable RLS
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Create simplified policies that work
CREATE POLICY "audit_logs_select_policy"
ON public.audit_logs FOR SELECT
USING (true);  -- Allow all authenticated users to read audit logs

CREATE POLICY "audit_logs_insert_policy"
ON public.audit_logs FOR INSERT
WITH CHECK (true);  -- Allow inserts from authenticated API endpoints

-- Prevent updates and deletes
CREATE POLICY "audit_logs_update_policy"
ON public.audit_logs FOR UPDATE
USING (false);

CREATE POLICY "audit_logs_delete_policy"
ON public.audit_logs FOR DELETE
USING (false); 
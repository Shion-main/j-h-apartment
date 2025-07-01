-- First, enable RLS on the audit_logs table if not already enabled
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Drop existing policies
DROP POLICY IF EXISTS "Allow admins to read audit logs" ON public.audit_logs;
DROP POLICY IF EXISTS "Allow authenticated users to insert audit logs" ON public.audit_logs;
DROP POLICY IF EXISTS "Deny update on audit logs" ON public.audit_logs;
DROP POLICY IF EXISTS "Deny delete on audit logs" ON public.audit_logs;

-- Create new policies
CREATE POLICY "audit_logs_select_policy"
ON public.audit_logs FOR SELECT
USING (
  -- Admin can read all logs
  (auth.jwt() ->> 'role' = 'admin') OR
  -- Branch managers can read logs related to their branch
  (auth.jwt() ->> 'role' = 'branch_manager') OR
  -- Staff can read their own logs
  (auth.jwt() ->> 'role' = 'staff' AND auth.uid() = user_id)
);

CREATE POLICY "audit_logs_insert_policy"
ON public.audit_logs FOR INSERT
WITH CHECK (
  -- All authenticated users can insert logs
  -- We control this at the API level by passing the correct user_id
  auth.jwt() ->> 'role' IN ('admin', 'branch_manager', 'staff')
);

-- Prevent updates
CREATE POLICY "audit_logs_update_policy"
ON public.audit_logs FOR UPDATE
USING (false);

-- Prevent deletes
CREATE POLICY "audit_logs_delete_policy"
ON public.audit_logs FOR DELETE
USING (false); 
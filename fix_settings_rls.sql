-- Quick fix for system_settings RLS policy
-- Drop the existing admin-only policy and create a more permissive one

-- Drop existing policies
DROP POLICY IF EXISTS "Allow admins to manage system settings" ON public.system_settings;

-- Create new policy for all authenticated users
CREATE POLICY "Allow authenticated users to manage system settings"
ON public.system_settings FOR ALL
USING (auth.uid() IS NOT NULL)
WITH CHECK (auth.uid() IS NOT NULL);

-- Make room_number_prefix nullable in branches table
ALTER TABLE public.branches ALTER COLUMN room_number_prefix DROP NOT NULL;

-- RLS Policies for audit_logs
-- Enable RLS for the table first
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Policy: Allow any authenticated user to insert a new audit log
-- This is the key policy to allow logging from the application
CREATE POLICY "Allow authenticated users to create audit logs"
ON public.audit_logs FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL);

-- Policy: Allow all authenticated users to view all audit logs
CREATE POLICY "Allow authenticated users to view all audit logs"
ON public.audit_logs FOR SELECT
USING (auth.uid() IS NOT NULL);

-- Policy: Prevent deletion of audit logs to maintain history
-- This policy returns 'false', so no rows will ever match the condition for deletion.
CREATE POLICY "Disallow deletion of audit logs"
ON public.audit_logs FOR DELETE
USING (false);

-- Policy: Prevent updating of audit logs to ensure immutability
CREATE POLICY "Disallow updating of audit logs"
ON public.audit_logs FOR UPDATE
USING (false);

-- Fix Foreign Key for audit_logs to profiles relationship

-- 1. Drop the existing foreign key constraint that points to auth.users
ALTER TABLE public.audit_logs
DROP CONSTRAINT IF EXISTS audit_logs_user_id_fkey;

-- 2. Add the correct foreign key constraint pointing to public.profiles
-- This tells Supabase how to join audit_logs with profiles.
ALTER TABLE public.audit_logs
ADD CONSTRAINT audit_logs_user_id_fkey
FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE SET NULL;

-- Create billing_reminders table to track daily reminder emails
-- This ensures we send exactly 3 consecutive daily reminders (3, 2, 1 days before cycle end)

CREATE TABLE IF NOT EXISTS billing_reminders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  billing_cycle_end_date DATE NOT NULL,
  reminder_day INTEGER NOT NULL CHECK (reminder_day IN (3, 2, 1)), -- 3 days before, 2 days before, 1 day before
  sent_date DATE NOT NULL DEFAULT CURRENT_DATE,
  email_sent_to TEXT[] NOT NULL, -- Array of admin email addresses that received the reminder
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()) NOT NULL,
  
  -- Ensure we don't send duplicate reminders for the same tenant, cycle, and day
  UNIQUE (tenant_id, billing_cycle_end_date, reminder_day)
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_billing_reminders_tenant_id ON billing_reminders(tenant_id);
CREATE INDEX IF NOT EXISTS idx_billing_reminders_cycle_end_date ON billing_reminders(billing_cycle_end_date);
CREATE INDEX IF NOT EXISTS idx_billing_reminders_reminder_day ON billing_reminders(reminder_day);
CREATE INDEX IF NOT EXISTS idx_billing_reminders_sent_date ON billing_reminders(sent_date);

-- Add RLS policies
ALTER TABLE billing_reminders ENABLE ROW LEVEL SECURITY;

-- Allow admins to view all reminder logs
CREATE POLICY "Admins can view all billing reminders" ON billing_reminders
  FOR ALL USING (
    auth.jwt() ->> 'role' = 'admin' OR 
    auth.jwt() ->> 'role' = 'super_admin'
  );

-- Allow system service to insert reminder logs
CREATE POLICY "System can insert billing reminders" ON billing_reminders
  FOR INSERT WITH CHECK (true);

-- Add comments for documentation
COMMENT ON TABLE billing_reminders IS 'Tracks daily billing reminder emails sent to admins for tenants requiring bill generation';
COMMENT ON COLUMN billing_reminders.reminder_day IS 'Number of days before billing cycle end (3, 2, or 1)';
COMMENT ON COLUMN billing_reminders.email_sent_to IS 'Array of admin email addresses that received this reminder';
COMMENT ON COLUMN billing_reminders.billing_cycle_end_date IS 'The billing cycle end date that this reminder is for'; 
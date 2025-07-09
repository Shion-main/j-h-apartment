# Automated Daily Billing Reminders Setup Guide

## Overview

The J&H Management System now includes an automated daily billing reminder system that sends emails to administrators for **3 consecutive days** before each tenant's billing cycle ends.

### Key Features

- **3-Day Consecutive Reminders**: Sends emails exactly 3, 2, and 1 days before billing cycle end
- **Duplicate Prevention**: Tracks sent reminders to prevent duplicate emails
- **Urgency Levels**: Different email styles for each reminder day
  - 📅 Day 3: Blue "NOTICE" - Advance warning
  - ⚠️ Day 2: Orange "IMPORTANT" - Preparation reminder  
  - 🚨 Day 1: Red "URGENT" - Final reminder
- **Comprehensive Tracking**: Database logs of all sent reminders
- **Admin-Specific**: Only admins receive these automated reminders

## Database Schema

The system uses a new `billing_reminders` table to track sent emails:

```sql
-- Already created in migration: 20240320_create_billing_reminders_table.sql
CREATE TABLE billing_reminders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  billing_cycle_end_date DATE NOT NULL,
  reminder_day INTEGER NOT NULL CHECK (reminder_day IN (3, 2, 1)),
  sent_date DATE NOT NULL DEFAULT CURRENT_DATE,
  email_sent_to TEXT[] NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()) NOT NULL,
  
  UNIQUE (tenant_id, billing_cycle_end_date, reminder_day)
);
```

## Environment Variables Required

Make sure these environment variables are set:

```bash
# SMTP Configuration
SMTP_HOST=your-smtp-host.com
SMTP_PORT=587
SMTP_USERNAME=your-email@domain.com
SMTP_PASSWORD=your-email-password

# Admin Email Addresses (reminders will be sent to these)
ADMIN_EMAIL_1=admin1@jh-management.com
ADMIN_EMAIL_2=admin2@jh-management.com
ADMIN_EMAIL_3=admin3@jh-management.com

# Email Branding
FROM_NAME="J&H Management"
FROM_EMAIL=noreply@jh-management.com
```

## API Endpoints

### 1. Manual Trigger (for testing)
```
GET/POST /api/admin/daily-reminders
```

### 2. Supabase Edge Function
```
POST https://your-project.supabase.co/functions/v1/daily-reminders
```

## Automated Scheduling Options

### Option 1: Vercel Cron (Recommended for Vercel deployments)

Create a Vercel Cron job by adding to your `vercel.json`:

```json
{
  "crons": [
    {
      "path": "/api/admin/daily-reminders",
      "schedule": "0 9 * * *"
    }
  ]
}
```

**Schedule**: Daily at 9:00 AM UTC (adjust timezone as needed)

### Option 2: GitHub Actions (Free option)

Create `.github/workflows/daily-reminders.yml`:

```yaml
name: Daily Billing Reminders

on:
  schedule:
    # Runs daily at 9:00 AM UTC (adjust for your timezone)
    - cron: '0 9 * * *'
  workflow_dispatch: # Allows manual triggering

jobs:
  send-reminders:
    runs-on: ubuntu-latest
    steps:
      - name: Trigger Daily Reminders
        run: |
          curl -X POST \
            -H "Authorization: Bearer ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}" \
            -H "Content-Type: application/json" \
            "${{ secrets.SUPABASE_URL }}/functions/v1/daily-reminders"
```

**Required GitHub Secrets**:
- `SUPABASE_URL`: Your Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY`: Your Supabase service role key

### Option 3: Supabase Edge Function with pg_cron

If your Supabase instance supports pg_cron, you can schedule directly in the database:

```sql
-- Schedule daily reminders at 9:00 AM UTC
SELECT cron.schedule(
  'daily-billing-reminders',
  '0 9 * * *',
  $$
    SELECT net.http_post(
      url := 'https://your-project.supabase.co/functions/v1/daily-reminders',
      headers := '{"Authorization": "Bearer your-service-role-key", "Content-Type": "application/json"}',
      body := '{}'
    );
  $$
);
```

### Option 4: External Cron Service

Use services like:
- **Cronhub.io** (free tier available)
- **Cron-job.org** (free)
- **UptimeRobot** (monitors + cron)

**Setup**:
1. Register for the service
2. Create a new cron job
3. Set URL: `https://your-domain.com/api/admin/daily-reminders`
4. Set schedule: `0 9 * * *` (daily at 9 AM)
5. Add basic authentication if needed

### Option 5: Server Cron (if self-hosting)

If hosting on your own server, add to crontab:

```bash
# Edit crontab
crontab -e

# Add this line for daily 9 AM reminders
0 9 * * * curl -X POST https://your-domain.com/api/admin/daily-reminders
```

## Testing the System

### Manual Testing

1. **Test API endpoint**:
```bash
curl -X POST https://your-domain.com/api/admin/daily-reminders
```

2. **Test Edge Function**:
```bash
curl -X POST \
  -H "Authorization: Bearer YOUR_SERVICE_ROLE_KEY" \
  https://your-project.supabase.co/functions/v1/daily-reminders
```

### Verify Email Configuration

1. Check that admin emails are set in environment variables
2. Verify SMTP settings are correct
3. Test email delivery manually first

### Database Verification

Check reminder logs:
```sql
SELECT 
  br.*,
  t.full_name,
  r.room_number,
  b.name as branch_name
FROM billing_reminders br
JOIN tenants t ON br.tenant_id = t.id
JOIN rooms r ON t.room_id = r.id
JOIN branches b ON r.branch_id = b.id
ORDER BY br.created_at DESC;
```

## Customization Options

### Adjust Reminder Timing

To change when reminders are sent, modify the logic in:
- `app/api/admin/daily-reminders/route.ts`
- `supabase/functions/daily-reminders/index.ts`

```typescript
// Current: Send exactly 3, 2, 1 days before
if (daysUntilCycleEnd === 3 || daysUntilCycleEnd === 2 || daysUntilCycleEnd === 1) {
  // Send reminder
}

// Example: Send 5, 3, 1 days before
if (daysUntilCycleEnd === 5 || daysUntilCycleEnd === 3 || daysUntilCycleEnd === 1) {
  // Send reminder
}
```

### Customize Email Templates

Email templates are in:
- `lib/services/emailService.ts` - API version
- `supabase/functions/daily-reminders/index.ts` - Edge function version

### Add More Admin Emails

Add more environment variables:
```bash
ADMIN_EMAIL_4=admin4@jh-management.com
ADMIN_EMAIL_5=admin5@jh-management.com
```

Then update the code to include them in the admin emails array.

## Monitoring and Logs

### Check Reminder History

Query sent reminders:
```sql
-- Reminders sent today
SELECT COUNT(*) as reminders_sent_today
FROM billing_reminders 
WHERE sent_date = CURRENT_DATE;

-- Reminders by type
SELECT 
  reminder_day,
  COUNT(*) as count,
  array_agg(DISTINCT email_sent_to) as admin_emails
FROM billing_reminders 
WHERE sent_date = CURRENT_DATE
GROUP BY reminder_day
ORDER BY reminder_day;
```

### Application Logs

Monitor logs for:
- Successful email sending
- Failed email attempts
- Database insertion errors
- Authentication issues

### Email Delivery Monitoring

Set up monitoring for:
- SMTP connection failures
- Bounce rates
- Admin email response/action rates

## Troubleshooting

### Common Issues

1. **No emails sent**:
   - Check environment variables
   - Verify SMTP credentials
   - Check admin email configuration

2. **Duplicate emails**:
   - Verify database constraints are working
   - Check for multiple cron jobs running

3. **Wrong timing**:
   - Verify server timezone
   - Check cron schedule syntax
   - Test billing cycle calculations

4. **Missing tenants**:
   - Verify tenant is active (`is_active = true`)
   - Check billing cycle calculations
   - Ensure tenant has room assignment

### Debug Mode

Add debug logging by setting environment variable:
```bash
DEBUG_REMINDERS=true
```

## Production Checklist

- [ ] Environment variables configured
- [ ] Admin emails verified
- [ ] SMTP settings tested
- [ ] Cron job scheduled and tested
- [ ] Database migration applied
- [ ] Email templates reviewed
- [ ] Timezone settings correct
- [ ] Monitoring set up
- [ ] Backup notification method configured

## Business Impact

### Benefits
- **Proactive Management**: Never miss billing deadlines
- **Consistent Communication**: Standardized reminder process
- **Reduced Manual Work**: Eliminates need for manual reminder tracking
- **Audit Trail**: Complete history of reminder communications
- **Scalable**: Automatically handles any number of tenants and branches

### Metrics to Track
- Reminder delivery success rate
- Time from reminder to bill generation
- Reduction in late bill generation
- Admin response time to reminders

## Support and Maintenance

### Regular Maintenance
- Monitor email delivery rates weekly
- Review reminder logs monthly
- Update admin email lists as needed
- Test system during low-activity periods

### Updates and Changes
- Document any changes to reminder schedule
- Test changes in staging environment first
- Notify admins of any system modifications
- Keep backup of working configuration 
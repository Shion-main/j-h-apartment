# J&H Management System - Environment Setup Guide

## 🔧 Environment Configuration

This document provides complete instructions for setting up the environment variables required for the J&H Management System.

## 📋 Required Environment Variables

Create a `.env.local` file in the root directory and add the following variables:

### Supabase Configuration
```bash
# Get these from your Supabase project dashboard: https://app.supabase.com
NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key_here
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key_here
```

### Email Configuration (for automated notifications)
```bash
# SMTP settings for sending automated emails
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USERNAME=your_email@gmail.com
SMTP_PASSWORD=your_app_password_here
FROM_EMAIL=your_email@gmail.com
FROM_NAME=J&H Management System
```

### Authentication & Security
```bash
# JWT secret for additional security (generate a random string)
JWT_SECRET=your_jwt_secret_here_generate_random_string
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=your_nextauth_secret_here
```

### Application Settings
```bash
APP_NAME=J&H Management System
APP_VERSION=1.0.0
NODE_ENV=development
```

### Business Configuration
```bash
# Default business settings (can be overridden in UI)
DEFAULT_PENALTY_PERCENTAGE=5
DEFAULT_CONTRACT_MONTHS=6
DEFAULT_DUE_DAYS=10
CURRENCY=PHP
CURRENCY_SYMBOL=₱
```

## 🚀 Step-by-Step Setup Instructions

### 1. Create Supabase Project
1. Go to [https://app.supabase.com](https://app.supabase.com)
2. Create a new project
3. Wait for the project to be provisioned
4. Go to Settings > API
5. Copy the Project URL and API Keys

### 2. Configure Database Schema
1. Go to your Supabase project dashboard
2. Navigate to SQL Editor
3. Copy and paste the contents of `schema.sql`
4. Execute the script to create all tables and relationships

### 3. Set Up Authentication
1. In Supabase dashboard, go to Authentication > Settings
2. Configure email settings if needed
3. Set up any additional auth providers if required
4. Create your first admin user in Authentication > Users

### 4. Configure Email Service

#### Option A: Gmail
1. Enable 2-factor authentication on your Gmail account
2. Generate an App Password:
   - Go to Google Account settings
   - Security > 2-Step Verification > App passwords
   - Generate password for "Mail"
3. Use the app password in `SMTP_PASSWORD`

#### Option B: SendGrid (Alternative)
1. Create SendGrid account
2. Generate API key
3. Update SMTP settings accordingly

### 5. Generate Security Secrets
```bash
# Generate random strings for JWT secrets
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 6. Configure Row Level Security (RLS)
In Supabase SQL Editor, enable RLS policies:
```sql
-- Enable RLS on all tables
ALTER TABLE branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE bills ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE company_expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Basic policies (customize based on your needs)
CREATE POLICY "Authenticated users can view all" ON branches FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert" ON branches FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update" ON branches FOR UPDATE TO authenticated USING (true);

-- Repeat similar patterns for other tables
```

## 📁 Complete .env.local Template

```bash
# J&H Management System - Environment Configuration
# ===========================================
# SUPABASE CONFIGURATION
# ===========================================
NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key_here
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key_here

# ===========================================
# EMAIL CONFIGURATION
# ===========================================
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USERNAME=your_email@gmail.com
SMTP_PASSWORD=your_app_password_here
FROM_EMAIL=your_email@gmail.com
FROM_NAME=J&H Management System

# ===========================================
# AUTHENTICATION & SECURITY
# ===========================================
JWT_SECRET=your_jwt_secret_here_generate_random_string
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=your_nextauth_secret_here

# ===========================================
# APPLICATION SETTINGS
# ===========================================
APP_NAME=J&H Management System
APP_VERSION=1.0.0
NODE_ENV=development

# ===========================================
# BUSINESS CONFIGURATION
# ===========================================
DEFAULT_PENALTY_PERCENTAGE=5
DEFAULT_CONTRACT_MONTHS=6
DEFAULT_DUE_DAYS=10
CURRENCY=PHP
CURRENCY_SYMBOL=₱

# ===========================================
# DEVELOPMENT SETTINGS
# ===========================================
DEBUG_MODE=true
LOG_LEVEL=debug
RATE_LIMIT_MAX_REQUESTS=100
RATE_LIMIT_WINDOW_MS=900000
```

## 🔒 Security Best Practices

### Development Environment
- Use different Supabase projects for development and production
- Keep `.env.local` in your `.gitignore` file
- Never commit sensitive credentials to version control

### Production Environment
- Set `NODE_ENV=production`
- Set `DEBUG_MODE=false`
- Use strong, unique secrets for each environment
- Enable all Supabase security features
- Set up database backups
- Configure monitoring and alerting

## ✅ Verification Steps

After setting up your environment:

1. **Test Database Connection**
   ```bash
   npm run dev
   ```
   Check if the dashboard loads without errors

2. **Test Authentication**
   - Try logging in with your admin user
   - Verify user sessions work properly

3. **Test Email Configuration** (if configured)
   - Create a test tenant to trigger welcome email
   - Check email delivery in your inbox

4. **Verify Business Logic**
   - Create a test branch
   - Add rooms to the branch
   - Create a test tenant
   - Generate a test bill

## 🐛 Troubleshooting

### Common Issues

**Supabase Connection Errors**
- Verify URLs and keys are correct
- Check if Supabase project is active
- Ensure RLS policies allow access

**Email Not Sending**
- Verify SMTP credentials
- Check if less secure app access is enabled (Gmail)
- Verify firewall/network settings

**Authentication Issues**
- Confirm Supabase auth settings
- Check JWT secret configuration
- Verify user creation in Supabase dashboard

### Debug Mode
Enable debug logging by setting:
```bash
DEBUG_MODE=true
LOG_LEVEL=debug
```

## 📞 Support

If you encounter issues:
1. Check the browser console for error messages
2. Review Supabase logs in the dashboard
3. Verify all environment variables are set correctly
4. Test with a fresh Supabase project if needed

## 🚀 Production Deployment

For production deployment (Vercel, Netlify, etc.):
1. Set all environment variables in your hosting platform
2. Use production Supabase project
3. Configure custom domain
4. Enable HTTPS
5. Set up database backups
6. Configure monitoring

---

**Note**: Always keep your environment variables secure and never share them publicly. Each team member should have their own development environment configuration. 
# GitHub Actions Cron Job Setup Guide

## Overview

This project uses GitHub Actions to automatically trigger the daily reminders at 9:00 AM UTC every day. This is a free alternative to Vercel's paid cron jobs.

## Required GitHub Secrets

You need to set up these secrets in your GitHub repository:

1. **NEXT_PUBLIC_APP_URL**: The URL of your deployed application
   - Example: `https://your-app-name.vercel.app`

2. **CRON_SECRET_KEY**: A random secure string to authenticate the cron requests
   - You'll need to generate this yourself

## Steps to Set Up

### 1. Generate a Secure Key

Run this command to generate a random secure key:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Or use an online generator to create a secure random string.

### 2. Add Secrets to Your GitHub Repository

1. Go to your GitHub repository
2. Click on **Settings** > **Secrets and variables** > **Actions**
3. Click **New repository secret**
4. Add both secrets:
   - Name: `NEXT_PUBLIC_APP_URL`
   - Value: Your deployed app URL (e.g., `https://your-app-name.vercel.app`)

   Then:
   - Name: `CRON_SECRET_KEY`
   - Value: Your generated secure key from step 1

### 3. Add the Secret to Your Environment Variables

Add this same secret key to your Vercel project:

1. Go to your Vercel project dashboard
2. Click on **Settings** > **Environment Variables**
3. Add a new environment variable:
   - Name: `CRON_SECRET_KEY`
   - Value: The same secure key you generated
4. Select all environments (Production, Preview, Development)
5. Click **Save**

### 4. Deploy Your Application

Commit and push the changes to your repository:

```bash
git add .github/workflows/daily-reminders.yml
git add app/api/admin/daily-reminders/route.ts
git commit -m "Add GitHub Actions cron for daily reminders"
git push
```

### 5. Verify the Workflow

1. Go to the **Actions** tab in your GitHub repository
2. You should see the "Daily Billing Reminders" workflow
3. It will run automatically at 9:00 AM UTC daily
4. You can also run it manually by clicking "Run workflow"

## How It Works

1. GitHub Actions runs the workflow at 9:00 AM UTC daily
2. It makes a POST request to your `/api/admin/daily-reminders` endpoint
3. The request includes the secret key for authentication
4. Your API validates the key and processes the request
5. Emails are sent to administrators about tenants with upcoming billing cycles

## Troubleshooting

If the cron job isn't working:

1. Check the GitHub Actions logs for errors
2. Verify your secrets are set up correctly
3. Make sure your deployed API is accessible
4. Test the endpoint manually with the secret key 
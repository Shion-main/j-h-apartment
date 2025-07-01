import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { EmailService } from '@/lib/services/emailService';
import { logAuditEvent } from '@/lib/audit/logger';

export async function POST(request: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { emails, month } = await request.json();

    if (!emails || !Array.isArray(emails) || emails.length === 0) {
      return NextResponse.json({ error: 'No email addresses provided' }, { status: 400 });
    }

    if (!month) {
      return NextResponse.json({ error: 'Month parameter is required' }, { status: 400 });
    }

    // Fetch the monthly report data
    const reportResponse = await fetch(`${request.nextUrl.origin}/api/reports/monthly?month=${month}`);
    if (!reportResponse.ok) {
      const errorData = await reportResponse.json();
      return NextResponse.json({ error: `Failed to fetch report data: ${errorData.error}` }, { status: reportResponse.status });
    }
    const { data: monthlyReport } = await reportResponse.json();

    // Fetch the CSV data
    const csvResponse = await fetch(`${request.nextUrl.origin}/api/reports/monthly?month=${month}&download=true`);
    if (!csvResponse.ok) {
      const errorData = await csvResponse.json();
      return NextResponse.json({ error: `Failed to fetch CSV data: ${errorData.error}` }, { status: csvResponse.status });
    }
    const csvContent = await csvResponse.text();

    // Send email to each recipient
    for (const email of emails) {
      try {
        await EmailService.sendMonthlyReportEmail({
          recipientEmail: email,
          month: month,
          reportData: monthlyReport,
          csvAttachment: {
            filename: `monthly_report_${month}.csv`,
            content: csvContent,
            contentType: 'text/csv',
          },
        });

        await logAuditEvent(
          supabase,
          user.id,
          'MONTHLY_REPORT_EMAIL_SENT',
          'reports',
          null,
          null,
          { month, recipient: email }
        );

      } catch (emailError) {
        console.error(`Failed to send email to ${email}:`, emailError);
        // Continue to next email even if one fails
      }
    }

    return NextResponse.json({ message: 'Monthly report emails sent successfully' }, { status: 200 });

  } catch (error) {
    console.error('API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
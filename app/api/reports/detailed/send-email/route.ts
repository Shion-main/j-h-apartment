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

    const { email, month, year } = await request.json();

    if (!email) {
      return NextResponse.json({ error: 'Email address is required' }, { status: 400 });
    }

    if (!month || !year) {
      return NextResponse.json({ error: 'Month and year parameters are required' }, { status: 400 });
    }

    // Validate month and year
    const monthNum = parseInt(month);
    const yearNum = parseInt(year);

    if (isNaN(monthNum) || isNaN(yearNum) || monthNum < 1 || monthNum > 12) {
      return NextResponse.json({ 
        error: 'Invalid month or year. Month must be 1-12, year must be a valid year' 
      }, { status: 400 });
    }

    // Fetch the comprehensive report data
    const reportResponse = await fetch(`${request.nextUrl.origin}/api/reports/detailed?month=${month}&year=${year}`);
    if (!reportResponse.ok) {
      const errorData = await reportResponse.json();
      return NextResponse.json({ error: `Failed to fetch report data: ${errorData.error}` }, { status: reportResponse.status });
    }
    const { data: reportData } = await reportResponse.json();

    // Fetch the CSV data
    const csvResponse = await fetch(`${request.nextUrl.origin}/api/reports/detailed?month=${month}&year=${year}&download=true`);
    if (!csvResponse.ok) {
      const errorData = await csvResponse.json();
      return NextResponse.json({ error: `Failed to fetch CSV data: ${errorData.error}` }, { status: csvResponse.status });
    }
    const csvContent = await csvResponse.text();

    // Send the comprehensive report email
    try {
      const emailResult = await EmailService.sendComprehensiveMonthlyReportEmail({
        recipientEmail: email,
        month: `${month}/${year}`,
        reportData,
        csvAttachment: {
          filename: `comprehensive_monthly_report_${month}_${year}.csv`,
          content: csvContent,
          contentType: 'text/csv',
        },
      });

      if (!emailResult.success) {
        return NextResponse.json({ 
          error: `Failed to send email: ${emailResult.error}` 
        }, { status: 500 });
      }

      // Log the action in audit_logs
      await logAuditEvent(
        supabase,
        user.id,
        'COMPREHENSIVE_REPORT_EMAIL_SENT',
        'reports',
        null,
        null,
        { 
          month: monthNum, 
          year: yearNum, 
          recipient: email,
          reportType: 'comprehensive_monthly',
          sections: ['overall_snapshot', 'tenant_room_status', 'billing_payments', 'company_expenses', 'tenant_movement']
        }
      );

      return NextResponse.json({ 
        message: 'Comprehensive monthly report email sent successfully',
        messageId: emailResult.messageId 
      }, { status: 200 });

    } catch (emailError) {
      console.error('Failed to send comprehensive report email:', emailError);
      return NextResponse.json({ 
        error: 'Failed to send comprehensive report email' 
      }, { status: 500 });
    }

  } catch (error) {
    console.error('API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
} 
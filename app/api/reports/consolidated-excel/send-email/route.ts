import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { EmailService } from '@/lib/services/emailService';
import { logAuditEvent } from '@/lib/audit/logger';
import * as XLSX from 'xlsx';

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

    // Generate the Excel file by calling the consolidated Excel endpoint
    const excelResponse = await fetch(`${request.nextUrl.origin}/api/reports/consolidated-excel?month=${month}&year=${year}`);
    
    if (!excelResponse.ok) {
      const errorData = await excelResponse.json();
      return NextResponse.json({ error: `Failed to generate Excel report: ${errorData.error}` }, { status: excelResponse.status });
    }

    const excelBuffer = await excelResponse.arrayBuffer();
    
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'];
    const monthName = monthNames[monthNum - 1];
    
    // Send the Excel file via email
    try {
      const emailResult = await EmailService.sendConsolidatedExcelReportEmail({
        recipientEmail: email,
        month: `${monthName} ${year}`,
        excelAttachment: {
          filename: `consolidated_monthly_report_${monthName}_${year}.xlsx`,
          content: Buffer.from(excelBuffer),
          contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
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
        'CONSOLIDATED_EXCEL_REPORT_EMAIL_SENT',
        'reports',
        null,
        null,
        { 
          month: monthNum, 
          year: yearNum, 
          recipient: email,
          reportType: 'consolidated_excel',
          worksheets: ['overall_snapshot', 'tenant_room_status', 'detailed_billing', 'company_expenses', 'tenant_movement']
        }
      );

      return NextResponse.json({ 
        message: 'Consolidated Excel report email sent successfully',
        messageId: emailResult.messageId 
      }, { status: 200 });

    } catch (emailError) {
      console.error('Failed to send consolidated Excel report email:', emailError);
      return NextResponse.json({ 
        error: 'Failed to send consolidated Excel report email' 
      }, { status: 500 });
    }

  } catch (error) {
    console.error('API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
} 
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import nodemailer from 'nodemailer';

export async function POST(request: Request) {
  try {
    const { emails, year } = await request.json();

    if (!emails || !Array.isArray(emails) || emails.length === 0) {
      return NextResponse.json({ error: 'At least one email address is required' }, { status: 400 });
    }

    if (!year) {
      return NextResponse.json({ error: 'Year is required' }, { status: 400 });
    }

    // Get the Excel report
    const response = await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/reports/consolidated-excel/yearly?year=${year}`, {
      method: 'GET'
    });

    if (!response.ok) {
      throw new Error('Failed to generate Excel report');
    }

    const buffer = await response.arrayBuffer();

    // Configure email transport
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: false,
      auth: {
        user: process.env.SMTP_USERNAME,
        pass: process.env.SMTP_PASSWORD
      }
    });

    // Send email with attachment
    await transporter.sendMail({
      from: process.env.SMTP_FROM_EMAIL,
      to: emails.join(', '),
      subject: `J&H Management - Yearly Report ${year}`,
      text: `Please find attached the yearly report for ${year}.`,
      html: `
        <h2>J&H Management - Yearly Report ${year}</h2>
        <p>Please find attached the yearly report for ${year}.</p>
        <p>This report includes:</p>
        <ul>
          <li>Overall Financial Snapshot</li>
          <li>Tenant & Room Status</li>
          <li>Detailed Billing Information</li>
          <li>Company Expenses</li>
          <li>Tenant Movements</li>
        </ul>
        <p>Best regards,<br>J&H Management System</p>
      `,
      attachments: [
        {
          filename: `yearly_report_${year}.xlsx`,
          content: Buffer.from(buffer)
        }
      ]
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error sending yearly report email:', error);
    return NextResponse.json({ error: 'Failed to send yearly report email' }, { status: 500 });
  }
} 
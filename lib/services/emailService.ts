import nodemailer from 'nodemailer';

export interface EmailRecipient {
  email: string;
  name?: string;
}

export interface EmailTemplateData {
  email: string;
  full_name: string;
  room_number?: string;
  branch_name?: string;
  move_out_date?: string;
  billing_period_start?: string;
  billing_period_end?: string;
  due_date?: string;
  total_amount_due?: number;
  payment_amount?: number;
  payment_date?: string;
  payment_method?: 'cash' | 'gcash';
  reference_number?: string;
  [key: string]: any; // Allow additional properties
}

interface DailyAdminRemindersData {
  adminEmails: string[];
  tenants: Array<{
    full_name: string;
    room_number: string;
    branch_name: string;
    cycle_end_date: string;
    days_remaining: number;
    reminder_day?: number;
  }>;
  reminderDay?: number; // 3, 2, or 1 days before
}

export class EmailService {
  /**
   * Create and configure SMTP transporter
   */
  private static createTransporter() {
    return nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '465'),
      secure: true, // Use true for port 465 (SSL)
      auth: {
        user: process.env.SMTP_USERNAME,
        pass: process.env.SMTP_PASSWORD
      }
    });
  }

  /**
   * Generate welcome email template
   */
  private static generateWelcomeEmail(data: any): { subject: string; html: string } {
    const subject = 'Welcome to J&H Apartment';
    
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #2563eb; margin-bottom: 20px;">Welcome to J&H Apartment!</h2>
        
        <p>Dear ${data.full_name},</p>
        
        <p>Thank you for choosing J&H Apartment. We're excited to have you as part of our community!</p>
        
        <div style="background-color: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <h3 style="margin-top: 0; color: #374151;">Your Tenancy Details:</h3>
          <ul style="list-style: none; padding: 0; margin: 0;">
            <li style="padding: 5px 0;"><strong>Room:</strong> ${data.room_number}</li>
            <li style="padding: 5px 0;"><strong>Branch:</strong> ${data.branch_name}</li>
            <li style="padding: 5px 0;"><strong>Contract Start:</strong> ${new Date(data.contract_start_date).toLocaleDateString()}</li>
            <li style="padding: 5px 0;"><strong>Contract End:</strong> ${new Date(data.contract_end_date).toLocaleDateString()}</li>
            <li style="padding: 5px 0;"><strong>Monthly Rent:</strong> ₱${data.monthly_rent.toLocaleString()}</li>
          </ul>
        </div>
        
        <div style="background-color: #fef3c7; padding: 15px; border-radius: 8px; margin: 20px 0;">
          <h4 style="margin-top: 0; color: #92400e;">Payment Information:</h4>
          <ul style="margin: 10px 0;">
            <li>Advance Payment: ₱${data.advance_payment.toLocaleString()}</li>
            <li>Security Deposit: ₱${data.security_deposit.toLocaleString()}</li>
            <li>Late Payment Penalty: ${data.penalty_percentage}% of total amount due</li>
          </ul>
        </div>
        
        <div style="background-color: #e0f2fe; padding: 15px; border-radius: 8px; margin: 20px 0;">
          <h4 style="margin-top: 0; color: #0277bd;">Important Reminders:</h4>
          <ul style="margin: 10px 0;">
            <li>Bills are generated monthly based on your rent start date</li>
            <li>Payment is due within 10 days of each billing period</li>
            <li>Keep all payment receipts for your records</li>
          </ul>
        </div>
        
        <p>If you have any questions or concerns, please don't hesitate to contact our management office.</p>
        
        <p style="margin-top: 30px;">Welcome to your new home!</p>
        
        <hr style="margin: 30px 0; border: none; border-top: 1px solid #e5e7eb;">
        
        <p style="color: #6b7280; font-size: 14px; margin: 0;">
          <strong>J&H Management System</strong><br>
          This is an automated email. Please do not reply to this address.
        </p>
      </div>
    `;

    return { subject, html };
  }

  /**
   * Send welcome email to new tenant
   */
  static async sendWelcomeEmail(data: {
    email: string;
    full_name: string;
    room_number: string;
    branch_name: string;
    contract_start_date: string;
    contract_end_date: string;
    monthly_rent: number;
    advance_payment: number;
    security_deposit: number;
    penalty_percentage: number;
  }): Promise<{ success: boolean; messageId?: string; error?: string }> {
    try {
      // Validate required environment variables
      if (!process.env.SMTP_HOST || !process.env.SMTP_USERNAME || !process.env.SMTP_PASSWORD) {
        throw new Error('Missing SMTP configuration. Please check your environment variables.');
      }

      // Create transporter
      const transporter = this.createTransporter();

      // Generate email content
      const emailContent = this.generateWelcomeEmail(data);

      // Send email
      const info = await transporter.sendMail({
        from: `"${process.env.FROM_NAME || 'J&H Management'}" <${process.env.FROM_EMAIL || process.env.SMTP_USERNAME}>`,
        to: data.email,
        subject: emailContent.subject,
        html: emailContent.html
      });

      console.log('Welcome email sent successfully:', info.messageId);

      return {
        success: true,
        messageId: info.messageId
      };

    } catch (error) {
      console.error('Failed to send welcome email:', error);
      
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }

  /**
   * Test email configuration
   */
  static async testEmailConfig(): Promise<{ success: boolean; error?: string }> {
    try {
      const transporter = this.createTransporter();
      await transporter.verify();
      
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }

  /**
   * Generate bill email template
   */
  private static generateBillEmail(data: any): { subject: string; html: string } {
    const subject = `New Bill Generated - ${new Date(data.billing_period_start).toLocaleDateString()} to ${new Date(data.billing_period_end).toLocaleDateString()}`;
    
    // Helper function to safely format numbers
    const formatAmount = (amount: number | undefined | null): string => {
      return typeof amount === 'number' ? amount.toFixed(2) : '0.00';
    };

    // Calculate consumption safely
    const consumption = typeof data.present_electricity_reading === 'number' && typeof data.previous_electricity_reading === 'number'
      ? data.present_electricity_reading - data.previous_electricity_reading
      : 0;
    
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #f59e0b; margin-bottom: 20px;">New Bill Generated</h2>
        
        <p>Dear ${data.full_name},</p>
        
        <p>Your bill for ${new Date(data.billing_period_start).toLocaleDateString()} to ${new Date(data.billing_period_end).toLocaleDateString()} has been generated.</p>
        
        <div style="background-color: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <h3 style="margin-top: 0; color: #374151;">Bill Breakdown:</h3>
          <ul style="list-style: none; padding: 0; margin: 0;">
            <li style="margin-bottom: 10px;">Monthly Rent: ₱${formatAmount(data.monthly_rent_amount)}</li>
            
            <li style="margin-bottom: 10px;">
              <strong>Electricity Consumption:</strong>
              <ul style="list-style: none; padding-left: 20px;">
                <li>Previous Reading: ${data.previous_electricity_reading || 0} kWh</li>
                <li>Present Reading: ${data.present_electricity_reading || 0} kWh</li>
                <li>Consumption: ${consumption} kWh</li>
                <li>Rate per kWh: ₱${formatAmount(data.electricity_rate)}</li>
                <li>Total Electricity Charges: ₱${formatAmount(data.electricity_amount)}</li>
              </ul>
            </li>
            
            <li style="margin-bottom: 10px;">Water Charges: ₱${formatAmount(data.water_amount)}</li>
            ${data.extra_fee > 0 ? `<li style="margin-bottom: 10px;">Extra Fees (${data.extra_fee_description || ''}): ₱${formatAmount(data.extra_fee)}</li>` : ''}
          </ul>
          
          <div style="border-top: 1px solid #d1d5db; margin-top: 15px; padding-top: 15px;">
            <h4 style="margin: 0; color: #374151;">Total Amount Due: ₱${formatAmount(data.total_amount_due)}</h4>
            <p style="margin: 5px 0 0 0; color: #6b7280; font-size: 14px;">Due Date: ${new Date(data.due_date).toLocaleDateString()}</p>
          </div>
        </div>

        <div style="background-color: #dcfce7; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #16a34a;">
          <h3 style="margin-top: 0; color: #166534;">💳 Payment Options</h3>
          
          <div style="margin-bottom: 15px;">
            <h4 style="color: #166534; margin-bottom: 10px;">💰 Cash Payment</h4>
            <p style="margin: 0; color: #374151;">Pay directly at the management office during business hours.</p>
          </div>
          
          <div style="margin-bottom: 15px;">
            <h4 style="color: #166534; margin-bottom: 10px;">📱 GCash Payment</h4>
            <p style="margin: 0 0 10px 0; color: #374151;">You can pay via GCash using the QR code attached below.</p>
            <p style="margin: 0 0 15px 0; color: #dc2626; font-weight: bold;">⚠️ IMPORTANT: After making a GCash payment, please reply to this email with the following details:</p>
            <ul style="margin: 0; padding-left: 20px; color: #374151;">
              <li>Room Number: ${data.room_number}</li>
              <li>Branch: ${data.branch_name}</li>
              <li>GCash Reference Number</li>
              <li>Payment Amount</li>
              <li>Payment Date</li>
            </ul>
          </div>
        </div>

        <div style="background-color: #fef3c7; padding: 15px; border-radius: 8px; margin: 20px 0;">
          <h4 style="margin-top: 0; color: #92400e;">📎 GCash QR Code</h4>
          <p style="margin: 0 0 10px 0; color: #92400e;">Scan the QR code below to pay via GCash:</p>
          <div style="text-align: center; margin: 15px 0;">
            <img src="cid:gcash-qr-code" alt="GCash QR Code" style="max-width: 200px; height: auto; border: 1px solid #d1d5db; border-radius: 8px;">
          </div>
          <p style="margin: 10px 0 0 0; color: #92400e; font-size: 14px;">Note: Please keep your payment receipt for verification.</p>
        </div>
        
        <div style="background-color: #e0f2fe; padding: 15px; border-radius: 8px; margin: 20px 0;">
          <h4 style="margin-top: 0; color: #0277bd;">Important Reminders:</h4>
          <ul style="margin: 10px 0;">
            <li>Payment is due within 10 days of the billing period end</li>
            <li>Late payments will incur a penalty fee</li>
            <li>Keep all payment receipts for your records</li>
            <li>For GCash payments, always include the reference number in your reply</li>
          </ul>
        </div>
        
        <p>If you have any questions about your bill or payment options, please contact our management office.</p>
        
        <hr style="margin: 30px 0; border: none; border-top: 1px solid #e5e7eb;">
        
        <p style="color: #6b7280; font-size: 14px; margin: 0;">
          <strong>J&H Management System</strong><br>
          This is an automated email. Please do not reply to this address for general inquiries.
        </p>
      </div>
    `;

    return { subject, html };
  }

  /**
   * Send bill email to tenant
   */
  static async sendBillEmail(data: {
    email: string;
    full_name: string;
    room_number: string;
    branch_name: string;
    billing_period_start: string;
    billing_period_end: string;
    monthly_rent_amount: number;
    electricity_amount: number;
    electricity_consumption: number;
    electricity_rate: number; // Add electricity rate
    previous_electricity_reading: number; // Add previous reading
    present_electricity_reading: number; // Add present reading
    water_amount: number;
    extra_fee: number;
    extra_fee_description?: string;
    total_amount_due: number;
    due_date: string;
  }): Promise<{ success: boolean; messageId?: string; error?: string }> {
    try {
      // Validate required environment variables
      if (!process.env.SMTP_HOST || !process.env.SMTP_USERNAME || !process.env.SMTP_PASSWORD) {
        throw new Error('Missing SMTP configuration. Please check your environment variables.');
      }

      // Create transporter
      const transporter = this.createTransporter();

      // Generate email content
      const emailContent = this.generateBillEmail(data);

      // Send email with QR code attachment
      const info = await transporter.sendMail({
        from: `"${process.env.FROM_NAME || 'J&H Management'}" <${process.env.FROM_EMAIL || process.env.SMTP_USERNAME}>`,
        to: data.email,
        subject: emailContent.subject,
        html: emailContent.html,
        attachments: [
          {
            filename: 'gcash-qr-code.jpg',
            path: './lib/Gcash QR code/QR CODE.jpg',
            cid: 'gcash-qr-code' // Content ID for embedding in HTML
          }
        ]
      });

      console.log('Bill email sent successfully:', info.messageId);

      return {
        success: true,
        messageId: info.messageId
      };

    } catch (error) {
      console.error('Failed to send bill email:', error);
      
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }

  /**
   * Generate partial payment confirmation email template
   */
  private static generatePartialPaymentEmail(data: any): { subject: string; html: string } {
    const subject = `Partial Payment Confirmation - ${new Date(data.payment_date).toLocaleDateString()}`;
    
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #f59e0b; margin-bottom: 20px;">Partial Payment Confirmation</h2>
        
        <p>Dear ${data.full_name},</p>
        
        <p>Thank you for your partial payment. Your payment has been recorded successfully.</p>
        
        <div style="background-color: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <h3 style="margin-top: 0; color: #374151;">Payment Details:</h3>
          <ul style="list-style: none; padding: 0; margin: 0;">
            <li style="padding: 5px 0;"><strong>Payment Amount:</strong> ₱${data.amount_paid.toLocaleString()}</li>
            <li style="padding: 5px 0;"><strong>Payment Date:</strong> ${new Date(data.payment_date).toLocaleDateString()}</li>
            <li style="padding: 5px 0;"><strong>Payment Method:</strong> ${data.payment_method === 'gcash' ? 'GCash' : 'Cash'}</li>
            ${data.payment_method === 'gcash' && data.reference_number ? `<li style="padding: 5px 0;"><strong>GCash Reference Number:</strong> ${data.reference_number}</li>` : ''}
            ${data.notes ? `<li style="padding: 5px 0;"><strong>Notes:</strong> ${data.notes}</li>` : ''}
          </ul>
        </div>
        
        <div style="background-color: #fef3c7; padding: 15px; border-radius: 8px; margin: 20px 0;">
          <h4 style="margin-top: 0; color: #92400e;">Remaining Balance:</h4>
          <p style="margin: 5px 0; font-size: 18px; font-weight: bold; color: #dc2626;">
            ₱${data.remaining_balance.toLocaleString()}
          </p>
          <p style="margin: 5px 0 0 0; color: #6b7280; font-size: 14px;">
            Due Date: ${new Date(data.due_date).toLocaleDateString()}
          </p>
        </div>
        
        <p>Please settle the remaining balance before the due date to avoid penalties.</p>
        
        <hr style="margin: 30px 0; border: none; border-top: 1px solid #e5e7eb;">
        
        <p style="color: #6b7280; font-size: 14px; margin: 0;">
          <strong>J&H Management System</strong><br>
          This is an automated email. Please do not reply to this address.
        </p>
      </div>
    `;

    return { subject, html };
  }

  /**
   * Generate full payment receipt email template
   */
  private static generateFullPaymentReceiptEmail(data: any): { subject: string; html: string } {
    const subject = `Payment Complete - Bill Fully Paid`;
    
    // Helper function to safely format numbers
    const formatAmount = (amount: number | undefined | null): string => {
      return typeof amount === 'number' ? amount.toFixed(2) : '0.00';
    };
    
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #059669; margin-bottom: 20px;">✅ Payment Complete</h2>
        
        <p>Dear ${data.full_name},</p>
        
        <p>Thank you! Your bill has been fully paid. Here's your payment receipt:</p>
        
        <div style="background-color: #f0fdf4; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #059669;">
          <h3 style="margin-top: 0; color: #059669;">Payment Receipt</h3>
          <ul style="list-style: none; padding: 0; margin: 0;">
            <li style="padding: 5px 0;"><strong>Room:</strong> ${data.room_number}</li>
            <li style="padding: 5px 0;"><strong>Branch:</strong> ${data.branch_name}</li>
            <li style="padding: 5px 0;"><strong>Billing Period:</strong> ${new Date(data.billing_period_start).toLocaleDateString()} - ${new Date(data.billing_period_end).toLocaleDateString()}</li>
            <li style="padding: 5px 0;"><strong>Total Bill Amount:</strong> ₱${formatAmount(data.total_amount_due)}</li>
            <li style="padding: 5px 0;"><strong>Final Payment Amount:</strong> ₱${formatAmount(data.final_payment_amount)}</li>
            <li style="padding: 5px 0;"><strong>Payment Date:</strong> ${new Date(data.payment_date).toLocaleDateString()}</li>
            <li style="padding: 5px 0;"><strong>Payment Method:</strong> ${data.payment_method === 'gcash' ? 'GCash' : 'Cash'}</li>
            ${data.payment_method === 'gcash' && data.reference_number ? `<li style="padding: 5px 0;"><strong>GCash Reference Number:</strong> ${data.reference_number}</li>` : ''}
          </ul>
        </div>
        
        <div style="background-color: #dbeafe; padding: 15px; border-radius: 8px; margin: 20px 0;">
          <h4 style="margin-top: 0; color: #1d4ed8;">Status: PAID IN FULL ✅</h4>
          <p style="margin: 5px 0; color: #374151;">Your next bill will be generated for the following billing cycle.</p>
        </div>
        
        <p>Please keep this receipt for your records. Thank you for your prompt payment!</p>
        
        <hr style="margin: 30px 0; border: none; border-top: 1px solid #e5e7eb;">
        
        <p style="color: #6b7280; font-size: 14px; margin: 0;">
          <strong>J&H Management System</strong><br>
          This is an automated email. Please do not reply to this address.
        </p>
      </div>
    `;

    return { subject, html };
  }

  /**
   * Generate bill edited email template
   */
  private static generateBillEditedEmail(data: any): { subject: string; html: string } {
    const subject = `Updated Bill - ${new Date(data.billing_period_start).toLocaleDateString()} to ${new Date(data.billing_period_end).toLocaleDateString()}`;
    
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #f59e0b; margin-bottom: 20px;">Bill Updated</h2>
        <p>Dear ${data.full_name},</p>
        <p>Your bill for the period ${new Date(data.billing_period_start).toLocaleDateString()} to ${new Date(data.billing_period_end).toLocaleDateString()} has been updated. Please review the changes below:</p>
        <div style="background-color: #fef3c7; border: 2px solid #f59e0b; padding: 15px; border-radius: 8px; margin: 20px 0;">
          <h4 style="margin-top: 0; color: #92400e;">⚠️ Bill Update Notice</h4>
          <p style="margin: 0; color: #92400e;">This bill has been modified from its original version. Please review the updated amounts below.</p>
          <p style="margin: 0; color: #92400e; font-weight: bold;">Reason for Edit: ${data.edit_reason || 'No reason provided.'}</p>
        </div>
        <div style="background-color: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <h3 style="margin-top: 0; color: #374151;">Updated Bill Details:</h3>
          <ul style="list-style: none; padding: 0; margin: 0;">
            <li style="padding: 5px 0;"><strong>Room:</strong> ${data.room_number}</li>
            <li style="padding: 5px 0;"><strong>Branch:</strong> ${data.branch_name}</li>
            <li style="padding: 5px 0;"><strong>Billing Period:</strong> ${new Date(data.billing_period_start).toLocaleDateString()} - ${new Date(data.billing_period_end).toLocaleDateString()}</li>
          </ul>
        </div>
        <div style="background-color: #fff; border: 2px solid #e5e7eb; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <h3 style="margin-top: 0; color: #374151; text-align: center;">Updated Bill Breakdown</h3>
          <table style="width: 100%; border-collapse: collapse; margin: 15px 0;">
            <tr style="border-bottom: 1px solid #e5e7eb;">
              <td style="padding: 10px; font-weight: bold;">Monthly Rent</td>
              <td style="padding: 10px; text-align: right;">₱${data.monthly_rent_amount.toLocaleString()}</td>
            </tr>
            <tr style="border-bottom: 1px solid #e5e7eb;">
              <td style="padding: 10px; font-weight: bold;">Electricity (${data.electricity_consumption} kWh)</td>
              <td style="padding: 10px; text-align: right;">₱${data.electricity_amount.toLocaleString()}</td>
            </tr>
            <tr style="border-bottom: 1px solid #e5e7eb;">
              <td style="padding: 10px; font-weight: bold;">Water</td>
              <td style="padding: 10px; text-align: right;">₱${data.water_amount.toLocaleString()}</td>
            </tr>
            ${data.extra_fee > 0 ? `
            <tr style="border-bottom: 1px solid #e5e7eb;">
              <td style="padding: 10px; font-weight: bold;">Extra Fees</td>
              <td style="padding: 10px; text-align: right;">₱${data.extra_fee.toLocaleString()}</td>
            </tr>
            ` : ''}
            ${data.penalty_amount > 0 ? `
            <tr style="border-bottom: 1px solid #e5e7eb;">
              <td style="padding: 10px; font-weight: bold; color: #dc2626;">Penalty</td>
              <td style="padding: 10px; text-align: right; color: #dc2626;">₱${data.penalty_amount.toLocaleString()}</td>
            </tr>
            ` : ''}
            <tr style="border-top: 2px solid #374151; background-color: #f9fafb;">
              <td style="padding: 15px; font-weight: bold; font-size: 18px;">TOTAL AMOUNT DUE</td>
              <td style="padding: 15px; text-align: right; font-weight: bold; font-size: 18px; color: #dc2626;">₱${data.total_amount_due.toLocaleString()}</td>
            </tr>
          </table>
        </div>
        <div style="background-color: #fee2e2; padding: 15px; border-radius: 8px; margin: 20px 0;">
          <h4 style="margin-top: 0; color: #dc2626;">Payment Due Date:</h4>
          <p style="margin: 0; font-weight: bold; color: #dc2626;">${new Date(data.due_date).toLocaleDateString()}</p>
        </div>
        <p>Please settle the updated amount by the due date to avoid any late payment penalties.</p>
        <hr style="margin: 30px 0; border: none; border-top: 1px solid #e5e7eb;">
        <p style="color: #6b7280; font-size: 14px; margin: 0;">
          <strong>J&H Management System</strong><br>
          This is an automated email. Please do not reply to this address.
        </p>
      </div>
    `;

    return { subject, html };
  }

  /**
   * Generate final bill edited email template (move-out bill edited)
   */
  private static generateFinalBillEditedEmail(data: any): { subject: string; html: string } {
    const subject = `Final Bill Update - Move-Out Bill Edited`;
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #f59e0b; margin-bottom: 20px;">Final Bill Update (Move-Out)</h2>
        <p>Dear ${data.full_name},</p>
        <p>Your final bill for move-out has been <strong>updated</strong>. Please review the revised breakdown and reason for this change below:</p>
        <div style="background-color: #fef3c7; border: 2px solid #f59e0b; padding: 15px; border-radius: 8px; margin: 20px 0;">
          <h4 style="margin-top: 0; color: #92400e;">Reason for Edit</h4>
          <p style="margin: 0; color: #92400e; font-weight: bold;">${data.edit_reason || 'No reason provided.'}</p>
        </div>
        <div style="background-color: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <h3 style="margin-top: 0; color: #374151;">Move-Out Details:</h3>
          <ul style="list-style: none; padding: 0; margin: 0;">
            <li style="padding: 5px 0;"><strong>Room:</strong> ${data.room_number}</li>
            <li style="padding: 5px 0;"><strong>Branch:</strong> ${data.branch_name}</li>
            <li style="padding: 5px 0;"><strong>Move-Out Date:</strong> ${data.move_out_date ? new Date(data.move_out_date).toLocaleDateString() : ''}</li>
          </ul>
        </div>
        <div style="background-color: #fff; border: 2px solid #e5e7eb; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <h3 style="margin-top: 0; color: #374151; text-align: center;">Final Bill Breakdown (Updated)</h3>
          <table style="width: 100%; border-collapse: collapse; margin: 15px 0;">
            <tr style="border-bottom: 1px solid #e5e7eb;">
              <td style="padding: 10px; font-weight: bold;">Prorated Rent</td>
              <td style="padding: 10px; text-align: right;">₱${data.prorated_rent?.toLocaleString() || '0'}</td>
            </tr>
            <tr style="border-bottom: 1px solid #e5e7eb;">
              <td style="padding: 10px; font-weight: bold;">Final Electricity Charges</td>
              <td style="padding: 10px; text-align: right;">₱${data.electricity_amount?.toLocaleString() || '0'}</td>
            </tr>
            <tr style="border-bottom: 1px solid #e5e7eb;">
              <td style="padding: 10px; font-weight: bold;">Final Water Charges</td>
              <td style="padding: 10px; text-align: right;">₱${data.water_amount?.toLocaleString() || '0'}</td>
            </tr>
            ${data.extra_fee > 0 ? `
            <tr style="border-bottom: 1px solid #e5e7eb;">
              <td style="padding: 10px; font-weight: bold;">Extra Fees</td>
              <td style="padding: 10px; text-align: right;">₱${data.extra_fee?.toLocaleString() || '0'}</td>
            </tr>
            ` : ''}
            <tr style="border-bottom: 1px solid #e5e7eb;">
              <td style="padding: 10px; font-weight: bold;">Outstanding Bills</td>
              <td style="padding: 10px; text-align: right;">₱${data.outstanding_bills?.toLocaleString() || '0'}</td>
            </tr>
            <tr style="border-bottom: 2px solid #374151;">
              <td style="padding: 10px; font-weight: bold;">Subtotal</td>
              <td style="padding: 10px; text-align: right; font-weight: bold;">₱${data.subtotal?.toLocaleString() || '0'}</td>
            </tr>
            <tr style="border-bottom: 1px solid #e5e7eb; background-color: #ecfdf5;">
              <td style="padding: 10px; font-weight: bold; color: #059669;">Less: Advance Payment</td>
              <td style="padding: 10px; text-align: right; font-weight: bold; color: #059669;">- ₱${data.advance_payment_applied?.toLocaleString() || '0'}</td>
            </tr>
            <tr style="border-bottom: 1px solid #e5e7eb; background-color: #ecfdf5;">
              <td style="padding: 10px; font-weight: bold; color: #059669;">Less: Security Deposit</td>
              <td style="padding: 10px; text-align: right; font-weight: bold; color: #059669;">- ₱${data.security_deposit_applied?.toLocaleString() || '0'}</td>
            </tr>
            ${data.security_deposit_forfeited > 0 ? `
            <tr style="border-bottom: 1px solid #e5e7eb; background-color: #fef2f2;">
              <td style="padding: 10px; font-weight: bold; color: #dc2626;">Security Deposit (Forfeited)</td>
              <td style="padding: 10px; text-align: right; font-weight: bold; color: #dc2626;">₱${data.security_deposit_forfeited?.toLocaleString() || '0'}</td>
            </tr>
            ` : ''}
            <tr style="border-top: 2px solid #374151; background-color: #fee2e2;">
              <td style="padding: 15px; font-weight: bold; font-size: 18px;">AMOUNT DUE</td>
              <td style="padding: 15px; text-align: right; font-weight: bold; font-size: 18px; color: #dc2626;">₱${data.final_amount_due?.toLocaleString() || '0'}</td>
            </tr>
          </table>
        </div>
        <div style="background-color: #fee2e2; border: 2px solid #dc2626; padding: 15px; border-radius: 8px; margin: 20px 0;">
          <h4 style="margin-top: 0; color: #dc2626;">Payment/Refund Status</h4>
          <p style="margin: 0; color: #dc2626;">${data.final_amount_due < 0 ? `A refund of <strong>₱${Math.abs(data.final_amount_due).toLocaleString()}</strong> is due to you.` : `Please settle the outstanding amount of <strong>₱${data.final_amount_due.toLocaleString()}</strong> by the due date.`}</p>
        </div>
        <p>Please contact our management office if you have any questions about this update.</p>
        <hr style="margin: 30px 0; border: none; border-top: 1px solid #e5e7eb;">
        <p style="color: #6b7280; font-size: 14px; margin: 0;">
          <strong>J&H Management System</strong><br>
          This is an automated email. Please do not reply to this address.
        </p>
      </div>
    `;
    return { subject, html };
  }

  /**
   * Send final bill edited email (move-out bill edited)
   */
  static async sendFinalBillEditedEmail(data: {
    email: string;
    full_name: string;
    room_number: string;
    branch_name: string;
    move_out_date: string;
    prorated_rent: number;
    electricity_amount: number;
    water_amount: number;
    extra_fee: number;
    outstanding_bills: number;
    subtotal: number;
    advance_payment_applied: number;
    security_deposit_applied: number;
    security_deposit_forfeited: number;
    final_amount_due: number;
    edit_reason: string;
  }): Promise<{ success: boolean; messageId?: string; error?: string }> {
    try {
      if (!process.env.SMTP_HOST || !process.env.SMTP_USERNAME || !process.env.SMTP_PASSWORD) {
        throw new Error('Missing SMTP configuration.');
      }
      const transporter = this.createTransporter();
      const emailContent = this.generateFinalBillEditedEmail(data);
      const info = await transporter.sendMail({
        from: `"${process.env.FROM_NAME || 'J&H Management'}" <${process.env.FROM_EMAIL || process.env.SMTP_USERNAME}>`,
        to: data.email,
        subject: emailContent.subject,
        html: emailContent.html
      });
      console.log('Final bill edited email sent successfully:', info.messageId);
      return { success: true, messageId: info.messageId };
    } catch (error) {
      console.error('Failed to send final bill edited email:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error occurred' };
    }
  }

  /**
   * Generate final bill email template (move-out with balance due)
   */
  private static generateFinalBillEmail(data: any): { subject: string; html: string } {
    const subject = `Final Bill - Move-Out Settlement Required`;
    
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #dc2626; margin-bottom: 20px;">Final Bill - Settlement Required</h2>
        
        <p>Dear ${data.full_name},</p>
        
        <p>Your move-out process has been initiated. Below is your final consolidated bill that includes all outstanding amounts up to your move-out date of ${new Date(data.move_out_date).toLocaleDateString()}.</p>
        
        <div style="background-color: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <h3 style="margin-top: 0; color: #374151;">Move-Out Details:</h3>
          <ul style="list-style: none; padding: 0; margin: 0;">
            <li style="padding: 5px 0;"><strong>Room:</strong> ${data.room_number}</li>
            <li style="padding: 5px 0;"><strong>Branch:</strong> ${data.branch_name}</li>
            <li style="padding: 5px 0;"><strong>Move-Out Date:</strong> ${new Date(data.move_out_date).toLocaleDateString()}</li>
          </ul>
        </div>
        
        <div style="background-color: #fff; border: 2px solid #e5e7eb; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <h3 style="margin-top: 0; color: #374151; text-align: center;">Final Bill Breakdown</h3>
          
          <table style="width: 100%; border-collapse: collapse; margin: 15px 0;">
            <tr style="border-bottom: 1px solid #e5e7eb;">
              <td style="padding: 10px; font-weight: bold;">Prorated Rent</td>
              <td style="padding: 10px; text-align: right;">₱${data.prorated_rent.toLocaleString()}</td>
            </tr>
            <tr style="border-bottom: 1px solid #e5e7eb;">
              <td style="padding: 10px; font-weight: bold;">Final Electricity Charges</td>
              <td style="padding: 10px; text-align: right;">₱${data.electricity_amount.toLocaleString()}</td>
            </tr>
            <tr style="border-bottom: 1px solid #e5e7eb;">
              <td style="padding: 10px; font-weight: bold;">Final Water Charges</td>
              <td style="padding: 10px; text-align: right;">₱${data.water_amount.toLocaleString()}</td>
            </tr>
            ${data.extra_fee > 0 ? `
            <tr style="border-bottom: 1px solid #e5e7eb;">
              <td style="padding: 10px; font-weight: bold;">Extra Fees</td>
              <td style="padding: 10px; text-align: right;">₱${data.extra_fee.toLocaleString()}</td>
            </tr>
            ` : ''}
            <tr style="border-bottom: 1px solid #e5e7eb;">
              <td style="padding: 10px; font-weight: bold;">Outstanding Bills</td>
              <td style="padding: 10px; text-align: right;">₱${data.outstanding_bills.toLocaleString()}</td>
            </tr>
            <tr style="border-bottom: 2px solid #374151;">
              <td style="padding: 10px; font-weight: bold;">Subtotal</td>
              <td style="padding: 10px; text-align: right; font-weight: bold;">₱${data.subtotal.toLocaleString()}</td>
            </tr>
            <tr style="border-bottom: 1px solid #e5e7eb; background-color: #ecfdf5;">
              <td style="padding: 10px; font-weight: bold; color: #059669;">Less: Advance Payment</td>
              <td style="padding: 10px; text-align: right; font-weight: bold; color: #059669;">- ₱${data.advance_payment_applied.toLocaleString()}</td>
            </tr>
            ${data.security_deposit_applied > 0 ? `
            <tr style="border-bottom: 1px solid #e5e7eb; background-color: #ecfdf5;">
              <td style="padding: 10px; font-weight: bold; color: #059669;">Less: Security Deposit</td>
              <td style="padding: 10px; text-align: right; font-weight: bold; color: #059669;">- ₱${data.security_deposit_applied.toLocaleString()}</td>
            </tr>
            ` : ''}
            ${data.security_deposit_forfeited > 0 ? `
            <tr style="border-bottom: 1px solid #e5e7eb; background-color: #fef2f2;">
              <td style="padding: 10px; font-weight: bold; color: #dc2626;">Security Deposit (Forfeited)</td>
              <td style="padding: 10px; text-align: right; font-weight: bold; color: #dc2626;">₱${data.security_deposit_forfeited.toLocaleString()}</td>
            </tr>
            ` : ''}
            <tr style="border-top: 2px solid #374151; background-color: #fee2e2;">
              <td style="padding: 15px; font-weight: bold; font-size: 18px;">AMOUNT DUE</td>
              <td style="padding: 15px; text-align: right; font-weight: bold; font-size: 18px; color: #dc2626;">₱${data.final_amount_due.toLocaleString()}</td>
            </tr>
          </table>
        </div>
        
        <div style="background-color: #fee2e2; border: 2px solid #dc2626; padding: 15px; border-radius: 8px; margin: 20px 0;">
          <h4 style="margin-top: 0; color: #dc2626;">Payment Required</h4>
          <p style="margin: 0; color: #dc2626;">Please settle the outstanding amount of <strong>₱${data.final_amount_due.toLocaleString()}</strong> to complete your move-out process.</p>
        </div>
        
        <p>Please contact our management office to arrange payment and finalize your move-out process.</p>
        
        <hr style="margin: 30px 0; border: none; border-top: 1px solid #e5e7eb;">
        
        <p style="color: #6b7280; font-size: 14px; margin: 0;">
          <strong>J&H Management System</strong><br>
          This is an automated email. Please do not reply to this address.
        </p>
      </div>
    `;

    return { subject, html };
  }

  /**
   * Generate refund notice email template (move-out with refund due)
   */
  private static generateRefundNoticeEmail(data: any): { subject: string; html: string } {
    const subject = `Refund Notice - Move-Out Settlement`;
    
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #10b981; margin-bottom: 20px;">🎉 Refund Notice</h2>
        
        <p>Dear ${data.full_name},</p>
        
        <p>Great news! Your move-out settlement has been calculated, and you have a refund due. Below are the details of your final settlement:</p>
        
        <div style="background-color: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <h3 style="margin-top: 0; color: #374151;">Move-Out Details:</h3>
          <ul style="list-style: none; padding: 0; margin: 0;">
            <li style="padding: 5px 0;"><strong>Room:</strong> ${data.room_number}</li>
            <li style="padding: 5px 0;"><strong>Branch:</strong> ${data.branch_name}</li>
            <li style="padding: 5px 0;"><strong>Move-Out Date:</strong> ${new Date(data.move_out_date).toLocaleDateString()}</li>
          </ul>
        </div>
        
        <div style="background-color: #fff; border: 2px solid #e5e7eb; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <h3 style="margin-top: 0; color: #374151; text-align: center;">Final Settlement Calculation</h3>
          
          <table style="width: 100%; border-collapse: collapse; margin: 15px 0;">
            <tr style="border-bottom: 1px solid #e5e7eb;">
              <td style="padding: 10px; font-weight: bold;">Prorated Rent</td>
              <td style="padding: 10px; text-align: right;">₱${data.prorated_rent.toLocaleString()}</td>
            </tr>
            <tr style="border-bottom: 1px solid #e5e7eb;">
              <td style="padding: 10px; font-weight: bold;">Final Electricity Charges</td>
              <td style="padding: 10px; text-align: right;">₱${data.electricity_amount.toLocaleString()}</td>
            </tr>
            <tr style="border-bottom: 1px solid #e5e7eb;">
              <td style="padding: 10px; font-weight: bold;">Final Water Charges</td>
              <td style="padding: 10px; text-align: right;">₱${data.water_amount.toLocaleString()}</td>
            </tr>
            ${data.extra_fee > 0 ? `
            <tr style="border-bottom: 1px solid #e5e7eb;">
              <td style="padding: 10px; font-weight: bold;">Extra Fees</td>
              <td style="padding: 10px; text-align: right;">₱${data.extra_fee.toLocaleString()}</td>
            </tr>
            ` : ''}
            <tr style="border-bottom: 1px solid #e5e7eb;">
              <td style="padding: 10px; font-weight: bold;">Outstanding Bills</td>
              <td style="padding: 10px; text-align: right;">₱${data.outstanding_bills.toLocaleString()}</td>
            </tr>
            <tr style="border-bottom: 2px solid #374151;">
              <td style="padding: 10px; font-weight: bold;">Total Charges</td>
              <td style="padding: 10px; text-align: right; font-weight: bold;">₱${data.total_charges.toLocaleString()}</td>
            </tr>
            <tr style="border-bottom: 1px solid #e5e7eb; background-color: #ecfdf5;">
              <td style="padding: 10px; font-weight: bold; color: #059669;">Advance Payment Available</td>
              <td style="padding: 10px; text-align: right; font-weight: bold; color: #059669;">₱${data.advance_payment_available.toLocaleString()}</td>
            </tr>
            <tr style="border-bottom: 1px solid #e5e7eb; background-color: #ecfdf5;">
              <td style="padding: 10px; font-weight: bold; color: #059669;">Security Deposit Available</td>
              <td style="padding: 10px; text-align: right; font-weight: bold; color: #059669;">₱${data.security_deposit_available.toLocaleString()}</td>
            </tr>
            <tr style="border-top: 2px solid #10b981; background-color: #d1fae5;">
              <td style="padding: 15px; font-weight: bold; font-size: 18px; color: #059669;">REFUND AMOUNT</td>
              <td style="padding: 15px; text-align: right; font-weight: bold; font-size: 18px; color: #059669;">₱${data.refund_amount.toLocaleString()}</td>
            </tr>
          </table>
        </div>
        
        <div style="background-color: #d1fae5; border: 2px solid #10b981; padding: 15px; border-radius: 8px; margin: 20px 0; text-align: center;">
          <h3 style="margin: 0; color: #059669;">💰 Refund Due: ₱${data.refund_amount.toLocaleString()}</h3>
          <p style="margin: 10px 0 0 0; color: #059669;">Your refund will be processed shortly.</p>
        </div>
        
        <div style="background-color: #e0f2fe; padding: 15px; border-radius: 8px; margin: 20px 0;">
          <h4 style="margin-top: 0; color: #0277bd;">Refund Process:</h4>
          <ul style="margin: 10px 0;">
            <li>Your refund will be processed within 3-5 business days</li>
            <li>You will be contacted by our management office regarding refund collection</li>
            <li>Please ensure your contact information is up to date</li>
          </ul>
        </div>
        
        <p>Thank you for being a valued tenant at J&H Apartment. We wish you all the best in your future endeavors!</p>
        
        <hr style="margin: 30px 0; border: none; border-top: 1px solid #e5e7eb;">
        
        <p style="color: #6b7280; font-size: 14px; margin: 0;">
          <strong>J&H Management System</strong><br>
          This is an automated email. Please do not reply to this address.
        </p>
      </div>
    `;

    return { subject, html };
  }

  /**
   * Send partial payment confirmation email
   */
  static async sendPartialPaymentEmail(data: {
    email: string;
    full_name: string;
    amount_paid: number;
    payment_date: string;
    payment_method: string;
    notes?: string;
    total_amount_due: number;
    total_paid: number;
    remaining_balance: number;
    due_date: string;
  }): Promise<{ success: boolean; messageId?: string; error?: string }> {
    try {
      if (!process.env.SMTP_HOST || !process.env.SMTP_USERNAME || !process.env.SMTP_PASSWORD) {
        throw new Error('Missing SMTP configuration.');
      }

      const transporter = this.createTransporter();
      const emailContent = this.generatePartialPaymentEmail(data);

      const info = await transporter.sendMail({
        from: `"${process.env.FROM_NAME || 'J&H Management'}" <${process.env.FROM_EMAIL || process.env.SMTP_USERNAME}>`,
        to: data.email,
        subject: emailContent.subject,
        html: emailContent.html
      });

      console.log('Partial payment email sent successfully:', info.messageId);
      return { success: true, messageId: info.messageId };
    } catch (error) {
      console.error('Failed to send partial payment email:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error occurred' };
    }
  }

  /**
   * Send full payment receipt email
   */
  static async sendFullPaymentReceiptEmail(data: {
    email: string;
    full_name: string;
    room_number: string;
    branch_name: string;
    billing_period_start: string;
    billing_period_end: string;
    final_payment_amount: number;
    total_amount_due: number;
    payment_date: string;
  }): Promise<{ success: boolean; messageId?: string; error?: string }> {
    try {
      if (!process.env.SMTP_HOST || !process.env.SMTP_USERNAME || !process.env.SMTP_PASSWORD) {
        throw new Error('Missing SMTP configuration.');
      }

      const transporter = this.createTransporter();
      const emailContent = this.generateFullPaymentReceiptEmail(data);

      const info = await transporter.sendMail({
        from: `"${process.env.FROM_NAME || 'J&H Management'}" <${process.env.FROM_EMAIL || process.env.SMTP_USERNAME}>`,
        to: data.email,
        subject: emailContent.subject,
        html: emailContent.html
      });

      console.log('Full payment receipt email sent successfully:', info.messageId);
      return { success: true, messageId: info.messageId };
    } catch (error) {
      console.error('Failed to send full payment receipt email:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error occurred' };
    }
  }

  /**
   * Send bill edited notification email
   */
  static async sendBillEditedEmail(data: {
    email: string;
    full_name: string;
    room_number: string;
    branch_name: string;
    billing_period_start: string;
    billing_period_end: string;
    monthly_rent_amount: number;
    electricity_amount: number;
    electricity_consumption: number;
    water_amount: number;
    extra_fee: number;
    penalty_amount: number;
    total_amount_due: number;
    due_date: string;
    edit_reason?: string; // Add optional edit reason
  }): Promise<{ success: boolean; messageId?: string; error?: string }> {
    try {
      if (!process.env.SMTP_HOST || !process.env.SMTP_USERNAME || !process.env.SMTP_PASSWORD) {
        throw new Error('Missing SMTP configuration.');
      }

      const transporter = this.createTransporter();
      const emailContent = this.generateBillEditedEmail(data);

      const info = await transporter.sendMail({
        from: `"${process.env.FROM_NAME || 'J&H Management'}" <${process.env.FROM_EMAIL || process.env.SMTP_USERNAME}>`,
        to: data.email,
        subject: emailContent.subject,
        html: emailContent.html
      });

      console.log('Bill edited email sent successfully:', info.messageId);
      return { success: true, messageId: info.messageId };
    } catch (error) {
      console.error('Failed to send bill edited email:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error occurred' };
    }
  }

  /**
   * Send final bill email (move-out with balance due)
   */
  static async sendFinalBillEmail(data: {
    email: string;
    full_name: string;
    room_number: string;
    branch_name: string;
    move_out_date: string;
    prorated_rent: number;
    electricity_amount: number;
    water_amount: number;
    extra_fee: number;
    outstanding_bills: number;
    subtotal: number;
    advance_payment_applied: number;
    security_deposit_applied: number;
    security_deposit_forfeited: number;
    final_amount_due: number;
  }): Promise<{ success: boolean; messageId?: string; error?: string }> {
    try {
      if (!process.env.SMTP_HOST || !process.env.SMTP_USERNAME || !process.env.SMTP_PASSWORD) {
        throw new Error('Missing SMTP configuration.');
      }

      const transporter = this.createTransporter();
      const emailContent = this.generateFinalBillEmail(data);

      const info = await transporter.sendMail({
        from: `"${process.env.FROM_NAME || 'J&H Management'}" <${process.env.FROM_EMAIL || process.env.SMTP_USERNAME}>`,
        to: data.email,
        subject: emailContent.subject,
        html: emailContent.html
      });

      console.log('Final bill email sent successfully:', info.messageId);
      return { success: true, messageId: info.messageId };
    } catch (error) {
      console.error('Failed to send final bill email:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error occurred' };
    }
  }

  /**
   * Send refund notice email (move-out with refund due)
   */
  static async sendRefundNoticeEmail(data: {
    email: string;
    full_name: string;
    room_number: string;
    branch_name: string;
    move_out_date: string;
    prorated_rent: number;
    electricity_amount: number;
    water_amount: number;
    extra_fee: number;
    outstanding_bills: number;
    total_charges: number;
    advance_payment_available: number;
    security_deposit_available: number;
    refund_amount: number;
  }): Promise<{ success: boolean; messageId?: string; error?: string }> {
    try {
      // Validate required environment variables
      if (!process.env.SMTP_HOST || !process.env.SMTP_USERNAME || !process.env.SMTP_PASSWORD) {
        throw new Error('Missing SMTP configuration. Please check your environment variables.');
      }

      // Create transporter
      const transporter = this.createTransporter();

      // Generate email content
      const emailContent = this.generateRefundNoticeEmail(data);

      // Send email
      const info = await transporter.sendMail({
        from: `"${process.env.FROM_NAME || 'J&H Management'}" <${process.env.FROM_EMAIL || process.env.SMTP_USERNAME}>`,
        to: data.email,
        subject: emailContent.subject,
        html: emailContent.html
      });

      console.log('Refund notice email sent successfully:', info.messageId);

      return {
        success: true,
        messageId: info.messageId
      };

    } catch (error) {
      console.error('Failed to send refund notice email:', error);
      
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }

  /**
   * Generate daily admin reminders email template
   */
  private static generateDailyAdminRemindersEmail(data: any): { subject: string; html: string } {
    const subject = `Daily Billing Reminders - ${new Date().toLocaleDateString()}`;
    
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #2563eb; margin-bottom: 20px;">📅 Daily Billing Reminders</h2>
        
        <p>Dear Administrator,</p>
        
        <p>Here are the tenants requiring bill generation in the next 3 days:</p>
        
        ${data.tenants && data.tenants.length > 0 ? `
          <div style="background-color: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="margin-top: 0; color: #374151;">Tenants Requiring Bill Generation</h3>
            
            <table style="width: 100%; border-collapse: collapse; margin: 15px 0;">
              <thead>
                <tr style="background-color: #e5e7eb;">
                  <th style="padding: 12px; text-align: left; border: 1px solid #d1d5db;">Tenant Name</th>
                  <th style="padding: 12px; text-align: left; border: 1px solid #d1d5db;">Room</th>
                  <th style="padding: 12px; text-align: left; border: 1px solid #d1d5db;">Branch</th>
                  <th style="padding: 12px; text-align: left; border: 1px solid #d1d5db;">Cycle End Date</th>
                  <th style="padding: 12px; text-align: left; border: 1px solid #d1d5db;">Days Remaining</th>
                </tr>
              </thead>
              <tbody>
                ${data.tenants.map((tenant: any) => `
                  <tr>
                    <td style="padding: 10px; border: 1px solid #d1d5db;">${tenant.full_name}</td>
                    <td style="padding: 10px; border: 1px solid #d1d5db;">${tenant.room_number}</td>
                    <td style="padding: 10px; border: 1px solid #d1d5db;">${tenant.branch_name}</td>
                    <td style="padding: 10px; border: 1px solid #d1d5db;">${new Date(tenant.cycle_end_date).toLocaleDateString()}</td>
                    <td style="padding: 10px; border: 1px solid #d1d5db; ${tenant.days_remaining <= 1 ? 'color: #dc2626; font-weight: bold;' : 'color: #059669;'}">${tenant.days_remaining} day(s)</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
          
          <div style="background-color: #fef3c7; border: 2px solid #f59e0b; padding: 15px; border-radius: 8px; margin: 20px 0;">
            <h4 style="margin-top: 0; color: #92400e;">⚠️ Action Required</h4>
            <p style="margin: 0; color: #92400e;">Please generate bills for these tenants before their billing cycles end to avoid delays in payment collection.</p>
          </div>
        ` : `
          <div style="background-color: #d1fae5; border: 2px solid #10b981; padding: 15px; border-radius: 8px; margin: 20px 0; text-align: center;">
            <h3 style="margin: 0; color: #059669;">✅ No Action Required</h3>
            <p style="margin: 10px 0 0 0; color: #059669;">All tenants have current bills or sufficient time remaining in their billing cycles.</p>
          </div>
        `}
        
        <div style="background-color: #e0f2fe; padding: 15px; border-radius: 8px; margin: 20px 0;">
          <h4 style="margin-top: 0; color: #0277bd;">Quick Actions:</h4>
          <ul style="margin: 10px 0;">
            <li>Log in to the J&H Management System to generate bills</li>
            <li>Navigate to Billing → Room Status to see tenant billing status</li>
            <li>Use the "Generate Bill" button for each tenant listed above</li>
          </ul>
        </div>
        
        <p>This is your daily reminder sent automatically by the J&H Management System.</p>
        
        <hr style="margin: 30px 0; border: none; border-top: 1px solid #e5e7eb;">
        
        <p style="color: #6b7280; font-size: 14px; margin: 0;">
          <strong>J&H Management System</strong><br>
          Automated Daily Reminder - ${new Date().toLocaleDateString()}<br>
          This is an automated email. Please do not reply to this address.
        </p>
      </div>
    `;

    return { subject, html };
  }

  /**
   * Send daily admin reminders email
   */
  static async sendDailyAdminRemindersEmail(data: DailyAdminRemindersData) {
    try {
      const { adminEmails, tenants, reminderDay } = data;
      
      // Determine email subject and urgency based on reminder day
      const dayText = reminderDay ? `Day ${reminderDay}` : '';
      const urgencyText = reminderDay === 1 ? '🚨 URGENT' : reminderDay === 2 ? '⚠️ IMPORTANT' : '📅 NOTICE';
      const subject = `${urgencyText} Billing Reminder ${dayText} - ${new Date().toLocaleDateString()}`;

      // Generate HTML content
      const html = this.generateDailyRemindersEmailTemplate(tenants, reminderDay);

      // Call the Supabase Edge Function
      const response = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/send-email`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`
        },
        body: JSON.stringify({
          emailType: 'daily_admin_reminders',
          recipientData: { emails: adminEmails },
          templateData: {
            subject,
            html,
            tenants,
            reminderDay
          }
        })
      });

      if (!response.ok) {
        const errorData = await response.text();
        throw new Error(`Email service responded with status ${response.status}: ${errorData}`);
      }

      const result = await response.json();
      
      if (!result.success) {
        throw new Error(result.error || 'Unknown error from email service');
      }

      return { success: true };
    } catch (error) {
      console.error('EmailService error:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  }

  private static generateDailyRemindersEmailTemplate(tenants: any[], reminderDay?: number): string {
    const dayText = reminderDay ? ` - Day ${reminderDay}` : '';
    const urgencyColor = reminderDay === 1 ? '#dc2626' : reminderDay === 2 ? '#ea580c' : '#2563eb';
    const urgencyText = reminderDay === 1 ? '🚨 URGENT - FINAL REMINDER' : 
                      reminderDay === 2 ? '⚠️ IMPORTANT - 2 DAYS REMAINING' : 
                      '📅 NOTICE - 3 DAYS REMAINING';

    return `
      <div style="font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px;">
        <div style="background-color: ${urgencyColor}; color: white; padding: 20px; border-radius: 8px 8px 0 0; text-align: center;">
          <h1 style="margin: 0; font-size: 24px;">${urgencyText}</h1>
          <p style="margin: 10px 0 0 0; font-size: 16px;">Daily Billing Reminders${dayText}</p>
        </div>
        
        <div style="background-color: #f9fafb; padding: 20px; border: 1px solid #e5e7eb; border-top: none;">
          <p><strong>Dear Administrator,</strong></p>
          
          ${reminderDay === 1 ? `
            <div style="background-color: #fef2f2; border: 2px solid #dc2626; padding: 15px; border-radius: 8px; margin: 15px 0;">
              <h3 style="color: #dc2626; margin-top: 0;">🚨 FINAL REMINDER - ACTION REQUIRED TODAY!</h3>
              <p style="color: #7f1d1d; margin: 0;">These tenants' billing cycles end TOMORROW. Bills must be generated TODAY to avoid delays in payment collection.</p>
            </div>
          ` : reminderDay === 2 ? `
            <div style="background-color: #fef3c7; border: 2px solid #ea580c; padding: 15px; border-radius: 8px; margin: 15px 0;">
              <h3 style="color: #ea580c; margin-top: 0;">⚠️ IMPORTANT - 2 DAYS REMAINING</h3>
              <p style="color: #92400e; margin: 0;">These tenants' billing cycles end in 2 days. Please prepare to generate bills soon.</p>
            </div>
          ` : `
            <div style="background-color: #eff6ff; border: 2px solid #2563eb; padding: 15px; border-radius: 8px; margin: 15px 0;">
              <h3 style="color: #2563eb; margin-top: 0;">📅 ADVANCE NOTICE - 3 DAYS REMAINING</h3>
              <p style="color: #1e40af; margin: 0;">These tenants' billing cycles end in 3 days. Start planning bill generation.</p>
            </div>
          `}
          
          <h3 style="color: #374151; margin-top: 25px;">Tenants Requiring Bill Generation</h3>
          
          <table style="width: 100%; border-collapse: collapse; margin: 15px 0; background-color: white; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
            <thead>
              <tr style="background-color: #f3f4f6;">
                <th style="padding: 12px; text-align: left; border-bottom: 1px solid #d1d5db; font-weight: 600;">Tenant Name</th>
                <th style="padding: 12px; text-align: left; border-bottom: 1px solid #d1d5db; font-weight: 600;">Room</th>
                <th style="padding: 12px; text-align: left; border-bottom: 1px solid #d1d5db; font-weight: 600;">Branch</th>
                <th style="padding: 12px; text-align: left; border-bottom: 1px solid #d1d5db; font-weight: 600;">Cycle End Date</th>
                <th style="padding: 12px; text-align: center; border-bottom: 1px solid #d1d5db; font-weight: 600;">Days Left</th>
              </tr>
            </thead>
            <tbody>
              ${tenants.map((tenant, index) => `
                <tr style="${index % 2 === 0 ? 'background-color: #f9fafb;' : 'background-color: white;'}">
                  <td style="padding: 12px; border-bottom: 1px solid #e5e7eb;">${tenant.full_name}</td>
                  <td style="padding: 12px; border-bottom: 1px solid #e5e7eb;">${tenant.room_number}</td>
                  <td style="padding: 12px; border-bottom: 1px solid #e5e7eb;">${tenant.branch_name}</td>
                  <td style="padding: 12px; border-bottom: 1px solid #e5e7eb;">${new Date(tenant.cycle_end_date).toLocaleDateString()}</td>
                  <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; text-align: center;">
                    <span style="
                      padding: 4px 8px; 
                      border-radius: 4px; 
                      font-weight: 600;
                      color: white;
                      background-color: ${tenant.days_remaining === 1 ? '#dc2626' : tenant.days_remaining === 2 ? '#ea580c' : '#2563eb'};
                    ">
                      ${tenant.days_remaining} day${tenant.days_remaining !== 1 ? 's' : ''}
                    </span>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
          
          <div style="margin-top: 25px; padding: 15px; background-color: #f0f9ff; border-radius: 8px; border-left: 4px solid #0ea5e9;">
            <h4 style="color: #0c4a6e; margin-top: 0;">💡 Quick Actions</h4>
            <ul style="color: #0c4a6e; margin: 0; padding-left: 20px;">
              <li>Log into J&H Management System</li>
              <li>Navigate to Billing section</li>
              <li>Generate bills for the listed tenants</li>
              <li>Send bill notifications to tenants</li>
            </ul>
          </div>
          
          <div style="margin-top: 20px; text-align: center; padding: 15px; background-color: #f3f4f6; border-radius: 8px;">
            <p style="margin: 0; color: #6b7280; font-size: 14px;">
              This is an automated reminder from J&H Management System<br>
              Generated on ${new Date().toLocaleDateString('en-PH', { 
                weekday: 'long', 
                year: 'numeric', 
                month: 'long', 
                day: 'numeric' 
              })}
            </p>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Generate monthly report email template
   */
  private static generateMonthlyReportEmail(data: any): { subject: string; html: string } {
    const subject = `Monthly Financial Report - ${data.monthYear}`;
    
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 700px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #2563eb; margin-bottom: 20px;">📊 Monthly Financial Report</h2>
        
        <p>Dear Recipient,</p>
        
        <p>Please find attached the detailed financial report for <strong>${data.monthYear}</strong>.</p>
        
        <div style="background-color: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <h3 style="margin-top: 0; color: #374151;">Summary for ${data.monthYear}</h3>
          
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
            <div>
              <h4 style="margin: 10px 0 5px 0; color: #059669;">Income</h4>
              <ul style="list-style: none; padding: 0; margin: 0;">
                <li style="padding: 3px 0;">Rent Collected: <strong>₱${data.summary.totalRentCollected.toLocaleString()}</strong></li>
                <li style="padding: 3px 0;">Electricity: <strong>₱${data.summary.totalElectricityCollected.toLocaleString()}</strong></li>
                <li style="padding: 3px 0;">Water: <strong>₱${data.summary.totalWaterCollected.toLocaleString()}</strong></li>
                <li style="padding: 3px 0;">Extra Fees: <strong>₱${data.summary.totalExtraFeesCollected.toLocaleString()}</strong></li>
                <li style="padding: 3px 0;">Penalties: <strong>₱${data.summary.totalPenaltyFeesCollected.toLocaleString()}</strong></li>
                <li style="padding: 3px 0;">Forfeited Deposits: <strong>₱${data.summary.forfeitedDeposits.toLocaleString()}</strong></li>
                <li style="padding: 8px 0 3px 0; border-top: 1px solid #d1d5db; font-weight: bold; color: #059669;">
                  Total Income: <strong>₱${data.summary.totalIncome.toLocaleString()}</strong>
                </li>
              </ul>
            </div>
            
            <div>
              <h4 style="margin: 10px 0 5px 0; color: #dc2626;">Expenses</h4>
              <ul style="list-style: none; padding: 0; margin: 0;">
                <li style="padding: 3px 0;">Total Expenses: <strong>₱${data.summary.totalExpenses.toLocaleString()}</strong></li>
                <li style="padding: 8px 0 3px 0; border-top: 1px solid #d1d5db; font-weight: bold;">
                  <span style="color: ${data.summary.profitLoss >= 0 ? '#059669' : '#dc2626'};">
                    ${data.summary.profitLoss >= 0 ? 'Net Profit' : 'Net Loss'}: 
                    <strong>₱${Math.abs(data.summary.profitLoss).toLocaleString()}</strong>
                  </span>
                </li>
              </ul>
            </div>
          </div>
        </div>
        
        <div style="background-color: #e0f2fe; padding: 15px; border-radius: 8px; margin: 20px 0;">
          <h4 style="margin-top: 0; color: #0277bd;">📎 Attachment</h4>
          <p style="margin: 0;">The detailed CSV report containing all transactions and calculations is attached to this email.</p>
        </div>
        
        <p>If you have any questions about this report, please contact the management office.</p>
        
        <hr style="margin: 30px 0; border: none; border-top: 1px solid #e5e7eb;">
        
        <p style="color: #6b7280; font-size: 14px; margin: 0;">
          <strong>J&H Management System</strong><br>
          Generated on ${new Date().toLocaleDateString()}<br>
          This is an automated email. Please do not reply to this address.
        </p>
      </div>
    `;

    return { subject, html };
  }

  /**
   * Send monthly report email with CSV attachment
   */
  static async sendMonthlyReportEmail(data: {
    recipientEmail: string;
    month: string;
    reportData: {
      totalRentCollected: number;
      totalElectricityCollected: number;
      totalWaterCollected: number;
      totalExtraFeesCollected: number;
      totalPenaltyFeesCollected: number;
      forfeitedDeposits: number;
      totalIncome: number;
      totalExpenses: number;
      profitLoss: number;
    };
    csvAttachment: {
      filename: string;
      content: string;
      contentType: string;
    };
  }): Promise<{ success: boolean; messageId?: string; error?: string }> {
    try {
      if (!process.env.SMTP_HOST || !process.env.SMTP_USERNAME || !process.env.SMTP_PASSWORD) {
        throw new Error('Missing SMTP configuration.');
      }

      const transporter = this.createTransporter();
      const emailContent = this.generateMonthlyReportEmail({
        monthYear: data.month,
        summary: data.reportData,
      });

      const info = await transporter.sendMail({
        from: `"${process.env.FROM_NAME || 'J&H Management'}" <${process.env.FROM_EMAIL || process.env.SMTP_USERNAME}>`,
        to: data.recipientEmail,
        subject: emailContent.subject,
        html: emailContent.html,
        attachments: [
          {
            filename: data.csvAttachment.filename,
            content: data.csvAttachment.content,
            contentType: data.csvAttachment.contentType,
          },
        ],
      });

      console.log('Monthly report email sent successfully:', info.messageId);

      return {
        success: true,
        messageId: info.messageId,
      };
    } catch (error) {
      console.error('Failed to send monthly report email:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      };
    }
  }

  /**
   * Send a generic HTML email.
   * Useful for simple, one-off notifications like penalties.
   */
  static async sendGenericEmail(data: {
    to: string;
    subject: string;
    html: string;
  }): Promise<{ success: boolean; messageId?: string; error?: string }> {
    try {
      if (!process.env.SMTP_HOST || !process.env.SMTP_USERNAME || !process.env.SMTP_PASSWORD) {
        throw new Error('Missing SMTP configuration.');
      }

      const transporter = this.createTransporter();

      const info = await transporter.sendMail({
        from: `"${process.env.FROM_NAME || 'J&H Management'}" <${process.env.FROM_EMAIL || process.env.SMTP_USERNAME}>`,
        to: data.to,
        subject: data.subject,
        html: data.html
      });

      console.log('Generic email sent successfully:', info.messageId);

      return {
        success: true,
        messageId: info.messageId
      };
    } catch (error) {
      console.error('Failed to send generic email:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }

  /**
   * Generate farewell email template
   */
  private static generateFarewellEmail(data: any): { subject: string; html: string } {
    const subject = 'Thank You for Staying with J&H Apartment';
    
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #4f46e5; margin-bottom: 20px;">Thank You for Choosing J&H Apartment</h2>
        
        <p>Dear ${data.full_name},</p>
        
        <p>We wanted to confirm that your move-out process has been completed successfully. Thank you for choosing J&H Apartment as your home.</p>
        
        <div style="background-color: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <h3 style="margin-top: 0; color: #374151;">Move-Out Details:</h3>
          <ul style="list-style: none; padding: 0; margin: 0;">
            <li style="padding: 5px 0;"><strong>Room:</strong> ${data.room_number}</li>
            <li style="padding: 5px 0;"><strong>Branch:</strong> ${data.branch_name}</li>
            <li style="padding: 5px 0;"><strong>Move-Out Date:</strong> ${new Date(data.move_out_date).toLocaleDateString()}</li>
          </ul>
        </div>
        
        <p>All accounts have been settled, and your move-out is now complete. We appreciate your tenancy and wish you all the best in your future endeavors.</p>
        
        <p>If you have any questions or need documentation regarding your stay, please don't hesitate to contact our management office.</p>
        
        <p style="margin-top: 30px;">Best wishes,</p>
        <p>J&H Management Team</p>
        
        <hr style="margin: 30px 0; border: none; border-top: 1px solid #e5e7eb;">
        
        <p style="color: #6b7280; font-size: 14px; margin: 0;">
          <strong>J&H Management System</strong><br>
          This is an automated email. Please do not reply to this address.
        </p>
      </div>
    `;

    return { subject, html };
  }
  
  /**
   * Send farewell email to tenant who has moved out
   */
  static async sendFarewellEmail(data: {
    email: string;
    full_name: string;
    room_number: string;
    branch_name: string;
    move_out_date: string;
  }): Promise<{ success: boolean; messageId?: string; error?: string }> {
    try {
      // Validate required environment variables
      if (!process.env.SMTP_HOST || !process.env.SMTP_USERNAME || !process.env.SMTP_PASSWORD) {
        throw new Error('Missing SMTP configuration. Please check your environment variables.');
      }

      // Create transporter
      const transporter = this.createTransporter();

      // Generate email content
      const emailContent = this.generateFarewellEmail(data);

      // Send email
      const info = await transporter.sendMail({
        from: `"${process.env.FROM_NAME || 'J&H Management'}" <${process.env.FROM_EMAIL || process.env.SMTP_USERNAME}>`,
        to: data.email,
        subject: emailContent.subject,
        html: emailContent.html
      });

      console.log('Farewell email sent successfully:', info.messageId);

      return {
        success: true,
        messageId: info.messageId
      };

    } catch (error) {
      console.error('Failed to send farewell email:', error);
      
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }

  /**
   * Generate penalty notification email template
   */
  private static generatePenaltyEmail(data: any): { subject: string; html: string } {
    const subject = `Late Payment Penalty Applied to Your Bill`;
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #dc2626; margin-bottom: 20px;">⚠️ Penalty Applied</h2>
        <p>Dear ${data.full_name},</p>
        <p>A late payment penalty has been applied to your bill for the period <strong>${new Date(data.billing_period_start).toLocaleDateString()} to ${new Date(data.billing_period_end).toLocaleDateString()}</strong>.</p>
        <div style="background-color: #fee2e2; border: 2px solid #dc2626; padding: 15px; border-radius: 8px; margin: 20px 0;">
          <h4 style="margin-top: 0; color: #dc2626;">Penalty Details</h4>
          <ul style="list-style: none; padding: 0; margin: 0;">
            <li style="padding: 5px 0;"><strong>Penalty Amount:</strong> ₱${data.penalty_amount.toLocaleString()}</li>
            <li style="padding: 5px 0;"><strong>Penalty Percentage:</strong> ${data.penalty_percentage}%</li>
            <li style="padding: 5px 0;"><strong>Reason:</strong> Late payment after due date</li>
          </ul>
        </div>
        <div style="background-color: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <h3 style="margin-top: 0; color: #374151;">Updated Bill Breakdown</h3>
          <table style="width: 100%; border-collapse: collapse; margin: 15px 0;">
            <tr style="border-bottom: 1px solid #e5e7eb;"><td style="padding: 10px; font-weight: bold;">Monthly Rent</td><td style="padding: 10px; text-align: right;">₱${data.monthly_rent_amount.toLocaleString()}</td></tr>
            <tr style="border-bottom: 1px solid #e5e7eb;"><td style="padding: 10px; font-weight: bold;">Electricity (${data.electricity_consumption} kWh)</td><td style="padding: 10px; text-align: right;">₱${data.electricity_amount.toLocaleString()}</td></tr>
            <tr style="border-bottom: 1px solid #e5e7eb;"><td style="padding: 10px; font-weight: bold;">Water</td><td style="padding: 10px; text-align: right;">₱${data.water_amount.toLocaleString()}</td></tr>
            ${data.extra_fee > 0 ? `<tr style="border-bottom: 1px solid #e5e7eb;"><td style="padding: 10px; font-weight: bold;">Extra Fees</td><td style="padding: 10px; text-align: right;">₱${data.extra_fee.toLocaleString()}</td></tr>` : ''}
            <tr style="border-bottom: 1px solid #e5e7eb;"><td style="padding: 10px; font-weight: bold; color: #dc2626;">Penalty</td><td style="padding: 10px; text-align: right; color: #dc2626;">₱${data.penalty_amount.toLocaleString()}</td></tr>
            <tr style="border-top: 2px solid #374151; background-color: #f9fafb;"><td style="padding: 15px; font-weight: bold; font-size: 18px;">TOTAL AMOUNT DUE</td><td style="padding: 15px; text-align: right; font-weight: bold; font-size: 18px; color: #dc2626;">₱${data.total_amount_due.toLocaleString()}</td></tr>
          </table>
        </div>
        <div style="background-color: #e0f2fe; padding: 15px; border-radius: 8px; margin: 20px 0;">
          <h4 style="margin-top: 0; color: #0277bd;">Payment Due Date</h4>
          <p style="margin: 0; font-weight: bold; color: #374151;">${new Date(data.due_date).toLocaleDateString()}</p>
        </div>
        <p>Please settle the updated amount by the due date to avoid further penalties. If you have already paid, please disregard this notice.</p>
        <hr style="margin: 30px 0; border: none; border-top: 1px solid #e5e7eb;">
        <p style="color: #6b7280; font-size: 14px; margin: 0;"><strong>J&H Management System</strong><br>This is an automated email. Please do not reply to this address.</p>
      </div>
    `;
    return { subject, html };
  }

  /**
   * Send penalty notification email
   */
  static async sendPenaltyEmail(data: {
    email: string;
    full_name: string;
    room_number: string;
    branch_name: string;
    billing_period_start: string;
    billing_period_end: string;
    monthly_rent_amount: number;
    electricity_amount: number;
    electricity_consumption: number;
    water_amount: number;
    extra_fee: number;
    penalty_amount: number;
    penalty_percentage: number;
    total_amount_due: number;
    due_date: string;
  }): Promise<{ success: boolean; messageId?: string; error?: string }> {
    try {
      if (!process.env.SMTP_HOST || !process.env.SMTP_USERNAME || !process.env.SMTP_PASSWORD) {
        throw new Error('Missing SMTP configuration.');
      }
      const transporter = this.createTransporter();
      const emailContent = this.generatePenaltyEmail(data);
      const info = await transporter.sendMail({
        from: `"${process.env.FROM_NAME || 'J&H Management'}" <${process.env.FROM_EMAIL || process.env.SMTP_USERNAME}>`,
        to: data.email,
        subject: emailContent.subject,
        html: emailContent.html
      });
      console.log('Penalty email sent successfully:', info.messageId);
      return { success: true, messageId: info.messageId };
    } catch (error) {
      console.error('Failed to send penalty email:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error occurred' };
    }
  }

  /**
   * Generate comprehensive monthly report email template
   */
  private static generateComprehensiveMonthlyReportEmail(data: any): { subject: string; html: string } {
    const subject = `Comprehensive Monthly Report - ${data.month}`;
    
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #2563eb; margin-bottom: 20px;">📊 Comprehensive Monthly Financial Report</h2>
        
        <p>Dear Administrator,</p>
        
        <p>Please find attached the comprehensive monthly financial and operational report for <strong>${data.month}</strong>.</p>
        
        <div style="background-color: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <h3 style="margin-top: 0; color: #374151;">Report Overview</h3>
          <p>This comprehensive report includes the following 5 detailed sections:</p>
          <ul style="margin: 15px 0; padding-left: 20px;">
            <li><strong>Section 1:</strong> Overall Monthly Snapshot (Income & Expenses Summary)</li>
            <li><strong>Section 2:</strong> Tenant & Room Status Overview (Occupancy Statistics)</li>
            <li><strong>Section 3:</strong> Detailed Billing & Payment Breakdown (Transaction Details)</li>
            <li><strong>Section 4:</strong> Detailed Company Expenses Breakdown (Operating Costs)</li>
            <li><strong>Section 5:</strong> Tenant Movement Breakdown (Move-ins & Move-outs)</li>
          </ul>
        </div>
        
        <div style="background-color: #e0f7fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <h3 style="margin-top: 0; color: #00695c;">Key Financial Summary</h3>
          <table style="width: 100%; border-collapse: collapse;">
            <tr style="border-bottom: 1px solid #b2dfdb;">
              <td style="padding: 10px; font-weight: bold;">Total Income</td>
              <td style="padding: 10px; text-align: right;">₱${data.reportData.section1?.grandTotalIncome?.toLocaleString() || '0.00'}</td>
            </tr>
            <tr style="border-bottom: 1px solid #b2dfdb;">
              <td style="padding: 10px; font-weight: bold;">Total Expenses</td>
              <td style="padding: 10px; text-align: right;">₱${data.reportData.section1?.grandTotalExpenses?.toLocaleString() || '0.00'}</td>
            </tr>
            <tr style="border-top: 2px solid #00695c; background-color: #f1f8e9;">
              <td style="padding: 15px; font-weight: bold; font-size: 18px;">Net Profit/Loss</td>
              <td style="padding: 15px; text-align: right; font-weight: bold; font-size: 18px; color: ${(data.reportData.section1?.netProfitLoss || 0) >= 0 ? '#2e7d32' : '#d32f2f'};">₱${data.reportData.section1?.netProfitLoss?.toLocaleString() || '0.00'}</td>
            </tr>
          </table>
        </div>
        
        <div style="background-color: #fff3e0; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <h3 style="margin-top: 0; color: #ef6c00;">Tenant & Room Status</h3>
          <ul style="list-style: none; padding: 0; margin: 0;">
            <li style="padding: 5px 0;"><strong>Active Tenants:</strong> ${data.reportData.section2?.activeTenantsCount || 0}</li>
            <li style="padding: 5px 0;"><strong>Vacant Rooms:</strong> ${data.reportData.section2?.vacantRoomsCount || 0}</li>
            <li style="padding: 5px 0;"><strong>New Move-ins:</strong> ${data.reportData.section2?.newTenantsCount || 0}</li>
            <li style="padding: 5px 0;"><strong>Move-outs:</strong> ${data.reportData.section2?.movedOutCount || 0}</li>
          </ul>
        </div>
        
        <div style="background-color: #f3e5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <h3 style="margin-top: 0; color: #7b1fa2;">Data Coverage</h3>
          <ul style="list-style: none; padding: 0; margin: 0;">
            <li style="padding: 5px 0;"><strong>Bills Processed:</strong> ${data.reportData.section3 || 0} bills</li>
            <li style="padding: 5px 0;"><strong>Expense Records:</strong> ${data.reportData.section4 || 0} transactions</li>
            <li style="padding: 5px 0;"><strong>Tenant Movements:</strong> ${(data.reportData.section5?.moveIns || 0) + (data.reportData.section5?.moveOuts || 0)} events</li>
          </ul>
        </div>
        
        <div style="background-color: #e8f5e8; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #4caf50;">
          <p style="margin: 0; font-weight: bold; color: #2e7d32;">📎 Attachment: ${data.csvAttachment.filename}</p>
          <p style="margin: 5px 0 0 0; color: #666;">Complete detailed data in CSV format for further analysis</p>
        </div>
        
        <p>This report was generated automatically and includes all relevant financial and operational data for the specified period.</p>
        
        <p>If you need any clarification or have questions about this report, please contact the system administrator.</p>
        
        <hr style="margin: 30px 0; border: none; border-top: 1px solid #e5e7eb;">
        
        <p style="color: #6b7280; font-size: 14px; margin: 0;">
          <strong>J&H Management System</strong><br>
          Comprehensive Financial Reporting Module<br>
          Generated on: ${new Date().toLocaleString()}<br>
          This is an automated email. Please do not reply to this address.
        </p>
      </div>
    `;

    return { subject, html };
  }

  /**
   * Send comprehensive monthly report email with CSV attachment
   */
  static async sendComprehensiveMonthlyReportEmail(data: {
    recipientEmail: string;
    month: string;
    reportData: any;
    csvAttachment: {
      filename: string;
      content: string;
      contentType: string;
    };
  }): Promise<{ success: boolean; messageId?: string; error?: string }> {
    try {
      // Validate required environment variables
      if (!process.env.SMTP_HOST || !process.env.SMTP_USERNAME || !process.env.SMTP_PASSWORD) {
        throw new Error('Missing SMTP configuration. Please check your environment variables.');
      }

      // Create transporter
      const transporter = this.createTransporter();

      // Generate email content
      const emailContent = this.generateComprehensiveMonthlyReportEmail(data);

      // Send email with CSV attachment
      const info = await transporter.sendMail({
        from: `"${process.env.FROM_NAME || 'J&H Management'}" <${process.env.FROM_EMAIL || process.env.SMTP_USERNAME}>`,
        to: data.recipientEmail,
        subject: emailContent.subject,
        html: emailContent.html,
        attachments: [
          {
            filename: data.csvAttachment.filename,
            content: Buffer.from(data.csvAttachment.content, 'utf-8'),
            contentType: data.csvAttachment.contentType,
          },
        ],
      });

      console.log('Comprehensive monthly report email sent successfully:', info.messageId);

      return {
        success: true,
        messageId: info.messageId
      };

    } catch (error) {
      console.error('Failed to send comprehensive monthly report email:', error);
      
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }

  /**
   * Generate consolidated Excel report email template
   */
  private static generateConsolidatedExcelReportEmail(data: any): { subject: string; html: string } {
    const subject = `Consolidated Excel Report - All Branches - ${data.month}`;
    
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #16a34a; margin-bottom: 20px;">📊 Consolidated Excel Report - All Branches</h2>
        
        <p>Dear Administrator,</p>
        
        <p>Please find attached the consolidated Excel report for <strong>${data.month}</strong> containing data from all branches.</p>
        
        <div style="background-color: #f0fdf4; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #16a34a;">
          <h3 style="margin-top: 0; color: #15803d;">Excel File Structure</h3>
          <p>This Excel file contains <strong>5 separate worksheets</strong>, each with data organized by branch:</p>
          <ul style="margin: 15px 0; padding-left: 20px;">
            <li><strong>Overall Snapshot:</strong> Financial summary by branch (Income & Expenses)</li>
            <li><strong>Tenant Room Status:</strong> Occupancy statistics by branch</li>
            <li><strong>Detailed Billing:</strong> Complete billing and payment breakdown by branch</li>
            <li><strong>Company Expenses:</strong> Operating costs breakdown by branch</li>
            <li><strong>Tenant Movement:</strong> Move-in and move-out data by branch</li>
          </ul>
        </div>
        
        <div style="background-color: #fef3c7; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <h3 style="margin-top: 0; color: #d97706;">Key Features</h3>
          <ul style="margin: 15px 0; padding-left: 20px;">
            <li>📋 <strong>Organized by Branch:</strong> Each worksheet contains data for all branches with clear separators</li>
            <li>📐 <strong>Auto-sized Columns:</strong> Optimized column widths for easy reading</li>
            <li>🎨 <strong>Professional Formatting:</strong> Bold headers and consistent styling</li>
            <li>📊 <strong>Complete Data:</strong> All financial and operational metrics included</li>
            <li>💼 <strong>Business Ready:</strong> Suitable for financial analysis and reporting</li>
          </ul>
        </div>
        
        <div style="background-color: #e0f2fe; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #0284c7;">
          <p style="margin: 0; font-weight: bold; color: #0c4a6e;">📎 Attachment: ${data.excelAttachment.filename}</p>
          <p style="margin: 5px 0 0 0; color: #666;">Excel format (.xlsx) with multiple worksheets for comprehensive analysis</p>
        </div>
        
        <div style="background-color: #f3f4f6; padding: 15px; border-radius: 8px; margin: 20px 0;">
          <h4 style="margin-top: 0; color: #374151;">How to Use:</h4>
          <ol style="margin: 10px 0; padding-left: 20px; color: #6b7280;">
            <li>Download and open the Excel file</li>
            <li>Navigate between worksheets using the tabs at the bottom</li>
            <li>Each worksheet shows data grouped by branch with clear headers</li>
            <li>Use Excel's filtering and sorting features for detailed analysis</li>
          </ol>
        </div>
        
        <p>This consolidated report provides a complete overview of all branch operations for the specified period and is ideal for comprehensive financial analysis and strategic planning.</p>
        
        <p>If you need any assistance with the report or have questions about the data, please contact the system administrator.</p>
        
        <hr style="margin: 30px 0; border: none; border-top: 1px solid #e5e7eb;">
        
        <p style="color: #6b7280; font-size: 14px; margin: 0;">
          <strong>J&H Management System</strong><br>
          Consolidated Excel Reporting Module<br>
          Generated on: ${new Date().toLocaleString()}<br>
          This is an automated email. Please do not reply to this address.
        </p>
      </div>
    `;

    return { subject, html };
  }

  /**
   * Send consolidated Excel report email with Excel attachment
   */
  static async sendConsolidatedExcelReportEmail(data: {
    recipientEmail: string;
    month: string;
    excelAttachment: {
      filename: string;
      content: Buffer;
      contentType: string;
    };
  }): Promise<{ success: boolean; messageId?: string; error?: string }> {
    try {
      // Validate required environment variables
      if (!process.env.SMTP_HOST || !process.env.SMTP_USERNAME || !process.env.SMTP_PASSWORD) {
        throw new Error('Missing SMTP configuration. Please check your environment variables.');
      }

      // Create transporter
      const transporter = this.createTransporter();

      // Generate email content
      const emailContent = this.generateConsolidatedExcelReportEmail(data);

      // Send email with Excel attachment
      const info = await transporter.sendMail({
        from: `"${process.env.FROM_NAME || 'J&H Management'}" <${process.env.FROM_EMAIL || process.env.SMTP_USERNAME}>`,
        to: data.recipientEmail,
        subject: emailContent.subject,
        html: emailContent.html,
        attachments: [
          {
            filename: data.excelAttachment.filename,
            content: data.excelAttachment.content,
            contentType: data.excelAttachment.contentType,
          },
        ],
      });

      console.log('Consolidated Excel report email sent successfully:', info.messageId);

      return {
        success: true,
        messageId: info.messageId
      };

    } catch (error) {
      console.error('Failed to send consolidated Excel report email:', error);
      
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }
} 
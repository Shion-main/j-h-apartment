import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import nodemailer from 'npm:nodemailer';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get admin email addresses from environment variables
    const adminEmails = [
      Deno.env.get('ADMIN_EMAIL_1'),
      Deno.env.get('ADMIN_EMAIL_2'),
      Deno.env.get('ADMIN_EMAIL_3')
    ].filter(Boolean);

    // If no admin emails configured, use SMTP username as fallback
    if (adminEmails.length === 0) {
      adminEmails.push(Deno.env.get('SMTP_USERNAME') || 'admin@jh-apartment.com');
    }

    // Get all active tenants with billing status
    const { data: tenants, error: tenantsError } = await supabase
      .from('tenants')
      .select(`
        id,
        full_name,
        rent_start_date,
        room (
          room_number,
          branch (
            name
          )
        )
      `)
      .eq('is_active', true);

    if (tenantsError) {
      console.error('Error fetching tenants:', tenantsError);
      throw new Error('Failed to fetch tenants');
    }

    // Calculate which tenants need bill generation (3 days or less remaining)
    const tenantsNeedingBills = [];
    const today = new Date();

    for (const tenant of tenants || []) {
      try {
        // Get all bills for this tenant to count fully paid bills
        const { data: bills } = await supabase
          .from('bills')
          .select('status')
          .eq('tenant_id', tenant.id);

        const fullyPaidBillsCount = bills?.filter(bill => bill.status === 'fully_paid').length || 0;

        // Calculate current cycle dates
        const rentStartDate = new Date(tenant.rent_start_date);
        const currentCycleStart = new Date(rentStartDate);
        currentCycleStart.setMonth(currentCycleStart.getMonth() + fullyPaidBillsCount);

        const currentCycleEnd = new Date(currentCycleStart);
        currentCycleEnd.setMonth(currentCycleEnd.getMonth() + 1);
        currentCycleEnd.setDate(currentCycleEnd.getDate() - 1);

        // Calculate days until cycle end
        const daysUntilCycleEnd = Math.ceil((currentCycleEnd.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

        // Check if tenant needs bill generation (3 days or less, including overdue)
        if (daysUntilCycleEnd <= 3) {
          tenantsNeedingBills.push({
            full_name: tenant.full_name,
            room_number: (tenant.room as any).room_number,
            branch_name: (tenant.room as any).branch.name,
            cycle_end_date: currentCycleEnd.toISOString(),
            days_remaining: daysUntilCycleEnd
          });
        }
      } catch (error) {
        console.error(`Error processing tenant ${tenant.id}:`, error);
        // Continue with other tenants
      }
    }

    // Create Nodemailer transporter
    const transporter = nodemailer.createTransporter({
      host: Deno.env.get('SMTP_HOST'),
      port: parseInt(Deno.env.get('SMTP_PORT') || '587'),
      secure: false,
      auth: {
        user: Deno.env.get('SMTP_USERNAME'),
        pass: Deno.env.get('SMTP_PASSWORD')
      }
    });

    // Generate email content
    const emailContent = generateDailyRemindersEmail({ tenants: tenantsNeedingBills });

    // Send emails to all admin addresses
    const emailPromises = adminEmails.map(async (email) => {
      return await transporter.sendMail({
        from: `"${Deno.env.get('FROM_NAME') || 'J&H Management'}" <${Deno.env.get('FROM_EMAIL') || Deno.env.get('SMTP_USERNAME')}>`,
        to: email,
        subject: emailContent.subject,
        html: emailContent.html
      });
    });

    const results = await Promise.allSettled(emailPromises);
    const successful = results.filter(result => result.status === 'fulfilled').length;

    console.log(`Daily admin reminders sent successfully to ${successful}/${adminEmails.length} recipients`);

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          emailsSent: successful,
          totalRecipients: adminEmails.length,
          tenantsRequiringBills: tenantsNeedingBills.length,
          tenants: tenantsNeedingBills
        }
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      },
    );

  } catch (error) {
    console.error('Error in daily reminders function:', error);
    return new Response(
      JSON.stringify({
        error: error.message,
        success: false
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      },
    );
  }
});

function generateDailyRemindersEmail(data: any): { subject: string; html: string } {
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
                  <td style="padding: 10px; border: 1px solid #d1d5db;">${tenant.rooms.room_number}</td>
                  <td style="padding: 10px; border: 1px solid #d1d5db;">${tenant.rooms.branches.name}</td>
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
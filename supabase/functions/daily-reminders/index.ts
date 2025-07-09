import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import nodemailer from 'npm:nodemailer';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface TenantReminderInfo {
  id: string;
  full_name: string;
  room_number: string;
  branch_name: string;
  cycle_end_date: string;
  days_remaining: number;
  reminder_day: number;
}

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

    // Get all active tenants with room and branch information
    const { data: tenants, error: tenantsError } = await supabase
      .from('tenants')
      .select(`
        id,
        full_name,
        rent_start_date,
        rooms (
          room_number,
          branches (
            name
          )
        )
      `)
      .eq('is_active', true);

    if (tenantsError) {
      console.error('Error fetching tenants:', tenantsError);
      throw new Error('Failed to fetch tenants');
    }

    // Calculate which tenants need reminders for exactly 3, 2, or 1 days before cycle end
    const tenantsNeedingReminders: TenantReminderInfo[] = [];
    const today = new Date();

    for (const tenant of tenants || []) {
      try {
        // Get all bills for this tenant to count fully paid bills
        const { data: bills } = await supabase
          .from('bills')
          .select('status')
          .eq('tenant_id', tenant.id);

        const fullyPaidBillsCount = bills?.filter(bill => bill.status === 'fully_paid').length || 0;

        // Calculate current billing cycle
        const rentStartDate = new Date(tenant.rent_start_date);
        
        // If tenant already has bills for current cycle, move to next cycle
        const nextCycleNumber = fullyPaidBillsCount + 1;
        
        // Calculate billing cycle using the same logic as the API
        const cycleStart = new Date(rentStartDate);
        cycleStart.setMonth(cycleStart.getMonth() + (nextCycleNumber - 1));
        
        const cycleEnd = new Date(cycleStart);
        cycleEnd.setMonth(cycleEnd.getMonth() + 1);
        cycleEnd.setDate(cycleEnd.getDate() - 1);
        
        // Calculate days until cycle end
        const daysUntilCycleEnd = Math.ceil((cycleEnd.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

        // Check if we need to send a reminder (exactly 3, 2, or 1 days before)
        if (daysUntilCycleEnd === 3 || daysUntilCycleEnd === 2 || daysUntilCycleEnd === 1) {
          // Check if we've already sent this specific reminder
          const { data: existingReminder } = await supabase
            .from('billing_reminders')
            .select('id')
            .eq('tenant_id', tenant.id)
            .eq('billing_cycle_end_date', cycleEnd.toISOString().split('T')[0])
            .eq('reminder_day', daysUntilCycleEnd)
            .single();

          // Only add if we haven't sent this specific reminder yet
          if (!existingReminder) {
            tenantsNeedingReminders.push({
              id: tenant.id,
              full_name: tenant.full_name,
              room_number: (tenant.rooms as any)?.room_number || 'Unknown Room',
              branch_name: (tenant.rooms as any)?.branches?.name || 'Unknown Branch',
              cycle_end_date: cycleEnd.toISOString(),
              days_remaining: daysUntilCycleEnd,
              reminder_day: daysUntilCycleEnd
            });
          }
        }
      } catch (error) {
        console.error(`Error processing tenant ${tenant.id}:`, error);
        // Continue with other tenants
      }
    }

    if (tenantsNeedingReminders.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          data: {
            message: 'No reminders needed today',
            emailsSent: 0,
            tenantsRequiringReminders: 0
          }
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        },
      );
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

    // Group tenants by reminder day for better email organization
    const reminderGroups = {
      3: tenantsNeedingReminders.filter(t => t.reminder_day === 3),
      2: tenantsNeedingReminders.filter(t => t.reminder_day === 2),
      1: tenantsNeedingReminders.filter(t => t.reminder_day === 1)
    };

    let totalEmailsSent = 0;
    const reminderResults = [];

    // Send reminders for each day group
    for (const [day, tenants] of Object.entries(reminderGroups)) {
      if (tenants.length === 0) continue;

      const dayNumber = parseInt(day);
      
      // Generate email content for this reminder day
      const emailContent = generateDailyRemindersEmail({ tenants, reminderDay: dayNumber });

      try {
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

        if (successful > 0) {
          totalEmailsSent += successful;
          
          // Record each reminder in the database
          for (const tenant of tenants) {
            try {
              await supabase
                .from('billing_reminders')
                .insert({
                  tenant_id: tenant.id,
                  billing_cycle_end_date: tenant.cycle_end_date.split('T')[0],
                  reminder_day: dayNumber,
                  email_sent_to: adminEmails
                });
            } catch (error) {
              console.error(`Error recording reminder for tenant ${tenant.id}:`, error);
            }
          }

          reminderResults.push({
            reminderDay: dayNumber,
            tenantsCount: tenants.length,
            emailsSent: successful
          });

          console.log(`${dayNumber}-day reminders sent successfully to ${successful}/${adminEmails.length} recipients`);
        }
      } catch (error) {
        console.error(`Failed to send ${dayNumber}-day reminders:`, error);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          totalEmailsSent,
          totalTenantsRequiringReminders: tenantsNeedingReminders.length,
          reminderResults,
          tenants: tenantsNeedingReminders
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

function generateDailyRemindersEmail(data: { tenants: TenantReminderInfo[]; reminderDay: number }): { subject: string; html: string } {
  const { tenants, reminderDay } = data;
  const dayText = ` - Day ${reminderDay}`;
  const urgencyText = reminderDay === 1 ? '🚨 URGENT' : reminderDay === 2 ? '⚠️ IMPORTANT' : '📅 NOTICE';
  const subject = `${urgencyText} Billing Reminder${dayText} - ${new Date().toLocaleDateString()}`;
  
  const urgencyColor = reminderDay === 1 ? '#dc2626' : reminderDay === 2 ? '#ea580c' : '#2563eb';
  const urgencyTitle = reminderDay === 1 ? '🚨 URGENT - FINAL REMINDER' : 
                     reminderDay === 2 ? '⚠️ IMPORTANT - 2 DAYS REMAINING' : 
                     '📅 NOTICE - 3 DAYS REMAINING';

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px;">
      <div style="background-color: ${urgencyColor}; color: white; padding: 20px; border-radius: 8px 8px 0 0; text-align: center;">
        <h1 style="margin: 0; font-size: 24px;">${urgencyTitle}</h1>
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
        
        <h3 style="color: #374151; margin-top: 25px;">Tenants Requiring Bill Generation (${tenants.length} tenant${tenants.length !== 1 ? 's' : ''})</h3>
        
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
            })} at ${new Date().toLocaleTimeString('en-PH')}
          </p>
        </div>
      </div>
    </div>
  `;

  return { subject, html };
} 
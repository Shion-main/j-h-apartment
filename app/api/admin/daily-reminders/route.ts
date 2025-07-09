import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { EmailService } from '@/lib/services/emailService';
import { getCurrentBillingCycle, calculateBillingPeriod } from '@/lib/calculations/billing';

interface TenantReminderInfo {
  id: string;
  full_name: string;
  room_number: string;
  branch_name: string;
  cycle_end_date: string;
  days_remaining: number;
  reminder_day: number;
}

export async function POST(request: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });

    // Check for cron job authorization
    const authHeader = request.headers.get('authorization');
    const isCronRequest = authHeader?.startsWith('Bearer ') && 
      authHeader.substring(7) === process.env.CRON_SECRET_KEY;
    
    // If not a cron request, verify user is logged in
    if (!isCronRequest) {
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user) {
        return NextResponse.json({
          error: 'Unauthorized',
          success: false
        }, { status: 401 });
      }
    }

    // Get admin email addresses from system settings or environment variables
    const adminEmails: string[] = [
      process.env.ADMIN_EMAIL_1 || '',
      process.env.ADMIN_EMAIL_2 || '',
      process.env.ADMIN_EMAIL_3 || ''
    ].filter(email => email !== ''); // Remove empty emails

    // If no admin emails configured, use a default
    if (adminEmails.length === 0) {
      adminEmails.push(process.env.SMTP_USERNAME || 'admin@jh-apartment.com');
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
      return NextResponse.json({
        error: 'Failed to fetch tenants',
        success: false
      }, { status: 500 });
    }

    // Calculate which tenants need reminders for exactly 3, 2, or 1 days before cycle end
    const tenantsNeedingReminders: TenantReminderInfo[] = [];
    const today = new Date();
    const todayDate = today.toISOString().split('T')[0]; // YYYY-MM-DD format

    for (const tenant of tenants || []) {
      try {
        // Get all bills for this tenant to count fully paid bills
        const { data: bills } = await supabase
          .from('bills')
          .select('status')
          .eq('tenant_id', tenant.id);

        const fullyPaidBillsCount = bills?.filter(bill => bill.status === 'fully_paid').length || 0;

        // Calculate current billing cycle using the billing calculation function
        const rentStartDate = new Date(tenant.rent_start_date);
        const currentCycle = getCurrentBillingCycle(rentStartDate);
        
        // If tenant already has bills for current cycle, move to next cycle
        const nextCycleNumber = fullyPaidBillsCount + 1;
        const billingCycle = calculateBillingPeriod(rentStartDate, nextCycleNumber);
        
        // Calculate days until cycle end
        const cycleEndDate = new Date(billingCycle.end);
        const daysUntilCycleEnd = Math.ceil((cycleEndDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

        // Check if we need to send a reminder (exactly 3, 2, or 1 days before)
        if (daysUntilCycleEnd === 3 || daysUntilCycleEnd === 2 || daysUntilCycleEnd === 1) {
          // Check if we've already sent this specific reminder
          const { data: existingReminder } = await supabase
            .from('billing_reminders')
            .select('id')
            .eq('tenant_id', tenant.id)
            .eq('billing_cycle_end_date', cycleEndDate.toISOString().split('T')[0])
            .eq('reminder_day', daysUntilCycleEnd)
            .single();

          // Only add if we haven't sent this specific reminder yet
          if (!existingReminder) {
            tenantsNeedingReminders.push({
              id: tenant.id,
              full_name: tenant.full_name,
                             room_number: (tenant.rooms as any)?.room_number || 'Unknown Room',
               branch_name: (tenant.rooms as any)?.branches?.name || 'Unknown Branch',
              cycle_end_date: cycleEndDate.toISOString(),
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
      return NextResponse.json({
        data: {
          message: 'No reminders needed today',
          emailsSent: 0,
          tenantsRequiringReminders: 0
        },
        success: true
      });
    }

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
      
      // Send the daily reminders email
      const emailResult = await EmailService.sendDailyAdminRemindersEmail({
        adminEmails,
        tenants,
        reminderDay: dayNumber
      });

      if (emailResult.success) {
        totalEmailsSent += adminEmails.length;
        
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
          emailsSent: adminEmails.length
        });
      } else {
        console.error(`Failed to send ${dayNumber}-day reminders:`, emailResult.error);
      }
    }

    return NextResponse.json({
      data: {
        totalEmailsSent,
        totalTenantsRequiringReminders: tenantsNeedingReminders.length,
        reminderResults,
        tenants: tenantsNeedingReminders
      },
      success: true
    });

  } catch (error) {
    console.error('API error:', error);
    return NextResponse.json({
      error: 'Internal server error',
      success: false
    }, { status: 500 });
  }
}

// GET endpoint for testing/manual trigger
export async function GET(request: NextRequest) {
  return POST(request);
} 
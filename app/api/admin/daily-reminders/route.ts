import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { EmailService } from '@/lib/services/emailService';

export async function POST(request: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });

    // Get current user for authorization
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({
        error: 'Unauthorized',
        success: false
      }, { status: 401 });
    }

    // Get admin email addresses from system settings or hardcode for now
    const adminEmails: string[] = [
      process.env.ADMIN_EMAIL_1 || '',
      process.env.ADMIN_EMAIL_2 || '',
      process.env.ADMIN_EMAIL_3 || ''
    ].filter(email => email !== ''); // Remove empty emails

    // If no admin emails configured, use a default
    if (adminEmails.length === 0) {
      adminEmails.push(process.env.SMTP_USERNAME || 'admin@jh-apartment.com');
    }

    // Get all active tenants with billing status
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
            room_number: typeof tenant.rooms === 'object' && tenant.rooms !== null && 
              Array.isArray(tenant.rooms) && tenant.rooms.length > 0 && 
              'room_number' in tenant.rooms[0] ? String(tenant.rooms[0].room_number) : 'Unknown Room',
            branch_name: typeof tenant.rooms === 'object' && tenant.rooms !== null && 
              Array.isArray(tenant.rooms) && tenant.rooms.length > 0 && 
              'branches' in tenant.rooms[0] && Array.isArray(tenant.rooms[0].branches) && 
              tenant.rooms[0].branches.length > 0 && 'name' in tenant.rooms[0].branches[0] ? 
              String(tenant.rooms[0].branches[0].name) : 'Unknown Branch',
            cycle_end_date: currentCycleEnd.toISOString(),
            days_remaining: daysUntilCycleEnd
          });
        }
      } catch (error) {
        console.error(`Error processing tenant ${tenant.id}:`, error);
        // Continue with other tenants
      }
    }

    // Send the daily reminders email
    const emailResult = await EmailService.sendDailyAdminRemindersEmail({
      adminEmails,
      tenants: tenantsNeedingBills
    });

    if (emailResult.success) {
      return NextResponse.json({
        data: {
          emailsSent: adminEmails.length,
          tenantsRequiringBills: tenantsNeedingBills.length,
          tenants: tenantsNeedingBills
        },
        success: true
      });
    } else {
      return NextResponse.json({
        error: 'Failed to send reminder emails',
        details: emailResult.error,
        success: false
      }, { status: 500 });
    }

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
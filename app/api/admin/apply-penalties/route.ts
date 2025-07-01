import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { Bill } from '@/types/database';
import { logAuditEvent } from '@/lib/audit/logger';
import { EmailService } from '@/lib/services/emailService';

// Define types for the bill and tenant objects
interface TenantInfo {
  id: string;
  full_name: string;
  email_address: string;
  rooms?: {
    room_number: string;
    branches?: {
      name: string;
    };
  };
}

interface BillWithTenant {
  id: string;
  tenant_id: string;
  due_date: string;
  total_amount_due: number;
  penalty_amount: number;
  amount_paid: number;
  status: string;
  monthly_rent_amount: number;
  electricity_amount: number;
  electricity_consumption: number;
  water_amount: number;
  extra_fee: number;
  billing_period_start: string;
  billing_period_end: string;
  tenant?: TenantInfo;
}

export async function POST(request: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });

    // Get current user for audit logging
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({
        error: 'Unauthorized',
        success: false
      }, { status: 401 });
    }

    // Get all bills that are overdue and not fully paid, with tenant information
    const { data: bills, error: billsError } = await supabase
      .from('bills')
      .select(`
        *,
        tenant:tenants!inner(
          id,
          full_name,
          email_address,
          rooms:rooms!inner(
            room_number,
            branches:branches!inner(
              name
            )
          )
        )
      `)
      .in('status', ['active', 'partially_paid'])
      .lt('due_date', new Date().toISOString().split('T')[0])
      .eq('penalty_amount', 0); // Only apply penalties to bills that don't already have penalties

    if (billsError) {
      console.error('Error fetching bills:', billsError);
      return NextResponse.json({
        error: 'Failed to fetch bills',
        success: false
      }, { status: 500 });
    }

    if (!bills || bills.length === 0) {
      return NextResponse.json({
        data: {
          processed: 0,
          success: 0,
          failed: 0,
          message: 'No overdue bills without penalties found'
        },
        success: true
      });
    }

    // Get penalty percentage from settings
    const { data: settings, error: settingsError } = await supabase
      .from('system_settings')
      .select('value')
      .eq('key', 'penalty_percentage')
      .single();

    if (settingsError) {
      console.error('Error fetching settings:', settingsError);
      return NextResponse.json({
        error: 'Failed to fetch penalty percentage',
        success: false
      }, { status: 500 });
    }

    const penaltyPercentage = parseFloat(settings.value);
    if (isNaN(penaltyPercentage) || penaltyPercentage < 0) {
      return NextResponse.json({
        error: 'Invalid penalty percentage',
        success: false
      }, { status: 500 });
    }

    // Apply penalties to each overdue bill
    const updates = bills.map(async (bill: BillWithTenant) => {
      try {
        const outstandingBalance = bill.total_amount_due - bill.amount_paid;
        
        // Calculate penalty: percentage of outstanding balance, rounded to nearest peso
        const penaltyAmount = Math.round(outstandingBalance * penaltyPercentage / 100);
        const newTotalDue = bill.total_amount_due + penaltyAmount;

        // Update bill with penalty
        const { error: updateError } = await supabase
          .from('bills')
          .update({
            penalty_amount: penaltyAmount,
            total_amount_due: newTotalDue
          })
          .eq('id', bill.id);

        if (updateError) {
          console.error(`Error updating bill ${bill.id}:`, updateError);
          return { id: bill.id, success: false, error: updateError.message };
        }

        // Log audit event
        await logAuditEvent(
          supabase,
          user.id,
          'PENALTY_APPLIED',
          'bills',
          bill.id,
          {
            penalty_amount: bill.penalty_amount,
            total_amount_due: bill.total_amount_due
          },
          {
            penalty_amount: penaltyAmount,
            total_amount_due: newTotalDue,
            penalty_percentage: penaltyPercentage
          }
        );

        // After updating the bill, fetch the updated bill with all joins
        const { data: fullBill, error: fetchError } = await supabase
          .from('bills')
          .select(`
            *,
            tenants!inner(
              id,
              full_name,
              email_address,
              room_id,
              rooms!inner(
                room_number,
                branches!inner(
                  name,
                  electricity_rate
                )
              )
            )
          `)
          .eq('id', bill.id)
          .single();

        if (fetchError || !fullBill) {
          console.error('Failed to fetch full bill for penalty email:', fetchError);
        } else {
          // Send dedicated penalty notification email to tenant
          await EmailService.sendPenaltyEmail({
            email: fullBill.tenants.email_address,
            full_name: fullBill.tenants.full_name,
            room_number: fullBill.tenants.rooms.room_number,
            branch_name: fullBill.tenants.rooms.branches.name,
            billing_period_start: fullBill.billing_period_start,
            billing_period_end: fullBill.billing_period_end,
            monthly_rent_amount: fullBill.monthly_rent_amount,
            electricity_amount: fullBill.electricity_amount,
            electricity_consumption: fullBill.electricity_consumption,
            water_amount: fullBill.water_amount,
            extra_fee: fullBill.extra_fee,
            penalty_amount: fullBill.penalty_amount,
            penalty_percentage: penaltyPercentage,
            total_amount_due: fullBill.total_amount_due,
            due_date: fullBill.due_date
          });
        }

        return { 
          id: bill.id, 
          success: true, 
          penalty: penaltyAmount,
          tenant_name: bill.tenant?.full_name || 'Unknown',
          room_number: bill.tenant?.rooms?.room_number || 'N/A'
        };

      } catch (error) {
        console.error(`Error processing bill ${bill.id}:`, error);
        return { 
          id: bill.id, 
          success: false, 
          error: error instanceof Error ? error.message : 'Unknown error' 
        };
      }
    });

    const results = await Promise.all(updates);
    const successCount = results.filter(r => r.success).length;
    const failedCount = results.filter(r => !r.success).length;

    let message = '';
    if (successCount > 0) {
      message = `Applied penalties to ${successCount} overdue bill${successCount > 1 ? 's' : ''}.`;
    } else if (bills && bills.length > 0) {
      message = 'All overdue bills already have penalties applied.';
    } else {
      message = 'No overdue bills found that need penalties.';
    }

    return NextResponse.json({
      data: {
        processed: results.length,
        success: successCount,
        failed: failedCount,
        details: results,
        penalty_percentage: penaltyPercentage,
        message
      },
      success: failedCount === 0
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
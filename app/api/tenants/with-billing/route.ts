import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { calculateBillingPeriod } from '@/lib/calculations/billing';

export async function GET(request: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    
    // Check authentication first
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' }, 
        { status: 401 }
      );
    }

    // Fetch active tenants with all related data in one query
    const { data: tenants, error: tenantsError } = await supabase
      .from('tenants')
      .select(`
        *,
        rooms (
          id,
          room_number,
          monthly_rent,
          branches (
            id,
            name,
            electricity_rate,
            water_rate
          )
        )
      `)
      .eq('is_active', true)
      .order('full_name');

    if (tenantsError) {
      throw tenantsError;
    }

    // Fetch all bills for active tenants in one query
    const tenantIds = tenants?.map((t: any) => t.id) || [];
    const { data: bills, error: billsError } = await supabase
      .from('bills')
      .select('*')
      .in('tenant_id', tenantIds)
      .order('billing_period_start', { ascending: false });

    if (billsError) {
      throw billsError;
    }

    // Process tenants with billing data efficiently
    const tenantsWithBilling = tenants?.map((tenant: any) => {
      // Get all bills for this tenant
      const tenantBills = bills?.filter((b: any) => b.tenant_id === tenant.id) || [];
      const fullyPaidBillsCount = tenantBills.filter((b: any) => b.status === 'fully_paid').length;
      
      // Calculate billing status
      let billingStatus: 'current' | 'overdue' | 'no_bills' = 'no_bills';
      let daysOverdue = 0;
      let latestBill = null;
      
      if (tenantBills.length > 0) {
        latestBill = tenantBills[0]; // Already sorted by billing_period_start desc
        
        if (latestBill && (latestBill.status === 'active' || latestBill.status === 'partially_paid')) {
          const dueDate = new Date(latestBill.due_date);
          const today = new Date();
          if (today > dueDate) {
            billingStatus = 'overdue';
            daysOverdue = Math.floor((today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));
          } else {
            billingStatus = 'current';
          }
        } else if (latestBill && latestBill.status === 'fully_paid') {
          billingStatus = 'current';
        }
      }
      
      // Calculate current billing cycle
      const rentStartDate = new Date(tenant.rent_start_date);
      const currentCycleNumber = fullyPaidBillsCount + 1;
      const currentCycle = calculateBillingPeriod(rentStartDate, currentCycleNumber);
      
      const today = new Date();
      const daysUntilCycleEnd = Math.ceil((currentCycle.end.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      const canGenerateBill = daysUntilCycleEnd <= 3;

      return {
        ...tenant,
        latest_bill: latestBill,
        days_overdue: daysOverdue,
        billing_status: billingStatus,
        current_cycle_start: currentCycle.start.toISOString().split('T')[0],
        current_cycle_end: currentCycle.end.toISOString().split('T')[0],
        days_until_cycle_end: daysUntilCycleEnd,
        can_generate_bill: canGenerateBill,
      };
    }) || [];

    return NextResponse.json({
      success: true,
      data: tenantsWithBilling,
      metadata: {
        total: tenantsWithBilling.length,
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('Error fetching tenants with billing:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch tenants with billing data'
    }, { status: 500 });
  }
}

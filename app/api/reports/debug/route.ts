import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const supabase = createRouteHandlerClient({ cookies });

  try {
    // Check what data exists in the system
    const debugInfo: any = {
      timestamp: new Date().toISOString(),
      queries: {}
    };

    // 1. Check bills
    const { data: bills, error: billsError } = await supabase
      .from('bills')
      .select('id, billing_period_start, billing_period_end, total_amount_due, amount_paid, status, created_at')
      .order('created_at', { ascending: false })
      .limit(10);

    debugInfo.queries.bills = {
      count: bills?.length || 0,
      error: billsError?.message || null,
      latest: bills?.[0] || null,
      dateRange: bills && bills.length > 0 ? {
        earliest: bills[bills.length - 1]?.billing_period_start,
        latest: bills[0]?.billing_period_start
      } : null
    };

    // 2. Check payments
    const { data: payments, error: paymentsError } = await supabase
      .from('payments')
      .select('id, payment_date, amount, payment_method, created_at')
      .order('created_at', { ascending: false })
      .limit(10);

    debugInfo.queries.payments = {
      count: payments?.length || 0,
      error: paymentsError?.message || null,
      latest: payments?.[0] || null,
      dateRange: payments && payments.length > 0 ? {
        earliest: payments[payments.length - 1]?.payment_date,
        latest: payments[0]?.payment_date
      } : null
    };

    // 3. Check payment_components
    const { data: components, error: componentsError } = await supabase
      .from('payment_components')
      .select('id, component_type, amount, created_at')
      .order('created_at', { ascending: false })
      .limit(10);

    debugInfo.queries.payment_components = {
      count: components?.length || 0,
      error: componentsError?.message || null,
      latest: components?.[0] || null,
      componentTypes: components ? [...new Set(components.map(c => c.component_type))] : []
    };

    // 4. Check tenants
    const { data: tenants, error: tenantsError } = await supabase
      .from('tenants')
      .select('id, full_name, rent_start_date, is_active, created_at')
      .order('created_at', { ascending: false })
      .limit(10);

    debugInfo.queries.tenants = {
      count: tenants?.length || 0,
      error: tenantsError?.message || null,
      activeTenants: tenants?.filter(t => t.is_active).length || 0,
      latest: tenants?.[0] || null
    };

    // 5. Check branches
    const { data: branches, error: branchesError } = await supabase
      .from('branches')
      .select('id, name, created_at')
      .order('created_at', { ascending: false });

    debugInfo.queries.branches = {
      count: branches?.length || 0,
      error: branchesError?.message || null,
      list: branches?.map(b => ({ id: b.id, name: b.name })) || []
    };

    // 6. Check rooms
    const { data: rooms, error: roomsError } = await supabase
      .from('rooms')
      .select('id, room_number, is_occupied, branch_id')
      .order('created_at', { ascending: false })
      .limit(10);

    debugInfo.queries.rooms = {
      count: rooms?.length || 0,
      error: roomsError?.message || null,
      occupiedRooms: rooms?.filter(r => r.is_occupied).length || 0,
      latest: rooms?.[0] || null
    };

    // 7. Check expenses
    const { data: expenses, error: expensesError } = await supabase
      .from('company_expenses')
      .select('id, expense_date, amount, description, created_at')
      .order('created_at', { ascending: false })
      .limit(5);

    debugInfo.queries.company_expenses = {
      count: expenses?.length || 0,
      error: expensesError?.message || null,
      latest: expenses?.[0] || null
    };

    // 8. Test specific queries for common report months
    const testMonths = ['2024-01', '2024-12', '2025-01', '2025-03'];
    debugInfo.testQueries = {};

    for (const month of testMonths) {
      const [year, monthNum] = month.split('-').map(Number);
      const startDate = new Date(year, monthNum - 1, 1);
      const endDate = new Date(year, monthNum, 0);

      // Test payment components for this month
      const { data: testComponents } = await supabase
        .from('payment_components')
        .select(`
          component_type,
          amount,
          payments!inner (
            payment_date
          )
        `)
        .gte('payments.payment_date', startDate.toISOString())
        .lte('payments.payment_date', endDate.toISOString());

      // Test bills for this month
      const { data: testBills } = await supabase
        .from('bills')
        .select('id, billing_period_start, billing_period_end, total_amount_due')
        .gte('billing_period_start', startDate.toISOString().split('T')[0])
        .lte('billing_period_start', endDate.toISOString().split('T')[0]);

      debugInfo.testQueries[month] = {
        period: `${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]}`,
        paymentComponents: testComponents?.length || 0,
        bills: testBills?.length || 0,
        totalAmount: testComponents?.reduce((sum, c) => sum + c.amount, 0) || 0
      };
    }

    return NextResponse.json({
      success: true,
      debug: debugInfo
    });

  } catch (error) {
    console.error('Debug API error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
} 
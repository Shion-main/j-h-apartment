import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

// Force dynamic rendering for this route
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { month, reportType } = body;
    
    if (!month) {
      return NextResponse.json({ 
        error: 'Month parameter is required (e.g., "2025-03")' 
      }, { status: 400 });
    }

    const supabase = createRouteHandlerClient({ cookies });

    // Parse month string (e.g., "2025-03")
    const [year, monthNum] = month.split('-').map(Number);
    
    if (!year || !monthNum || monthNum < 1 || monthNum > 12) {
      return NextResponse.json({ 
        error: 'Invalid month format. Use YYYY-MM format (e.g., "2025-03")' 
      }, { status: 400 });
    }

    // Calculate start and end dates for the selected month
    const startDate = new Date(year, monthNum - 1, 1);
    const endDate = new Date(year, monthNum, 0); // Last day of the month
    const startDateStr = startDate.toISOString().split('T')[0];
    const endDateStr = endDate.toISOString().split('T')[0];

    // Parallel queries for better performance
    const [
      branchesResult,
      roomsResult,
      tenantsResult,
      paymentsResult,
      expensesResult,
      forfeitedDepositsResult
    ] = await Promise.all([
      // Get total branches
      supabase.from('branches').select('id', { count: 'exact' }),
      
      // Get room statistics
      supabase.from('rooms').select('id, is_occupied', { count: 'exact' }),
      
      // Get active tenants
      supabase.from('tenants').select('id', { count: 'exact' }).eq('is_active', true),
      
      // Get monthly income from payment components
      supabase
        .from('payment_components')
        .select(`
          component_type,
          amount,
          payments!inner (
            payment_date
          )
        `)
        .gte('payments.payment_date', startDate.toISOString())
        .lte('payments.payment_date', endDate.toISOString()),
      
      // Get monthly expenses
      supabase
        .from('company_expenses')
        .select('amount')
        .gte('expense_date', startDateStr)
        .lte('expense_date', endDateStr),
      
      // Get forfeited deposits from final bills
      supabase
        .from('bills')
        .select(`
          forfeited_amount,
          tenants!inner(move_out_date)
        `)
        .eq('is_final_bill', true)
        .gt('forfeited_amount', 0)
        .gte('tenants.move_out_date', startDateStr)
        .lte('tenants.move_out_date', endDateStr)
    ]);

    // Check for errors
    const errors = [
      branchesResult.error,
      roomsResult.error,
      tenantsResult.error,
      paymentsResult.error,
      expensesResult.error,
      forfeitedDepositsResult.error
    ].filter(Boolean);

    if (errors.length > 0) {
      console.error('Database errors:', errors);
      return NextResponse.json({ 
        error: 'Failed to fetch summary data',
        details: errors
      }, { status: 500 });
    }

    // Calculate income breakdown
    let totalRent = 0;
    let totalElectricity = 0;
    let totalWater = 0;
    let totalExtraFees = 0;
    let totalPenalty = 0;

    paymentsResult.data?.forEach(component => {
      const amount = component.amount;
      switch (component.component_type) {
        case 'rent': totalRent += amount; break;
        case 'electricity': totalElectricity += amount; break;
        case 'water': totalWater += amount; break;
        case 'extra_fee': totalExtraFees += amount; break;
        case 'penalty': totalPenalty += amount; break;
      }
    });

    // Calculate forfeited deposits
    const totalForfeitedDeposits = forfeitedDepositsResult.data?.reduce(
      (sum, record) => sum + record.forfeited_amount, 0
    ) || 0;

    // Calculate total income and expenses
    const totalIncome = totalRent + totalElectricity + totalWater + totalExtraFees + totalPenalty + totalForfeitedDeposits;
    const totalExpenses = expensesResult.data?.reduce((sum, expense) => sum + expense.amount, 0) || 0;

    // Get room statistics
    const totalRooms = roomsResult.count || 0;
    const occupiedRooms = roomsResult.data?.filter(room => room.is_occupied).length || 0;

    const summaryData = {
      branchCount: branchesResult.count || 0,
      roomCount: totalRooms,
      occupiedRooms: occupiedRooms,
      activeTenants: tenantsResult.count || 0,
      totalIncome: totalIncome,
      totalExpenses: totalExpenses,
      netProfitLoss: totalIncome - totalExpenses,
      incomeBreakdown: {
        rent: totalRent,
        electricity: totalElectricity,
        water: totalWater,
        extraFees: totalExtraFees,
        penalty: totalPenalty,
        forfeitedDeposits: totalForfeitedDeposits
      }
    };

    return NextResponse.json({
      success: true,
      data: summaryData
    });

  } catch (error) {
    console.error('Summary API error:', error);
    return NextResponse.json({
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error',
      success: false
    }, { status: 500 });
  }
} 
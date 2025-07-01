import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const year = searchParams.get('year');

  if (!year) {
    return NextResponse.json({ 
      error: 'Year parameter is required (e.g., ?year=2025)' 
    }, { status: 400 });
  }

  const supabase = createRouteHandlerClient({ cookies });

  try {
    // Calculate start and end dates for the year
    const startDate = new Date(parseInt(year), 0, 1); // January 1st
    const endDate = new Date(parseInt(year), 11, 31); // December 31st
    const startDateStr = startDate.toISOString().split('T')[0];
    const endDateStr = endDate.toISOString().split('T')[0];
    
    console.log(`Generating yearly report for ${year} (${startDateStr} to ${endDateStr})`);

    // Step 1: Fetch all branches
    const { data: branches, error: branchesError } = await supabase
      .from('branches')
      .select('*')
      .order('name');

    if (branchesError) {
      console.error('Error fetching branches:', branchesError);
      return NextResponse.json({ error: branchesError.message }, { status: 500 });
    }

    if (!branches || branches.length === 0) {
      return NextResponse.json({ error: 'No branches found in the system' }, { status: 404 });
    }

    // Initialize summary data
    let totalBills = 0;
    let totalBilled = 0;
    let totalCollected = 0;
    let totalOutstanding = 0;
    let fullyPaidBills = 0;
    let partiallyPaidBills = 0;
    let activeBills = 0;
    let finalBills = 0;
    let totalExpenses = 0;
    let newTenants = 0;
    let movedOutTenants = 0;

    // Initialize branch breakdown data
    const branchBreakdown = [];
    const detailedBills = [];
    const detailedExpenses = [];
    const tenantMovements = [];

    // Step 2: Loop through each branch and collect data
    for (const branch of branches) {
      console.log(`Processing data for branch: ${branch.name}`);

      // Get bills for this branch in the year
      const { data: branchBills } = await supabase
        .from('bills')
        .select(`
          *,
          tenants!inner(
            full_name,
            email_address,
            phone_number,
            branch_id
          ),
          rooms!inner(room_number),
          payments(
            id,
            amount,
            payment_date,
            payment_method,
            notes,
            reference_number
          )
        `)
        .eq('branch_id', branch.id)
        .gte('billing_period_start', startDateStr)
        .lte('billing_period_end', endDateStr);

      // Get expenses for this branch in the year
      const { data: branchExpenses } = await supabase
        .from('company_expenses')
        .select('*')
        .eq('branch_id', branch.id)
        .gte('expense_date', startDateStr)
        .lte('expense_date', endDateStr);

      // Get tenant movements for this branch in the year
      const { data: newTenantsData } = await supabase
        .from('tenants')
        .select('*')
        .eq('branch_id', branch.id)
        .gte('rent_start_date', startDateStr)
        .lte('rent_start_date', endDateStr);

      const { data: movedOutTenantsData } = await supabase
        .from('tenants')
        .select('*')
        .eq('branch_id', branch.id)
        .gte('move_out_date', startDateStr)
        .lte('move_out_date', endDateStr);

      // Calculate branch totals
      let branchTotalBilled = 0;
      let branchTotalCollected = 0;
      let branchTotalOutstanding = 0;
      let branchFullyPaidCount = 0;
      let branchPartiallyPaidCount = 0;
      let branchActiveCount = 0;
      let branchFinalBillCount = 0;

      // Process bills
      for (const bill of branchBills || []) {
        branchTotalBilled += bill.total_amount_due;
        branchTotalCollected += bill.amount_paid;
        branchTotalOutstanding += (bill.total_amount_due - bill.amount_paid);

        if (bill.status === 'fully_paid') branchFullyPaidCount++;
        else if (bill.status === 'partially_paid') branchPartiallyPaidCount++;
        else if (bill.status === 'active') branchActiveCount++;
        if (bill.is_final_bill) branchFinalBillCount++;

        // Add to detailed bills array
        detailedBills.push({
          id: bill.id,
          billingPeriod: `${bill.billing_period_start} - ${bill.billing_period_end}`,
          dueDate: bill.due_date,
          tenantName: bill.tenants.full_name,
          tenantEmail: bill.tenants.email_address,
          tenantPhone: bill.tenants.phone_number,
          branchName: branch.name,
          roomNumber: bill.rooms.room_number,
          monthlyRent: bill.monthly_rent_amount,
          electricityAmount: bill.electricity_amount,
          waterAmount: bill.water_amount,
          extraFee: bill.extra_fee,
          extraFeeDescription: bill.extra_fee_description,
          penaltyAmount: bill.penalty_fee,
          totalAmountDue: bill.total_amount_due,
          amountPaid: bill.amount_paid,
          outstandingAmount: bill.total_amount_due - bill.amount_paid,
          status: bill.status,
          isFinalBill: bill.is_final_bill,
          advancePayment: bill.advance_payment,
          securityDeposit: bill.security_deposit,
          appliedAdvancePayment: bill.applied_advance_payment,
          appliedSecurityDeposit: bill.applied_security_deposit,
          forfeitedAmount: bill.forfeited_amount,
          refundAmount: bill.refund_amount,
          payments: bill.payments
        });
      }

      // Process expenses
      let branchTotalExpenses = 0;
      for (const expense of branchExpenses || []) {
        branchTotalExpenses += expense.amount;
        detailedExpenses.push({
          id: expense.id,
          expenseDate: expense.expense_date,
          amount: expense.amount,
          description: expense.description,
          category: expense.category,
          branchName: branch.name
        });
      }

      // Process tenant movements
      for (const tenant of newTenantsData || []) {
        tenantMovements.push({
          id: tenant.id,
          fullName: tenant.full_name,
          rentStartDate: tenant.rent_start_date,
          moveOutDate: null,
          isActive: tenant.is_active,
          roomNumber: tenant.room_number,
          branchName: branch.name,
          movementType: 'Move In'
        });
      }

      for (const tenant of movedOutTenantsData || []) {
        tenantMovements.push({
          id: tenant.id,
          fullName: tenant.full_name,
          rentStartDate: tenant.rent_start_date,
          moveOutDate: tenant.move_out_date,
          isActive: false,
          roomNumber: tenant.room_number,
          branchName: branch.name,
          movementType: 'Move Out'
        });
      }

      // Update branch breakdown
      branchBreakdown.push({
        name: branch.name,
        address: branch.address,
        totalBilled: branchTotalBilled,
        totalCollected: branchTotalCollected,
        totalOutstanding: branchTotalOutstanding,
        billCount: (branchBills || []).length,
        fullyPaidCount: branchFullyPaidCount,
        partiallyPaidCount: branchPartiallyPaidCount,
        activeCount: branchActiveCount,
        finalBillCount: branchFinalBillCount
      });

      // Update totals
      totalBills += (branchBills || []).length;
      totalBilled += branchTotalBilled;
      totalCollected += branchTotalCollected;
      totalOutstanding += branchTotalOutstanding;
      fullyPaidBills += branchFullyPaidCount;
      partiallyPaidBills += branchPartiallyPaidCount;
      activeBills += branchActiveCount;
      finalBills += branchFinalBillCount;
      totalExpenses += branchTotalExpenses;
      newTenants += (newTenantsData || []).length;
      movedOutTenants += (movedOutTenantsData || []).length;
    }

    // Get active tenants at year end
    const { data: activeTenantsAtYearEnd } = await supabase
      .from('tenants')
      .select('id')
      .eq('is_active', true)
      .lte('rent_start_date', endDateStr);

    // Prepare and return the report data
    const reportData = {
      year: year,
      period: {
        start: startDateStr,
        end: endDateStr
      },
      summary: {
        totalBills,
        totalBilled,
        totalCollected,
        totalOutstanding,
        fullyPaidBills,
        partiallyPaidBills,
        activeBills,
        finalBills,
        totalExpenses,
        newTenants,
        movedOutTenants,
        activeTenantsAtMonthEnd: activeTenantsAtYearEnd?.length || 0
      },
      branchBreakdown,
      detailedBills,
      detailedExpenses,
      tenantMovements
    };

    return NextResponse.json({ data: reportData });

  } catch (error) {
    console.error('Error generating yearly report:', error);
    return NextResponse.json({ error: 'Failed to generate yearly report' }, { status: 500 });
  }
} 
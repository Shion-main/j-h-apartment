import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import * as XLSX from 'xlsx';

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
    
    console.log(`Generating yearly Excel report for ${year} (${startDateStr} to ${endDateStr})`);

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

    // Initialize data structures for each worksheet
    const overallSnapshotData: any[][] = [];
    const tenantRoomStatusData: any[][] = [];
    const detailedBillingData: any[][] = [];
    const companyExpensesData: any[][] = [];
    const tenantMovementData: any[][] = [];

    // Add report title to each worksheet
    const reportTitle = `Yearly Report - All Branches - ${year}`;
    
    overallSnapshotData.push([reportTitle]);
    overallSnapshotData.push([]); // Empty row
    
    tenantRoomStatusData.push([reportTitle]);
    tenantRoomStatusData.push([]); // Empty row
    
    detailedBillingData.push([reportTitle]);
    detailedBillingData.push([]); // Empty row
    
    companyExpensesData.push([reportTitle]);
    companyExpensesData.push([]); // Empty row
    
    tenantMovementData.push([reportTitle]);
    tenantMovementData.push([]); // Empty row

    // Step 2: Loop through each branch and collect data
    for (const branch of branches) {
      console.log(`Processing data for branch: ${branch.name}`);

      // Get payment components for this branch in the year
      const { data: branchPaymentComponents } = await supabase
        .from('payment_components')
        .select(`
          component_type,
          amount,
          payments!inner (
            payment_date,
            payment_method,
            bills!inner (
              branch_id
            )
          )
        `)
        .eq('payments.bills.branch_id', branch.id)
        .gte('payments.payment_date', startDateStr)
        .lte('payments.payment_date', endDateStr);

      // Calculate income by component type for this branch
      let branchTotalRent = 0;
      let branchTotalElectricity = 0;
      let branchTotalWater = 0;
      let branchTotalExtraFees = 0;
      let branchTotalPenalty = 0;

      for (const component of branchPaymentComponents || []) {
        const amount = component.amount;
        switch (component.component_type) {
          case 'rent': branchTotalRent += amount; break;
          case 'electricity': branchTotalElectricity += amount; break;
          case 'water': branchTotalWater += amount; break;
          case 'extra_fee': branchTotalExtraFees += amount; break;
          case 'penalty': branchTotalPenalty += amount; break;
        }
      }

      // Get forfeited deposits for this branch
      const { data: branchForfeitedDeposits } = await supabase
        .from('bills')
        .select(`
          forfeited_amount,
          tenants!inner(move_out_date, branch_id)
        `)
        .eq('is_final_bill', true)
        .eq('tenants.branch_id', branch.id)
        .gt('forfeited_amount', 0)
        .gte('tenants.move_out_date', startDateStr)
        .lte('tenants.move_out_date', endDateStr);

      const branchForfeitedTotal = branchForfeitedDeposits?.reduce((sum, record) => sum + record.forfeited_amount, 0) || 0;

      // Get company expenses for this branch
      const { data: branchExpenses } = await supabase
        .from('company_expenses')
        .select('*')
        .eq('branch_id', branch.id)
        .gte('expense_date', startDateStr)
        .lte('expense_date', endDateStr);

      const branchTotalExpenses = branchExpenses?.reduce((sum, expense) => sum + expense.amount, 0) || 0;

      // Get deposits refunded for this branch
      const { data: branchRefundBills } = await supabase
        .from('bills')
        .select(`
          refund_amount,
          tenants!inner(move_out_date, branch_id)
        `)
        .eq('is_final_bill', true)
        .eq('tenants.branch_id', branch.id)
        .gt('refund_amount', 0)
        .gte('tenants.move_out_date', startDateStr)
        .lte('tenants.move_out_date', endDateStr);

      const branchTotalRefunds = branchRefundBills?.reduce((sum, bill) => sum + bill.refund_amount, 0) || 0;

      // Calculate totals for this branch
      const branchGrandTotalIncome = branchTotalRent + branchTotalElectricity + branchTotalWater + 
                                   branchTotalExtraFees + branchTotalPenalty + branchForfeitedTotal;
      const branchGrandTotalExpenses = branchTotalExpenses + branchTotalRefunds;
      const branchNetProfitLoss = branchGrandTotalIncome - branchGrandTotalExpenses;

      // Add to Overall Snapshot worksheet
      overallSnapshotData.push([`--- ${branch.name} ---`]);
      overallSnapshotData.push(['Type', 'Description', 'Amount (PHP)']);
      overallSnapshotData.push(['Income', 'Total Rent Collected', branchTotalRent.toFixed(2)]);
      overallSnapshotData.push(['Income', 'Total Electricity Collected', branchTotalElectricity.toFixed(2)]);
      overallSnapshotData.push(['Income', 'Total Water Collected', branchTotalWater.toFixed(2)]);
      overallSnapshotData.push(['Income', 'Total Extra Fees Collected', branchTotalExtraFees.toFixed(2)]);
      overallSnapshotData.push(['Income', 'Total Penalty Fees Collected', branchTotalPenalty.toFixed(2)]);
      overallSnapshotData.push(['Income', 'Total Forfeited Deposits', branchForfeitedTotal.toFixed(2)]);
      overallSnapshotData.push(['Income', 'Grand Total Income', branchGrandTotalIncome.toFixed(2)]);
      overallSnapshotData.push(['Expense', 'Total Company Expenses', branchTotalExpenses.toFixed(2)]);
      overallSnapshotData.push(['Expense', 'Total Deposits Refunded', branchTotalRefunds.toFixed(2)]);
      overallSnapshotData.push(['Expense', 'Grand Total Expenses', branchGrandTotalExpenses.toFixed(2)]);
      overallSnapshotData.push(['Summary', 'Net Profit/Loss', branchNetProfitLoss.toFixed(2)]);
      overallSnapshotData.push([]); // Empty row for spacing

      // Get tenant and room status data
      const { data: activeTenantsCount } = await supabase
        .from('tenants')
        .select('id')
        .eq('branch_id', branch.id)
        .eq('is_active', true)
        .lte('rent_start_date', endDateStr);

      const { data: vacantRoomsCount } = await supabase
        .from('rooms')
        .select('id')
        .eq('branch_id', branch.id)
        .eq('is_occupied', false);

      const { data: newTenantsCount } = await supabase
        .from('tenants')
        .select('id')
        .eq('branch_id', branch.id)
        .gte('rent_start_date', startDateStr)
        .lte('rent_start_date', endDateStr);

      const { data: movedOutTenantsCount } = await supabase
        .from('tenants')
        .select('id')
        .eq('branch_id', branch.id)
        .gte('move_out_date', startDateStr)
        .lte('move_out_date', endDateStr);

      // Add to Tenant Room Status worksheet
      tenantRoomStatusData.push([`--- ${branch.name} ---`]);
      tenantRoomStatusData.push(['Metric', 'Count']);
      tenantRoomStatusData.push(['Active Tenants (at year-end)', activeTenantsCount?.length || 0]);
      tenantRoomStatusData.push(['Vacant Rooms (at year-end)', vacantRoomsCount?.length || 0]);
      tenantRoomStatusData.push(['New Tenants Moved In', newTenantsCount?.length || 0]);
      tenantRoomStatusData.push(['Tenants Moved Out', movedOutTenantsCount?.length || 0]);
      tenantRoomStatusData.push([]); // Empty row for spacing

      // Get detailed billing data
      const { data: branchBills } = await supabase
        .from('bills')
        .select(`
          *,
          tenants!inner(full_name),
          rooms!inner(room_number),
          payments(payment_date, payment_method, amount)
        `)
        .eq('branch_id', branch.id)
        .gte('billing_period_start', startDateStr)
        .lte('billing_period_end', endDateStr)
        .order('billing_period_start', { ascending: true });

      // Add to Detailed Billing worksheet
      detailedBillingData.push([`--- ${branch.name} ---`]);
      detailedBillingData.push(['Tenant Full Name', 'Room Number', 'Billing Period', 'Bill Due Date', 'Original Total Amount Due (PHP)', 'Total Amount Paid for this Bill (PHP)', 'Current Bill Status', 'Payment Date', 'Payment Method', 'Amount Paid (PHP)']);
      
      for (const bill of branchBills || []) {
        const tenantName = (bill.tenants as any)?.full_name || 'Unknown';
        const roomNumber = (bill.rooms as any)?.room_number || 'Unknown';
        const billingPeriod = `${bill.billing_period_start} - ${bill.billing_period_end}`;
        const dueDate = bill.due_date;
        const originalTotal = bill.total_amount_due.toFixed(2);
        const totalPaid = bill.amount_paid.toFixed(2);
        const status = bill.status;

        if (bill.payments && bill.payments.length > 0) {
          for (const payment of bill.payments) {
            detailedBillingData.push([
              tenantName,
              roomNumber,
              billingPeriod,
              dueDate,
              originalTotal,
              totalPaid,
              status,
              payment.payment_date,
              payment.payment_method,
              payment.amount.toFixed(2)
            ]);
          }
        } else {
          detailedBillingData.push([
            tenantName,
            roomNumber,
            billingPeriod,
            dueDate,
            originalTotal,
            totalPaid,
            status,
            '',
            '',
            ''
          ]);
        }
      }
      detailedBillingData.push([]); // Empty row for spacing

      // Add to Company Expenses worksheet
      companyExpensesData.push([`--- ${branch.name} ---`]);
      companyExpensesData.push(['Date', 'Category', 'Description', 'Amount (PHP)']);
      
      for (const expense of branchExpenses || []) {
        companyExpensesData.push([
          expense.expense_date,
          expense.category,
          expense.description,
          expense.amount.toFixed(2)
        ]);
      }
      companyExpensesData.push([]); // Empty row for spacing

      // Get tenant movement data
      const { data: tenantMovements } = await supabase
        .from('tenants')
        .select('*')
        .eq('branch_id', branch.id)
        .or(`rent_start_date.gte.${startDateStr},move_out_date.lte.${endDateStr}`);

      // Add to Tenant Movement worksheet
      tenantMovementData.push([`--- ${branch.name} ---`]);
      tenantMovementData.push(['Tenant Name', 'Room Number', 'Movement Type', 'Date']);
      
      for (const tenant of tenantMovements || []) {
        if (tenant.rent_start_date >= startDateStr && tenant.rent_start_date <= endDateStr) {
          tenantMovementData.push([
            tenant.full_name,
            tenant.room_number,
            'Move In',
            tenant.rent_start_date
          ]);
        }
        if (tenant.move_out_date && tenant.move_out_date >= startDateStr && tenant.move_out_date <= endDateStr) {
          tenantMovementData.push([
            tenant.full_name,
            tenant.room_number,
            'Move Out',
            tenant.move_out_date
          ]);
        }
      }
      tenantMovementData.push([]); // Empty row for spacing
    }

    // Create workbook and add worksheets
    const workbook = XLSX.utils.book_new();

    const overallSnapshotWs = XLSX.utils.aoa_to_sheet(overallSnapshotData);
    XLSX.utils.book_append_sheet(workbook, overallSnapshotWs, 'Overall Snapshot');

    const tenantRoomStatusWs = XLSX.utils.aoa_to_sheet(tenantRoomStatusData);
    XLSX.utils.book_append_sheet(workbook, tenantRoomStatusWs, 'Tenant & Room Status');

    const detailedBillingWs = XLSX.utils.aoa_to_sheet(detailedBillingData);
    XLSX.utils.book_append_sheet(workbook, detailedBillingWs, 'Detailed Billing');

    const companyExpensesWs = XLSX.utils.aoa_to_sheet(companyExpensesData);
    XLSX.utils.book_append_sheet(workbook, companyExpensesWs, 'Company Expenses');

    const tenantMovementWs = XLSX.utils.aoa_to_sheet(tenantMovementData);
    XLSX.utils.book_append_sheet(workbook, tenantMovementWs, 'Tenant Movements');

    // Write workbook to buffer
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    // Return Excel file
    return new Response(buffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="yearly_report_${year}.xlsx"`
      }
    });

  } catch (error) {
    console.error('Error generating yearly Excel report:', error);
    return NextResponse.json({ error: 'Failed to generate yearly Excel report' }, { status: 500 });
  }
} 
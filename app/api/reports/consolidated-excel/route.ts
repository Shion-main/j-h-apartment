import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import * as XLSX from 'xlsx';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const reportMonth = searchParams.get('month'); // e.g., "3" for March
  const reportYear = searchParams.get('year'); // e.g., "2025"

  if (!reportMonth || !reportYear) {
    return NextResponse.json({ 
      error: 'Month and year parameters are required (e.g., ?month=3&year=2025)' 
    }, { status: 400 });
  }

  const month = parseInt(reportMonth);
  const year = parseInt(reportYear);

  if (isNaN(month) || isNaN(year) || month < 1 || month > 12) {
    return NextResponse.json({ 
      error: 'Invalid month or year. Month must be 1-12, year must be a valid year' 
    }, { status: 400 });
  }

  const supabase = createRouteHandlerClient({ cookies });

  try {
    // Calculate start and end dates for the selected month
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0); // Last day of the month
    const startDateStr = startDate.toISOString().split('T')[0];
    const endDateStr = endDate.toISOString().split('T')[0];
    
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'];
    const monthName = monthNames[month - 1];
    
    console.log(`Generating consolidated Excel report for ${monthName} ${year} (${startDateStr} to ${endDateStr})`);

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
    const reportTitle = `Consolidated Monthly Report - All Branches - ${monthName} ${year}`;
    
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

      // SECTION 1: Overall Monthly Snapshot for this branch
      
      // Get payment components for this branch in the month
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
        .gte('payments.payment_date', startDate.toISOString())
        .lte('payments.payment_date', endDate.toISOString());

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

      // SECTION 2: Tenant & Room Status Overview for this branch

      // Active tenants for this branch at month-end
      const { data: branchActiveTenants } = await supabase
        .from('tenants')
        .select('id')
        .eq('branch_id', branch.id)
        .eq('is_active', true);

      // Vacant rooms for this branch at month-end
      const { data: branchVacantRooms } = await supabase
        .from('rooms')
        .select('id')
        .eq('branch_id', branch.id)
        .eq('is_occupied', false);

      // New tenants moved in during the month for this branch
      const { data: branchNewTenants } = await supabase
        .from('tenants')
        .select('id')
        .eq('branch_id', branch.id)
        .gte('rent_start_date', startDateStr)
        .lte('rent_start_date', endDateStr);

      // Tenants moved out during the month for this branch
      const { data: branchMovedOutTenants } = await supabase
        .from('tenants')
        .select('id')
        .eq('branch_id', branch.id)
        .gte('move_out_date', startDateStr)
        .lte('move_out_date', endDateStr);

      // Add to Tenant Room Status worksheet
      tenantRoomStatusData.push([`--- ${branch.name} ---`]);
      tenantRoomStatusData.push(['Metric', 'Count']);
      tenantRoomStatusData.push(['Active Tenants (at month-end)', branchActiveTenants?.length || 0]);
      tenantRoomStatusData.push(['Vacant Rooms (at month-end)', branchVacantRooms?.length || 0]);
      tenantRoomStatusData.push(['New Tenants Moved In', branchNewTenants?.length || 0]);
      tenantRoomStatusData.push(['Tenants Moved Out', branchMovedOutTenants?.length || 0]);
      tenantRoomStatusData.push([]); // Empty row for spacing

      // SECTION 3: Detailed Billing & Payment Breakdown for this branch
      
      const { data: branchBillsData } = await supabase
        .from('bills')
        .select(`
          *,
          tenants!inner(full_name),
          rooms!inner(room_number),
          payments(payment_date, payment_method, amount)
        `)
        .eq('branch_id', branch.id)
        .gte('billing_period_start', startDateStr)
        .lt('billing_period_start', new Date(year, month, 1).toISOString().split('T')[0]) // Start of next month
        .order('billing_period_start', { ascending: true });

      // Add to Detailed Billing worksheet
      detailedBillingData.push([`--- ${branch.name} ---`]);
      detailedBillingData.push(['Tenant Full Name', 'Room Number', 'Billing Period', 'Bill Due Date', 'Original Total Amount Due (PHP)', 'Total Amount Paid for this Bill (PHP)', 'Current Bill Status', 'Payment Date', 'Payment Method', 'Amount Paid (PHP)']);
      
      for (const bill of branchBillsData || []) {
        const tenantName = (bill.tenants as any)?.full_name || 'Unknown';
        const roomNumber = (bill.rooms as any)?.room_number || 'Unknown';
        const billingPeriod = `${bill.billing_period_start} - ${bill.billing_period_end}`;
        const dueDate = bill.due_date;
        const originalTotal = bill.total_amount_due.toFixed(2);
        const totalPaid = bill.amount_paid.toFixed(2);
        const status = bill.status;

        const payments = bill.payments as any[] || [];
        
        if (payments.length === 0) {
          // Bill with no payments
          detailedBillingData.push([tenantName, roomNumber, billingPeriod, dueDate, originalTotal, totalPaid, status, '', '', '']);
        } else {
          // Bill with payments
          for (const payment of payments) {
            const paymentDate = payment.payment_date ? new Date(payment.payment_date).toISOString().split('T')[0] : '';
            const paymentMethod = payment.payment_method || '';
            const paymentAmount = payment.amount ? payment.amount.toFixed(2) : '0.00';
            
            detailedBillingData.push([tenantName, roomNumber, billingPeriod, dueDate, originalTotal, totalPaid, status, paymentDate, paymentMethod, paymentAmount]);
          }
        }
      }
      detailedBillingData.push([]); // Empty row for spacing

      // SECTION 4: Company Expenses Breakdown for this branch
      
      companyExpensesData.push([`--- ${branch.name} ---`]);
      companyExpensesData.push(['Expense Date', 'Amount (PHP)', 'Description', 'Category']);
      
      for (const expense of branchExpenses || []) {
        const expenseDate = expense.expense_date;
        const amount = expense.amount.toFixed(2);
        const description = expense.description || '';
        const category = expense.category || '';
        
        companyExpensesData.push([expenseDate, amount, description, category]);
      }
      companyExpensesData.push([]); // Empty row for spacing

      // SECTION 5: Tenant Movement Breakdown for this branch
      
      // Move-in data for this branch
      const { data: branchMoveInData } = await supabase
        .from('tenants')
        .select(`
          full_name,
          rent_start_date,
          advance_payment,
          security_deposit,
          rooms!inner(room_number)
        `)
        .eq('branch_id', branch.id)
        .gte('rent_start_date', startDateStr)
        .lte('rent_start_date', endDateStr);

      // Move-out data for this branch
      const { data: branchMoveOutData } = await supabase
        .from('tenants')
        .select(`
          full_name,
          move_out_date,
          bills!inner(
            total_amount_due,
            applied_advance_payment,
            applied_security_deposit,
            forfeited_amount,
            refund_amount
          )
        `)
        .eq('branch_id', branch.id)
        .gte('move_out_date', startDateStr)
        .lte('move_out_date', endDateStr)
        .eq('bills.is_final_bill', true);

      tenantMovementData.push([`--- ${branch.name} ---`]);
      tenantMovementData.push([]); // Empty row
      tenantMovementData.push(['Move-In Data']);
      tenantMovementData.push(['Tenant Full Name', 'Rent Start Date', 'Room Number', 'Advance Payment Collected (PHP)', 'Security Deposit Collected (PHP)']);
      
      for (const tenant of branchMoveInData || []) {
        const fullName = tenant.full_name || '';
        const rentStartDate = tenant.rent_start_date;
        const roomNumber = (tenant.rooms as any)?.room_number || 'Unknown';
        const advancePayment = tenant.advance_payment.toFixed(2);
        const securityDeposit = tenant.security_deposit.toFixed(2);
        
        tenantMovementData.push([fullName, rentStartDate, roomNumber, advancePayment, securityDeposit]);
      }
      
      tenantMovementData.push([]); // Empty row
      tenantMovementData.push(['Move-Out Data']);
      tenantMovementData.push(['Tenant Full Name', 'Move Out Date', 'Final Bill Total Amount Due (PHP)', 'Total Deposits Used/Forfeited (PHP)', 'Total Deposits Refunded (PHP)']);
      
      for (const tenant of branchMoveOutData || []) {
        const fullName = tenant.full_name || '';
        const moveOutDate = tenant.move_out_date || '';
        
        const finalBill = (tenant.bills as any[])?.[0]; // Should only be one final bill
        if (finalBill) {
          const finalBillTotal = finalBill.total_amount_due.toFixed(2);
          const depositsUsed = (finalBill.applied_advance_payment + finalBill.applied_security_deposit + finalBill.forfeited_amount).toFixed(2);
          const depositsRefunded = finalBill.refund_amount.toFixed(2);
          
          tenantMovementData.push([fullName, moveOutDate, finalBillTotal, depositsUsed, depositsRefunded]);
        }
      }
      tenantMovementData.push([]); // Empty row for spacing between branches
    }

    // Step 3: Create Excel workbook with multiple worksheets
    const workbook = XLSX.utils.book_new();

    // Create worksheets
    const overallSnapshotWS = XLSX.utils.aoa_to_sheet(overallSnapshotData);
    const tenantRoomStatusWS = XLSX.utils.aoa_to_sheet(tenantRoomStatusData);
    const detailedBillingWS = XLSX.utils.aoa_to_sheet(detailedBillingData);
    const companyExpensesWS = XLSX.utils.aoa_to_sheet(companyExpensesData);
    const tenantMovementWS = XLSX.utils.aoa_to_sheet(tenantMovementData);

    // Add worksheets to workbook
    XLSX.utils.book_append_sheet(workbook, overallSnapshotWS, "Overall Snapshot");
    XLSX.utils.book_append_sheet(workbook, tenantRoomStatusWS, "Tenant Room Status");
    XLSX.utils.book_append_sheet(workbook, detailedBillingWS, "Detailed Billing");
    XLSX.utils.book_append_sheet(workbook, companyExpensesWS, "Company Expenses");
    XLSX.utils.book_append_sheet(workbook, tenantMovementWS, "Tenant Movement");

    // Auto-size columns for all worksheets
    const worksheets = [overallSnapshotWS, tenantRoomStatusWS, detailedBillingWS, companyExpensesWS, tenantMovementWS];
    worksheets.forEach(ws => {
      const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
      const colWidths: number[] = [];
      
      for (let C = range.s.c; C <= range.e.c; ++C) {
        let maxWidth = 10;
        for (let R = range.s.r; R <= range.e.r; ++R) {
          const cellAddress = XLSX.utils.encode_cell({ r: R, c: C });
          const cell = ws[cellAddress];
          if (cell && cell.v) {
            const cellLength = cell.v.toString().length;
            maxWidth = Math.max(maxWidth, Math.min(cellLength, 50));
          }
        }
        colWidths[C] = maxWidth;
      }
      
      ws['!cols'] = colWidths.map(w => ({ width: w }));
    });

    // Generate Excel buffer
    const excelBuffer = XLSX.write(workbook, { 
      type: 'buffer', 
      bookType: 'xlsx',
      compression: true 
    });

    // Return Excel file
    return new NextResponse(excelBuffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="consolidated_monthly_report_${monthName}_${year}.xlsx"`,
      },
    });

  } catch (error) {
    console.error('Error generating consolidated Excel report:', error);
    return NextResponse.json({ error: 'Failed to generate consolidated Excel report' }, { status: 500 });
  }
} 
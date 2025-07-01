import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const reportMonth = searchParams.get('month'); // e.g., "3" for March
  const reportYear = searchParams.get('year'); // e.g., "2025"
  const download = searchParams.get('download') === 'true';

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
    const startDate = new Date(Date.UTC(year, month - 1, 1)); // First day of month (UTC)
    const endDate = new Date(Date.UTC(year, month, 0)); // Last day of month (UTC)
    const startDateStr = startDate.toISOString().split('T')[0];
    const endDateStr = endDate.toISOString().split('T')[0];

    // Get all bills for the period (bills with billing period in this month)
    const { data: billsData, error: billsError } = await supabase
      .from('bills')
      .select(`
        *,
        tenants!inner(
          id,
          full_name,
          email_address,
          phone_number
        ),
        rooms!inner(
          id,
            room_number,
          branch_id,
          branches!inner(
            id,
            name
          )
        ),
        payments(
          id,
          amount,
          payment_date,
          payment_method,
          notes,
          reference_number
        )
      `)
      .gte('billing_period_start', startDateStr)
      .lte('billing_period_start', endDateStr);

    if (billsError) {
      console.error('Error fetching bills data:', billsError);
      return NextResponse.json({ error: billsError.message }, { status: 500 });
    }

    // Get payment components for the month
    const { data: paymentComponents, error: componentsError } = await supabase
      .from('payment_components')
        .select(`
        component_type,
            amount,
        payments!inner(
            payment_date,
            payment_method,
          bills!inner(
            id,
            branch_id
          )
        )
      `)
      .gte('payments.payment_date', startDateStr)
      .lte('payments.payment_date', endDateStr); // Changed to include full month

    if (componentsError) {
      console.error('Error fetching payment components:', componentsError);
      return NextResponse.json({ error: componentsError.message }, { status: 500 });
    }

    // Calculate income by component type
    let totalRentCollected = 0;
    let totalElectricityCollected = 0;
    let totalWaterCollected = 0;
    let totalExtraFeesCollected = 0;
    let totalPenaltyFeesCollected = 0;

    for (const component of paymentComponents || []) {
      const amount = component.amount;
      switch (component.component_type) {
        case 'rent': totalRentCollected += amount; break;
        case 'electricity': totalElectricityCollected += amount; break;
        case 'water': totalWaterCollected += amount; break;
        case 'extra_fee': totalExtraFeesCollected += amount; break;
        case 'penalty': totalPenaltyFeesCollected += amount; break;
      }
    }

    // Get forfeited deposits from final bills processed in this month
    const { data: forfeitedDepositRecords, error: forfeitedError } = await supabase
      .from('bills')
      .select(`
        forfeited_amount,
        tenants!inner(move_out_date)
      `)
      .eq('is_final_bill', true)
      .gt('forfeited_amount', 0)
      .gte('tenants.move_out_date', startDateStr)
      .lte('tenants.move_out_date', endDateStr); // Changed to include full month

    const totalForfeitedDeposits = forfeitedDepositRecords?.reduce((sum, record) => sum + record.forfeited_amount, 0) || 0;

    // Get company expenses for the month
    const { data: expenses, error: expensesError } = await supabase
      .from('company_expenses')
      .select('*')
      .gte('expense_date', startDateStr)
      .lte('expense_date', endDateStr); // Changed to include full month

    if (expensesError) {
      console.error('Error fetching expenses:', expensesError);
      return NextResponse.json({ error: expensesError.message }, { status: 500 });
    }

    const totalCompanyExpenses = expenses?.reduce((sum, expense) => sum + expense.amount, 0) || 0;

    // Get deposits refunded in this month
    const { data: refundBills, error: refundError } = await supabase
      .from('bills')
      .select(`
        refund_amount,
        tenants!inner(move_out_date)
      `)
      .eq('is_final_bill', true)
      .gt('refund_amount', 0)
      .gte('tenants.move_out_date', startDateStr)
      .lte('tenants.move_out_date', endDateStr); // Changed to include full month

    const totalDepositsRefunded = refundBills?.reduce((sum, bill) => sum + bill.refund_amount, 0) || 0;

    // Calculate totals
    const grandTotalIncome = totalRentCollected + totalElectricityCollected + totalWaterCollected + 
                           totalExtraFeesCollected + totalPenaltyFeesCollected + totalForfeitedDeposits;
    const grandTotalExpenses = totalCompanyExpenses + totalDepositsRefunded;
    const netProfitLoss = grandTotalIncome - grandTotalExpenses;

    // Get active tenants at month-end
    const { data: activeTenants, error: activeTenantsError } = await supabase
      .from('tenants')
      .select('id')
      .eq('is_active', true)
      .lte('rent_start_date', endDateStr);

    const activeTenantsCount = activeTenants?.length || 0;

    // Get vacant rooms at month-end
    const { data: vacantRooms, error: vacantRoomsError } = await supabase
      .from('rooms')
      .select('id')
      .eq('is_occupied', false);

    const vacantRoomsCount = vacantRooms?.length || 0;

    // New tenants moved in during the month
    const { data: newTenants, error: newTenantsError } = await supabase
      .from('tenants')
      .select('id')
      .gte('rent_start_date', startDateStr)
      .lte('rent_start_date', endDateStr); // Changed to include full month

    const newTenantsCount = newTenants?.length || 0;

    // Tenants moved out during the month
    const { data: movedOutTenants, error: movedOutError } = await supabase
      .from('tenants')
      .select('id')
      .gte('move_out_date', startDateStr)
      .lte('move_out_date', endDateStr); // Changed to include full month

    const movedOutCount = movedOutTenants?.length || 0;

    // Get branch data with the same logic as consolidated Excel report
    const { data: branches } = await supabase.from('branches').select('*').order('name');
    
    // Calculate branch breakdown using the same logic as consolidated Excel report
    const branchBreakdown = await Promise.all((branches || []).map(async (branch) => {
      // Get payment components for this branch in the month (same as Excel)
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

      // Calculate income by component type for this branch (same as Excel)
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

      // Get forfeited deposits for this branch (same as Excel)
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

      // Get bills for detailed billing breakdown (same as Excel)
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
        .lte('billing_period_start', endDateStr)
        .order('billing_period_start', { ascending: true });

      // Calculate totals for this branch (same as Excel)
      const branchGrandTotalIncome = branchTotalRent + branchTotalElectricity + branchTotalWater + 
                                   branchTotalExtraFees + branchTotalPenalty + branchForfeitedTotal;
      
      const totalBilled = branchBillsData?.reduce((sum, bill) => sum + bill.total_amount_due, 0) || 0;
      const totalOutstanding = totalBilled - branchGrandTotalIncome;
      
      // Calculate collection rate based on actual income vs billed amount
      let collectionRate = 0;
      if (totalBilled > 0) {
        collectionRate = Math.round((branchGrandTotalIncome / totalBilled) * 100 * 10) / 10;
      }

      // Prepare detailed billing data (same structure as Excel)
      const detailedBills = [];
      for (const bill of branchBillsData || []) {
        const tenantName = (bill.tenants as any)?.full_name || 'Unknown';
        const roomNumber = (bill.rooms as any)?.room_number || 'Unknown';
        const billingPeriod = `${bill.billing_period_start} - ${bill.billing_period_end}`;
        const dueDate = bill.due_date;
        const originalTotal = bill.total_amount_due;
        const totalPaid = bill.amount_paid;
        const status = bill.status;

        const payments = bill.payments as any[] || [];
        
        if (payments.length === 0) {
          // Bill with no payments
          detailedBills.push({
            tenantName,
            roomNumber,
            billingPeriod,
            dueDate,
            originalTotal,
            totalPaid,
            status,
            paymentDate: '',
            paymentMethod: '',
            paymentAmount: 0
          });
        } else {
          // Bill with payments
          for (const payment of payments) {
            detailedBills.push({
              tenantName,
              roomNumber,
              billingPeriod,
              dueDate,
              originalTotal,
              totalPaid,
              status,
              paymentDate: payment.payment_date || '',
              paymentMethod: payment.payment_method || '',
              paymentAmount: payment.amount || 0
            });
          }
        }
      }

      return {
        name: branch.name,
        address: branch.address,
        totalBilled,
        totalCollected: branchGrandTotalIncome,
        totalOutstanding,
        collectionRate,
        billCount: branchBillsData?.length || 0,
        fullyPaidCount: branchBillsData?.filter(bill => bill.status === 'fully_paid').length || 0,
        partiallyPaidCount: branchBillsData?.filter(bill => bill.status === 'partially_paid').length || 0,
        activeCount: branchBillsData?.filter(bill => bill.status === 'active').length || 0,
        finalBillCount: branchBillsData?.filter(bill => bill.is_final_bill).length || 0,
        // Include detailed breakdown components
        incomeBreakdown: {
          rentCollected: branchTotalRent,
          electricityCollected: branchTotalElectricity,
          waterCollected: branchTotalWater,
          extraFeesCollected: branchTotalExtraFees,
          penaltyFeesCollected: branchTotalPenalty,
          forfeitedDeposits: branchForfeitedTotal
        },
        detailedBills
      };
    }));

    // Get tenant movements
    const { data: moveInData, error: moveInError } = await supabase
      .from('tenants')
      .select(`
        id,
        full_name,
        rent_start_date,
        advance_payment,
        security_deposit,
        rooms!inner(
          room_number,
          branches!inner(
            id,
            name
          )
        ),
        bills!inner(
          id,
          total_amount_due,
          applied_advance_payment,
          applied_security_deposit,
          forfeited_amount,
          refund_amount
        )
      `)
      .gte('rent_start_date', startDateStr)
      .lt('rent_start_date', new Date(year, month, 1).toISOString().split('T')[0]);

    const { data: moveOutData, error: moveOutError } = await supabase
      .from('tenants')
      .select(`
        id,
        full_name,
        move_out_date,
        rooms!inner(
          room_number,
          branches!inner(
            id,
            name
          )
        ),
        bills!inner(
          id,
          total_amount_due,
          applied_advance_payment,
          applied_security_deposit,
          forfeited_amount,
          refund_amount
        )
      `)
      .gte('move_out_date', startDateStr)
      .lt('move_out_date', new Date(year, month, 1).toISOString().split('T')[0]);

    // Generate CSV content
    let csv = '';

    // SECTION 1: Overall Monthly Snapshot
    csv += 'SECTION 1: OVERALL MONTHLY SNAPSHOT\n';
    csv += 'Type,Description,Amount (PHP)\n';
    csv += `Income,Total Rent Collected,${totalRentCollected.toFixed(2)}\n`;
    csv += `Income,Total Electricity Collected,${totalElectricityCollected.toFixed(2)}\n`;
    csv += `Income,Total Water Collected,${totalWaterCollected.toFixed(2)}\n`;
    csv += `Income,Total Extra Fees Collected,${totalExtraFeesCollected.toFixed(2)}\n`;
    csv += `Income,Total Penalty Fees Collected,${totalPenaltyFeesCollected.toFixed(2)}\n`;
    csv += `Income,Total Forfeited Deposits,${totalForfeitedDeposits.toFixed(2)}\n`;
    csv += `Income,Grand Total Income,${grandTotalIncome.toFixed(2)}\n`;
    csv += `Expense,Total Company Expenses,${totalCompanyExpenses.toFixed(2)}\n`;
    csv += `Expense,Total Deposits Refunded,${totalDepositsRefunded.toFixed(2)}\n`;
    csv += `Expense,Grand Total Expenses,${grandTotalExpenses.toFixed(2)}\n`;
    csv += `Summary,Net Profit/Loss,${netProfitLoss.toFixed(2)}\n`;
    csv += '\n';

    // SECTION 2: Tenant & Room Status Overview
    csv += 'SECTION 2: TENANT & ROOM STATUS OVERVIEW\n';
    csv += 'Metric,Count\n';
    csv += `Active Tenants (at month-end),${activeTenantsCount}\n`;
    csv += `Vacant Rooms (at month-end),${vacantRoomsCount}\n`;
    csv += `New Tenants Moved In,${newTenantsCount}\n`;
    csv += `Tenants Moved Out,${movedOutCount}\n`;
    csv += '\n';

    // SECTION 3: Detailed Billing & Payment Breakdown
    csv += 'SECTION 3: DETAILED BILLING & PAYMENT BREAKDOWN\n';
    csv += 'Tenant Full Name,Branch Name,Room Number,Billing Period,Bill Due Date,Original Total Amount Due (PHP),Total Amount Paid for this Bill (PHP),Current Bill Status,Payment Date,Payment Method,Amount Paid (PHP)\n';
    
    for (const bill of billsData || []) {
      const tenantName = (bill.tenants as any)?.full_name || 'Unknown';
      const branchName = (bill.rooms as any)?.branches?.name || 'Unknown';
      const roomNumber = (bill.rooms as any)?.room_number || 'Unknown';
      const billingPeriod = `${bill.billing_period_start} - ${bill.billing_period_end}`;
      const dueDate = bill.due_date;
      const originalTotal = bill.total_amount_due.toFixed(2);
      const totalPaid = bill.amount_paid.toFixed(2);
      const status = bill.status;

      const payments = bill.payments as any[] || [];
      
      if (payments.length === 0) {
        // Bill with no payments
        csv += `"${tenantName}","${branchName}","${roomNumber}","${billingPeriod}","${dueDate}",${originalTotal},${totalPaid},"${status}","","",""\n`;
      } else {
        // Bill with payments
        for (const payment of payments) {
          const paymentDate = payment.payment_date ? new Date(payment.payment_date).toISOString().split('T')[0] : '';
          const paymentMethod = payment.payment_method || '';
          const paymentAmount = payment.amount ? payment.amount.toFixed(2) : '0.00';
          
          csv += `"${tenantName}","${branchName}","${roomNumber}","${billingPeriod}","${dueDate}",${originalTotal},${totalPaid},"${status}","${paymentDate}","${paymentMethod}",${paymentAmount}\n`;
        }
      }
    }
    csv += '\n';

    // SECTION 4: Detailed Company Expenses Breakdown
    csv += 'SECTION 4: DETAILED COMPANY EXPENSES BREAKDOWN\n';
    csv += 'Expense Date,Amount (PHP),Description,Category,Branch\n';
    
    for (const expense of expenses || []) {
      const expenseDate = expense.expense_date;
      const amount = expense.amount.toFixed(2);
      const description = expense.description || '';
      const category = expense.category || '';
      const branchName = expense.branch_id ? 'Branch Specific' : 'General'; // We'd need to join with branches table for actual name
      
      csv += `"${expenseDate}",${amount},"${description}","${category}","${branchName}"\n`;
    }
    csv += '\n';

    // SECTION 5: Tenant Movement Breakdown
    csv += 'SECTION 5: TENANT MOVEMENT BREAKDOWN\n';
    csv += '\n';
    csv += 'Move-In Data\n';
    csv += 'Tenant Full Name,Rent Start Date,Branch and Room Assigned,Advance Payment Collected (PHP),Security Deposit Collected (PHP)\n';
    
    for (const tenant of moveInData || []) {
      const fullName = tenant.full_name || '';
      const rentStartDate = tenant.rent_start_date;
      const branchRoom = `${(tenant.rooms as any)?.branches?.name || 'Unknown'} - Room ${(tenant.rooms as any)?.room_number || 'Unknown'}`;
      const advancePayment = tenant.advance_payment.toFixed(2);
      const securityDeposit = tenant.security_deposit.toFixed(2);
      
      csv += `"${fullName}","${rentStartDate}","${branchRoom}",${advancePayment},${securityDeposit}\n`;
    }
    csv += '\n';
    
    csv += 'Move-Out Data\n';
    csv += 'Tenant Full Name,Move Out Date,Final Bill Total Amount Due (PHP),Total Deposits Used/Forfeited (PHP),Total Deposits Refunded (PHP)\n';
    
    for (const tenant of moveOutData || []) {
      const fullName = tenant.full_name || '';
      const moveOutDate = tenant.move_out_date || '';
      
      const finalBill = (tenant.bills as any[])?.[0]; // Should only be one final bill
      if (finalBill) {
        const finalBillTotal = finalBill.total_amount_due.toFixed(2);
        const depositsUsed = (finalBill.applied_advance_payment + finalBill.applied_security_deposit + finalBill.forfeited_amount).toFixed(2);
        const depositsRefunded = finalBill.refund_amount.toFixed(2);
        
        csv += `"${fullName}","${moveOutDate}",${finalBillTotal},${depositsUsed},${depositsRefunded}\n`;
      }
    }

    // Return structured data for API consumption
    const totalBilled = billsData?.reduce((sum, bill) => sum + bill.total_amount_due, 0) || 0;
    const totalCollected = grandTotalIncome;
    const totalOutstanding = totalBilled - totalCollected;

    const reportData = {
      month: `${month}/${year}`,
      period: {
        start: startDateStr,
        end: endDateStr
      },
      summary: {
        totalBills: billsData?.length || 0,
        totalBilled: billsData?.reduce((sum, bill) => sum + bill.total_amount_due, 0) || 0,
        totalCollected: grandTotalIncome,
        totalOutstanding: (billsData?.reduce((sum, bill) => sum + bill.total_amount_due, 0) || 0) - grandTotalIncome,
        fullyPaidBills: billsData?.filter(bill => bill.status === 'fully_paid').length || 0,
        partiallyPaidBills: billsData?.filter(bill => bill.status === 'partially_paid').length || 0,
        activeBills: billsData?.filter(bill => bill.status === 'active').length || 0,
        finalBills: billsData?.filter(bill => bill.is_final_bill).length || 0,
        totalExpenses: grandTotalExpenses,
        newTenants: newTenantsCount,
        movedOutTenants: movedOutCount,
        activeTenantsAtMonthEnd: activeTenantsCount
      },
      branchBreakdown,
      detailedBills: billsData?.map(bill => ({
        id: bill.id,
        billingPeriod: `${bill.billing_period_start} - ${bill.billing_period_end}`,
        dueDate: bill.due_date,
        tenantName: (bill.tenants as any)?.full_name,
        tenantEmail: (bill.tenants as any)?.email_address,
        tenantPhone: (bill.tenants as any)?.phone_number,
        branchName: (bill.rooms as any)?.branches?.name,
        roomNumber: (bill.rooms as any)?.room_number,
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
        payments: (bill.payments as any[])?.map(payment => ({
          id: payment.id,
          amount: payment.amount,
          paymentDate: payment.payment_date,
          paymentMethod: payment.payment_method,
          notes: payment.notes,
          referenceNumber: payment.reference_number
        })) || []
      })) || [],
      detailedExpenses: expenses?.map(expense => ({
        id: expense.id,
        expenseDate: expense.expense_date,
        amount: expense.amount,
        description: expense.description,
        category: expense.category,
        branchName: expense.branch_id ? 'Branch Specific' : 'General'
      })) || [],
      tenantMovements: [
        ...(moveInData?.map(tenant => ({
        id: tenant.id,
        fullName: tenant.full_name,
        rentStartDate: tenant.rent_start_date,
          moveOutDate: null,
          isActive: true,
          roomNumber: (tenant.rooms as any)?.room_number,
          branchName: (tenant.rooms as any)?.branches?.name,
          movementType: 'Move In'
        })) || []),
        ...(moveOutData?.map(tenant => ({
          id: tenant.id,
          fullName: tenant.full_name,
          rentStartDate: null,
        moveOutDate: tenant.move_out_date,
          isActive: false,
        roomNumber: (tenant.rooms as any)?.room_number,
        branchName: (tenant.rooms as any)?.branches?.name,
          movementType: 'Move Out'
        })) || [])
      ]
    };

    if (download) {
      return new NextResponse(csv, {
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="comprehensive_monthly_report_${month}_${year}.csv"`,
        },
      });
    }

    return NextResponse.json({ data: reportData });

  } catch (error) {
    console.error('Error generating comprehensive monthly report:', error);
    return NextResponse.json({ error: 'Failed to generate comprehensive monthly report' }, { status: 500 });
  }
} 
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const month = searchParams.get('month'); // YYYY-MM format
  const download = searchParams.get('download') === 'true';

  if (!month) {
    return NextResponse.json({ error: 'Month parameter is required' }, { status: 400 });
  }

  const [year, monthNum] = month.split('-').map(Number);
  if (isNaN(year) || isNaN(monthNum) || monthNum < 1 || monthNum > 12) {
    return NextResponse.json({ error: 'Invalid month format. Use YYYY-MM' }, { status: 400 });
  }

  const supabase = createRouteHandlerClient({ cookies });

  try {
    // Calculate start and end dates for the selected month
    const startDate = new Date(year, monthNum - 1, 1);
    const endDate = new Date(year, monthNum, 0); // Last day of the month

    // Fetch payment components within the selected month for accurate income reporting
    const { data: paymentComponents, error: componentsError } = await supabase
      .from('payment_components')
      .select(`
        component_type,
        amount,
        payments (
          payment_date,
          payment_method
        )
      `)
      .gte('payments.payment_date', startDate.toISOString())
      .lte('payments.payment_date', endDate.toISOString());

    if (componentsError) {
      console.error('Error fetching payment components:', componentsError);
      return NextResponse.json({ error: componentsError.message }, { status: 500 });
    }

    // Fetch company expenses for the selected month
    const { data: expenses, error: expensesError } = await supabase
      .from('company_expenses')
      .select('amount')
      .gte('expense_date', startDate.toISOString())
      .lte('expense_date', endDate.toISOString());

    if (expensesError) {
      console.error('Error fetching expenses:', expensesError);
      return NextResponse.json({ error: expensesError.message }, { status: 500 });
    }

    let totalRentCollected = 0;
    let totalElectricityCollected = 0;
    let totalWaterCollected = 0;
    let totalExtraFeesCollected = 0;
    let totalPenaltyFeesCollected = 0;
    let totalDepositApplications = 0;
    let forfeitedDeposits = 0;

    // Calculate collected amounts by component type using payment components
    for (const component of paymentComponents || []) {
      const amount = component.amount;
      
      switch (component.component_type) {
        case 'rent':
          totalRentCollected += amount;
          break;
        case 'electricity':
          totalElectricityCollected += amount;
          break;
        case 'water':
          totalWaterCollected += amount;
          break;
        case 'extra_fee':
          totalExtraFeesCollected += amount;
          break;
        case 'penalty':
          totalPenaltyFeesCollected += amount;
          break;
      }

      // Track deposit applications separately for transparency
      const payment = component.payments as any;
      if (payment?.payment_method === 'deposit_application') {
        totalDepositApplications += amount;
      }
    }

    // Fetch forfeited deposits from final bills created in this month
    const { data: forfeitedDepositRecords, error: forfeitedDepositError } = await supabase
      .from('bills')
      .select('forfeited_amount, tenants!inner(move_out_date)')
      .eq('is_final_bill', true)
      .gt('forfeited_amount', 0)
      .gte('tenants.move_out_date', startDate.toISOString().split('T')[0])
      .lte('tenants.move_out_date', endDate.toISOString().split('T')[0]);

    if (forfeitedDepositError) {
      console.error('Error fetching forfeited deposit records:', forfeitedDepositError);
      // Continue without forfeited deposits if there's an error
    } else {
      forfeitedDeposits = forfeitedDepositRecords?.reduce((sum, record) => sum + record.forfeited_amount, 0) || 0;
    }

    // Fetch refunds for the selected month (use move_out_date for correct month attribution)
    const { data: refundBills, error: refundError } = await supabase
      .from('bills')
      .select('refund_amount, tenants!inner(move_out_date)')
      .eq('is_final_bill', true)
      .gt('refund_amount', 0)
      .gte('tenants.move_out_date', startDate.toISOString().split('T')[0])
      .lte('tenants.move_out_date', endDate.toISOString().split('T')[0]);

    const totalRefunds = refundBills?.reduce((sum, bill) => sum + bill.refund_amount, 0) || 0;

    // Calculate totals
    const totalMonthlyExpenses = expenses.reduce((sum, expense) => sum + expense.amount, 0) + totalDepositApplications + totalRefunds;
    const totalMonthlyIncome = totalRentCollected + totalElectricityCollected + totalWaterCollected + totalExtraFeesCollected + totalPenaltyFeesCollected + forfeitedDeposits;
    const profitLoss = totalMonthlyIncome - totalMonthlyExpenses;

    const report = {
      totalRentCollected,
      totalElectricityCollected,
      totalWaterCollected,
      totalExtraFeesCollected,
      totalPenaltyFeesCollected,
      totalDepositApplications,
      forfeitedDeposits,
      totalRefunds,
      totalIncome: totalMonthlyIncome,
      totalExpenses: totalMonthlyExpenses,
      profitLoss,
    };

    if (download) {
      let csv = 'Type,Description,Amount (PHP),Source\n';
      csv += `Income,Total Rent Collected,${totalRentCollected.toFixed(2)},Cash+Deposits\n`;
      csv += `Income,Total Electricity Collected,${totalElectricityCollected.toFixed(2)},Cash+Deposits\n`;
      csv += `Income,Total Water Collected,${totalWaterCollected.toFixed(2)},Cash+Deposits\n`;
      csv += `Income,Total Extra Fees Collected,${totalExtraFeesCollected.toFixed(2)},Cash+Deposits\n`;
      csv += `Income,Total Penalty Fees Collected,${totalPenaltyFeesCollected.toFixed(2)},Cash+Deposits\n`;
      csv += `Income,Forfeited Security Deposits,${forfeitedDeposits.toFixed(2)},Forfeited Deposits\n`;
      csv += `Expense,Total from Deposit Applications,${totalDepositApplications.toFixed(2)},Deposits Applied\n`;
      csv += `Expense,Refunds to Tenants,${totalRefunds.toFixed(2)},Refunds\n`;
      csv += `Income,Total Monthly Income,${totalMonthlyIncome.toFixed(2)},All Sources\n`;
      csv += `Expense,Total Monthly Expenses,${totalMonthlyExpenses.toFixed(2)},Company Expenses + Deposits Applied + Refunds\n`;
      csv += `Summary,Profit/Loss,${profitLoss.toFixed(2)},Net Result\n`;

      // Add detailed expenses to CSV
      if (expenses && expenses.length > 0) {
        csv += 'Expense,Detailed Expenses,\n';
        for (const expense of expenses) {
          csv += `Expense,Expense Item,${expense.amount.toFixed(2)}\n`; // Assuming 'description' is not available in this query
        }
      }

      return new NextResponse(csv, {
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="monthly_report_${month}.csv"`,
        },
      });
    }

    return NextResponse.json({ data: report });

  } catch (error) {
    console.error('Error generating monthly report:', error);
    return NextResponse.json({ error: 'Failed to generate monthly report' }, { status: 500 });
  }
}
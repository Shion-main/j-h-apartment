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

    // Parse month string (e.g., "2025-03") to get month and year
    const [year, monthNum] = month.split('-').map(Number);
    
    if (!year || !monthNum || monthNum < 1 || monthNum > 12) {
      return NextResponse.json({ 
        error: 'Invalid month format. Use YYYY-MM format (e.g., "2025-03")' 
      }, { status: 400 });
    }

    // Create a new URL with query parameters for the GET handler
    const url = new URL(request.url);
    url.searchParams.set('month', monthNum.toString());
    url.searchParams.set('year', year.toString());
    
    // Create a new request with GET method and the same URL
    const getRequest = new NextRequest(url, {
      method: 'GET',
      headers: request.headers
    });
    
    // Call the existing GET handler
    return await GET(getRequest);
  } catch (error) {
    console.error('POST handler error:', error);
    return NextResponse.json({
      error: 'Internal server error',
      success: false
    }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
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

    // Step 1: Fetch all branches
    const { data: branches, error: branchesError } = await supabase
      .from('branches')
      .select('*')
      .order('name');

    if (branchesError) {
      return NextResponse.json({ error: branchesError.message }, { status: 500 });
    }
    if (!branches || branches.length === 0) {
      return NextResponse.json({ error: 'No branches found in the system' }, { status: 404 });
    }

    // Prepare JSON structure for all sections
    const report: any = {
      month: `${monthName} ${year}`,
      branches: [],
      overallSnapshot: [],
      tenantRoomStatus: [],
      detailedBilling: [],
      companyExpenses: [],
      tenantMovement: []
    };

    for (const branch of branches) {
      // SECTION 1: Overall Monthly Snapshot for this branch
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
      const { data: branchExpenses } = await supabase
        .from('company_expenses')
        .select('*')
        .eq('branch_id', branch.id)
        .gte('expense_date', startDateStr)
        .lte('expense_date', endDateStr);
      const branchTotalExpenses = branchExpenses?.reduce((sum, expense) => sum + expense.amount, 0) || 0;
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
      const branchGrandTotalIncome = branchTotalRent + branchTotalElectricity + branchTotalWater + 
                                   branchTotalExtraFees + branchTotalPenalty + branchForfeitedTotal;
      const branchGrandTotalExpenses = branchTotalExpenses + branchTotalRefunds;
      const branchNetProfitLoss = branchGrandTotalIncome - branchGrandTotalExpenses;
      report.overallSnapshot.push({
        branch: branch.name,
        rent: branchTotalRent,
        electricity: branchTotalElectricity,
        water: branchTotalWater,
        extraFees: branchTotalExtraFees,
        penalty: branchTotalPenalty,
        forfeitedDeposits: branchForfeitedTotal,
        totalIncome: branchGrandTotalIncome,
        companyExpenses: branchTotalExpenses,
        depositsRefunded: branchTotalRefunds,
        totalExpenses: branchGrandTotalExpenses,
        netProfitLoss: branchNetProfitLoss
      });
      // SECTION 2: Tenant & Room Status Overview
      const { data: branchActiveTenants } = await supabase
        .from('tenants')
        .select('id')
        .eq('branch_id', branch.id)
        .eq('is_active', true);
      const { data: branchVacantRooms } = await supabase
        .from('rooms')
        .select('id')
        .eq('branch_id', branch.id)
        .eq('is_occupied', false);
      const { data: branchNewTenants } = await supabase
        .from('tenants')
        .select('id')
        .eq('branch_id', branch.id)
        .gte('rent_start_date', startDateStr)
        .lte('rent_start_date', endDateStr);
      const { data: branchMovedOutTenants } = await supabase
        .from('tenants')
        .select('id')
        .eq('branch_id', branch.id)
        .gte('move_out_date', startDateStr)
        .lte('move_out_date', endDateStr);
      report.tenantRoomStatus.push({
        branch: branch.name,
        activeTenants: branchActiveTenants?.length || 0,
        vacantRooms: branchVacantRooms?.length || 0,
        newTenants: branchNewTenants?.length || 0,
        movedOutTenants: branchMovedOutTenants?.length || 0
      });
      // SECTION 3: Detailed Billing & Payment Breakdown
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
        .lt('billing_period_start', new Date(year, month, 1).toISOString().split('T')[0])
        .order('billing_period_start', { ascending: true });
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
          report.detailedBilling.push({
            branch: branch.name,
            tenantName,
            roomNumber,
            billingPeriod,
            dueDate,
            originalTotal,
            totalPaid,
            status,
            paymentDate: '',
            paymentMethod: '',
            paymentAmount: ''
          });
        } else {
          for (const payment of payments) {
            const paymentDate = payment.payment_date ? new Date(payment.payment_date).toISOString().split('T')[0] : '';
            const paymentMethod = payment.payment_method || '';
            const paymentAmount = payment.amount ? payment.amount : 0;
            report.detailedBilling.push({
              branch: branch.name,
              tenantName,
              roomNumber,
              billingPeriod,
              dueDate,
              originalTotal,
              totalPaid,
              status,
              paymentDate,
              paymentMethod,
              paymentAmount
            });
          }
        }
      }
      // SECTION 4: Company Expenses Breakdown
      for (const expense of branchExpenses || []) {
        const expenseDate = expense.expense_date;
        const amount = expense.amount;
        const description = expense.description || '';
        const category = expense.category || '';
        report.companyExpenses.push({
          branch: branch.name,
          expenseDate,
          amount,
          description,
          category
        });
      }
      // SECTION 5: Tenant Movement Breakdown
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
      for (const tenant of branchMoveInData || []) {
        const fullName = tenant.full_name || '';
        const rentStartDate = tenant.rent_start_date;
        const roomNumber = (tenant.rooms as any)?.room_number || 'Unknown';
        const advancePayment = tenant.advance_payment;
        const securityDeposit = tenant.security_deposit;
        report.tenantMovement.push({
          branch: branch.name,
          type: 'Move In',
          fullName,
          date: rentStartDate,
          roomNumber,
          advancePayment,
          securityDeposit
        });
      }
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
      for (const tenant of branchMoveOutData || []) {
        const fullName = tenant.full_name || '';
        const moveOutDate = tenant.move_out_date || '';
        const finalBill = (tenant.bills as any[])?.[0];
        if (finalBill) {
          const finalBillTotal = finalBill.total_amount_due;
          const depositsUsed = (finalBill.applied_advance_payment + finalBill.applied_security_deposit + finalBill.forfeited_amount);
          const depositsRefunded = finalBill.refund_amount;
          report.tenantMovement.push({
            branch: branch.name,
            type: 'Move Out',
            fullName,
            date: moveOutDate,
            finalBillTotal,
            depositsUsed,
            depositsRefunded
          });
        }
      }
    }

    return NextResponse.json({ 
      success: true, 
      data: report 
    });
  } catch (error) {
    console.error('Consolidated JSON report error:', error);
    return NextResponse.json({ 
      error: 'Failed to generate consolidated JSON report',
      success: false 
    }, { status: 500 });
  }
}

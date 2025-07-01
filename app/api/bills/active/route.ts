import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { calculatePenalty } from '@/lib/calculations/billing';

export async function GET(request: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { searchParams } = new URL(request.url);
    const searchTerm = searchParams.get('search') || '';
    const statusFilter = searchParams.get('status') || '';
    const branchFilter = searchParams.get('branch') || '';

    // Get penalty percentage from settings
    const { data: penaltySettings } = await supabase
      .from('system_settings')
      .select('value')
      .eq('key', 'penalty_percentage')
      .single();

    const penaltyPercentage = penaltySettings?.value ? parseFloat(penaltySettings.value) : 5;

    // Build query for active bills (not fully paid)
    let query = supabase
      .from('bills')
      .select(`
        id,
        tenant_id,
        billing_period_start,
        billing_period_end,
        previous_electricity_reading,
        present_electricity_reading,
        present_reading_date,
        electricity_consumption,
        electricity_amount,
        water_amount,
        monthly_rent_amount,
        extra_fee,
        extra_fee_description,
        penalty_amount,
        total_amount_due,
        amount_paid,
        due_date,
        status,
        is_final_bill,
        advance_payment,
        security_deposit,
        tenant:tenants (
          id,
          full_name,
          email_address,
          advance_payment,
          security_deposit,
          rooms (
            id,
            room_number,
            branches (
              id,
              name,
              electricity_rate,
              water_rate
            )
          )
        )
      `)
      .in('status', ['active', 'partially_paid', 'refund'])
      .order('due_date', { ascending: true });

    const { data: bills, error } = await query;

    if (error) {
      console.error('Error fetching active bills:', error);
      return NextResponse.json({
        error: 'Failed to fetch active bills',
        success: false
      }, { status: 500 });
    }

    // Enhance bills with penalty calculations for overdue bills
    const today = new Date();
    const enhancedBills = (bills || []).map(bill => {
      const dueDate = new Date(bill.due_date);
      const isOverdue = today > dueDate;
      
      // Calculate potential penalty for overdue bills without existing penalties
      let potentialPenalty = 0;
      let shouldShowPenaltyWarning = false;
      
      if (isOverdue && bill.penalty_amount === 0) {
        const originalTotal = bill.monthly_rent_amount + bill.electricity_amount + bill.water_amount + bill.extra_fee;
        potentialPenalty = calculatePenalty(originalTotal, today, dueDate, penaltyPercentage);
        shouldShowPenaltyWarning = true;
      }

      return {
        ...bill,
        isOverdue,
        daysOverdue: isOverdue ? Math.ceil((today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24)) : 0,
        potentialPenalty,
        shouldShowPenaltyWarning,
        totalWithPotentialPenalty: bill.total_amount_due + potentialPenalty
      };
    });

    // Apply client-side filtering
    let filteredBills = enhancedBills;

    // Search filter
    if (searchTerm) {
      const searchLower = searchTerm.toLowerCase();
      filteredBills = filteredBills.filter(bill => {
        const tenantName = typeof bill.tenant === 'object' && bill.tenant !== null && 'full_name' in bill.tenant && 
          typeof bill.tenant.full_name === 'string' ? bill.tenant.full_name.toLowerCase() : '';
        
        const roomNumber = typeof bill.tenant === 'object' && bill.tenant !== null && 'rooms' in bill.tenant && 
          bill.tenant.rooms && typeof bill.tenant.rooms === 'object' && 'room_number' in bill.tenant.rooms && 
          typeof bill.tenant.rooms.room_number === 'string' ? bill.tenant.rooms.room_number.toLowerCase() : '';
        
        const branchName = typeof bill.tenant === 'object' && bill.tenant !== null && 'rooms' in bill.tenant && 
          bill.tenant.rooms && typeof bill.tenant.rooms === 'object' && 'branches' in bill.tenant.rooms && 
          bill.tenant.rooms.branches && typeof bill.tenant.rooms.branches === 'object' && 'name' in bill.tenant.rooms.branches && 
          typeof bill.tenant.rooms.branches.name === 'string' ? bill.tenant.rooms.branches.name.toLowerCase() : '';
        
        return tenantName.includes(searchLower) || roomNumber.includes(searchLower) || branchName.includes(searchLower);
      });
    }

    // Status filter
    if (statusFilter && statusFilter !== 'all') {
      filteredBills = filteredBills.filter(bill => {
        switch (statusFilter) {
          case 'active':
            return bill.status === 'active' && !bill.isOverdue;
          case 'partially_paid':
            return bill.status === 'partially_paid';
          case 'overdue':
            return bill.isOverdue;
          default:
            return true;
        }
      });
    }

    // Branch filter
    if (branchFilter && branchFilter !== 'all') {
      filteredBills = filteredBills.filter(bill => {
        const branchId = typeof bill.tenant === 'object' && bill.tenant !== null && 'rooms' in bill.tenant && 
          bill.tenant.rooms && typeof bill.tenant.rooms === 'object' && 'branches' in bill.tenant.rooms && 
          bill.tenant.rooms.branches && typeof bill.tenant.rooms.branches === 'object' && 'id' in bill.tenant.rooms.branches ? 
          bill.tenant.rooms.branches.id : '';
          
        return branchId === branchFilter;
      });
    }

    return NextResponse.json({
      data: filteredBills,
      success: true
    });

  } catch (error) {
    console.error('API error:', error);
    return NextResponse.json({
      error: 'Internal server error',
      success: false
    }, { status: 500 });
  }
} 
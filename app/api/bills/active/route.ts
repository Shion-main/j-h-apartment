import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { calculatePenalty } from '@/lib/calculations/billing';

// Force dynamic rendering and disable caching for this route
export const dynamic = 'force-dynamic';
export const revalidate = 0;

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

    const searchParams = request.nextUrl.searchParams;
    const searchTerm = searchParams.get('search') || '';
    const statusFilter = searchParams.get('status') || '';
    const branchFilter = searchParams.get('branch') || '';

    // Get penalty percentage from settings (with caching)
    const { data: penaltySettings } = await supabase
      .from('system_settings')
      .select('value')
      .eq('key', 'penalty_percentage')
      .single();

    const penaltyPercentage = penaltySettings?.value ? parseFloat(penaltySettings.value) : 5;

    // Build optimized query for active bills
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

    // Apply server-side filtering for better performance
    if (branchFilter && branchFilter !== 'all') {
      query = query.eq('tenant.rooms.branches.id', branchFilter);
    }

    const { data: bills, error } = await query;

    if (error) {
      console.error('Error fetching active bills:', error);
      return NextResponse.json({
        error: 'Failed to fetch active bills',
        success: false
      }, { 
        status: 500,
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0',
        }
      });
    }

    // Optimized bill processing with batch operations
    const today = new Date();
    const todayTime = today.getTime();
    
    const enhancedBills = (bills || []).map((bill: any) => {
      const dueDate = new Date(bill.due_date);
      const dueDateTime = dueDate.getTime();
      const isOverdue = todayTime > dueDateTime;
      
      // Calculate potential penalty for overdue bills without existing penalties
      let potentialPenalty = 0;
      let shouldShowPenaltyWarning = false;
      
      if (isOverdue && bill.penalty_amount === 0) {
        const originalTotal = (bill.monthly_rent_amount || 0) + (bill.electricity_amount || 0) + (bill.water_amount || 0) + (bill.extra_fee || 0);
        potentialPenalty = calculatePenalty(originalTotal, today, dueDate, penaltyPercentage);
        shouldShowPenaltyWarning = true;
      }

      return {
        ...bill,
        isOverdue,
        daysOverdue: isOverdue ? Math.ceil((todayTime - dueDateTime) / (1000 * 60 * 60 * 24)) : 0,
        potentialPenalty,
        shouldShowPenaltyWarning,
        totalWithPotentialPenalty: bill.total_amount_due + potentialPenalty
      };
    });

    // Apply client-side filtering (optimized)
    let filteredBills = enhancedBills;

    // Search filter (optimized with early returns)
    if (searchTerm) {
      const searchLower = searchTerm.toLowerCase();
      filteredBills = filteredBills.filter((bill: any) => {
        // Quick checks for most common search terms
        const tenant = bill.tenant as any;
        if (!tenant || typeof tenant !== 'object') return false;
        
        const tenantName = tenant.full_name?.toLowerCase() || '';
        if (tenantName.includes(searchLower)) return true;
        
        const rooms = tenant.rooms as any;
        if (rooms && typeof rooms === 'object') {
          const roomNumber = rooms.room_number?.toLowerCase() || '';
          if (roomNumber.includes(searchLower)) return true;
          
          const branches = rooms.branches as any;
          if (branches && typeof branches === 'object') {
            const branchName = branches.name?.toLowerCase() || '';
            if (branchName.includes(searchLower)) return true;
          }
        }
        
        return false;
      });
    }

    // Status filter (optimized)
    if (statusFilter && statusFilter !== 'all') {
      filteredBills = filteredBills.filter((bill: any) => {
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

    // Branch filter (if not already applied server-side)
    if (branchFilter && branchFilter !== 'all') {
      filteredBills = filteredBills.filter((bill: any) => {
        const tenant = bill.tenant as any;
        return tenant && 
               typeof tenant === 'object' && 
               tenant.rooms && 
               typeof tenant.rooms === 'object' && 
               tenant.rooms.branches && 
               typeof tenant.rooms.branches === 'object' && 
               tenant.rooms.branches.id === branchFilter;
      });
    }

    return NextResponse.json({
      data: filteredBills,
      success: true,
      metadata: {
        total: filteredBills.length,
        timestamp: new Date().toISOString()
      }
    }, { 
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
      }
    });

  } catch (error) {
    console.error('API error:', error);
    return NextResponse.json({
      error: 'Internal server error',
      success: false
    }, { 
      status: 500,
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
      }
    });
  }
} 
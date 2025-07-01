import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { tenantMoveInSchema, validateSchema } from '@/lib/validations/schemas';
import { logTenantMoveIn } from '@/lib/audit/logger';
import { addMonths } from '@/lib/utils';
import { EmailService } from '@/lib/services/emailService';

// Force dynamic rendering for this route
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const searchParams = request.nextUrl.searchParams;
    const isActive = searchParams.get('active');
    const status = searchParams.get('status');

    let query = supabase
      .from('tenants')
      .select(`
        *,
        rooms (
          id,
          room_number,
          monthly_rent,
          branches (
            id,
            name,
            address,
            electricity_rate,
            water_rate
          )
        )
      `);

    // Filter by active status if specified
    if (isActive !== null) {
      query = query.eq('is_active', isActive === 'true');
    } else if (status === 'inactive') {
      query = query.eq('is_active', false);
    } else {
      query = query.eq('is_active', true);
    }

    const { data: tenants, error } = await query;

    if (error) {
      console.error('Error fetching tenants:', error);
      return NextResponse.json({
        error: 'Failed to fetch tenants',
        success: false
      }, { status: 500 });
    }

    // Fetch final bill status for each tenant
    const { data: finalBills } = await supabase
      .from('bills')
      .select('tenant_id, status')
      .eq('is_final_bill', true);

    // Map final bill status to tenants
    const tenantsWithStatus = tenants?.map(tenant => ({
      ...tenant,
      final_bill_status: finalBills?.find(bill => bill.tenant_id === tenant.id)?.status
    }));

    return NextResponse.json({
      data: tenantsWithStatus,
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

export async function POST(request: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const body = await request.json();

    // Get current user for audit logging
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({
        error: 'Unauthorized',
        success: false
      }, { status: 401 });
    }

    // Validate input
    const { error: validationError, value } = validateSchema(tenantMoveInSchema, body);
    if (validationError) {
      return NextResponse.json({
        error: validationError,
        success: false
      }, { status: 400 });
    }

    // Verify deposit confirmations
    if (!value.advance_payment_received || !value.security_deposit_received) {
      return NextResponse.json({
        error: 'Both advance payment and security deposit must be received',
        success: false
      }, { status: 400 });
    }

    // Get room details with branch info
    const { data: room, error: roomError } = await supabase
      .from('rooms')
      .select(`
        *,
        branches:branch_id (
          id,
          name,
          electricity_rate,
          water_rate
        )
      `)
      .eq('id', value.room_id)
      .single();

    if (roomError || !room) {
      console.error('Error fetching room:', roomError);
      return NextResponse.json({
        error: 'Failed to fetch room details',
        success: false
      }, { status: 500 });
    }

    if (room.is_occupied) {
      return NextResponse.json({
        error: 'Room is already occupied',
        success: false
      }, { status: 400 });
    }

    // Calculate contract dates and deposits
    const rentStartDate = new Date(value.rent_start_date);
    const contractStartDate = rentStartDate;
    const contractEndDate = addMonths(contractStartDate, 6); // 6-month contract

    const tenantData = {
      full_name: value.full_name,
      phone_number: value.phone_number,
      email_address: value.email_address,
      branch_id: room.branch_id,
      room_id: value.room_id,
      rent_start_date: rentStartDate.toISOString().split('T')[0], // Date only format
      initial_electricity_reading: Number(value.initial_electricity_reading),
      // Note: initial_water_reading removed - water is fixed amount, no meter readings
      contract_start_date: contractStartDate.toISOString().split('T')[0], // Date only format
      contract_end_date: contractEndDate.toISOString().split('T')[0], // Date only format
      advance_payment: room.monthly_rent,
      security_deposit: room.monthly_rent,
      is_active: true
    };

    // Get system settings for penalty percentage
    const { data: settings } = await supabase
      .from('system_settings')
      .select('value')
      .eq('key', 'penalty_percentage')
      .single();

    // Start transaction - Create tenant and update room first
    const { data: tenant, error: tenantError } = await supabase
      .from('tenants')
      .insert(tenantData)
      .select()
      .single();

    if (tenantError) {
      console.error('Tenant creation error:', tenantError);
      return NextResponse.json({
        error: `Failed to create tenant: ${tenantError.message}`,
        success: false
      }, { status: 500 });
    }

    // Update room status
    const { error: roomUpdateError } = await supabase
      .from('rooms')
      .update({ is_occupied: true })
      .eq('id', value.room_id);

    if (roomUpdateError) {
      console.error('Room update error:', roomUpdateError);
      // Rollback tenant creation if room update fails
      await supabase
        .from('tenants')
        .delete()
        .eq('id', tenant.id);

      return NextResponse.json({
        error: `Failed to update room status: ${roomUpdateError.message}`,
        success: false
      }, { status: 500 });
    }

    // Log the tenant move-in
    try {
      await logTenantMoveIn(supabase, user.id, tenant.id, tenantData);
    } catch (auditError) {
      console.error('Audit logging error:', auditError);
      // Don't fail the entire operation for audit logging issues
    }

    // Send welcome email
    const emailData = {
      email: value.email_address,
      full_name: value.full_name,
      room_number: room.room_number,
      branch_name: room.branches?.name || '',
      contract_start_date: contractStartDate.toISOString(),
      contract_end_date: contractEndDate.toISOString(),
      monthly_rent: room.monthly_rent,
      advance_payment: room.monthly_rent,
      security_deposit: room.monthly_rent,
      initial_electricity_reading: value.initial_electricity_reading,
      penalty_percentage: settings?.value ? parseFloat(settings.value) : 5
    };

    try {
      const emailResult = await EmailService.sendWelcomeEmail(emailData);

      if (!emailResult.success) {
        console.error('Email sending failed:', emailResult.error);
        // Don't fail the tenant creation if email fails - just log it
      }
    } catch (emailError) {
      console.error('Email service error:', emailError);
      // Don't fail the tenant creation if email fails
    }

    return NextResponse.json({
      data: tenant,
      success: true
    });
  } catch (error) {
    console.error('Error creating tenant:', error);
    return NextResponse.json({
      error: 'An unexpected error occurred',
      success: false
    }, { status: 500 });
  }
} 
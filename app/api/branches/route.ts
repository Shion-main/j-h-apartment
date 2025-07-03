import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { branchSchema } from '@/lib/validations/schemas';
import { logAuditEvent } from '@/lib/audit/logger';

// Force dynamic rendering for this route
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: branches, error } = await supabase
      .from('branches')
      .select('*')
      .order('name');

    if (error) {
      console.error('Error fetching branches:', error);
      return NextResponse.json({
        error: 'Failed to fetch branches',
        success: false
      }, { status: 500 });
    }

    return NextResponse.json({
      data: branches,
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

    // Get default rates from settings
    const { data: settings } = await supabase
      .from('system_settings')
      .select('key, value')
      .in('key', ['default_monthly_rent_rate', 'default_water_rate', 'default_electricity_rate']);

    const defaultRates = settings?.reduce((acc: any, setting) => {
      if (setting.key === 'default_monthly_rent_rate') acc.monthly_rent_rate = parseFloat(setting.value);
      if (setting.key === 'default_water_rate') acc.water_rate = parseFloat(setting.value);
      if (setting.key === 'default_electricity_rate') acc.electricity_rate = parseFloat(setting.value);
      return acc;
    }, {}) || {};

    // Merge default rates with provided data
    const branchData = {
      name: body.name,
      address: body.address,
      monthly_rent_rate: body.monthly_rent_rate || defaultRates.monthly_rent_rate,
      water_rate: body.water_rate || defaultRates.water_rate,
      electricity_rate: body.electricity_rate || defaultRates.electricity_rate,
      room_number_prefix: body.room_number_prefix
    };

    const { data: newBranch, error } = await supabase
      .from('branches')
      .insert([branchData])
      .select()
      .single();

    if (error) {
      console.error('Error creating branch:', error);
      return NextResponse.json({
        error: 'Failed to create branch',
        success: false
      }, { status: 500 });
    }

    // Log branch creation
    await logAuditEvent(
      supabase,
      user.id,
      'BRANCH_CREATED',
      'branches',
      newBranch.id,
      null,
      branchData
    );

    return NextResponse.json({
      data: newBranch,
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

export async function DELETE(request: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const searchParams = request.nextUrl.searchParams;
    const branchId = searchParams.get('id');

    // Get current user for audit logging
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized', success: false },
        { status: 401 }
      );
    }

    if (!branchId) {
      return Response.json(
        { error: 'Branch ID is required', success: false },
        { status: 400 }
      );
    }

    // Get branch details for audit logging
    const { data: branch, error: branchError } = await supabase
      .from('branches')
      .select('*')
      .eq('id', branchId)
      .single();

    if (branchError || !branch) {
      return Response.json(
        { error: 'Branch not found', success: false },
        { status: 404 }
      );
    }

    // Check if branch has any occupied rooms (rooms with active tenants)
    const { data: occupiedRooms, error: roomsError } = await supabase
      .from('rooms')
      .select('id, room_number')
      .eq('branch_id', branchId)
      .eq('is_occupied', true)
      .limit(1);

    if (roomsError) {
      throw roomsError;
    }

    if (occupiedRooms && occupiedRooms.length > 0) {
      return Response.json(
        { error: 'Cannot delete branch that has occupied rooms. Please move out all tenants first.', success: false },
        { status: 400 }
      );
    }

    // Check if branch has any active tenants (double-check)
    const { data: tenants, error: tenantsError } = await supabase
      .from('tenants')
      .select('id, full_name')
      .eq('branch_id', branchId)
      .eq('is_active', true)
      .limit(1);

    if (tenantsError) {
      throw tenantsError;
    }

    if (tenants && tenants.length > 0) {
      return Response.json(
        { error: 'Cannot delete branch that has active tenants. Please move out all tenants first.', success: false },
        { status: 400 }
      );
    }

    // If we reach here, branch has no occupied rooms and no active tenants
    // We can safely delete the branch (CASCADE will handle rooms)
    const { error: deleteError } = await supabase
      .from('branches')
      .delete()
      .eq('id', branchId);

    if (deleteError) {
      throw deleteError;
    }

    // Log audit event for branch deletion
    await logAuditEvent(
      supabase,
      user.id,
      'Branch Deleted',
      'branches',
      branchId,
      {
        name: branch.name,
        address: branch.address,
        monthly_rent_rate: branch.monthly_rent_rate
      },
      null
    );

    return Response.json({ success: true, message: 'Branch and its empty rooms deleted successfully' });
  } catch (error: any) {
    console.error('Error deleting branch:', error);
    return Response.json(
      { error: error.message || 'Failed to delete branch', success: false },
      { status: 500 }
    );
  }
} 
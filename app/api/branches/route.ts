import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { branchSchema } from '@/lib/validations/schemas';
import { logAuditEvent } from '@/lib/audit/logger';

export async function GET() {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    
    const { data: branches, error } = await supabase
      .from('branches')
      .select('*')
      .order('name');

    if (error) {
      console.error('Error fetching branches:', error);
      return NextResponse.json(
        { error: 'Failed to fetch branches', success: false },
        { status: 500 }
      );
    }

    return NextResponse.json({
      data: branches,
      success: true
    });
  } catch (error) {
    console.error('Error in GET /api/branches:', error);
    return NextResponse.json(
      { error: 'Internal server error', success: false },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    
    // Get current user for audit logging
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized', success: false },
        { status: 401 }
      );
    }

    const body = await request.json();
    
    // Validate input
    const { error: validationError, value: branchData } = branchSchema.validate(body);
    if (validationError) {
      return NextResponse.json(
        { error: validationError.details[0].message, success: false },
        { status: 400 }
      );
    }

    // Ensure numberOfRooms is present and valid
    if (!branchData.numberOfRooms || branchData.numberOfRooms < 1) {
      return NextResponse.json(
        { error: 'Number of rooms is required and must be at least 1', success: false },
        { status: 400 }
      );
    }

    // Default room_number_prefix to empty string if not provided
    const { numberOfRooms, room_number_prefix = '', ...branchInsertData } = branchData;

    // Insert branch
    const { data: branch, error: branchError } = await supabase
      .from('branches')
      .insert(branchInsertData)
      .select()
      .single();

    if (branchError) {
      console.error('Error creating branch:', branchError);
      return NextResponse.json(
        { error: 'Failed to create branch', success: false },
        { status: 500 }
      );
    }

    // Log audit event
    await logAuditEvent(
      supabase,
      user.id,
      'Branch Created',
      'branches',
      branch.id,
      undefined,
      branchInsertData
    );

    // If numberOfRooms is specified, create rooms in bulk
    if (numberOfRooms && numberOfRooms > 0) {
      const roomsToInsert = [];
      
      for (let i = 1; i <= numberOfRooms; i++) {
        roomsToInsert.push({
          branch_id: branch.id,
          room_number: `${room_number_prefix}${i.toString().padStart(2, '0')}`,
          monthly_rent: branch.monthly_rent_rate,
        });
      }

      const { error: roomsError } = await supabase
        .from('rooms')
        .insert(roomsToInsert);

      if (roomsError) {
        console.error('Error creating rooms:', roomsError);
        // Don't fail the entire request if room creation fails
        // The branch was created successfully
      } else {
        // Log audit event for bulk room creation
        await logAuditEvent(
          supabase,
          user.id,
          'Bulk Rooms Created',
          'rooms',
          branch.id,
          undefined,
          { branch_id: branch.id, rooms_created: numberOfRooms }
        );
      }
    }

    return NextResponse.json({
      data: branch,
      success: true,
      message: `Branch created successfully${numberOfRooms ? ` with ${numberOfRooms} rooms` : ''}`
    });
  } catch (error) {
    console.error('Error in POST /api/branches:', error);
    return NextResponse.json(
      { error: 'Internal server error', success: false },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { searchParams } = new URL(request.url);
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
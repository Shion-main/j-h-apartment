import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { logAuditEvent } from '@/lib/audit/logger';

// Force dynamic rendering for this route
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const searchParams = request.nextUrl.searchParams;
    const available = searchParams.get('available');
    const branchId = searchParams.get('branch_id');

    console.log('GET /api/rooms called with params:', { available, branchId });

    // Filter by availability if specified
    if (available === 'true') {
      // First, get all active tenants and their room IDs
      const { data: activeTenants, error: tenantsError } = await supabase
        .from('tenants')
        .select('room_id')
        .eq('is_active', true)
        .not('room_id', 'is', null);

      if (tenantsError) {
        console.error('Error fetching active tenants:', tenantsError);
        return NextResponse.json({
          error: 'Failed to fetch tenant data',
          success: false
        }, { status: 500 });
      }

      const occupiedRoomIds = activeTenants?.map(t => t.room_id).filter(Boolean) || [];
      console.log('Occupied room IDs:', occupiedRoomIds);

      // Now get all rooms, excluding the occupied ones
      let roomQuery = supabase
        .from('rooms')
        .select(`
          *,
          branches (
            id,
            name,
            address
          )
        `)
        .order('room_number');

      // Exclude occupied rooms if there are any
      if (occupiedRoomIds.length > 0) {
        roomQuery = roomQuery.not('id', 'in', `(${occupiedRoomIds.map(id => `"${id}"`).join(',')})`);
      }

      // Filter by branch if specified
      if (branchId) {
        roomQuery = roomQuery.eq('branch_id', branchId);
      }

      const { data: availableRooms, error: roomsError } = await roomQuery;

      if (roomsError) {
        console.error('Error fetching available rooms:', roomsError);
        return NextResponse.json({
          error: 'Failed to fetch available rooms',
          success: false
        }, { status: 500 });
      }

      console.log(`Found ${availableRooms?.length || 0} available rooms${branchId ? ` in branch ${branchId}` : ''}`);

      return NextResponse.json({
        data: availableRooms?.map(room => ({
          ...room,
          branch: room.branches // Normalize the structure
        })) || [],
        success: true
      });
    }

    // For non-available queries, use the simple approach
    let query = supabase
      .from('rooms')
      .select(`
        *,
        branches (
          id,
          name,
          address
        )
      `)
      .order('room_number');

    // Filter by branch if specified
    if (branchId) {
      query = query.eq('branch_id', branchId);
    }

    const { data: rooms, error } = await query;

    if (error) {
      console.error('Error fetching rooms:', error);
      return NextResponse.json({
        error: 'Failed to fetch rooms',
        success: false
      }, { status: 500 });
    }

    console.log(`Found ${rooms?.length || 0} rooms${branchId ? ` in branch ${branchId}` : ''}`);

    return NextResponse.json({
      data: rooms?.map(room => ({
        ...room,
        branch: room.branches // Normalize the structure
      })) || [],
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
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized', success: false }, { status: 401 });
    }

    const body = await request.json();
    
    // Basic validation
    if (!body.branch_id || !body.room_number || !body.monthly_rent) {
      return NextResponse.json({ error: 'Missing required fields', success: false }, { status: 400 });
    }

    const { data: newRoom, error } = await supabase
      .from('rooms')
      .insert({
        branch_id: body.branch_id,
        room_number: body.room_number,
        monthly_rent: body.monthly_rent,
        is_occupied: false,
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating room:', error);
      return NextResponse.json({ error: 'Failed to create room', success: false }, { status: 500 });
    }

    // Log the audit event
    await logAuditEvent(
      supabase,
      user.id,
      'ROOM_CREATED',
      'rooms',
      newRoom.id,
      null,
      {
        branch_id: newRoom.branch_id,
        room_number: newRoom.room_number,
        monthly_rent: newRoom.monthly_rent,
      }
    );

    return NextResponse.json({ data: newRoom, success: true });
  } catch (error) {
    console.error('Error in POST /api/rooms:', error);
    return NextResponse.json({ error: 'Internal Server Error', success: false }, { status: 500 });
  }
} 
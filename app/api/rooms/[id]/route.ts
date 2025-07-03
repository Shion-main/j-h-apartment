import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { logAuditEvent } from '@/lib/audit/logger';

// PUT handler for updating a room
export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  const roomId = params.id;
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized', success: false }, { status: 401 });
    }

    const body = await request.json();

    // Fetch current room data for audit log
    const { data: currentRoom, error: fetchError } = await supabase
      .from('rooms')
      .select('*')
      .eq('id', roomId)
      .single();

    if (fetchError || !currentRoom) {
      return NextResponse.json({ error: 'Room not found', success: false }, { status: 404 });
    }

    // Update the room
    const { data: updatedRoom, error: updateError } = await supabase
      .from('rooms')
      .update({
        room_number: body.room_number,
        monthly_rent: body.monthly_rent,
      })
      .eq('id', roomId)
      .select()
      .single();

    if (updateError) {
      throw updateError;
    }

    // Log the audit event
    await logAuditEvent(
      supabase,
      user.id,
      'ROOM_UPDATED',
      'rooms',
      roomId,
      { room_number: currentRoom.room_number, monthly_rent: currentRoom.monthly_rent },
      { room_number: updatedRoom.room_number, monthly_rent: updatedRoom.monthly_rent }
    );

    return NextResponse.json({ data: updatedRoom, success: true });
  } catch (error: any) {
    console.error(`Error updating room ${roomId}:`, error);
    return NextResponse.json({ error: error.message || 'Failed to update room', success: false }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const roomId = params.id;

    // Get current user for audit logging
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({
        error: 'Unauthorized',
        success: false
      }, { status: 401 });
    }

    // Get room data before deletion for audit logging
    const { data: roomData } = await supabase
      .from('rooms')
      .select('*')
      .eq('id', roomId)
      .single();

    const { error } = await supabase
      .from('rooms')
      .delete()
      .eq('id', roomId);

    if (error) {
      console.error('Error deleting room:', error);
      return NextResponse.json({
        error: 'Failed to delete room',
        success: false
      }, { status: 500 });
    }

    // Log the room deletion
    await logAuditEvent(
      supabase,
      user.id,
      'ROOM_DELETED',
      'rooms',
      roomId,
      roomData,
      null
    );

    return NextResponse.json({
      success: true
    });
  } catch (error) {
    console.error('Error in DELETE /api/rooms/[id]:', error);
    return NextResponse.json({
      error: 'Internal server error',
      success: false
    }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const roomId = params.id;
    const body = await request.json();

    // Get current user for audit logging
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({
        error: 'Unauthorized',
        success: false
      }, { status: 401 });
    }

    // Get current room data for audit logging
    const { data: currentRoom } = await supabase
      .from('rooms')
      .select('*')
      .eq('id', roomId)
      .single();

    const { data: updatedRoom, error } = await supabase
      .from('rooms')
      .update(body)
      .eq('id', roomId)
      .select()
      .single();

    if (error) {
      console.error('Error updating room:', error);
      return NextResponse.json({
        error: 'Failed to update room',
        success: false
      }, { status: 500 });
    }

    // Log the room update
    await logAuditEvent(
      supabase,
      user.id,
      'ROOM_UPDATED',
      'rooms',
      roomId,
      currentRoom,
      updatedRoom
    );

    return NextResponse.json({
      data: updatedRoom,
      success: true
    });
  } catch (error) {
    console.error('Error in PATCH /api/rooms/[id]:', error);
    return NextResponse.json({
      error: 'Internal server error',
      success: false
    }, { status: 500 });
  }
} 
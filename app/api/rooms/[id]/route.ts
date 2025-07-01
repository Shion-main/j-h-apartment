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

// DELETE handler for deleting a room
export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const roomId = params.id;
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized', success: false }, { status: 401 });
    }
    
    // Fetch current room data for audit log
    const { data: roomToDelete, error: fetchError } = await supabase
      .from('rooms')
      .select('*')
      .eq('id', roomId)
      .single();

    if (fetchError || !roomToDelete) {
      return NextResponse.json({ error: 'Room not found', success: false }, { status: 404 });
    }
    
    if (roomToDelete.is_occupied) {
        return NextResponse.json({ error: 'Cannot delete an occupied room.', success: false }, { status: 400 });
    }

    // Delete the room
    const { error: deleteError } = await supabase
      .from('rooms')
      .delete()
      .eq('id', roomId);

    if (deleteError) {
      throw deleteError;
    }

    // Log the audit event
    await logAuditEvent(
      supabase,
      user.id,
      'ROOM_DELETED',
      'rooms',
      roomId,
      { room_number: roomToDelete.room_number, branch_id: roomToDelete.branch_id, monthly_rent: roomToDelete.monthly_rent },
      null
    );

    return NextResponse.json({ success: true, message: 'Room deleted successfully' });
  } catch (error: any) {
    console.error(`Error deleting room ${roomId}:`, error);
    return NextResponse.json({ error: error.message || 'Failed to delete room', success: false }, { status: 500 });
  }
} 
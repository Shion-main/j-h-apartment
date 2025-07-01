import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { logAuditEvent } from '@/lib/audit/logger';

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createRouteHandlerClient({ cookies });
  const tenantId = params.id;

  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { full_name, email_address, phone_number, room_id } = body;

    // 1. Get original tenant data for logging and comparison
    const { data: originalTenant, error: fetchError } = await supabase
      .from('tenants')
      .select('*')
      .eq('id', tenantId)
      .single();
      
    if (fetchError || !originalTenant) throw new Error('Original tenant not found.');

    const isRelocating = room_id !== originalTenant.room_id;
    let newBranchId = originalTenant.branch_id;

    // 2. If relocating, handle room occupancy changes
    if (isRelocating) {
      // Mark old room as not occupied
      await supabase.from('rooms').update({ is_occupied: false }).eq('id', originalTenant.room_id);
      
      // Mark new room as occupied and get its branch_id
      const { data: newRoom, error: newRoomError } = await supabase
        .from('rooms')
        .update({ is_occupied: true })
        .eq('id', room_id)
        .select('branch_id')
        .single();
        
      if (newRoomError || !newRoom) throw new Error('Failed to secure new room for relocation.');
      newBranchId = newRoom.branch_id;
    }

    // 3. Update the tenant record
    const { data: updatedTenant, error: updateError } = await supabase
      .from('tenants')
      .update({ full_name, email_address, phone_number, room_id, branch_id: newBranchId })
      .eq('id', tenantId)
      .select()
      .single();

    if (updateError) throw updateError;

    // 4. Log the audit event
    await logAuditEvent(
      supabase,
      user.id,
      'TENANT_UPDATED',
      'tenants',
      tenantId,
      {
        full_name: originalTenant.full_name,
        email_address: originalTenant.email_address,
        phone_number: originalTenant.phone_number,
        room_id: originalTenant.room_id,
      },
      {
        full_name: updatedTenant.full_name,
        email_address: updatedTenant.email_address,
        phone_number: updatedTenant.phone_number,
        room_id: updatedTenant.room_id,
        relocated: isRelocating
      }
    );

    return NextResponse.json({ success: true, data: updatedTenant });

  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
} 
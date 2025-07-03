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
    const { full_name, email_address, phone_number } = body;

    // 1. Get original tenant data for logging and comparison
    const { data: originalTenant, error: fetchError } = await supabase
      .from('tenants')
      .select('*')
      .eq('id', tenantId)
      .single();
      
    if (fetchError || !originalTenant) throw new Error('Original tenant not found.');

    // 2. Update only personal information (no room changes allowed)
    const { data: updatedTenant, error: updateError } = await supabase
      .from('tenants')
      .update({ 
        full_name, 
        email_address, 
        phone_number
        // Note: room_id and branch_id remain unchanged
      })
      .eq('id', tenantId)
      .select()
      .single();

    if (updateError) throw updateError;

    // 3. Log the audit event (personal information update only)
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
      },
      {
        full_name: updatedTenant.full_name,
        email_address: updatedTenant.email_address,
        phone_number: updatedTenant.phone_number,
        update_type: 'personal_information'
      }
    );

    return NextResponse.json({ success: true, data: updatedTenant });

  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
} 
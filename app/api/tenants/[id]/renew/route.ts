import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { logAuditEvent } from '@/lib/audit/logger';

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const tenantId = params.id;
  const supabase = createRouteHandlerClient({ cookies });

  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: tenant, error: tenantError } = await supabase
      .from('tenants')
      .select('contract_end_date')
      .eq('id', tenantId)
      .single();

    if (tenantError || !tenant) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
    }

    const currentEndDate = new Date(tenant.contract_end_date);
    // Add 6 months to the current contract end date
    currentEndDate.setMonth(currentEndDate.getMonth() + 6);
    const newEndDate = currentEndDate.toISOString().split('T')[0];

    const { data: updatedTenant, error: updateError } = await supabase
      .from('tenants')
      .update({ contract_end_date: newEndDate })
      .eq('id', tenantId)
      .select('contract_end_date')
      .single();

    if (updateError) {
      console.error('Contract renewal error:', updateError);
      return NextResponse.json({ error: 'Failed to renew contract', details: updateError.message }, { status: 500 });
    }

    // Log the audit event for contract renewal
    await logAuditEvent(
      supabase,
      user.id,
      'CONTRACT_RENEWAL',
      'tenants',
      tenantId,
      { contract_end_date: tenant.contract_end_date },
      { contract_end_date: newEndDate }
    );

    return NextResponse.json({ 
      success: true, 
      message: 'Contract renewed successfully.',
      data: updatedTenant
    });

  } catch (error) {
    console.error('API Route Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
} 
import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const tenantId = params.id;

    // Validate tenant ID
    if (!tenantId || typeof tenantId !== 'string' || tenantId === 'undefined') {
      return NextResponse.json({
        error: 'Invalid tenant ID',
        success: false
      }, { status: 400 });
    }

    // Get current user for authorization
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({
        error: 'Unauthorized',
        success: false
      }, { status: 401 });
    }

    // Get tenant details with room and branch information
    const { data: tenant, error: tenantError } = await supabase
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
            electricity_rate,
            water_rate
          )
        )
      `)
      .eq('id', tenantId)
      .single();

    if (tenantError || !tenant) {
      console.error('Tenant lookup error:', tenantError);
      return NextResponse.json({
        error: 'Tenant not found',
        success: false
      }, { status: 404 });
    }

    return NextResponse.json({
      data: tenant,
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
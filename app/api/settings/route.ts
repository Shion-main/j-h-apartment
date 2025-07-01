import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { logSettingsChange, logAuditEvent } from '@/lib/audit/logger';

export async function GET(request: NextRequest) {
  const supabase = createRouteHandlerClient({ cookies });

  try {
    const { data, error } = await supabase
      .from('system_settings')
      .select('key, value');

    if (error) {
      console.error('Error fetching settings:', error);
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    const settings = data.reduce((acc, { key, value }) => {
      acc[key] = value;
      return acc;
    }, {} as Record<string, string>);

    return NextResponse.json({ success: true, data: settings });
  } catch (err: any) {
    console.error('An unexpected error occurred:', err);
    return NextResponse.json({ success: false, error: 'An unexpected error occurred' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  const supabase = createRouteHandlerClient({ cookies });
  const { key, value } = await request.json();

  if (!key || value === undefined || value === null) {
    return NextResponse.json({ success: false, error: 'Setting key and value are required' }, { status: 400 });
  }

  try {
    // Get current user for audit logging
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({
        error: 'Unauthorized',
        success: false
      }, { status: 401 });
    }

    // Get current value for audit logging
    const { data: currentSetting } = await supabase
      .from('system_settings')
      .select('value')
      .eq('key', key)
      .single();

    const oldValue = currentSetting?.value || null;

    const { data, error } = await supabase
      .from('system_settings')
      .upsert({ key, value }, { onConflict: 'key' })
      .select()
      .single();

    if (error) {
      console.error(`Error updating setting "${key}":`, error);
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    // Log the settings change (critical for penalty_percentage changes)
    await logSettingsChange(supabase, user.id, key, oldValue, value);

    return NextResponse.json({ success: true, data });
  } catch (err: any) {
    console.error('An unexpected error occurred during setting update:', err);
    return NextResponse.json({ success: false, error: 'An unexpected error occurred' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const supabase = createRouteHandlerClient({ cookies });
  const { updates } = await request.json();

  if (!updates || updates.length === 0) {
    return NextResponse.json({ success: false, error: 'Updates are required' }, { status: 400 });
  }

  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get current settings for audit logging
    const { data: currentSettings } = await supabase
      .from('system_settings')
      .select('key, value');

    if (!currentSettings) {
      return NextResponse.json({
        error: 'Failed to fetch current settings',
        success: false
      }, { status: 500 });
    }

    const oldSettings = currentSettings.reduce((acc, { key, value }) => {
      acc[key] = value;
      return acc;
    }, {} as Record<string, string>);

    // Update settings
    const { data: updatedSettings, error } = await supabase
      .from('system_settings')
      .upsert(updates, { onConflict: 'key' })
      .select();

    if (error) throw error;

    // --- START: New logic to update all branches ---
    const rateUpdatePayload: { [key: string]: any } = {};
    updates.forEach((update: { key: string, value: string }) => {
      if (update.key === 'default_monthly_rent_rate') {
        const rate = parseFloat(update.value);
        if (!isNaN(rate) && rate >= 0) {
          rateUpdatePayload.monthly_rent_rate = rate;
        }
      } else if (update.key === 'default_water_rate') {
        const rate = parseFloat(update.value);
        if (!isNaN(rate) && rate >= 0) {
          rateUpdatePayload.water_rate = rate;
        }
      } else if (update.key === 'default_electricity_rate') {
        const rate = parseFloat(update.value);
        if (!isNaN(rate) && rate >= 0) {
          rateUpdatePayload.electricity_rate = rate;
        }
      }
    });

    if (Object.keys(rateUpdatePayload).length > 0) {
      const { error: branchUpdateError } = await supabase
        .from('branches')
        .update(rateUpdatePayload); // This updates all rows

      if (branchUpdateError) {
        // Log the error but don't fail the entire operation
        console.error('Failed to cascade rate updates to branches:', branchUpdateError);
      } else {
        await logAuditEvent(
          supabase,
          user.id,
          'BRANCH_RATES_CASCADE_UPDATE',
          'branches',
          'all',
          null,
          rateUpdatePayload
        );
      }
    }
    // --- END: New logic ---

    // Log each setting change
    for (const { key, value } of updates) {
      await logAuditEvent(
        supabase,
        user.id,
        'SETTINGS_CHANGED',
        'system_settings',
        key, // Use the key as the target_id for settings
        { value: oldSettings[key] },
        { value }
      );
    }

    return NextResponse.json({ success: true, data: updatedSettings });
  } catch (err: any) {
    console.error('An unexpected error occurred during settings update:', err);
    return NextResponse.json({ success: false, error: 'An unexpected error occurred' }, { status: 500 });
  }
} 
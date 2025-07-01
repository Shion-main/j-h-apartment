import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const supabase = createRouteHandlerClient({ cookies });

  try {
    const { data: { session } } = await supabase.auth.getSession();

    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data, error } = await supabase
      .from('audit_logs')
      .select(`
        *,
        profiles (
          full_name,
          email
        )
      `)
      .order('timestamp', { ascending: false })
      .limit(100);

    if (error) {
      console.error('Error fetching audit logs:', error);
      throw error;
    }

    // Map the user data from the profiles table to a top-level user property
    const logsWithUser = data.map(log => {
      const user_display_name = (log as any).profiles?.full_name || (log as any).profiles?.email || log.user_id;
      const { profiles, ...rest } = log as any;
      return { ...rest, user_display_name };
    });

    return NextResponse.json({ success: true, data: logsWithUser });

  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
} 
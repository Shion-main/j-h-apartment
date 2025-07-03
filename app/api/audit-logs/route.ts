import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

// Force dynamic rendering for this route
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: NextRequest) {
  const supabase = createRouteHandlerClient({ cookies });

  try {
    const { data: { session } } = await supabase.auth.getSession();

    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get search params
    const searchParams = request.nextUrl.searchParams;
    const limit = searchParams.get('limit') || '100';
    const offset = searchParams.get('offset') || '0';
    const action = searchParams.get('action');
    const table = searchParams.get('table');
    const date = searchParams.get('date');

    // Build query
    let query = supabase
      .from('audit_logs')
      .select(`
        *,
        user:user_id (
          id,
          full_name,
          email
        )
      `)
      .order('timestamp', { ascending: false });

    // Apply filters
    if (action) query = query.eq('action', action);
    if (table) query = query.eq('target_table', table);
    if (date) query = query.gte('timestamp', date).lt('timestamp', new Date(new Date(date).getTime() + 86400000).toISOString());

    // Apply pagination
    query = query.range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);

    const { data, error, count } = await query;

    if (error) {
      console.error('Error fetching audit logs:', error);
      return NextResponse.json({ 
        success: false, 
        error: error.message 
      }, { status: 500 });
    }

    // Process the logs to include user display names
    const logsWithUser = data?.map(log => {
      const userProfile = log.user;
      const user_display_name = userProfile?.full_name || userProfile?.email || log.user_id;
      const { user, ...rest } = log;
      return { 
        ...rest, 
        user_display_name,
        timestamp: new Date(log.timestamp).toISOString() // Ensure consistent timestamp format
      };
    }) || [];

    return NextResponse.json({ 
      success: true, 
      data: logsWithUser,
      count
    });

  } catch (error: any) {
    console.error('Error in audit logs API:', error);
    return NextResponse.json({ 
      success: false, 
      error: 'Internal server error' 
    }, { status: 500 });
  }
} 
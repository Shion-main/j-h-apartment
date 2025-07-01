import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { logAuthEvent } from '@/lib/audit/logger';

export async function POST(request: NextRequest) {
  const supabase = createRouteHandlerClient({ cookies });
  
  try {
    // Get current user before logging out
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (user) {
      // Log logout before signing out, passing the route handler's client
      await logAuthEvent(supabase, user.id, 'LOGOUT');
    }

    const { error } = await supabase.auth.signOut();

    if (error) {
      return NextResponse.json({ 
        error: error.message,
        success: false 
      }, { status: 500 });
    }

    // Create a response that clears the auth cookies
    const response = NextResponse.json({ 
      message: 'Logged out successfully',
      success: true 
    });

    // Clear Supabase auth cookies
    response.cookies.set('supabase-auth-token', '', {
      expires: new Date(0),
      path: '/',
    });

    return response;

  } catch (err: any) {
    console.error('Logout error:', err);
    return NextResponse.json({ 
      error: 'An unexpected error occurred',
      success: false 
    }, { status: 500 });
  }
} 
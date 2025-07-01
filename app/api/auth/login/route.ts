import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { logAuthEvent } from '@/lib/audit/logger';

export async function POST(request: NextRequest) {
  const supabase = createRouteHandlerClient({ cookies });
  
  try {
    const { email, password } = await request.json();

    if (!email || !password) {
      return NextResponse.json({ 
        error: 'Email and password are required',
        success: false 
      }, { status: 400 });
    }

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      // Log failed login attempt (no user ID since login failed)
      console.log('Failed login attempt for email:', email);
      return NextResponse.json({ 
        error: error.message,
        success: false 
      }, { status: 401 });
    }

    // Log successful login
    if (data.user) {
      try {
        await logAuthEvent(supabase, data.user.id, 'LOGIN');
      } catch (logError) {
        console.error('Failed to log auth event:', logError);
        // Don't fail the login if audit logging fails
      }
    }

    return NextResponse.json({ 
      data: data,
      success: true 
    });

  } catch (err: any) {
    console.error('Login error:', err);
    return NextResponse.json({ 
      error: 'An unexpected error occurred',
      success: false 
    }, { status: 500 });
  }
} 
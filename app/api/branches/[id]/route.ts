import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { logAuditEvent } from '@/lib/audit/logger';

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const branchId = params.id;
    const body = await request.json();

    // Get current user for audit logging
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({
        error: 'Unauthorized',
        success: false
      }, { status: 401 });
    }

    // Get current branch data for audit logging
    const { data: currentBranch } = await supabase
      .from('branches')
      .select('*')
      .eq('id', branchId)
      .single();

    const { data: updatedBranch, error } = await supabase
      .from('branches')
      .update(body)
      .eq('id', branchId)
      .select()
      .single();

    if (error) {
      console.error('Error updating branch:', error);
      return NextResponse.json({
        error: 'Failed to update branch',
        success: false
      }, { status: 500 });
    }

    // Log the branch update
    await logAuditEvent(
      supabase,
      user.id,
      'BRANCH_UPDATED',
      'branches',
      branchId,
      currentBranch,
      updatedBranch
    );

    return NextResponse.json({
      data: updatedBranch,
      success: true
    });
  } catch (error) {
    console.error('Error in PATCH /api/branches/[id]:', error);
    return NextResponse.json({
      error: 'Internal server error',
      success: false
    }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const branchId = params.id;

    // Get current user for audit logging
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({
        error: 'Unauthorized',
        success: false
      }, { status: 401 });
    }

    // Get branch data before deletion for audit logging
    const { data: branchData } = await supabase
      .from('branches')
      .select('*')
      .eq('id', branchId)
      .single();

    // Check if branch has any rooms
    const { data: rooms } = await supabase
      .from('rooms')
      .select('id')
      .eq('branch_id', branchId);

    if (rooms && rooms.length > 0) {
      return NextResponse.json({
        error: 'Cannot delete branch with existing rooms',
        success: false
      }, { status: 400 });
    }

    const { error } = await supabase
      .from('branches')
      .delete()
      .eq('id', branchId);

    if (error) {
      console.error('Error deleting branch:', error);
      return NextResponse.json({
        error: 'Failed to delete branch',
        success: false
      }, { status: 500 });
    }

    // Log the branch deletion
    await logAuditEvent(
      supabase,
      user.id,
      'BRANCH_DELETED',
      'branches',
      branchId,
      branchData,
      null
    );

    return NextResponse.json({
      success: true
    });
  } catch (error) {
    console.error('Error in DELETE /api/branches/[id]:', error);
    return NextResponse.json({
      error: 'Internal server error',
      success: false
    }, { status: 500 });
  }
} 
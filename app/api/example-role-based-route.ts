import { NextRequest, NextResponse } from 'next/server';
import { withAuth, AuthOptions } from '@/lib/middleware/auth';

// Example API route with role-based authorization
export const GET = withAuth(
  async (request: NextRequest, userContext: any) => {
    // This handler will only be called if the user has the required permissions
    const { role, assignedBranch } = userContext;
    
    return NextResponse.json({
      success: true,
      data: {
        message: `Hello ${role}!`,
        assignedBranch,
        timestamp: new Date().toISOString()
      }
    });
  },
  {
    permissions: ['view_financial_reports'] // Only users who can view financial reports
  }
);

// Example: Admin-only route
export const POST = withAuth(
  async (request: NextRequest, userContext: any) => {
    const body = await request.json();
    
    return NextResponse.json({
      success: true,
      data: {
        message: 'Admin action completed',
        user: userContext.email,
        action: body.action
      }
    });
  },
  {
    requireAdmin: true // Only admins can access this
  }
);

// Example: Branch manager route with branch-specific data
export const PUT = withAuth(
  async (request: NextRequest, userContext: any) => {
    const { assignedBranch } = userContext;
    
    if (!assignedBranch) {
      return NextResponse.json({
        error: 'No branch assigned',
        success: false
      }, { status: 400 });
    }
    
    // Process branch-specific data
    return NextResponse.json({
      success: true,
      data: {
        message: 'Branch-specific action completed',
        branchId: assignedBranch
      }
    });
  },
  {
    requireBranchManager: true // Only branch managers can access this
  }
); 
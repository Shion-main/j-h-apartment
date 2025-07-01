import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { 
  isAdmin, 
  isBranchManager, 
  isStaff, 
  getUserAssignedBranch,
  canManageUsers,
  canManageBranches,
  canManageTenants,
  canGenerateBills,
  canViewFinancialReports,
  canViewAuditLogs,
  canModifySystemSettings
} from '@/lib/supabase/client';

export interface AuthOptions {
  requireAuth?: boolean;
  requireAdmin?: boolean;
  requireBranchManager?: boolean;
  requireStaff?: boolean;
  requireBranchAccess?: boolean;
  permissions?: string[];
}

export async function withAuth(
  handler: Function,
  options: AuthOptions = {}
) {
  return async (request: Request, ...args: any[]) => {
    const supabase = createRouteHandlerClient({ cookies });
    
    try {
      // Get current user
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      
      if (authError || !user) {
        return NextResponse.json(
          { error: 'Unauthorized', success: false },
          { status: 401 }
        );
      }

      // Check role-based permissions
      if (options.requireAdmin && !(await isAdmin(user.id))) {
        return NextResponse.json(
          { error: 'Admin access required', success: false },
          { status: 403 }
        );
      }

      if (options.requireBranchManager && !(await isBranchManager(user.id))) {
        return NextResponse.json(
          { error: 'Branch manager access required', success: false },
          { status: 403 }
        );
      }

      if (options.requireStaff && !(await isStaff(user.id))) {
        return NextResponse.json(
          { error: 'Staff access required', success: false },
          { status: 403 }
        );
      }

      // Check specific permissions
      if (options.permissions) {
        for (const permission of options.permissions) {
          let hasPermission = false;
          
          switch (permission) {
            case 'manage_users':
              hasPermission = await canManageUsers(user.id);
              break;
            case 'manage_branches':
              hasPermission = await canManageBranches(user.id);
              break;
            case 'manage_tenants':
              hasPermission = await canManageTenants(user.id);
              break;
            case 'generate_bills':
              hasPermission = await canGenerateBills(user.id);
              break;
            case 'view_financial_reports':
              hasPermission = await canViewFinancialReports(user.id);
              break;
            case 'view_audit_logs':
              hasPermission = await canViewAuditLogs(user.id);
              break;
            case 'modify_system_settings':
              hasPermission = await canModifySystemSettings(user.id);
              break;
            default:
              hasPermission = false;
          }
          
          if (!hasPermission) {
            return NextResponse.json(
              { error: `Permission denied: ${permission}`, success: false },
              { status: 403 }
            );
          }
        }
      }

      // Add user context to request
      const userContext = {
        id: user.id,
        email: user.email,
        role: await getUserRole(user.id),
        assignedBranch: await getUserAssignedBranch(user.id)
      };

      // Call the original handler with user context
      return await handler(request, userContext, ...args);
      
    } catch (error) {
      console.error('Auth middleware error:', error);
      return NextResponse.json(
        { error: 'Internal server error', success: false },
        { status: 500 }
      );
    }
  };
}

// Helper function to get user role (needed for the middleware)
async function getUserRole(userId: string): Promise<string | null> {
  const supabase = createRouteHandlerClient({ cookies });
  const { data, error } = await supabase
    .from('user_roles')
    .select(`
      roles (
        role_name
      )
    `)
    .eq('user_id', userId)
    .single();
  
  if (error || !data) return null;
  return (data as any).roles?.role_name || null;
} 
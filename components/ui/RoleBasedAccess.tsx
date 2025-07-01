'use client';

import { ReactNode, useEffect, useState } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { 
  isAdmin, 
  isBranchManager, 
  isStaff,
  canManageUsers,
  canManageBranches,
  canManageTenants,
  canGenerateBills,
  canViewFinancialReports,
  canViewAuditLogs,
  canModifySystemSettings
} from '@/lib/supabase/client';

interface RoleBasedAccessProps {
  children: ReactNode;
  requireAdmin?: boolean;
  requireBranchManager?: boolean;
  requireStaff?: boolean;
  permissions?: string[];
  fallback?: ReactNode;
  showIfNoPermission?: boolean;
}

export default function RoleBasedAccess({
  children,
  requireAdmin = false,
  requireBranchManager = false,
  requireStaff = false,
  permissions = [],
  fallback = null,
  showIfNoPermission = false
}: RoleBasedAccessProps) {
  const [hasAccess, setHasAccess] = useState<boolean | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const supabase = createClientComponentClient();

  useEffect(() => {
    const checkAccess = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        
        if (!user) {
          setHasAccess(false);
          setIsLoading(false);
          return;
        }

        // Check role requirements
        if (requireAdmin && !(await isAdmin(user.id))) {
          setHasAccess(false);
          setIsLoading(false);
          return;
        }

        if (requireBranchManager && !(await isBranchManager(user.id))) {
          setHasAccess(false);
          setIsLoading(false);
          return;
        }

        if (requireStaff && !(await isStaff(user.id))) {
          setHasAccess(false);
          setIsLoading(false);
          return;
        }

        // Check specific permissions
        if (permissions.length > 0) {
          for (const permission of permissions) {
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
              setHasAccess(false);
              setIsLoading(false);
              return;
            }
          }
        }

        setHasAccess(true);
        setIsLoading(false);
      } catch (error) {
        console.error('Error checking access:', error);
        setHasAccess(false);
        setIsLoading(false);
      }
    };

    checkAccess();
  }, [requireAdmin, requireBranchManager, requireStaff, permissions, supabase]);

  if (isLoading) {
    return null; // Or a loading spinner
  }

  if (hasAccess) {
    return <>{children}</>;
  }

  if (showIfNoPermission) {
    return <>{fallback}</>;
  }

  return null;
}

// Convenience components for common role checks
export function AdminOnly({ children, fallback }: { children: ReactNode; fallback?: ReactNode }) {
  return (
    <RoleBasedAccess requireAdmin={true} fallback={fallback}>
      {children}
    </RoleBasedAccess>
  );
}

export function BranchManagerOnly({ children, fallback }: { children: ReactNode; fallback?: ReactNode }) {
  return (
    <RoleBasedAccess requireBranchManager={true} fallback={fallback}>
      {children}
    </RoleBasedAccess>
  );
}

export function StaffOnly({ children, fallback }: { children: ReactNode; fallback?: ReactNode }) {
  return (
    <RoleBasedAccess requireStaff={true} fallback={fallback}>
      {children}
    </RoleBasedAccess>
  );
}

export function AdminOrBranchManager({ children, fallback }: { children: ReactNode; fallback?: ReactNode }) {
  return (
    <RoleBasedAccess 
      permissions={['manage_tenants']} 
      fallback={fallback}
    >
      {children}
    </RoleBasedAccess>
  );
}

export function CanManageUsers({ children, fallback }: { children: ReactNode; fallback?: ReactNode }) {
  return (
    <RoleBasedAccess 
      permissions={['manage_users']} 
      fallback={fallback}
    >
      {children}
    </RoleBasedAccess>
  );
}

export function CanGenerateBills({ children, fallback }: { children: ReactNode; fallback?: ReactNode }) {
  return (
    <RoleBasedAccess 
      permissions={['generate_bills']} 
      fallback={fallback}
    >
      {children}
    </RoleBasedAccess>
  );
}

export function CanViewFinancialReports({ children, fallback }: { children: ReactNode; fallback?: ReactNode }) {
  return (
    <RoleBasedAccess 
      permissions={['view_financial_reports']} 
      fallback={fallback}
    >
      {children}
    </RoleBasedAccess>
  );
}

export function CanViewAuditLogs({ children, fallback }: { children: ReactNode; fallback?: ReactNode }) {
  return (
    <RoleBasedAccess 
      permissions={['view_audit_logs']} 
      fallback={fallback}
    >
      {children}
    </RoleBasedAccess>
  );
} 
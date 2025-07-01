import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import type { Database } from '@/types/database';

export const supabase = createClientComponentClient<Database>();

// Server-side client for API routes
export { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';

// Utility functions for common database operations
export async function getCurrentUser() {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error) throw error;
  return user;
}

export async function getUserProfile(userId: string) {
  const { data, error } = await supabase
    .from('profiles')
    .select(`
      *,
      user_roles (
        role_id,
        roles (
          role_name
        )
      )
    `)
    .eq('id', userId)
    .single();
  
  if (error) throw error;
  return data;
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

// Typed query helpers
export async function getTenantBills(tenantId: string) {
  const { data, error } = await supabase
    .from('bills')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('billing_period_start', { ascending: false });

  if (error) throw new Error(error.message);
  return data || [];
}

export async function getBranches() {
  const { data, error } = await supabase
    .from('branches')
    .select('*')
    .order('name');

  if (error) throw new Error(error.message);
  return data || [];
}

export async function getRooms(branchId?: string) {
  let query = supabase
    .from('rooms')
    .select('*, branches(name)')
    .order('room_number');

  if (branchId) {
    query = query.eq('branch_id', branchId);
  }

  const { data, error } = await query;

  if (error) throw new Error(error.message);
  return data || [];
}

export async function getAvailableRooms() {
  const { data, error } = await supabase
    .from('rooms')
    .select('*, branches(name)')
    .eq('is_occupied', false)
    .order('room_number');

  if (error) throw new Error(error.message);
  return data || [];
}

// Role checking utility functions
export async function getUserRole(userId: string): Promise<string | null> {
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

export async function isAdmin(userId: string): Promise<boolean> {
  const role = await getUserRole(userId);
  return role === 'admin';
}

export async function isBranchManager(userId: string): Promise<boolean> {
  const role = await getUserRole(userId);
  return role === 'branch_manager';
}

export async function isStaff(userId: string): Promise<boolean> {
  const role = await getUserRole(userId);
  return role === 'staff';
}

export async function getUserAssignedBranch(userId: string): Promise<string | null> {
  // Since profiles table doesn't have assigned_branch_id, we'll return null for now
  // This should be implemented when you add the assigned_branch_id column to profiles
  return null;
}

// Permission checking functions
export async function canManageUsers(userId: string): Promise<boolean> {
  return await isAdmin(userId);
}

export async function canManageBranches(userId: string): Promise<boolean> {
  return await isAdmin(userId);
}

export async function canManageTenants(userId: string): Promise<boolean> {
  const role = await getUserRole(userId);
  return role === 'admin' || role === 'branch_manager';
}

export async function canGenerateBills(userId: string): Promise<boolean> {
  const role = await getUserRole(userId);
  return role === 'admin' || role === 'branch_manager';
}

export async function canViewFinancialReports(userId: string): Promise<boolean> {
  const role = await getUserRole(userId);
  return role === 'admin' || role === 'branch_manager';
}

export async function canViewAuditLogs(userId: string): Promise<boolean> {
  const role = await getUserRole(userId);
  return role === 'admin' || role === 'branch_manager';
}

export async function canModifySystemSettings(userId: string): Promise<boolean> {
  return await isAdmin(userId);
} 
'use client';

import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import type { Database } from '@/types/database';

// Singleton instance to prevent multiple client creations
let supabaseInstance: ReturnType<typeof createClientComponentClient<Database>> | null = null;

export function getSupabaseClient() {
  if (!supabaseInstance) {
    try {
      supabaseInstance = createClientComponentClient<Database>();
    } catch (error) {
      console.error('Failed to initialize Supabase client:', error);
      throw error;
    }
  }
  return supabaseInstance;
}

// Helper function to ensure non-null client
export function getSupabaseClientOrThrow() {
  const client = getSupabaseClient();
  if (!client) {
    throw new Error('Supabase client not initialized');
  }
  return client;
}

// Export the singleton instance
export const supabase = getSupabaseClient();

// Server-side client for API routes
export { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';

// Utility functions for common database operations
export async function getCurrentUser() {
  try {
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error) throw error;
    return user;
  } catch (error) {
    console.error('Failed to get current user:', error);
    throw error;
  }
}

export async function getUserProfile(userId: string) {
  try {
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
  } catch (error) {
    console.error('Failed to get user profile:', error);
    throw error;
  }
}

export async function signOut() {
  try {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  } catch (error) {
    console.error('Failed to sign out:', error);
    throw error;
  }
}

// Typed query helpers with optimized caching
const queryCache = new Map<string, { data: any; timestamp: number }>();
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

function getCachedQuery<T>(key: string, queryFn: () => Promise<T>, cacheDuration = CACHE_DURATION): Promise<T> {
  const cached = queryCache.get(key);
  const now = Date.now();
  
  if (cached && (now - cached.timestamp) < cacheDuration) {
    return Promise.resolve(cached.data);
  }
  
  return queryFn().then(data => {
    queryCache.set(key, { data, timestamp: now });
    return data;
  });
}

export async function getTenantBills(tenantId: string) {
  return getCachedQuery(`tenant-bills-${tenantId}`, async () => {
    const { data, error } = await supabase
      .from('bills')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('billing_period_start', { ascending: false });

    if (error) throw new Error(error.message);
    return data || [];
  });
}

export async function getBranches() {
  return getCachedQuery('branches', async () => {
    const { data, error } = await supabase
      .from('branches')
      .select('*')
      .order('name');

    if (error) throw new Error(error.message);
    return data || [];
  });
}

export async function getRooms(branchId?: string) {
  const cacheKey = branchId ? `rooms-${branchId}` : 'rooms-all';
  
  return getCachedQuery(cacheKey, async () => {
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
  });
}

export async function getAvailableRooms() {
  return getCachedQuery('available-rooms', async () => {
    const { data, error } = await supabase
      .from('rooms')
      .select('*, branches(name)')
      .eq('is_occupied', false)
      .order('room_number');

    if (error) throw new Error(error.message);
    return data || [];
  });
}

// Role checking utility functions with caching
export async function getUserRole(userId: string): Promise<string | null> {
  return getCachedQuery(`user-role-${userId}`, async () => {
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
  });
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

// Cache invalidation functions
export function invalidateCache(pattern?: string) {
  if (pattern) {
    for (const key of queryCache.keys()) {
      if (key.includes(pattern)) {
        queryCache.delete(key);
      }
    }
  } else {
    queryCache.clear();
  }
}

// Initialize cache with common queries
export async function prewarmCache() {
  try {
    // Preload common data
    const session = await supabase.auth.getSession();
    if (session.data.session) {
      const userId = session.data.session.user.id;
      await Promise.all([
        getUserProfile(userId).catch(() => null),
        getUserRole(userId).catch(() => null),
        getBranches().catch(() => null)
      ]);
    }
  } catch (error) {
    console.error('Cache prewarm error:', error);
  }
}

// Call prewarm immediately
prewarmCache(); 
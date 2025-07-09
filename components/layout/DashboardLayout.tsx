'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { getSupabaseClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import Sidebar from './Sidebar';
import { usePageTitle } from '@/lib/contexts/PageTitleContext';
import { 
  LogOut,
  Menu,
  X,
  User,
  Loader2
} from 'lucide-react';
import type { User as SupabaseUser } from '@supabase/supabase-js';
import { LoadingState } from '@/components/ui/loading-state';

interface DashboardLayoutProps {
  children: React.ReactNode;
}

export default function DashboardLayout({ children }: DashboardLayoutProps) {
  const { title, subtitle } = usePageTitle();
  const router = useRouter();
  const pathname = usePathname();
  const [userProfile, setUserProfile] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  
  // Use the optimized singleton Supabase client
  const supabase = useMemo(() => getSupabaseClient(), []);

  const fetchUserProfile = useCallback(async (user: SupabaseUser) => {
    try {
      const { data: profile, error } = await supabase
        .from('profiles')
        .select(`
          *,
          user_roles (
            roles (
              role_name
            )
          )
        `)
        .eq('id', user.id)
        .single();

      if (error && error.code !== 'PGRST116') {
        console.error('Error fetching profile:', error);
        return null;
      }
      return { ...profile, email: user.email };
    } catch (error) {
      console.error('Profile fetch error:', error);
      return null;
    }
  }, [supabase]);

  useEffect(() => {
    let mounted = true;
    
    const checkSession = async () => {
      try {
        // Get session and fetch profile in parallel
        const [sessionResult] = await Promise.all([
          supabase.auth.getSession(),
          // Pre-warm the cache
          supabase.auth.getUser().catch(() => null)
        ]);

        const { data: { session } } = sessionResult;

        if (!mounted) return;

        if (!session) {
          setIsAuthenticated(false);
          setIsLoading(false);
          router.replace('/login');
          return;
        }
        
        // Fetch profile and set states in parallel
        const [profile] = await Promise.all([
          fetchUserProfile(session.user),
          setIsAuthenticated(true)
        ]);

        if (mounted && profile) {
          setUserProfile(profile);
        }
      } catch (error) {
        console.error('Auth error:', error);
        if (mounted) {
          setIsAuthenticated(false);
          router.replace('/login');
        }
      } finally {
        if (mounted) {
          setIsLoading(false);
        }
      }
    };

    // Start auth check immediately
    checkSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!mounted) return;
      
      if (event === 'SIGNED_OUT' || !session) {
        setIsAuthenticated(false);
        setUserProfile(null);
        router.replace('/login');
      } else if (event === 'SIGNED_IN' && session) {
        setIsAuthenticated(true);
        const profile = await fetchUserProfile(session.user);
        if (mounted && profile) {
          setUserProfile(profile);
        }
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [supabase, router, fetchUserProfile]);

  const handleSignOut = useCallback(async () => {
    try {
      await supabase.auth.signOut();
    } catch (error) {
      console.error('Sign out error:', error);
    }
  }, [supabase]);

  // Show loading state only for initial load
  if (isLoading) {
    return <LoadingState message="Initializing your dashboard..." />;
  }

  // Don't show anything while redirecting to login
  if (!isAuthenticated || !userProfile) {
    return null;
  }

  const userRole = userProfile?.user_roles?.[0]?.roles?.role_name || 'Staff';

  return (
    <div className="h-screen bg-gray-50 flex overflow-hidden">
      {/* Fixed Sidebar - Desktop */}
      <Sidebar isAuthenticated={isAuthenticated} />
      
      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div 
          className="lg:hidden fixed inset-0 z-40 bg-black bg-opacity-50"
          onClick={() => setSidebarOpen(false)}
        />
      )}
      
      {/* Mobile sidebar */}
      <div className={`lg:hidden fixed inset-y-0 left-0 z-50 w-72 bg-white transform transition-transform duration-300 ease-in-out ${
        sidebarOpen ? 'translate-x-0' : '-translate-x-full'
      }`}>
        <div className="flex items-center justify-between p-4 border-b">
          <h1 className="text-xl font-bold">J&H Management</h1>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSidebarOpen(false)}
          >
            <X className="h-5 w-5" />
          </Button>
        </div>
        <div className="p-4">
          <Sidebar isAuthenticated={isAuthenticated} />
        </div>
      </div>

      {/* Main content area */}
      <div className="flex-1 lg:ml-72 flex flex-col h-screen">
        {/* Fixed Top bar */}
        <div className="bg-white shadow-sm border-b border-gray-200 px-4 py-3 flex items-center justify-between fixed top-0 right-0 left-0 lg:left-72 z-20">
          <div className="flex items-center space-x-4">
            <Button
              variant="ghost"
              size="sm"
              className="lg:hidden"
              onClick={() => setSidebarOpen(true)}
            >
              <Menu className="h-5 w-5" />
            </Button>
            
            <div>
              <h1 className="text-xl font-semibold text-gray-900">{title}</h1>
              {subtitle && (
                <p className="text-sm text-gray-500">{subtitle}</p>
              )}
            </div>
          </div>
          
          <div className="flex items-center space-x-4">
            <div className="text-right hidden sm:block">
              <div className="text-sm font-medium text-gray-900">{userProfile.full_name || userProfile.email}</div>
              <div className="text-xs text-gray-500">{userRole}</div>
            </div>
            <div className="flex items-center space-x-2">
              <User className="h-5 w-5 text-gray-400" />
              <Button
                variant="ghost"
                size="sm"
                onClick={handleSignOut}
                className="text-gray-600 hover:text-gray-900"
              >
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>

        {/* Scrollable Page content */}
        <main className="flex-1 overflow-y-auto pt-16 p-4 sm:p-6 lg:p-8">
          {children}
        </main>
      </div>
    </div>
  );
} 
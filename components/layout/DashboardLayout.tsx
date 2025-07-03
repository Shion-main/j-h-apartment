'use client';

import { useState, useEffect, useCallback, useMemo, createContext, useContext, memo } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { getSupabaseClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import Sidebar from './Sidebar';
import { 
  LogOut,
  Menu,
  X,
  User,
  Loader2
} from 'lucide-react';
import type { User as SupabaseUser } from '@supabase/supabase-js';
import { usePageTitle } from '@/lib/contexts/PageTitleContext';

interface DashboardLayoutProps {
  children: React.ReactNode;
}

// Memoized user menu component to prevent unnecessary re-renders
const UserMenu = memo(({ userProfile, onSignOut }: { userProfile: any; onSignOut: () => void }) => (
  <div className="flex items-center space-x-4">
    <div className="flex items-center space-x-2">
      <div className="bg-blue-600 text-white p-2 rounded-full">
        <User className="h-4 w-4" />
      </div>
      <div className="hidden md:block">
        <p className="text-sm font-medium text-gray-900">
          {userProfile?.username || userProfile?.email || 'User'}
        </p>
        <p className="text-xs text-gray-500">
          {userProfile?.user_roles?.[0]?.roles?.role_name || 'Staff'}
        </p>
      </div>
    </div>
    <Button
      onClick={onSignOut}
      variant="outline"
      size="sm"
      className="text-gray-600 border-gray-200 hover:bg-gray-50"
    >
      <LogOut className="h-4 w-4 mr-2" />
      Sign Out
    </Button>
  </div>
));

UserMenu.displayName = 'UserMenu';

// Memoized header component to prevent unnecessary re-renders
const DashboardHeader = memo(({ 
  title, 
  subtitle, 
  userProfile, 
  onSignOut, 
  onMenuToggle 
}: {
  title: string;
  subtitle: string;
  userProfile: any;
  onSignOut: () => void;
  onMenuToggle: () => void;
}) => (
  <div className="sticky top-0 z-20 px-4 py-3 bg-gray-50">
    <div className="floating-header px-5 py-3 flex items-center justify-between animate-fadeIn">
      <div className="flex items-center min-w-0 flex-1">
        <Button
          variant="ghost"
          size="sm"
          className="lg:hidden rounded-lg hover:bg-gray-100 mr-3 flex-shrink-0"
          onClick={onMenuToggle}
        >
          <Menu className="h-5 w-5" />
        </Button>
        
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-bold text-gray-900 truncate">{title}</h1>
          {subtitle && (
            <p className="text-sm text-gray-600 truncate">{subtitle}</p>
          )}
        </div>
      </div>
      
      <UserMenu userProfile={userProfile} onSignOut={onSignOut} />
    </div>
  </div>
));

DashboardHeader.displayName = 'DashboardHeader';

// Memoized mobile sidebar to prevent unnecessary re-renders
const MobileSidebar = memo(({ 
  isOpen, 
  onClose, 
  isAuthenticated 
}: {
  isOpen: boolean;
  onClose: () => void;
  isAuthenticated: boolean;
}) => (
  <>
    {isOpen && (
      <div 
        className="lg:hidden fixed inset-0 z-40 bg-black bg-opacity-50 backdrop-blur-sm"
        onClick={onClose}
      />
    )}
    
    <aside className={`lg:hidden fixed inset-y-0 left-0 z-50 w-72 transform transition-transform duration-300 ease-in-out ${
      isOpen ? 'translate-x-0' : '-translate-x-full'
    }`} style={{ height: '100vh', position: 'fixed' }}>
      <div className="floating-sidebar flex flex-col h-full m-3 overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-gray-100/50">
          <h1 className="text-xl font-bold text-blue-700">J&H Management</h1>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="rounded-lg hover:bg-gray-100"
          >
            <X className="h-5 w-5" />
          </Button>
        </div>
        <div className="overflow-y-auto" style={{ maxHeight: 'calc(100vh - 70px)' }}>
          <Sidebar isAuthenticated={isAuthenticated} />
        </div>
      </div>
    </aside>
  </>
));

MobileSidebar.displayName = 'MobileSidebar';

// Memoized loading component
const LoadingSpinner = memo(() => (
  <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50">
    <div className="floating-card p-8 flex flex-col items-center animate-pulse">
      <Loader2 className="h-16 w-16 animate-spin text-blue-600" />
      <p className="mt-4 text-blue-600 font-medium">Loading J&H Management System</p>
    </div>
  </div>
));

LoadingSpinner.displayName = 'LoadingSpinner';

export default function DashboardLayout({ children }: DashboardLayoutProps) {
  const router = useRouter();
  const pathname = usePathname();
  
  // Optimized state management
  const [userProfile, setUserProfile] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  
  // Use the global page title context
  const { title, subtitle } = usePageTitle();
  
  // Use the optimized singleton Supabase client
  const supabase = useMemo(() => getSupabaseClient(), []);

  // Memoized fetch user profile function
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

  // Memoized sign out handler
  const handleSignOut = useCallback(async () => {
    try {
      await supabase.auth.signOut();
      router.replace('/login');
    } catch (error) {
      console.error('Sign out error:', error);
    }
  }, [supabase, router]);

  // Memoized sidebar toggle handler
  const handleSidebarToggle = useCallback(() => {
    setSidebarOpen(prev => !prev);
  }, []);

  // Memoized close sidebar handler
  const handleCloseSidebar = useCallback(() => {
    setSidebarOpen(false);
  }, []);

  // Optimized authentication effect
  useEffect(() => {
    let mounted = true;
    
    const checkSession = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();

        if (!mounted) return;

        if (!session) {
          setIsAuthenticated(false);
          router.replace('/login');
          return;
        }
        
        setIsAuthenticated(true);
        const profile = await fetchUserProfile(session.user);
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

  // Early returns for loading and unauthenticated states
  if (isLoading) {
    return <LoadingSpinner />;
  }

  if (!isAuthenticated || !userProfile) {
    if (typeof window !== 'undefined') {
      router.replace('/login');
    }
    return <LoadingSpinner />;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Optimized Sidebar - Only render once */}
      <Sidebar isAuthenticated={isAuthenticated} />
      
      {/* Mobile sidebar with memoization */}
      <MobileSidebar 
        isOpen={sidebarOpen}
        onClose={handleCloseSidebar}
        isAuthenticated={isAuthenticated}
      />
      
      {/* Main content */}
      <div className="lg:ml-72 flex flex-col h-screen">
        {/* Optimized header */}
        <DashboardHeader
          title={title}
          subtitle={subtitle ?? ''}
          userProfile={userProfile}
          onSignOut={handleSignOut}
          onMenuToggle={handleSidebarToggle}
        />
        
        {/* Main content area with performance optimization */}
        <main className="flex-1 p-4 lg:p-6 overflow-y-auto">
          <div className="max-w-7xl mx-auto">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
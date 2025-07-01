'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { Button } from '@/components/ui/button';
import { 
  Building2, 
  Home, 
  Users, 
  FileText, 
  History, 
  Settings, 
  LogOut,
  Menu,
  X,
  User,
  Loader2
} from 'lucide-react';
import type { User as SupabaseUser } from '@supabase/supabase-js';

interface DashboardLayoutProps {
  children: React.ReactNode;
}

const navigationItems = [
  {
    name: 'Dashboard',
    href: '/dashboard',
    icon: Home,
    description: 'Overview & Analytics'
  },
  {
    name: 'Branches',
    href: '/branches',
    icon: Building2,
    description: 'Branch & Room Management'
  },
  {
    name: 'Tenants',
    href: '/tenants',
    icon: Users,
    description: 'Active Tenant Management'
  },
  {
    name: 'Billing',
    href: '/billing',
    icon: FileText,
    description: 'Bill Generation & Payments'
  },
  {
    name: 'History',
    href: '/history',
    icon: History,
    description: 'Historical Data & Audit Logs'
  },
  {
    name: 'Settings',
    href: '/settings',
    icon: Settings,
    description: 'System Configuration'
  }
];

export default function DashboardLayout({ children }: DashboardLayoutProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [userProfile, setUserProfile] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  
  // Create supabase client once and memoize it
  const supabase = useMemo(() => createClientComponentClient(), []);

  const fetchUserProfile = useCallback(async (user: SupabaseUser) => {
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
  }, [supabase]);

  useEffect(() => {
    let mounted = true;
    
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();

      if (!mounted) return;

      if (!session) {
        router.replace('/login');
        return;
      }
      
      const profile = await fetchUserProfile(session.user);
      if (mounted && profile) {
        setUserProfile(profile);
      }
      if (mounted) {
        setIsLoading(false);
      }
    };

    checkSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!mounted) return;
      
      if (event === 'SIGNED_OUT' || !session) {
        setUserProfile(null);
        router.replace('/login');
      } else if (event === 'SIGNED_IN' && session) {
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

  const handleSignOut = async () => {
    await supabase.auth.signOut();
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="h-16 w-16 animate-spin text-primary" />
      </div>
    );
  }

  if (!userProfile) {
    return null; 
  }

  const userRole = userProfile?.user_roles?.[0]?.roles?.role_name || 'Staff';

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Sidebar for desktop */}
      <div className="hidden lg:flex flex-col w-72 bg-white shadow-lg fixed h-full z-40">
        <div className="flex flex-col h-full">
          {/* Header - Fixed */}
          <div className="flex items-center justify-between p-4 border-b bg-white">
            <div className="flex items-center space-x-3">
              <Building2 className="h-10 w-10 text-primary" />
              <div>
                <h1 className="text-xl font-bold text-gray-900">J&H Management</h1>
                <p className="text-sm text-gray-500">Property Management</p>
              </div>
            </div>
          </div>
          
          {/* Navigation - Scrollable */}
          <nav className="flex-1 overflow-y-auto p-4 space-y-2">
            {navigationItems.map((item) => {
              const isActive = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href));
              const Icon = item.icon;
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  className={
                    `flex items-center space-x-3 px-3 py-3 rounded-lg text-sm font-medium transition-all duration-200 group ` +
                    (isActive
                      ? 'bg-primary text-primary-foreground shadow-md'
                      : 'text-gray-700 hover:bg-gray-100 hover:text-gray-900')
                  }
                >
                  <Icon className={`h-6 w-6 flex-shrink-0 ${isActive ? 'text-primary-foreground' : 'text-gray-500 group-hover:text-primary'}`} />
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold">{item.name}</div>
                    <div className={`text-xs ${isActive ? 'text-primary-foreground/80' : 'text-gray-500'}`}>{item.description}</div>
                  </div>
                </Link>
              );
            })}
          </nav>
          
          {/* User info and logout - Fixed at bottom */}
          <div className="p-4 border-t bg-white mt-auto">
            <div className="flex items-center space-x-3 mb-3">
              <div className="flex-shrink-0 h-10 w-10 rounded-full bg-gray-200 flex items-center justify-center">
                <User className="h-6 w-6 text-gray-600" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-gray-900 truncate">{userProfile?.full_name || userProfile?.email}</p>
                <p className="text-xs text-gray-500 truncate capitalize">{userRole}</p>
              </div>
            </div>
            <Button
              variant="outline"
              className="w-full justify-center group"
              onClick={handleSignOut}
            >
              <LogOut className="h-4 w-4 mr-2 text-gray-600 group-hover:text-red-500" />
              Sign Out
            </Button>
          </div>
        </div>
      </div>

      {/* Mobile Header */}
      <div className="lg:hidden flex items-center justify-between w-full h-16 px-4 bg-white shadow-md fixed top-0 z-50">
        <div className="flex items-center space-x-2">
          <Building2 className="h-7 w-7 text-primary" />
          <h1 className="text-lg font-bold text-gray-900">J&H Management</h1>
        </div>
        <Button variant="ghost" size="icon" onClick={() => setSidebarOpen(true)}>
          <Menu className="h-6 w-6" />
        </Button>
      </div>

      {/* Mobile Sidebar */}
      {sidebarOpen && (
        <div className="lg:hidden fixed inset-0 bg-black bg-opacity-50 z-50" onClick={() => setSidebarOpen(false)}>
          <div className="fixed inset-y-0 left-0 w-72 bg-white shadow-xl p-4 z-60" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between pb-4 border-b">
                <div className="flex items-center space-x-3">
                  <Building2 className="h-10 w-10 text-primary" />
                  <div>
                    <h1 className="text-xl font-bold text-gray-900">J&H Management</h1>
                    <p className="text-sm text-gray-500">Property Management</p>
                  </div>
                </div>
              <Button variant="ghost" size="icon" onClick={() => setSidebarOpen(false)}>
                <X className="h-6 w-6" />
              </Button>
            </div>
            <nav className="mt-4 space-y-2">
              {navigationItems.map((item) => {
                const isActive = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href));
                const Icon = item.icon;
                return (
                  <Link
                    key={item.name}
                    href={item.href}
                    onClick={() => setSidebarOpen(false)}
                    className={
                      `flex items-center space-x-3 px-3 py-3 rounded-lg text-sm font-medium transition-all duration-200 group ` +
                      (isActive
                        ? 'bg-primary text-primary-foreground shadow-md'
                        : 'text-gray-700 hover:bg-gray-100 hover:text-gray-900')
                    }
                  >
                    <Icon className={`h-6 w-6 flex-shrink-0 ${isActive ? 'text-primary-foreground' : 'text-gray-500 group-hover:text-primary'}`} />
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold">{item.name}</div>
                      <div className={`text-xs ${isActive ? 'text-primary-foreground/80' : 'text-gray-500'}`}>{item.description}</div>
                    </div>
                  </Link>
                );
              })}
            </nav>
            <div className="mt-auto pt-4 border-t">
               <div className="flex items-center space-x-3 mb-3">
                <div className="flex-shrink-0 h-10 w-10 rounded-full bg-gray-200 flex items-center justify-center">
                  <User className="h-6 w-6 text-gray-600" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-900 truncate">{userProfile?.full_name || userProfile?.email}</p>
                  <p className="text-xs text-gray-500 truncate capitalize">{userRole}</p>
                </div>
              </div>
              <Button
                variant="outline"
                className="w-full justify-center group"
                onClick={handleSignOut}
              >
                <LogOut className="h-4 w-4 mr-2 text-gray-600 group-hover:text-red-500" />
                Sign Out
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      <main className="flex-1 lg:pl-72 pt-16 lg:pt-0">
        <div className="p-4 sm:p-6 lg:p-8">
          {children}
        </div>
      </main>
    </div>
  );
} 
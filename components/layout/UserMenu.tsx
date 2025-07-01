'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
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
  Loader2,
  BarChart3
} from 'lucide-react';

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
    name: 'Reports',
    href: '/reports',
    icon: BarChart3,
    description: 'Detailed Financial Reports'
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

interface UserMenuProps {
  currentPath: string;
}

export default function UserMenu({ currentPath }: UserMenuProps) {
  const router = useRouter();
  const [userProfile, setUserProfile] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const supabase = createClientComponentClient();

  useEffect(() => {
    const initAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        router.replace('/login');
        return;
      }

      // Get user profile
      const { data: profile } = await supabase
        .from('profiles')
        .select(`
          *,
          user_roles (
            roles (
              role_name
            )
          )
        `)
        .eq('id', session.user.id)
        .single();

      setUserProfile({ ...profile, email: session.user.email });
      setIsLoading(false);
    };

    initAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT' || !session) {
        setUserProfile(null);
        router.replace('/login');
      }
    });

    return () => subscription.unsubscribe();
  }, [router, supabase]);

  const handleSignOut = async () => {
    setIsLoggingOut(true);
    try {
      // Use the API route to handle logout, which includes audit logging
      const response = await fetch('/api/auth/logout', {
        method: 'POST',
      });

      if (!response.ok) {
        throw new Error('Logout failed');
      }
      
      // The onAuthStateChange listener will handle the redirect,
      // but we can also push the user manually for a faster UI update.
      router.push('/login');
      router.refresh(); // This is key to force a re-render of the root layout

    } catch (error) {
      console.error('Error during logout:', error);
      // As a fallback, force a full page reload to the login page
      window.location.href = '/login';
    } finally {
      // In case the redirect logic fails, ensure loading state is turned off
      // This is a safeguard, as the component should unmount on redirect.
      setIsLoggingOut(false);
    }
  };

  if (isLoading || isLoggingOut) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-white z-50">
        <Loader2 className="h-16 w-16 animate-spin text-primary" />
      </div>
    );
  }

  if (!userProfile) {
    return null;
  }

  const userRole = userProfile?.user_roles?.[0]?.roles?.role_name || 'Staff';

  return (
    <>
      {/* Desktop User Info - Fixed at bottom of sidebar */}
      <div className="hidden lg:block fixed bottom-0 left-0 w-72 p-4 border-t bg-white z-50">
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
          disabled={isLoggingOut}
        >
          {isLoggingOut ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <LogOut className="h-4 w-4 mr-2 text-gray-600 group-hover:text-red-500" />
          )}
          Sign Out
        </Button>
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
                const isActive = currentPath === item.href || (item.href !== '/dashboard' && currentPath.startsWith(item.href));
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
                disabled={isLoggingOut}
              >
                {isLoggingOut ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <LogOut className="h-4 w-4 mr-2 text-gray-600 group-hover:text-red-500" />
                )}
                Sign Out
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
} 
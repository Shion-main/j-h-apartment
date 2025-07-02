'use client';

import { memo } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import Image from 'next/image';
import { 
  Building2, 
  Home, 
  Users, 
  FileText, 
  History, 
  Settings,
  BarChart3,
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

interface SidebarProps {
  isAuthenticated: boolean;
}

function Sidebar({ isAuthenticated }: SidebarProps) {
  const pathname = usePathname();
  const currentPath = pathname === '/' ? '/dashboard' : pathname;

  // Don't render sidebar if not authenticated
  if (!isAuthenticated) {
    return null;
  }

  return (
    <div className="hidden lg:flex flex-col w-72 bg-white shadow-lg fixed h-full z-30">
      <div className="flex flex-col h-full">
        {/* Header - Fixed */}
        <div className="flex items-center justify-center p-6 border-b bg-white">
          <Image
            src="/lib/Logo/J-H LOGO-BLUE.png"
            alt="J&H Management Logo"
            width={240}
            height={100}
            className="w-[240px] h-auto mx-auto"
            priority
          />
        </div>
        
        {/* Navigation - Scrollable */}
        <nav className="flex-1 overflow-y-auto p-4 space-y-1">
          {navigationItems.map((item) => {
            const isActive = currentPath === item.href;
            const Icon = item.icon;
            
            return (
              <Link
                key={item.name}
                href={item.href}
                className={
                  `flex items-center space-x-2 px-3 py-3 rounded-lg text-sm font-medium transition-all duration-200 group hover:shadow-sm active:scale-[0.98] ` +
                  (isActive
                    ? 'bg-blue-600 text-white shadow-lg'
                    : 'text-gray-700 hover:bg-gray-100 hover:text-gray-900')
                }
                style={{ WebkitTapHighlightColor: 'transparent' }}
              >
                <Icon className={`h-5 w-5 flex-shrink-0 ${isActive ? 'text-white' : 'text-gray-500 group-hover:text-blue-600'}`} />
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-sm">{item.name}</div>
                  <div className={`text-xs ${isActive ? 'text-blue-100' : 'text-gray-500'}`}>{item.description}</div>
                </div>
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
} 

export default memo(Sidebar); 
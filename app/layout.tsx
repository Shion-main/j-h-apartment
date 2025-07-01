import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import { headers } from 'next/headers'
import './globals.css'
import Sidebar from '@/components/layout/Sidebar'
import UserMenu from '@/components/layout/UserMenu'
import ToasterProvider from '@/components/layout/Toaster'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'J&H Management System',
  description: 'Property management system for J&H Management',
  icons: {
    icon: '/favicon.ico',
    shortcut: '/favicon-16x16.png',
    apple: '/apple-touch-icon.png',
  },
}

function getCurrentPath() {
  const headersList = headers()
  const pathname = headersList.get('x-pathname') || '/'
  return pathname;
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const currentPath = getCurrentPath()
  const isLoginPage = currentPath === '/login'

  if (isLoginPage) {
    return (
      <html lang="en" suppressHydrationWarning>
        <body className={inter.className}>
          {children}
        </body>
      </html>
    )
  }

  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className}>
          <ToasterProvider>
            <div className="min-h-screen bg-gray-50 flex">
              {/* Client-side Sidebar - Updates on navigation */}
              <Sidebar />
              
              {/* Client-side User Menu - Handles auth & mobile */}
              <UserMenu currentPath={currentPath} />
              
              {/* Main Content */}
              <main className="flex-1 lg:pl-72 pt-16 lg:pt-0 pb-20 lg:pb-0">
                <div className="p-4 sm:p-6 lg:p-8">
                  {children}
                </div>
              </main>
            </div>
          </ToasterProvider>
      </body>
    </html>
  )
} 
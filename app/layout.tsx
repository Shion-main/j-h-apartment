import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import { headers } from 'next/headers'
import './globals.css'
import DashboardLayout from '@/components/layout/DashboardLayout'
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
          <ToasterProvider>
            {children}
          </ToasterProvider>
        </body>
      </html>
    )
  }

  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className}>
        <ToasterProvider>
          <DashboardLayout>
            {children}
          </DashboardLayout>
        </ToasterProvider>
      </body>
    </html>
  )
} 
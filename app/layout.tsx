import type { Metadata } from 'next'
import { headers } from 'next/headers'
import './globals.css'
import DashboardLayout from '@/components/layout/DashboardLayout'
import ToasterProvider from '@/components/layout/Toaster'
import { Inter } from 'next/font/google'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'J&H Apartment Management',
  description: 'Manage your apartment rentals efficiently',
  icons: {
    icon: [
      {
        url: '/lib/Logo/J-H LOGO-BLUE.png',
        sizes: '32x32',
        type: 'image/png',
      },
      {
        url: '/lib/Logo/J-H LOGO-BLUE.png',
        sizes: '16x16',
        type: 'image/png',
      }
    ],
    shortcut: '/lib/Logo/J-H LOGO-BLUE.png',
    apple: '/lib/Logo/J-H LOGO-BLUE.png',
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
      <html lang="en" suppressHydrationWarning className="antialiased">
        <head>
          <link rel="icon" type="image/png" sizes="32x32" href="/lib/Logo/J-H LOGO-BLUE.png" />
          <link rel="icon" type="image/png" sizes="16x16" href="/lib/Logo/J-H LOGO-BLUE.png" />
          <link rel="shortcut icon" href="/lib/Logo/J-H LOGO-BLUE.png" />
          <link rel="apple-touch-icon" href="/lib/Logo/J-H LOGO-BLUE.png" />
        </head>
        <body className="font-sans bg-background text-foreground">
          <ToasterProvider>
            {children}
          </ToasterProvider>
        </body>
      </html>
    )
  }

  return (
    <html lang="en" suppressHydrationWarning className="antialiased">
      <head>
        <link rel="icon" type="image/png" sizes="32x32" href="/lib/Logo/J-H LOGO-BLUE.png" />
        <link rel="icon" type="image/png" sizes="16x16" href="/lib/Logo/J-H LOGO-BLUE.png" />
        <link rel="shortcut icon" href="/lib/Logo/J-H LOGO-BLUE.png" />
        <link rel="apple-touch-icon" href="/lib/Logo/J-H LOGO-BLUE.png" />
      </head>
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
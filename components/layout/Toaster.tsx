'use client';

import { ToastProvider } from '@/components/ui/toast';

export default function ToasterProvider({ children }: { children: React.ReactNode }) {
  return <ToastProvider>{children}</ToastProvider>;
} 
'use client';

import { Loader2 } from 'lucide-react';

interface LoadingStateProps {
  message?: string;
}

export function LoadingState({ message = 'Loading...' }: LoadingStateProps) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 space-y-4">
      <Loader2 className="h-16 w-16 animate-spin text-blue-600" />
      <p className="text-gray-600 text-lg">{message}</p>
    </div>
  );
} 
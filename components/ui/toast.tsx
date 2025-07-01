'use client';

import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { CheckCircleIcon, ExclamationCircleIcon, XMarkIcon, InformationCircleIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface Toast {
  id: string;
  type: ToastType;
  title: string;
  message?: string;
  duration?: number;
  isVisible?: boolean;
}

interface ToastContextType {
  addToast: (toast: Omit<Toast, 'id'>) => void;
  removeToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback((toast: Omit<Toast, 'id'>) => {
    const id = Math.random().toString(36).substr(2, 9);
    const newToast = { ...toast, id, isVisible: false };
    
    setToasts(prev => [...prev, newToast]);
    
    // Make visible after a tiny delay for animation
    setTimeout(() => {
      setToasts(prev => prev.map(t => t.id === id ? { ...t, isVisible: true } : t));
    }, 10);
    
    // Auto remove after duration
    setTimeout(() => {
      removeToast(id);
    }, toast.duration || 5000);
  }, []);

  const removeToast = useCallback((id: string) => {
    // First make invisible for exit animation
    setToasts(prev => prev.map(t => t.id === id ? { ...t, isVisible: false } : t));
    
    // Then remove from state after animation
    setTimeout(() => {
      setToasts(prev => prev.filter(toast => toast.id !== id));
    }, 300);
  }, []);

  return (
    <ToastContext.Provider value={{ addToast, removeToast }}>
      {children}
      <ToastContainer toasts={toasts} removeToast={removeToast} />
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
}

function ToastContainer({ toasts, removeToast }: { toasts: Toast[]; removeToast: (id: string) => void }) {
  return (
    <div className="fixed top-4 right-4 z-[9999] space-y-3 max-w-sm w-full pointer-events-none">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onRemove={removeToast} />
      ))}
    </div>
  );
}

function ToastItem({ toast, onRemove }: { toast: Toast; onRemove: (id: string) => void }) {
  const icons = {
    success: <CheckCircleIcon className="h-5 w-5 text-green-500" />,
    error: <ExclamationCircleIcon className="h-5 w-5 text-red-500" />,
    warning: <ExclamationTriangleIcon className="h-5 w-5 text-amber-500" />,
    info: <InformationCircleIcon className="h-5 w-5 text-blue-500" />
  };

  const styles = {
    success: 'bg-white border-l-4 border-l-green-500 shadow-lg ring-1 ring-green-100',
    error: 'bg-white border-l-4 border-l-red-500 shadow-lg ring-1 ring-red-100',
    warning: 'bg-white border-l-4 border-l-amber-500 shadow-lg ring-1 ring-amber-100',
    info: 'bg-white border-l-4 border-l-blue-500 shadow-lg ring-1 ring-blue-100'
  };

  const titleColors = {
    success: 'text-green-900',
    error: 'text-red-900',
    warning: 'text-amber-900',
    info: 'text-blue-900'
  };

  const messageColors = {
    success: 'text-green-700',
    error: 'text-red-700',
    warning: 'text-amber-700',
    info: 'text-blue-700'
  };

  return (
    <div className={`
      ${styles[toast.type]}
      w-full rounded-lg p-4 pointer-events-auto
      transform transition-all duration-300 ease-out
      ${toast.isVisible 
        ? 'translate-x-0 opacity-100 scale-100' 
        : 'translate-x-full opacity-0 scale-95'
      }
      hover:shadow-xl hover:scale-[1.02] active:scale-[0.98]
    `}>
      <div className="flex items-start">
        <div className="flex-shrink-0">
          {icons[toast.type]}
        </div>
        <div className="ml-3 flex-1 min-w-0">
          <h4 className={`text-sm font-semibold ${titleColors[toast.type]} leading-tight`}>
            {toast.title}
          </h4>
          {toast.message && (
            <p className={`text-sm ${messageColors[toast.type]} mt-1 leading-relaxed`}>
              {toast.message}
            </p>
          )}
        </div>
        <button
          onClick={() => onRemove(toast.id)}
          className="ml-4 flex-shrink-0 text-gray-400 hover:text-gray-600 transition-colors duration-200 p-1 rounded-full hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-gray-300"
          aria-label="Close notification"
        >
          <XMarkIcon className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
} 
'use client';

import React, { createContext, useContext, useState, ReactNode } from 'react';

interface PageTitleContextType {
  title: string;
  subtitle?: string;
  setPageTitle: (title: string, subtitle?: string) => void;
}

const PageTitleContext = createContext<PageTitleContextType | undefined>(undefined);

interface PageTitleProviderProps {
  children: ReactNode;
}

export function PageTitleProvider({ children }: PageTitleProviderProps) {
  const [title, setTitle] = useState('Dashboard');
  const [subtitle, setSubtitle] = useState<string | undefined>();

  const setPageTitle = (newTitle: string, newSubtitle?: string) => {
    setTitle(newTitle);
    setSubtitle(newSubtitle);
    
    // Also set the document title
    if (newSubtitle) {
      document.title = `${newTitle} | ${newSubtitle} | J&H Management`;
    } else {
      document.title = `${newTitle} | J&H Management`;
    }
  };

  return (
    <PageTitleContext.Provider value={{ title, subtitle, setPageTitle }}>
      {children}
    </PageTitleContext.Provider>
  );
}

export function usePageTitle() {
  const context = useContext(PageTitleContext);
  if (context === undefined) {
    throw new Error('usePageTitle must be used within a PageTitleProvider');
  }
  return context;
}

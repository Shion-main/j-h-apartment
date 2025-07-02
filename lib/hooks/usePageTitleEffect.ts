'use client';

import { useEffect } from 'react';
import { usePageTitle } from '@/components/layout/DashboardLayout';

// A custom hook that updates the page title and subtitle when the component mounts
export function usePageTitleEffect(title: string, subtitle: string = '') {
  const { setPageTitle } = usePageTitle();
  
  useEffect(() => {
    setPageTitle(title, subtitle);
  }, [title, subtitle, setPageTitle]);
}

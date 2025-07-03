'use client';

import { useEffect } from 'react';
import { usePageTitle } from '@/lib/contexts/PageTitleContext';

/**
 * Sets the document title and optionally a subtitle for the page.
 * @param {string} title - The main page title.
 * @param {string} [subtitle] - Optional subtitle to append to the title.
 */
export function usePageTitleEffect(title: string, subtitle?: string) {
  const { setPageTitle } = usePageTitle();

  useEffect(() => {
    setPageTitle(title, subtitle);
  }, [title, subtitle, setPageTitle]);
}

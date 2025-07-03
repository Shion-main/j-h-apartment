import { useEffect } from 'react';

/**
 * Sets the document title and optionally a subtitle for the page.
 * @param {string} title - The main page title.
 * @param {string} [subtitle] - Optional subtitle to append to the title.
 */
export function usePageTitleEffect(title: string, subtitle?: string) {
  useEffect(() => {
    if (subtitle) {
      document.title = `${title} | ${subtitle} | J&H Management`;
    } else {
      document.title = `${title} | J&H Management`;
    }
    // Optionally, you could set a meta tag or global state for subtitle if needed
  }, [title, subtitle]);
}

import { useEffect, useLayoutEffect, useState } from 'react';

const storageKey = 'fuel-feet-theme';
const darkQuery = '(prefers-color-scheme: dark)';

export type Theme = 'light' | 'dark' | 'system';

function savedTheme(): Theme {
  try {
    const value = localStorage.getItem(storageKey);
    if (value === 'dark' || value === 'light') {
      return value;
    }
  } catch {
    // System appearance is still available when persistence is blocked.
  }
  return 'system';
}

export function useTheme() {
  const [theme, setTheme] = useState(savedTheme);

  useLayoutEffect(() => {
    const media = window.matchMedia(darkQuery);
    const applyTheme = () => {
      document.documentElement.dataset.theme = theme === 'system'
        ? (media.matches ? 'dark' : 'light')
        : theme;
    };

    applyTheme();
    if (theme === 'system') {
      media.addEventListener('change', applyTheme);
      return () => media.removeEventListener('change', applyTheme);
    }
  }, [theme]);

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, theme);
    } catch {
      // Keep the chosen theme for the lifetime of the page.
    }
  }, [theme]);

  return { theme, setTheme };
}

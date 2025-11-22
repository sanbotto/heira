import { writable } from 'svelte/store';
import { browser } from '$app/environment';

export type Theme = 'auto' | 'light' | 'dark';

const THEME_STORAGE_KEY = 'theme-preference';

function getSystemTheme(): 'light' | 'dark' {
  if (!browser) return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function getStoredTheme(): Theme {
  if (!browser) return 'auto';
  const stored = localStorage.getItem(THEME_STORAGE_KEY);
  return (stored as Theme) || 'auto';
}

function applyTheme(theme: Theme) {
  if (!browser) return;

  const root = document.documentElement;
  const effectiveTheme = theme === 'auto' ? getSystemTheme() : theme;

  root.classList.remove('light', 'dark');
  root.classList.add(effectiveTheme);
  root.setAttribute('data-theme', effectiveTheme);
}

function createThemeStore() {
  const { subscribe, set, update } = writable<Theme>(getStoredTheme());

  return {
    subscribe,
    set: (theme: Theme) => {
      set(theme);
      if (browser) {
        localStorage.setItem(THEME_STORAGE_KEY, theme);
        applyTheme(theme);
      }
    },
    init: () => {
      if (browser) {
        const theme = getStoredTheme();
        applyTheme(theme);

        // Listen for system theme changes when in auto mode
        const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
        const handleChange = () => {
          const currentTheme = getStoredTheme();
          if (currentTheme === 'auto') {
            applyTheme('auto');
          }
        };

        mediaQuery.addEventListener('change', handleChange);

        return () => {
          mediaQuery.removeEventListener('change', handleChange);
        };
      }
    },
  };
}

export const theme = createThemeStore();

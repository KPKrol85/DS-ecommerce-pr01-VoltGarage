import { safeStorage } from '../services/storage.js';

const STORAGE_KEY = 'vg_theme';

const getStoredTheme = () => safeStorage.get(STORAGE_KEY);

const setStoredTheme = (theme) => safeStorage.set(STORAGE_KEY, theme);

const getSystemTheme = () =>
  window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';

const resolveInitialTheme = (storedTheme) => storedTheme ?? getSystemTheme();

const reflectPreference = (theme, toggle) => {
  document.documentElement.setAttribute('data-theme', theme);
  if (toggle) {
    toggle.setAttribute('aria-label', theme);
    toggle.setAttribute('aria-pressed', String(theme === 'dark'));
  }
};

const persistPreference = (theme) => {
  setStoredTheme(theme);
};

const applyTheme = (theme, { persist = false, toggle } = {}) => {
  reflectPreference(theme, toggle);
  if (persist) {
    persistPreference(theme);
  }
};

export const initTheme = () => {
  const toggle = document.querySelector('[data-theme-toggle]');
  const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
  const stored = getStoredTheme();
  let userHasPreference = stored !== null;

  applyTheme(resolveInitialTheme(stored), { toggle });

  if (toggle) {
    toggle.addEventListener('click', () => {
      const next =
        document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      userHasPreference = true;
      applyTheme(next, { persist: true, toggle });
    });
  }

  const handleSystemChange = (event) => {
    if (userHasPreference) return;
    applyTheme(event.matches ? 'dark' : 'light', { toggle });
  };

  if (typeof mediaQuery.addEventListener === 'function') {
    mediaQuery.addEventListener('change', handleSystemChange);
  } else if (typeof mediaQuery.addListener === 'function') {
    mediaQuery.addListener(handleSystemChange);
  }
};

// Both areas are probed once, at module evaluation: a blocked or missing Storage throws on the
// very first access, and every accessor below then degrades to a no-op instead of propagating it.
const createSafeStorage = (resolveArea) => {
  const isStorageAvailable = () => {
    try {
      const key = '__vg_test__';
      resolveArea().setItem(key, '1');
      resolveArea().removeItem(key);
      return true;
    } catch (error) {
      return false;
    }
  };

  const storageEnabled = isStorageAvailable();

  return {
    get: (key) => {
      if (!storageEnabled) return null;
      try {
        return resolveArea().getItem(key);
      } catch (error) {
        return null;
      }
    },
    set: (key, value) => {
      if (!storageEnabled) return;
      try {
        resolveArea().setItem(key, value);
      } catch (error) {
        // no-op
      }
    },
    remove: (key) => {
      if (!storageEnabled) return;
      try {
        resolveArea().removeItem(key);
      } catch (error) {
        // no-op
      }
    },
  };
};

// Persistent, cross-visit state: cart, theme, project terms, completed installation.
export const safeStorage = createSafeStorage(() => window.localStorage);

// State that must expire with the tab, such as declining the install invitation for this visit.
export const safeSessionStorage = createSafeStorage(() => window.sessionStorage);

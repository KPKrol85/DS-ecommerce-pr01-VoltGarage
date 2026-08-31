const isStorageAvailable = () => {
  try {
    const key = '__vg_test__';
    window.localStorage.setItem(key, '1');
    window.localStorage.removeItem(key);
    return true;
  } catch (error) {
    return false;
  }
};

const storageEnabled = isStorageAvailable();

export const safeStorage = {
  get: (key) => {
    if (!storageEnabled) return null;
    try {
      return window.localStorage.getItem(key);
    } catch (error) {
      return null;
    }
  },
  set: (key, value) => {
    if (!storageEnabled) return;
    try {
      window.localStorage.setItem(key, value);
    } catch (error) {
      // no-op
    }
  },
  remove: (key) => {
    if (!storageEnabled) return;
    try {
      window.localStorage.removeItem(key);
    } catch (error) {
      // no-op
    }
  },
};

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([type="hidden"]):not([disabled])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
];

const getFocusable = (root) => {
  if (!root) return [];
  return Array.from(root.querySelectorAll(FOCUSABLE.join(','))).filter(
    (el) => !el.hasAttribute('inert') && !el.closest('[aria-hidden="true"]')
  );
};

export const createFocusTrap = (root) => {
  let previousActive = null;

  const handleKeydown = (event) => {
    if (event.key !== 'Tab') return;
    const focusable = getFocusable(root);
    if (!focusable.length) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = document.activeElement;

    if (event.shiftKey) {
      if (active === first || !root.contains(active)) {
        event.preventDefault();
        last.focus();
      }
    } else if (active === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const activate = () => {
    previousActive = document.activeElement;
    document.addEventListener('keydown', handleKeydown);
    const focusable = getFocusable(root);
    focusable[0]?.focus();
  };

  const deactivate = () => {
    document.removeEventListener('keydown', handleKeydown);
    if (previousActive && previousActive.focus) previousActive.focus();
    previousActive = null;
  };

  return { activate, deactivate };
};

import { safeStorage } from '../services/storage.js';

const INSTALL_DISMISSED_KEY = 'vg_install_cta_dismissed';

const createElement = (tag, className, attrs = {}) => {
  const el = document.createElement(tag);
  if (className) el.className = className;
  Object.entries(attrs).forEach(([key, value]) => el.setAttribute(key, value));
  return el;
};

const renderToast = (message, actions = []) => {
  let toast = document.querySelector('[data-toast]');
  if (!toast) {
    toast = createElement('div', 'toast', {
      'data-toast': 'true',
      role: 'status',
      'aria-live': 'polite',
    });
    const text = createElement('span', 'toast__message', { 'data-toast-message': 'true' });
    const actionsEl = createElement('div', 'toast__actions', { 'data-toast-actions': 'true' });
    toast.append(text, actionsEl);
    document.body.appendChild(toast);
  }
  toast.querySelector('[data-toast-message]').textContent = message;
  const actionsContainer = toast.querySelector('[data-toast-actions]');
  actionsContainer.innerHTML = '';
  actions.forEach((action) => {
    const button = createElement('button', 'btn btn-outline btn-sm');
    button.type = 'button';
    button.textContent = action.label;
    button.addEventListener('click', action.onClick);
    actionsContainer.appendChild(button);
  });
  toast.hidden = false;
};

const hideToast = () => {
  const toast = document.querySelector('[data-toast]');
  if (toast) toast.hidden = true;
};

const renderInstallCta = (onInstall, onDismiss) => {
  let cta = document.querySelector('[data-install-cta]');
  let installBtn;
  let closeBtn;

  if (!cta) {
    cta = createElement('div', 'install-cta', {
      'data-install-cta': 'true',
      role: 'status',
      'aria-live': 'polite',
    });
    const text = createElement('p', 'install-cta__text');
    text.textContent = 'Zainstaluj aplikację VOLT GARAGE na swoim urządzeniu.';
    const actions = createElement('div', 'install-cta__actions');

    installBtn = createElement('button', 'btn btn-accent btn-sm');
    installBtn.type = 'button';
    installBtn.setAttribute('data-install-action', 'install');
    installBtn.textContent = 'Zainstaluj';

    closeBtn = createElement('button', 'btn btn-outline btn-sm');
    closeBtn.type = 'button';
    closeBtn.setAttribute('data-install-action', 'dismiss');
    closeBtn.textContent = 'Nie teraz';

    actions.append(installBtn, closeBtn);
    cta.append(text, actions);
    document.body.appendChild(cta);
  } else {
    installBtn = cta.querySelector('[data-install-action="install"]');
    closeBtn = cta.querySelector('[data-install-action="dismiss"]');
  }

  installBtn.onclick = onInstall;
  closeBtn.onclick = onDismiss;

  cta.hidden = false;
};

const hideInstallCta = () => {
  const cta = document.querySelector('[data-install-cta]');
  if (cta) cta.hidden = true;
};

export const initPwaPrompts = (registrationPromise) => {
  let deferredPrompt = null;
  let refreshing = false;

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    if (safeStorage.get(INSTALL_DISMISSED_KEY) === '1') return;
    deferredPrompt = event;
    renderInstallCta(
      async () => {
        hideInstallCta();
        if (!deferredPrompt) return;
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        if (outcome === 'accepted') {
          safeStorage.set(INSTALL_DISMISSED_KEY, '1');
        }
        deferredPrompt = null;
      },
      () => {
        safeStorage.set(INSTALL_DISMISSED_KEY, '1');
        hideInstallCta();
      }
    );
  });

  window.addEventListener('appinstalled', () => {
    safeStorage.set(INSTALL_DISMISSED_KEY, '1');
    hideInstallCta();
  });

  if ('onLine' in navigator) {
    const updateOnlineStatus = () => {
      if (navigator.onLine) {
        hideToast();
      } else {
        renderToast('Tryb offline: część funkcji może być ograniczona.');
      }
    };
    window.addEventListener('online', updateOnlineStatus);
    window.addEventListener('offline', updateOnlineStatus);
    updateOnlineStatus();
  }

  if (registrationPromise) {
    registrationPromise.then((registration) => {
      if (!registration) return;

      const showUpdateToast = (waiting) => {
        renderToast('Dostępna jest nowa wersja aplikacji.', [
          {
            label: 'Odśwież',
            onClick: () => {
              if (waiting) {
                waiting.postMessage('SKIP_WAITING');
              }
            },
          },
        ]);
      };

      if (registration.waiting) {
        showUpdateToast(registration.waiting);
      }

      registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing;
        if (newWorker) {
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              showUpdateToast(newWorker);
            }
          });
        }
      });

      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (refreshing) return;
        refreshing = true;
        window.location.reload();
      });
    });
  }
};

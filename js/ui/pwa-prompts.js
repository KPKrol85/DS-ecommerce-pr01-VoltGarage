import { safeSessionStorage, safeStorage } from '../services/storage.js';

// Written only once the application is installed, so a later visit never re-offers what the
// browser can no longer install. Declining with "Nie teraz" is deliberately weaker: it expires
// with the tab through the session key below.
const INSTALL_DISMISSED_KEY = 'vg_install_cta_dismissed';
const INSTALL_SESSION_DISMISSED_KEY = 'vg_install_cta_session_dismissed';
const AUTO_COLLAPSE_DELAY = 30000;
// Symbol only: the offer is a compact chip, so the wordmark beside it belongs to the copy.
const INSTALL_MARK = '/assets/images/logo/logo-badge.svg';

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

const createMark = () =>
  createElement('img', 'install-cta__mark', {
    src: INSTALL_MARK,
    alt: '',
    'aria-hidden': 'true',
    width: '48',
    height: '48',
    decoding: 'async',
  });

const createInstallCta = ({ onInstall, onDismiss, onExpand }) => {
  const cta = createElement('div', 'install-cta', { 'data-install-cta': 'true' });

  // The card announces itself politely when it appears. It stays an offer rather than a dialog:
  // no focus trap, no backdrop, nothing the visitor has to answer before continuing.
  const card = createElement('div', 'install-cta__card', {
    'data-install-card': 'true',
    role: 'status',
    'aria-live': 'polite',
  });
  const text = createElement('p', 'install-cta__text');
  text.textContent = 'Zainstaluj aplikację VOLT GARAGE na swoim urządzeniu.';
  const actions = createElement('div', 'install-cta__actions');

  const installBtn = createElement('button', 'btn btn-accent btn-sm', {
    type: 'button',
    'data-install-action': 'install',
  });
  installBtn.textContent = 'Zainstaluj';
  installBtn.addEventListener('click', onInstall);

  const dismissBtn = createElement('button', 'btn btn-outline btn-sm', {
    type: 'button',
    'data-install-action': 'dismiss',
  });
  dismissBtn.textContent = 'Nie teraz';
  dismissBtn.addEventListener('click', onDismiss);

  actions.append(installBtn, dismissBtn);
  card.append(createMark(), text, actions);

  const chip = createElement('button', 'install-cta__chip', {
    type: 'button',
    'data-install-action': 'expand',
    'aria-label': 'Zainstaluj aplikację VOLT GARAGE',
  });
  const chipLabel = createElement('span', 'install-cta__chip-label');
  chipLabel.textContent = 'VOLT APP';
  chip.append(createMark(), chipLabel);
  chip.addEventListener('click', onExpand);

  cta.append(card, chip);
  document.body.appendChild(cta);
  return cta;
};

// hidden | expanded | collapsed. Visibility rides the hidden attribute, so a state that is off
// screen is also out of the accessibility tree and out of the tab order.
const setInstallState = (cta, state) => {
  cta.setAttribute('data-install-state', state);
  cta.hidden = state === 'hidden';
  cta.querySelector('[data-install-card]').hidden = state !== 'expanded';
  cta.querySelector('[data-install-action="expand"]').hidden = state !== 'collapsed';
};

const initInstallPrompt = () => {
  let deferredPrompt = null;
  let cta = null;
  let collapseTimer = null;
  let collapsePending = false;

  const isSuppressed = () =>
    safeStorage.get(INSTALL_DISMISSED_KEY) === '1' ||
    safeSessionStorage.get(INSTALL_SESSION_DISMISSED_KEY) === '1';

  const clearCollapseTimer = () => {
    if (collapseTimer !== null) clearTimeout(collapseTimer);
    collapseTimer = null;
    collapsePending = false;
  };

  // Collapsing is not a rejection: the deferred event survives and the chip keeps the offer
  // reachable for the rest of the visit.
  const collapse = () => {
    if (cta) setInstallState(cta, 'collapsed');
  };

  const autoCollapse = () => {
    collapseTimer = null;
    // Never pull a focused control out from under the keyboard. The focusout listener finishes
    // the collapse once focus leaves the component.
    if (cta && cta.contains(document.activeElement)) {
      collapsePending = true;
      return;
    }
    collapse();
  };

  const expand = () => {
    // Reopening is deliberate, so the inactivity timer that already elapsed is not re-armed.
    clearCollapseTimer();
    setInstallState(cta, 'expanded');
    // The chip the visitor just activated is now hidden; move focus onto the primary action
    // instead of dropping it on the document.
    cta.querySelector('[data-install-action="install"]').focus();
  };

  const hide = () => {
    clearCollapseTimer();
    if (cta) setInstallState(cta, 'hidden');
  };

  const install = async () => {
    hide();
    const prompt = deferredPrompt;
    if (!prompt) return;
    // The deferred event is single use; releasing it before prompting rules out a second call.
    deferredPrompt = null;
    prompt.prompt();
    const { outcome } = await prompt.userChoice;
    if (outcome === 'accepted') safeStorage.set(INSTALL_DISMISSED_KEY, '1');
  };

  const dismiss = () => {
    // Session scoped on purpose: the offer returns on a later visit, not during this one. With
    // storage blocked the write is a no-op and a re-fired event restores only the chip.
    safeSessionStorage.set(INSTALL_SESSION_DISMISSED_KEY, '1');
    deferredPrompt = null;
    hide();
  };

  const ensureCta = () => {
    if (cta) return cta;
    cta = createInstallCta({ onInstall: install, onDismiss: dismiss, onExpand: expand });
    cta.addEventListener('focusout', (event) => {
      if (!collapsePending) return;
      if (event.relatedTarget && cta.contains(event.relatedTarget)) return;
      collapsePending = false;
      collapse();
    });
    return cta;
  };

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    if (isSuppressed()) return;
    deferredPrompt = event;
    if (!cta) {
      setInstallState(ensureCta(), 'expanded');
      collapseTimer = setTimeout(autoCollapse, AUTO_COLLAPSE_DELAY);
      return;
    }
    // A re-fired event must not overrule the state the visitor is already looking at, and must
    // not re-open the card that the install flow just closed.
    if (cta.getAttribute('data-install-state') === 'hidden') collapse();
  });

  window.addEventListener('appinstalled', () => {
    safeStorage.set(INSTALL_DISMISSED_KEY, '1');
    deferredPrompt = null;
    hide();
  });
};

export const initPwaPrompts = (registrationPromise) => {
  let refreshing = false;

  initInstallPrompt();

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
    let hadController = Boolean(navigator.serviceWorker.controller);
    let approvedWorker = null;

    navigator.serviceWorker.addEventListener('controllerchange', () => {
      const controller = navigator.serviceWorker.controller;
      if (!hadController) {
        hadController = Boolean(controller);
        return;
      }
      // Another tab can activate the shared worker without this page requesting a reload.
      if (!controller || controller !== approvedWorker || refreshing) return;
      refreshing = true;
      window.location.reload();
    });

    registrationPromise.then((registration) => {
      if (!registration) return;

      const showUpdateToast = (waiting) => {
        renderToast('Dostępna jest nowa wersja aplikacji.', [
          {
            label: 'Odśwież',
            onClick: () => {
              if (waiting && waiting === registration.waiting && waiting !== approvedWorker) {
                approvedWorker = waiting;
                waiting.postMessage('SKIP_WAITING');
              }
            },
          },
        ]);
      };

      if (registration.waiting && navigator.serviceWorker.controller) {
        showUpdateToast(registration.waiting);
      }

      const observeInstallingWorker = () => {
        const newWorker = registration.installing;
        if (newWorker) {
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              showUpdateToast(newWorker);
            }
          });
        }
      };
      registration.addEventListener('updatefound', observeInstallingWorker);
      observeInstallingWorker();
    });
  }
};

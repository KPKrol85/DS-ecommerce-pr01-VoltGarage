import { safeStorage } from '../services/storage.js';
import { createFocusTrap } from './focus-trap.js';

const STORAGE_KEY = 'vg_project_terms_accepted';

const showModal = (modal, trap, initialFocus) => {
  modal.hidden = false;
  document.body.classList.add('project-modal-open');
  requestAnimationFrame(() => {
    modal.classList.add('is-visible');
    trap.activate();
    initialFocus?.focus();
  });
};

const hideModal = (modal, trap) => {
  modal.classList.remove('is-visible');
  document.body.classList.remove('project-modal-open');
  trap.deactivate();
  modal.hidden = true;
};

export const initProjectModal = () => {
  const modal = document.querySelector('[data-project-modal]');
  if (!modal) return;

  const trap = createFocusTrap(modal);
  const accepted = safeStorage.get(STORAGE_KEY) === '1';

  if (accepted) {
    modal.hidden = true;
    return;
  }

  const accept = modal.querySelector('[data-project-accept]');
  if (!accept) return;

  accept.addEventListener('click', () => {
    safeStorage.set(STORAGE_KEY, '1');
    hideModal(modal, trap);
  });

  showModal(modal, trap, accept);
};

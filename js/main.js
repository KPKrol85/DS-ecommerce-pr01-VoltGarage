// Entry point: bootstrap site modules.
import { initHeader } from './ui/header.js';
import { initTheme } from './ui/theme.js';
import { initReveal } from './ui/reveal.js';
import { initAccessibility } from './ui/accessibility.js';
import { initProjectModal } from './ui/project-modal.js';
import { initGlobalErrorHandling } from './core/errors.js';
import { emit, events, on } from './core/events.js';
import { injectBreadcrumbJsonLd } from './ui/structured-data.js';
import { initPwaPrompts } from './ui/pwa-prompts.js';
import {
  initCart,
  initCartPage,
  initAddToCartButtons,
  initCheckoutSummary,
} from './features/cart.js';
import {
  initFeaturedProducts,
  initProductDetails,
  initRelatedProducts,
  initNewArrivalsProducts,
  initSaleProducts,
} from './features/products.js';
import { initFilters } from './features/filters.js';

const initForms = () => {
  const forms = document.querySelectorAll('[data-contact-form], [data-checkout-form]');
  if (!forms.length) return;

  const isEmail = (value) => /\S+@\S+\.\S+/.test(value);
  const getOrCreateError = (field) => {
    const wrapper = field.closest('.input-group') || field.parentElement;
    if (!wrapper) return null;
    let message = wrapper.querySelector('[data-field-error]');
    if (!message) {
      message = document.createElement('p');
      message.className = 'input-error';
      message.dataset.fieldError = field.name || field.id || 'field';
      message.setAttribute('aria-live', 'polite');
      message.hidden = true;
      wrapper.appendChild(message);
    }
    if (!message.id) {
      const base = field.id || field.name || 'field';
      const safeBase =
        base
          .trim()
          .toLowerCase()
          .replace(/[^a-z0-9_-]+/g, '-') || 'field';
      message.id = `${safeBase}-error`;
    }
    return message;
  };

  const validators = {
    email: (field, value) => (value && !isEmail(value) ? 'Podaj poprawny adres e-mail.' : ''),
    tel: (field, value) =>
      value && field.pattern && !new RegExp(field.pattern).test(value)
        ? 'Podaj poprawny numer telefonu.'
        : '',
  };

  const validateField = (field) => {
    const value = field.value.trim();
    let message = '';

    if (field.hasAttribute('required') && !value) {
      message = 'To pole jest wymagane.';
    }

    if (!message) {
      const validator = validators[field.type];
      if (validator) message = validator(field, value);
    }

    if (!message && field.minLength > 0 && value && value.length < field.minLength) {
      message = `Wpisz min. ${field.minLength} znaków.`;
    }

    const errorEl = getOrCreateError(field);
    if (message) {
      field.setAttribute('aria-invalid', 'true');
      if (errorEl) {
        errorEl.textContent = message;
        errorEl.hidden = false;
        const describedBy = field.getAttribute('aria-describedby');
        const ids = describedBy ? describedBy.split(/\s+/) : [];
        if (!ids.includes(errorEl.id)) {
          ids.push(errorEl.id);
          field.setAttribute('aria-describedby', ids.join(' ').trim());
        }
      }
      return false;
    }

    field.setAttribute('aria-invalid', 'false');
    if (errorEl) {
      errorEl.textContent = '';
      errorEl.hidden = true;
      const describedBy = field.getAttribute('aria-describedby');
      if (describedBy) {
        const ids = describedBy.split(/\s+/).filter((id) => id && id !== errorEl.id);
        if (ids.length) {
          field.setAttribute('aria-describedby', ids.join(' '));
        } else {
          field.removeAttribute('aria-describedby');
        }
      }
    }
    return true;
  };

  forms.forEach((form) => {
    form.noValidate = true;
    const status = form.querySelector('[data-form-status]');
    if (status) {
      status.setAttribute('aria-live', 'polite');
    }
    const handlesSubmissionInJs = form.hasAttribute('data-checkout-form');

    const focusFirstInvalid = (fields) => {
      const invalid = fields.find((field) => field.getAttribute('aria-invalid') === 'true');
      invalid?.focus();
    };

    form.addEventListener('submit', (event) => {
      const fields = Array.from(form.querySelectorAll('input, textarea, select'));
      const results = fields.map((field) => validateField(field));
      const isValid = results.every(Boolean);

      if (!isValid) {
        event.preventDefault();
        if (status) {
          status.textContent = 'Uzupełnij wymagane pola i popraw zaznaczone błędy.';
        }
        focusFirstInvalid(fields);
        return;
      }

      if (!handlesSubmissionInJs) {
        return;
      }

      event.preventDefault();
      if (status) {
        status.textContent = 'Dziękujemy! Twoje zgłoszenie zostało przyjęte.';
      }
      form.reset();
      fields.forEach((field) => validateField(field));
    });

    form.addEventListener('input', (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      if (!['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;
      validateField(target);
    });
  });
};

const initCopyrightYear = () => {
  const yearTargets = document.querySelectorAll('[data-current-year]');
  if (!yearTargets.length) return;
  const year = String(new Date().getFullYear());
  yearTargets.forEach((el) => {
    el.textContent = year;
  });
};

const initApp = () => {
  initGlobalErrorHandling();
  on(events.app.error, ({ source, error }) => {
    if (error) {
      console.error('[VOLT][app]', source, error);
    }
  });

  emit(events.app.error, { source: 'init:ready', error: null });

  const has = (selector) => document.querySelector(selector);

  if (document.body) initAccessibility();
  if (has('[data-header]')) initHeader();
  if (has('[data-theme-toggle]')) initTheme();
  if (has('[data-reveal]')) initReveal();
  if (has('[data-cart-count]')) initCart();
  if (has('[data-products="featured"]')) initFeaturedProducts();
  if (has('[data-products="shop"]')) initFilters();
  if (has('[data-products="new"]')) initNewArrivalsProducts();
  if (has('[data-products="related"]')) initRelatedProducts();
  if (has('[data-products="sale"]')) initSaleProducts();
  if (has('[data-product-details]')) initProductDetails();
  if (has('[data-cart-items]')) initCartPage();
  if (has('[data-checkout-summary]')) initCheckoutSummary();
  if (has('[data-contact-form], [data-checkout-form]')) initForms();
  if (has('.breadcrumbs')) injectBreadcrumbJsonLd();
  // Przyczyna: przyciski są renderowane po async load produktów, więc selektor na starcie zwraca null.
  // Delegacja klików musi być podpięta zawsze, niezależnie od chwili renderu.
  initAddToCartButtons();
  initProjectModal();
  if ('serviceWorker' in navigator) {
    const registrationPromise = navigator.serviceWorker
      .register('/sw.js')
      .catch((error) => console.error('[VOLT][sw]', error));
    initPwaPrompts(registrationPromise);
  }
  if (has('[data-current-year]')) initCopyrightYear();
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp, { once: true });
} else {
  initApp();
}

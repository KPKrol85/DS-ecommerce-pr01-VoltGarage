// Entry point: bootstrap site modules.
import { mountIconSprite } from '../icons.js';
import { initHeader } from './ui/header.js';
import { initTheme } from './ui/theme.js';
import { initReveal } from './ui/reveal.js';
import { initAccessibility } from './ui/accessibility.js';
import { initProjectModal } from './ui/project-modal.js';
import { initGlobalErrorHandling } from './core/errors.js';
import { emit, events, on } from './core/events.js';
import { injectBreadcrumbJsonLd } from './ui/structured-data.js';
import { initPwaPrompts } from './ui/pwa-prompts.js';
import { initOfflineRetry } from './ui/offline-retry.js';
import {
  initCart,
  initCartPage,
  initAddToCartButtons,
  initCheckoutSummary,
  hasCartItems,
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
  };

  // A declared `pattern` is read back from the field's own ValidityState so the custom UI and
  // the browser keep one interpretation of the expression, for every input type that carries
  // one. Wording comes from the field's `title` guidance; a type keeps its own fuller sentence
  // where the project already publishes one.
  const patternMessages = {
    tel: 'Podaj poprawny numer telefonu, np. 533 537 091 lub +48 533 537 091.',
  };

  const patternMessage = (field) => {
    if (patternMessages[field.type]) return patternMessages[field.type];
    const guidance = (field.title || '').trim();
    return guidance
      ? `Podaj wartość w poprawnym formacie. ${guidance}`
      : 'Podaj wartość w poprawnym formacie.';
  };

  // These types keep the trimmed-value reading they had before declared patterns became
  // generic: surrounding whitespace never decided a phone number. The constraint is still the
  // browser's own, applied to the same declared expression through a detached copy of the
  // field, so the visitor's value is never touched and the pattern keeps one interpretation.
  const trimmedPatternTypes = new Set(['tel']);

  const hasPatternMismatch = (field, value) => {
    if (!field.pattern) return false;
    if (value === field.value || !trimmedPatternTypes.has(field.type)) {
      return Boolean(field.validity?.patternMismatch);
    }
    const probe = field.cloneNode(false);
    probe.value = value;
    return Boolean(probe.validity?.patternMismatch);
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

    if (!message && value && hasPatternMismatch(field, value)) {
      message = patternMessage(field);
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
      if (handlesSubmissionInJs) event.preventDefault();
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

      if (!hasCartItems()) {
        if (status) {
          status.textContent =
            'Koszyk jest pusty. Dodaj co najmniej jeden produkt przed kontynuowaniem zamówienia.';
        }
        return;
      }
      if (status) {
        status.textContent =
          'Symulacja checkoutu zakończyła się pomyślnie. Zamówienie nie zostało wysłane ani zapisane.';
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

    // Checkout stays disabled in HTML until its simulation handler is installed.
    if (handlesSubmissionInJs) {
      const submitButton = form.querySelector('button[type="submit"]');
      if (submitButton) submitButton.disabled = false;
    }
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

const runInitializer = (source, initializer) => {
  const reportError = (error) => emit(events.app.error, { source, error });
  try {
    Promise.resolve(initializer()).catch(reportError);
  } catch (error) {
    reportError(error);
  }
};

const initApp = () => {
  on(events.app.error, ({ source, error }) => {
    if (error) {
      console.error('[VOLT][app]', source, error);
    }
  });

  runInitializer('initGlobalErrorHandling', initGlobalErrorHandling);
  emit(events.app.error, { source: 'init:ready', error: null });

  const has = (selector) => document.querySelector(selector);

  if (document.body) runInitializer('mountIconSprite', mountIconSprite);
  if (document.body) runInitializer('initAccessibility', initAccessibility);
  if (has('[data-header]')) runInitializer('initHeader', initHeader);
  if (has('[data-theme-toggle]')) runInitializer('initTheme', initTheme);
  if (has('[data-reveal]')) runInitializer('initReveal', initReveal);
  if (has('[data-cart-count]')) runInitializer('initCart', initCart);
  if (has('[data-products="featured"]'))
    runInitializer('initFeaturedProducts', initFeaturedProducts);
  if (has('[data-products="shop"]')) runInitializer('initFilters', initFilters);
  if (has('[data-products="new"]'))
    runInitializer('initNewArrivalsProducts', initNewArrivalsProducts);
  if (has('[data-products="related"]')) runInitializer('initRelatedProducts', initRelatedProducts);
  if (has('[data-products="sale"]')) runInitializer('initSaleProducts', initSaleProducts);
  if (has('[data-product-details]')) runInitializer('initProductDetails', initProductDetails);
  if (has('[data-cart-items]')) runInitializer('initCartPage', initCartPage);
  if (has('[data-checkout-summary]')) runInitializer('initCheckoutSummary', initCheckoutSummary);
  if (has('[data-contact-form], [data-checkout-form]')) runInitializer('initForms', initForms);
  if (has('[data-offline-retry]')) runInitializer('initOfflineRetry', initOfflineRetry);
  if (has('.breadcrumbs')) runInitializer('injectBreadcrumbJsonLd', injectBreadcrumbJsonLd);
  // Przyczyna: przyciski są renderowane po async load produktów, więc selektor na starcie zwraca null.
  // Delegacja klików musi być podpięta zawsze, niezależnie od chwili renderu.
  runInitializer('initAddToCartButtons', initAddToCartButtons);
  runInitializer('initProjectModal', initProjectModal);
  if (import.meta.env.PROD && 'serviceWorker' in navigator) {
    runInitializer('initPwaPrompts', () => {
      const registrationPromise = navigator.serviceWorker
        .register('/sw.js', { updateViaCache: 'none' })
        .catch((error) => console.error('[VOLT][sw]', error));
      return initPwaPrompts(registrationPromise);
    });
  }
  if (has('[data-current-year]')) runInitializer('initCopyrightYear', initCopyrightYear);
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp, { once: true });
} else {
  initApp();
}

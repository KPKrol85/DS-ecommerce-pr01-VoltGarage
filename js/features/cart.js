import { fetchProducts, getProductImage, formatProductPrice } from './products.js';
import { initReveal } from '../ui/reveal.js';
import { renderState } from '../ui/state.js';
import { safeStorage } from '../services/storage.js';
import { logError } from '../core/errors.js';

const CART_KEY = 'volt_cart';
const FREE_SHIPPING = 300;
const SHIPPING_FEE = 20;

const getCart = () => {
  const raw = safeStorage.get(CART_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) || [];
  } catch (error) {
    logError('cart:parse', error);
    return [];
  }
};

const saveCart = (items) => {
  try {
    safeStorage.set(CART_KEY, JSON.stringify(items));
  } catch (error) {
    logError('cart:save', error);
  }
  window.dispatchEvent(new CustomEvent('cart:updated'));
};

export const addToCart = (id, qty = 1) => {
  const cart = getCart();
  const existing = cart.find((item) => item.id === id);
  if (existing) {
    existing.qty += qty;
  } else {
    cart.push({ id, qty });
  }
  saveCart(cart);
};

const updateCount = () => {
  const cart = getCart();
  const count = cart.reduce((sum, item) => sum + item.qty, 0);
  document.querySelectorAll('[data-cart-count]').forEach((el) => {
    el.textContent = String(count);
  });
};

export const initCart = () => {
  updateCount();
  window.addEventListener('cart:updated', updateCount);
};

export const initAddToCartButtons = () => {
  document.addEventListener('click', (event) => {
    const button = event.target.closest('[data-add-to-cart]');
    if (!button) return;

    const id = button.getAttribute('data-product-id');
    if (!id) return;
    const qtySelect = document.querySelector('[data-qty-select]');
    const qty = qtySelect ? Number(qtySelect.value) : 1;
    const originalLabel = button.textContent;

    addToCart(id, qty);
    button.textContent = 'Dodano';
    setTimeout(() => {
      button.textContent = originalLabel;
    }, 1200);
  });
};

const buildCartItems = (cart, products) => {
  if (!cart.length) {
    return '<p class="notice" data-reveal>Koszyk jest pusty. Dodaj produkty ze sklepu.</p>';
  }

  return cart
    .map((item) => {
      const product = products.find((p) => p.id === item.id);
      if (!product) return '';
      return `
        <div class="cart-item" role="group" aria-label="${product.name}" data-reveal>
          <img src="${getProductImage(product.image)}" alt="${product.name}" loading="lazy" decoding="async" width="120" height="120" />
          <div class="stacked">
            <strong>${product.name}</strong>
            <span>${formatProductPrice(product.price)}</span>
            <div class="quantity">
              <button class="qty-btn" type="button" aria-label="Zmniejsz ilość" data-qty-action="dec" data-product-id="${product.id}">-</button>
              <span>${item.qty}</span>
              <button class="qty-btn" type="button" aria-label="Zwiększ ilość" data-qty-action="inc" data-product-id="${product.id}">+</button>
            </div>
          </div>
          <div class="stacked">
            <strong>${formatProductPrice(product.price * item.qty)}</strong>
            <button class="btn btn-outline" type="button" data-remove-item data-product-id="${product.id}">Usuń</button>
          </div>
        </div>
      `;
    })
    .join('');
};

const calculateTotals = (cart, products) => {
  const subtotal = cart.reduce((sum, item) => {
    const product = products.find((p) => p.id === item.id);
    return product ? sum + product.price * item.qty : sum;
  }, 0);
  const shipping = subtotal >= FREE_SHIPPING || subtotal === 0 ? 0 : SHIPPING_FEE;
  const total = subtotal + shipping;
  return { subtotal, shipping, total };
};

const updateSummary = (summary, totals) => {
  if (!summary) return;
  const subtotalEl = summary.querySelector('[data-cart-subtotal]');
  const shippingEl = summary.querySelector('[data-cart-shipping]');
  const totalEl = summary.querySelector('[data-cart-total]');
  if (subtotalEl) subtotalEl.textContent = `${totals.subtotal.toFixed(0)} zł`;
  if (shippingEl) shippingEl.textContent = `${totals.shipping.toFixed(0)} zł`;
  if (totalEl) totalEl.textContent = `${totals.total.toFixed(0)} zł`;
};

export const initCartPage = async () => {
  const container = document.querySelector('[data-cart-items]');
  if (!container) return;

  renderState(container, 'loading', 'Ładowanie koszyka...');

  let products = [];
  try {
    products = await fetchProducts();
  } catch (error) {
    logError('cart:load-products', error);
    renderState(container, 'error', 'Nie udało się wczytać produktów koszyka.');
    return;
  }

  const render = () => {
    const cart = getCart();
    if (!cart.length) {
      renderState(container, 'empty', 'Koszyk jest pusty. Dodaj produkty ze sklepu.');
      const summary = document.querySelector('[data-cart-summary]');
      updateSummary(summary, calculateTotals(cart, products));
      return;
    }

    container.innerHTML = buildCartItems(cart, products);
    const summary = document.querySelector('[data-cart-summary]');
    updateSummary(summary, calculateTotals(cart, products));
    initReveal();
  };

  render();

  container.addEventListener('click', (event) => {
    const inc = event.target.closest('[data-qty-action="inc"]');
    const dec = event.target.closest('[data-qty-action="dec"]');
    const remove = event.target.closest('[data-remove-item]');

    const cart = getCart();

    if (inc || dec) {
      const id = (inc || dec).getAttribute('data-product-id');
      const item = cart.find((entry) => entry.id === id);
      if (item) {
        item.qty += inc ? 1 : -1;
        if (item.qty <= 0) {
          const index = cart.findIndex((entry) => entry.id === id);
          cart.splice(index, 1);
        }
        saveCart(cart);
        render();
      }
    }

    if (remove) {
      const id = remove.getAttribute('data-product-id');
      const next = cart.filter((entry) => entry.id !== id);
      saveCart(next);
      render();
    }
  });
};

export const initCheckoutSummary = async () => {
  const summary = document.querySelector('[data-checkout-summary]');
  if (!summary) return;
  try {
    const products = await fetchProducts();
    const cart = getCart();
    updateSummary(summary, calculateTotals(cart, products));
  } catch (error) {
    logError('cart:checkout-summary', error);
    updateSummary(summary, { subtotal: 0, shipping: 0, total: 0 });
  }
};

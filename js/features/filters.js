import { fetchProducts } from '../services/products.js';
import { getProductImage, getProductLink, renderGrid, renderProductsLoading } from './products.js';
import { renderState } from '../ui/state.js';
import { logError } from '../core/errors.js';
import { injectItemListJsonLd, toAbsolute } from '../ui/structured-data.js';

export const initFilters = async () => {
  const container = document.querySelector('[data-products="shop"]');
  if (!container) return;

  const categorySelect = document.querySelector('#filter-category');
  const priceRange = document.querySelector('#filter-price');
  const priceOutput = document.querySelector('[data-price-output]');
  const sortSelect = document.querySelector('#filter-sort');
  const resultCount = document.querySelector('[data-result-count]');
  const searchInput = document.querySelector('[data-search-input]');
  const searchClear = document.querySelector('[data-search-clear]');
  const suggestions = document.querySelector('[data-search-suggestions]');
  const searchField = document.querySelector('[data-search]');

  renderProductsLoading(container, 'Ładowanie produktów...');

  let products = [];
  try {
    products = await fetchProducts();
  } catch (error) {
    logError('filters:load', error);
    renderState(container, 'error', 'Nie udało się wczytać produktów do filtrowania.');
    return;
  }
  const params = new URLSearchParams(window.location.search);
  const categoryParam = params.get('category');

  const debounce = (fn, delay = 200) => {
    let timer;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), delay);
    };
  };

  const polishL = String.fromCharCode(322);

  const foldChar = (char) => {
    const lowered = char.toLowerCase();
    let simplified = lowered.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (simplified === polishL) simplified = 'l';
    if (/[a-z0-9]/.test(simplified)) return simplified;
    if (/\s/.test(simplified)) return ' ';
    return '';
  };

  const foldText = (value = '') => {
    let folded = '';
    for (const char of value) {
      folded += foldChar(char);
    }
    return folded.replace(/\s+/g, ' ').trim();
  };

  const escapeHtml = (value) =>
    value.replace(
      /[&<>"]/g,
      (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[char]
    );

  const buildSearchText = (product) =>
    [product.name, product.category, product.badge, ...(product.tags || [])]
      .filter(Boolean)
      .join(' ');

  const fuzzyScore = (query, text) => {
    if (query.length < 2) return 0;
    let matched = 0;
    for (let i = 0, j = 0; i < text.length && j < query.length; i += 1) {
      if (text[i] === query[j]) {
        matched += 1;
        j += 1;
      }
    }
    return matched / query.length;
  };

  const scoreMatch = (query, name, search) => {
    if (!query) return 0;
    if (name.startsWith(query)) return 300;
    if (name.includes(query)) return 220;
    if (search.startsWith(query)) return 180;
    if (search.includes(query)) return 120;
    const fuzzy = fuzzyScore(query, name);
    return fuzzy >= 0.7 ? 80 + fuzzy * 20 : 0;
  };

  const searchable = products.map((product) => ({
    product,
    nameIndex: foldText(product.name),
    searchIndex: foldText(buildSearchText(product)),
  }));

  const resolveCategory = (value) => {
    if (!categorySelect) return null;
    const options = Array.from(categorySelect.options);
    const directMatch = options.find((option) => option.value === value);
    if (directMatch) return directMatch.value;
    const normalized = foldText(value);
    const normalizedMatch = options.find((option) => foldText(option.value) === normalized);
    return normalizedMatch?.value || null;
  };

  const state = {
    query: '',
  };

  const clearSuggestions = () => {
    if (!suggestions) return;
    suggestions.innerHTML = '';
  };

  const renderSuggestions = (query) => {
    if (!suggestions || !searchInput) return;
    const foldedQuery = foldText(query);
    if (!foldedQuery) {
      clearSuggestions();
      return;
    }
    const scored = searchable
      .map(({ product, nameIndex, searchIndex }) => ({
        product,
        score: scoreMatch(foldedQuery, nameIndex, searchIndex),
      }))
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score || a.product.name.localeCompare(b.product.name))
      .slice(0, 8);

    if (!scored.length) {
      clearSuggestions();
      return;
    }

    suggestions.innerHTML = scored
      .map((entry) => `<option value="${escapeHtml(entry.product.name)}"></option>`)
      .join('');
  };

  const applyFilters = () => {
    const category = categorySelect?.value || 'all';
    const maxPrice = Number(priceRange?.value || 1000);
    const sort = sortSelect?.value || 'featured';
    const searchQuery = foldText(searchInput?.value || '');

    let filtered = searchable
      .filter(({ product, searchIndex }) => {
        const matchesCategory = category === 'all' || product.category === category;
        const matchesSearch = !searchQuery || searchIndex.includes(searchQuery);
        return matchesCategory && product.price <= maxPrice && matchesSearch;
      })
      .map(({ product }) => product);

    if (sort === 'price-asc') {
      filtered = filtered.sort((a, b) => a.price - b.price);
    }
    if (sort === 'price-desc') {
      filtered = filtered.sort((a, b) => b.price - a.price);
    }
    if (sort === 'name-asc') {
      filtered = filtered.sort((a, b) => a.name.localeCompare(b.name));
    }

    renderGrid(container, filtered);
    injectItemListJsonLd({
      name: 'Sklep VOLT GARAGE',
      items: filtered.map((product) => ({
        name: product.name,
        url: toAbsolute(getProductLink(product.id)),
        image: toAbsolute(getProductImage(product.image)),
      })),
    });
    if (resultCount) {
      resultCount.textContent = `${filtered.length} produktów`;
      resultCount.setAttribute('aria-live', 'polite');
    }
  };

  const applyFiltersDebounced = debounce(applyFilters, 200);

  if (priceRange && priceOutput) {
    priceOutput.textContent = priceRange.value;
    priceRange.addEventListener('input', () => {
      priceOutput.textContent = priceRange.value;
      applyFilters();
    });
  }

  categorySelect?.addEventListener('change', applyFilters);
  sortSelect?.addEventListener('change', applyFilters);

  if (searchInput) {
    searchInput.addEventListener('input', () => {
      state.query = searchInput.value;
      if (searchClear) {
        searchClear.hidden = !state.query;
      }
      renderSuggestions(state.query);
      applyFiltersDebounced();
    });
  }

  if (searchInput) {
    searchInput.addEventListener('change', () => {
      state.query = searchInput.value;
      if (searchClear) {
        searchClear.hidden = !state.query;
      }
      applyFilters();
    });
  }

  if (searchClear && searchInput) {
    searchClear.addEventListener('click', () => {
      searchInput.value = '';
      state.query = '';
      searchClear.hidden = true;
      clearSuggestions();
      applyFilters();
      searchInput.focus();
    });
  }

  if (searchField) {
    document.addEventListener('click', (event) => {
      if (!searchField.contains(event.target)) {
        clearSuggestions();
      }
    });
  }

  if (categoryParam && categorySelect) {
    const resolved = resolveCategory(categoryParam);
    if (resolved) {
      categorySelect.value = resolved;
    }
  }

  applyFilters();
};

import { initReveal } from '../ui/reveal.js';
import { renderState } from '../ui/state.js';
import { fetchProducts } from '../services/products.js';
import { logError } from '../core/errors.js';
import {
  STORE_ID,
  injectBreadcrumbJsonLd,
  injectItemListJsonLd,
  resolvePageUrl,
  toAbsolute,
  upsertJsonLd,
} from '../ui/structured-data.js';

const getPrefix = () => (window.location.pathname.includes('/pages/') ? '../' : '');
const formatPrice = (value) => `${value.toFixed(0)} zł`;
const isNewProduct = (product) => product.badge?.toLowerCase().includes('nowo');

const productLink = (id) => {
  const prefix = getPrefix();
  return prefix ? `product.html?id=${id}` : `pages/product.html?id=${id}`;
};

const productImage = (path) => `${getPrefix()}${path}`;

const productPicture = (path, alt, loading = 'lazy') => {
  const src = productImage(path);
  const optimizedSrc = src.replace('assets/images/', 'assets/images/_optimized/');
  const base = optimizedSrc.replace(/\.(jpe?g|png)$/i, '');
  return `
    <picture>
      <source srcset="${base}.avif" type="image/avif" />
      <source srcset="${base}.webp" type="image/webp" />
      <img src="${src}" alt="${alt}" loading="${loading}" decoding="async" width="800" height="600" />
    </picture>
  `;
};

const cardPicture = (product) => {
  if (!product.imageBase) {
    return productPicture(product.image, product.name);
  }

  const base = product.imageBase;
  const fallbackSrc = product.image
    ? productImage(product.image)
    : `${getPrefix()}assets/images/products/${base}.jpg`;

  return `
    <picture>
      <source srcset="${getPrefix()}assets/images/_optimized/products/${base}.avif" type="image/avif" />
      <source srcset="${getPrefix()}assets/images/_optimized/products/${base}.webp" type="image/webp" />
      <img src="${fallbackSrc}" alt="${product.name}" loading="lazy" decoding="async" width="800" height="600" />
    </picture>
  `;
};

const renderCard = (product) => `
  <article class="card" aria-label="${product.name}" data-reveal>
    <!-- CHANGED: img -> picture -->
    ${cardPicture(product)}
    <span class="badge">${product.badge}</span>
    <h3 class="card-title">${product.name}</h3>
    <p class="card-text">${product.description}</p>
    <div class="card-meta">
      <span class="price">${formatPrice(product.price)}</span>
      <span class="product-category">${product.category}</span>
    </div>
    <div class="tag-list">
      <a class="btn btn-outline" href="${productLink(product.id)}">Szczegóły</a>
      <button class="btn btn-accent" type="button" data-add-to-cart data-product-id="${product.id}">Dodaj</button>
    </div>
  </article>
`;

const renderSaleCard = (product) => {
  const oldPrice = product.oldPrice ?? product.price;
  return `
  <article class="card" aria-label="${product.name}" data-reveal>
    <!-- CHANGED: img -> picture -->
    ${productPicture(product.image, product.name)}
    <span class="badge">Promocja</span>
    <h3 class="card-title">${product.name}</h3>
    <p>${product.description}</p>
    <div class="card-meta">
      <span class="price price-old">${formatPrice(oldPrice)}</span>
      <span class="price price-new">${formatPrice(product.price)}</span>
      <span>${product.category}</span>
    </div>
    <div class="tag-list">
      <a class="btn btn-outline" href="${productLink(product.id)}">Szczegóły</a>
      <button class="btn btn-accent" type="button" data-add-to-cart data-product-id="${product.id}">Dodaj</button>
    </div>
  </article>
`;
};

const renderSkeletonCard = () => `
  <article class="card card--skeleton" aria-hidden="true">
    <div class="card-skeleton__media"></div>
    <div class="card-skeleton__badge"></div>
    <div class="card-skeleton__title"></div>
    <div class="card-skeleton__text"></div>
    <div class="card-skeleton__meta"></div>
    <div class="card-skeleton__actions"></div>
  </article>
`;

const setGridBusyState = (container, isBusy) => {
  container.setAttribute('aria-busy', isBusy ? 'true' : 'false');
  container.classList.toggle('products--loading', isBusy);
};

export const renderProductsLoading = (container, message = 'Ładowanie produktów...') => {
  if (!container) return;
  const loadingLabel = `<p class="visually-hidden" role="status" aria-live="polite">${message}</p>`;
  const placeholders = Array.from({ length: 6 }, renderSkeletonCard).join('');
  setGridBusyState(container, true);
  container.innerHTML = `${loadingLabel}${placeholders}`;
};

export const renderGrid = (container, products) => {
  if (!container) return;
  setGridBusyState(container, false);
  container.innerHTML = products.map(renderCard).join('');
  initReveal();
};

const renderSaleGrid = (container, products) => {
  if (!container) return;
  setGridBusyState(container, false);
  container.innerHTML = products.map(renderSaleCard).join('');
  initReveal();
};

const mapProductsToItemList = (products) =>
  products.map((product) => ({
    name: product.name,
    url: toAbsolute(productLink(product.id)),
    image: toAbsolute(productImage(product.image)),
  }));

export const initFeaturedProducts = async () => {
  const container = document.querySelector('[data-products="featured"]');
  if (!container) return;
  renderProductsLoading(container, 'Ładowanie polecanych...');
  try {
    const products = await fetchProducts();
    if (!products.length) {
      renderState(container, 'empty', 'Brak produktów do wyświetlenia.');
      return;
    }
    renderGrid(container, products.slice(0, 3));
  } catch (error) {
    logError('products:featured', error);
    renderState(container, 'error', 'Nie udało się załadować polecanych.');
  }
};

export const initShopProducts = async () => {
  const container = document.querySelector('[data-products="shop"]');
  if (!container) return;
  renderProductsLoading(container, 'Ładowanie produktów...');
  try {
    const products = await fetchProducts();
    if (!products.length) {
      renderState(container, 'empty', 'Brak produktów w sklepie.');
      return;
    }
    renderGrid(container, products);
  } catch (error) {
    logError('products:shop', error);
    renderState(container, 'error', 'Nie udało się załadować listy produktów.');
  }
};

export const initRelatedProducts = async () => {
  const container = document.querySelector('[data-products="related"]');
  if (!container) return;
  renderProductsLoading(container, 'Ładowanie powiązanych...');
  try {
    const products = await fetchProducts();
    const related = products.slice(2, 5);
    if (!related.length) {
      renderState(container, 'empty', 'Brak powiązanych produktów.');
      return;
    }
    renderGrid(container, related);
  } catch (error) {
    logError('products:related', error);
    renderState(container, 'error', 'Nie udało się wczytać powiązanych produktów.');
  }
};

export const initNewArrivalsProducts = async () => {
  const container = document.querySelector('[data-products="new"]');
  if (!container) return;
  const resultCount = document.querySelector('[data-result-count="new"]');
  renderProductsLoading(container, 'Ładowanie nowości...');
  try {
    const products = await fetchProducts();
    const filtered = products.filter(isNewProduct);
    if (!filtered.length) {
      renderState(container, 'empty', 'Brak nowości do wyświetlenia.');
      injectItemListJsonLd({ name: 'Nowości VOLT GARAGE', items: [] });
    } else {
      renderGrid(container, filtered);
      injectItemListJsonLd({
        name: 'Nowości VOLT GARAGE',
        items: mapProductsToItemList(filtered),
      });
    }
    if (resultCount) {
      resultCount.textContent = `${filtered.length} produktów`;
    }
  } catch (error) {
    logError('products:new', error);
    renderState(container, 'error', 'Nie udało się załadować nowości.');
    injectItemListJsonLd({ name: 'Nowości VOLT GARAGE', items: [] });
  }
};

export const initSaleProducts = async () => {
  const container = document.querySelector('[data-products="sale"]');
  if (!container) return;
  const resultCount = document.querySelector('[data-result-count="sale"]');
  renderProductsLoading(container, 'Ładowanie promocji...');
  try {
    const products = await fetchProducts();
    const filtered = products.filter((product) => product.onSale);
    if (!filtered.length) {
      renderState(container, 'empty', 'Aktualnie brak promocji.');
      injectItemListJsonLd({ name: 'Promocje VOLT GARAGE', items: [] });
    } else {
      renderSaleGrid(container, filtered);
      injectItemListJsonLd({
        name: 'Promocje VOLT GARAGE',
        items: mapProductsToItemList(filtered),
      });
    }
    if (resultCount) {
      resultCount.textContent = `${filtered.length} produktów`;
    }
  } catch (error) {
    logError('products:sale', error);
    renderState(container, 'error', 'Nie udało się wczytać promocji.');
    injectItemListJsonLd({ name: 'Promocje VOLT GARAGE', items: [] });
  }
};

export const initProductDetails = async () => {
  const container = document.querySelector('[data-product-details]');
  if (!container) return;

  renderState(container, 'loading', 'Ładowanie produktu...');

  try {
    const products = await fetchProducts();
    const params = new URLSearchParams(window.location.search);
    const currentId = params.get('id') || products[0].id;
    const product = products.find((item) => item.id === currentId) || products[0];

    const canonical = document.querySelector('link[rel="canonical"]');
    const canonicalUrl = `${window.location.origin}${window.location.pathname}?id=${product.id}`;
    if (canonical) {
      canonical.setAttribute('href', canonicalUrl);
    }
    document.title = `${product.name} | VOLT GARAGE`;
    const descriptionSelectors = [
      'meta[name="description"]',
      'meta[property="og:description"]',
      'meta[name="twitter:description"]',
    ];
    descriptionSelectors.forEach((selector) => {
      const metaTag = document.querySelector(selector);
      if (metaTag) {
        metaTag.setAttribute('content', product.description);
      }
    });

    container.innerHTML = `
      <div class="page-layout product-details">
        <div class="card product-media" data-reveal>
          ${productPicture(product.image, product.name, 'eager')}
        </div>
        <div class="card product-info" data-reveal>
          <span class="badge">${product.badge}</span>
          <h2 class="product-title">${product.name}</h2>
          <p class="card-text">${product.description}</p>

          <ul class="stacked">
            ${product.features.map((feature) => `<li>${feature}</li>`).join('')}
          </ul>
 <div class="price">${formatPrice(product.price)}</div>
          <div class="tag-list">
          <label class="input-group">
            <span class="qty-label">Ilość:</span>
            <select name="qty" data-qty-select>
              <option value="1">1</option>
              <option value="2">2</option>
              <option value="3">3</option>
            </select>
          </label>
            <button class="btn btn-accent" type="button" data-add-to-cart data-product-id="${product.id}">Dodaj</button>
          </div>
          </div>
      </div>
    `;
    initReveal();

    const pageUrl = resolvePageUrl({ preferCanonical: false });
    const ld = {
      '@context': 'https://schema.org',
      '@type': 'Product',
      '@id': `${pageUrl}#product`,
      url: canonicalUrl,
      name: product.name,
      category: product.category,
      image: [toAbsolute(productImage(product.image))],
      description: product.description,
      sku: product.id,
      brand: {
        '@type': 'Brand',
        name: 'VOLT GARAGE',
      },
      offers: {
        '@type': 'Offer',
        url: canonicalUrl,
        priceCurrency: 'PLN',
        price: product.price.toFixed(0),
        seller: {
          '@id': STORE_ID,
        },
      },
    };

    upsertJsonLd('product', ld);
    injectBreadcrumbJsonLd();
  } catch (error) {
    logError('products:detail', error);
    renderState(container, 'error', 'Nie udało się wczytać produktu.');
  }
};

export const getProductImage = productImage;
export const getProductLink = productLink;
export const formatProductPrice = formatPrice;
export { fetchProducts };

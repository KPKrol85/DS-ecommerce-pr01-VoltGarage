export const STORE_ID = 'https://e-commerce-pr01-voltgarage.netlify.app/#store';
export const WEBSITE_ID = 'https://e-commerce-pr01-voltgarage.netlify.app/#website';

export const toAbsolute = (href) => new URL(href, window.location.origin).href;

const getCanonicalHref = () =>
  document.querySelector('link[rel="canonical"]')?.getAttribute('href') || '';

const stripHash = (href) => {
  const url = new URL(href, window.location.origin);
  url.hash = '';
  return url.href;
};

export const resolvePageUrl = ({ preferCanonical = true } = {}) => {
  const canonicalHref = getCanonicalHref();
  const currentUrl = stripHash(window.location.href);

  if (!canonicalHref) {
    return currentUrl;
  }

  const canonicalUrl = stripHash(canonicalHref);
  const currentHasSearch = new URL(currentUrl).search.length > 0;

  if (!preferCanonical && currentHasSearch) {
    return currentUrl;
  }

  return canonicalUrl;
};

export const upsertJsonLd = (key, payload) => {
  const selector = `script[data-jsonld-key="${key}"]`;
  const existing = document.head.querySelector(selector);

  if (!payload) {
    existing?.remove();
    return;
  }

  const script = existing || document.createElement('script');
  script.type = 'application/ld+json';
  script.dataset.jsonldKey = key;
  script.textContent = JSON.stringify(payload, null, 2);

  if (!existing) {
    document.head.appendChild(script);
  }
};

export const injectBreadcrumbJsonLd = (selector = '.breadcrumbs') => {
  const nav = document.querySelector(selector);
  if (!nav) return;

  const pageUrl = resolvePageUrl({ preferCanonical: false });
  const items = Array.from(nav.querySelectorAll('ol > li')).map((item, index, list) => {
    const link = item.querySelector('a');
    const isLast = index === list.length - 1;

    return {
      '@type': 'ListItem',
      position: index + 1,
      name: link ? link.textContent.trim() : item.textContent.trim(),
      item: link && !isLast ? toAbsolute(link.getAttribute('href')) : pageUrl,
    };
  });

  upsertJsonLd('breadcrumb', {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    '@id': `${pageUrl}#breadcrumb`,
    itemListElement: items,
  });
};

export const injectItemListJsonLd = ({
  name,
  items,
  pageUrl = resolvePageUrl({ preferCanonical: false }),
}) => {
  if (!Array.isArray(items) || !items.length) {
    upsertJsonLd('itemlist', null);
    return;
  }

  upsertJsonLd('itemlist', {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    '@id': `${pageUrl}#itemlist`,
    name,
    url: pageUrl,
    numberOfItems: items.length,
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      url: item.url,
      name: item.name,
      ...(item.image ? { image: item.image } : {}),
    })),
  });
};

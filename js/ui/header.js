const normalizePath = (pathname) => {
  let path = pathname.replace(/\\/g, '/');
  if (path.endsWith('/index.html')) {
    path = path.slice(0, -'/index.html'.length) || '/';
  }
  if (path.length > 1 && path.endsWith('/')) {
    path = path.slice(0, -1);
  }
  return path || '/';
};

const applyAriaCurrent = () => {
  const currentPath = normalizePath(window.location.pathname);
  const links = document.querySelectorAll('.nav a[href], .footer a[href], .cart-link[href]');

  links.forEach((link) => {
    const href = link.getAttribute('href');
    if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) {
      return;
    }

    let url;
    try {
      url = new URL(href, window.location.href);
    } catch {
      return;
    }

    if (url.origin !== window.location.origin) {
      return;
    }

    const linkPath = normalizePath(url.pathname);
    if (linkPath === currentPath) {
      link.setAttribute('aria-current', 'page');
      link.classList.add('is-current');
    } else {
      link.removeAttribute('aria-current');
      link.classList.remove('is-current');
    }
  });

  const breadcrumbItems = document.querySelectorAll('.breadcrumbs ol > li');
  breadcrumbItems.forEach((item, index) => {
    if (index === breadcrumbItems.length - 1) {
      item.setAttribute('aria-current', 'page');
    } else {
      item.removeAttribute('aria-current');
    }
  });
};

export const initHeader = () => {
  applyAriaCurrent();
  const header = document.querySelector('[data-header]');
  const nav = document.querySelector('.nav');
  const toggle = document.querySelector('[data-nav-toggle]');
  const dropdowns = document.querySelectorAll('[data-dropdown]');

  if (!header) return;

  const updateHeader = () => {
    if (window.scrollY > 12) {
      header.classList.add('shrink');
      header.style.boxShadow = 'var(--shadow-sm)';
    } else {
      header.classList.remove('shrink');
      header.style.boxShadow = 'none';
    }
  };

  updateHeader();
  window.addEventListener('scroll', updateHeader, { passive: true });

  if (toggle && nav) {
    toggle.addEventListener('click', () => {
      const isOpen = nav.classList.toggle('is-open');
      toggle.setAttribute('aria-expanded', String(isOpen));
    });

    nav.querySelectorAll('a').forEach((link) => {
      link.addEventListener('click', () => {
        nav.classList.remove('is-open');
        toggle.setAttribute('aria-expanded', 'false');
        dropdowns.forEach((item) => {
          item.classList.remove('is-open');
          item.querySelector('[data-dropdown-toggle]')?.setAttribute('aria-expanded', 'false');
        });
      });
    });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        nav.classList.remove('is-open');
        toggle.setAttribute('aria-expanded', 'false');
        dropdowns.forEach((item) => {
          item.classList.remove('is-open');
          item.querySelector('[data-dropdown-toggle]')?.setAttribute('aria-expanded', 'false');
        });
      }
    });
  }

  if (dropdowns.length) {
    const closeAll = (except = null) => {
      dropdowns.forEach((item) => {
        if (item === except) return;
        item.classList.remove('is-open');
        item.querySelector('[data-dropdown-toggle]')?.setAttribute('aria-expanded', 'false');
      });
    };

    dropdowns.forEach((item, index) => {
      const button = item.querySelector('[data-dropdown-toggle]');
      const menu = item.querySelector('[data-dropdown-menu]');

      if (!button || !menu) return;

      const menuId = `dropdown-menu-${index}`;
      menu.id = menu.id || menuId;
      button.setAttribute('aria-controls', menu.id);

      const getMenuLinks = () => Array.from(menu.querySelectorAll('a'));

      button.addEventListener('click', () => {
        const willOpen = !item.classList.contains('is-open');

        closeAll(item);
        item.classList.toggle('is-open', willOpen);
        button.setAttribute('aria-expanded', String(willOpen));

        if (willOpen) {
          const links = getMenuLinks();
          links[0]?.focus();
        }
      });

      button.addEventListener('keydown', (event) => {
        if (event.key === 'ArrowDown') {
          event.preventDefault();
          if (!item.classList.contains('is-open')) {
            item.classList.add('is-open');
            button.setAttribute('aria-expanded', 'true');
          }
          getMenuLinks()[0]?.focus();
        }
      });

      menu.addEventListener('keydown', (event) => {
        const links = getMenuLinks();
        if (!links.length) return;

        const currentIndex = links.indexOf(document.activeElement);

        if (event.key === 'Escape') {
          closeAll();
          button.focus();
        }
        if (event.key === 'ArrowDown') {
          event.preventDefault();
          const next = links[currentIndex + 1] || links[0];
          next.focus();
        }
        if (event.key === 'ArrowUp') {
          event.preventDefault();
          const prev = links[currentIndex - 1] || links[links.length - 1];
          prev.focus();
        }
        if (event.key === 'Tab' && !event.shiftKey && currentIndex === links.length - 1) {
          closeAll();
        }
      });
    });

    document.addEventListener('click', (event) => {
      if (!event.target.closest('[data-dropdown]')) {
        closeAll();
      }
    });
  }
};

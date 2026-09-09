// One reveal observer stays live at a time. Re-rendering a grid calls initReveal again, so the
// previous observer is released before every return path instead of being left attached to
// elements the new render has already replaced.
let activeObserver = null;

export const initReveal = () => {
  activeObserver?.disconnect();
  activeObserver = null;

  const elements = document.querySelectorAll('[data-reveal]');
  if (!elements.length) return;

  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    elements.forEach((el) => el.classList.add('is-visible'));
    return;
  }

  const revealInView = () => {
    elements.forEach((el) => {
      const rect = el.getBoundingClientRect();
      const inView = rect.top < window.innerHeight && rect.bottom > 0;
      if (inView) {
        el.classList.add('is-visible');
      }
    });
  };

  revealInView();
  document.documentElement.classList.add('reveal-ready');

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        }
      });
    },
    { rootMargin: '0px 0px -10% 0px', threshold: 0.12 }
  );

  activeObserver = observer;
  elements.forEach((el) => observer.observe(el));
  requestAnimationFrame(revealInView);
};

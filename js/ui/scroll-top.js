// The control is a courtesy at the end of a long page, so it costs nothing while the visitor
// reads: one IntersectionObserver on the shared footer decides when it appears, and no scroll
// listener runs in between. The footer is the page's own "you have arrived" marker, so the
// arrival needs no sentinel of its own.

// The footer is tall, so its top edge crosses the fold a screen or so before the end of the
// document. The extra bottom margin hands the control over a fifth of a viewport earlier still,
// which reads as the page offering it rather than the button catching up. Watching both ends of
// the ratio means a page that grows or shrinks under the footer - a filtered grid, say - is
// judged again instead of keeping whatever it decided while it was long.
const OBSERVER_OPTIONS = { rootMargin: '0px 0px 20% 0px', threshold: [0, 1] };
// Below half a viewport of travel the footer is on screen from the first paint and the trip back
// is a few dozen pixels: the control would be offering a journey nobody made.
const MIN_SCROLLABLE_VIEWPORTS = 0.5;
const VISIBLE_CLASS = 'is-visible';

// One observer and one bound button stay live at a time. Re-initializing re-reads the document,
// so the previous pair is released before every return path rather than being left attached to
// markup a later render has already replaced.
let activeObserver = null;
let activeButton = null;
let activeHandler = null;

const isWorthReturning = () =>
  document.documentElement.scrollHeight - window.innerHeight >
  window.innerHeight * MIN_SCROLLABLE_VIEWPORTS;

export const initScrollTop = () => {
  activeObserver?.disconnect();
  activeObserver = null;
  if (activeButton && activeHandler) activeButton.removeEventListener('click', activeHandler);
  activeButton = null;
  activeHandler = null;

  const button = document.querySelector('[data-scroll-top]');
  const target = document.querySelector('[data-scroll-top-target]');
  // Without the observed footer nothing can say when the visitor has arrived, so the button
  // keeps the hidden default the stylesheet gives it instead of appearing unconditionally.
  if (!button || !target) return;

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  activeHandler = () => {
    // 'auto' would defer to the smooth scroll-behavior the stylesheet sets on the root, so the
    // reduced-motion path names 'instant' outright rather than relying on that pairing. The
    // preference is read per activation, so changing it mid-session takes effect immediately.
    window.scrollTo({ top: 0, behavior: reducedMotion.matches ? 'instant' : 'smooth' });
  };
  button.addEventListener('click', activeHandler);
  activeButton = button;

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      button.classList.toggle(VISIBLE_CLASS, entry.isIntersecting && isWorthReturning());
    });
  }, OBSERVER_OPTIONS);

  activeObserver = observer;
  observer.observe(target);
};

// The FAQ ships every answer open, so the page is readable before this module runs and for a
// visitor whose JavaScript never arrives. Collapsing is therefore the enhancement, not the
// authored state, and the markup's aria-expanded="true" is true at the moment it is parsed.
//
// Each question is an independent disclosure: opening one never closes another, because a
// visitor comparing two answers should not have to keep re-opening the first. Nothing here
// scrolls the page or moves focus - the activated button stays where the visitor put it.

// One delegated binding stays live at a time. Re-initializing re-reads the document, so the
// previous listener is released before every return path rather than being left attached to
// markup a later render has already replaced.
let activeRoot = null;
let activeHandler = null;

// The hidden attribute takes the answer out of the accessibility tree and out of the tab order,
// so a collapsed panel cannot hand its links to the Tab key. Visual state follows the same
// attribute pair, never a stylesheet's own idea of what is open.
const setExpanded = (trigger, answer, expanded) => {
  trigger.setAttribute('aria-expanded', String(expanded));
  answer.hidden = !expanded;
};

const answerFor = (trigger) => {
  const id = trigger.getAttribute('aria-controls');
  return id ? document.getElementById(id) : null;
};

export const initFaq = () => {
  if (activeRoot && activeHandler) activeRoot.removeEventListener('click', activeHandler);
  activeRoot = null;
  activeHandler = null;

  const root = document.querySelector('[data-faq]');
  if (!root) return;

  // A question whose panel is missing is left exactly as the document shipped it: open and
  // readable, rather than collapsed behind a control that can no longer reveal it.
  root.querySelectorAll('[data-faq-trigger]').forEach((trigger) => {
    const answer = answerFor(trigger);
    if (answer) setExpanded(trigger, answer, false);
  });

  // Delegation from the accordion root: the triggers are authored, but one listener still
  // outlives any individual item and costs nothing per question.
  activeHandler = (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const trigger = target.closest('[data-faq-trigger]');
    if (!trigger || !root.contains(trigger)) return;
    const answer = answerFor(trigger);
    if (!answer) return;
    setExpanded(trigger, answer, trigger.getAttribute('aria-expanded') !== 'true');
  };

  root.addEventListener('click', activeHandler);
  activeRoot = root;
};

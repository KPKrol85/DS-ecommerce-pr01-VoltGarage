const templates = {
  loading: (message = 'Ładowanie…') =>
    `<div class="state-block state-block--loading" role="status" aria-live="polite">${message}</div>`,
  error: (message = 'Nie udało się pobrać danych.') =>
    `<div class="state-block state-block--error" role="alert">${message}</div>`,
  empty: (message = 'Brak wyników do wyświetlenia.') =>
    `<div class="state-block state-block--empty" role="status" aria-live="polite">${message}</div>`,
};

export const renderState = (container, state, message) => {
  if (!container) return;
  const template = templates[state];
  if (!template) return;
  container.setAttribute('aria-busy', 'false');
  container.classList.remove('products--loading');
  container.innerHTML = template(message);
};

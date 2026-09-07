// The worker serves the offline document for a navigation that failed, and the browser keeps
// the requested URL. Retrying must therefore re-request the current location rather than the
// fallback document's own path. The empty href already resolves to that location without
// scripting; reloading additionally keeps the fragment that resolving an empty href drops.
export const initOfflineRetry = () => {
  const control = document.querySelector('[data-offline-retry]');
  if (!control) return;

  control.addEventListener('click', (event) => {
    event.preventDefault();
    window.location.reload();
  });
};

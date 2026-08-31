import { emit, events } from './events.js';

const formatError = (error) => {
  if (!error) return 'Nieznany błąd';
  if (typeof error === 'string') return error;
  if (error.message) return error.message;
  return JSON.stringify(error);
};

export const initGlobalErrorHandling = () => {
  window.addEventListener('error', (event) => {
    emit(events.app.error, { source: 'window', error: event.error || event.message });
  });

  window.addEventListener('unhandledrejection', (event) => {
    emit(events.app.error, { source: 'promise', error: event.reason });
  });
};

export const logError = (label, error) => {
  console.error(`[VOLT][${label}]`, formatError(error));
};

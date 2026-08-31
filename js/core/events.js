const eventBus = new EventTarget();

const createEventName = (scope, name) => `${scope}:${name}`;

export const events = {
  app: {
    error: createEventName('app', 'error'),
  },
  products: {
    loading: createEventName('products', 'loading'),
    loaded: createEventName('products', 'loaded'),
    error: createEventName('products', 'error'),
  },
};

export const emit = (name, detail = {}) => {
  eventBus.dispatchEvent(new CustomEvent(name, { detail }));
};

export const on = (name, handler) => {
  const wrapped = (event) => handler(event.detail ?? {});
  eventBus.addEventListener(name, wrapped);
  return () => eventBus.removeEventListener(name, wrapped);
};

export const once = (name, handler) => {
  const wrapped = (event) => handler(event.detail ?? {});
  eventBus.addEventListener(name, wrapped, { once: true });
};

export const getEventBus = () => eventBus;

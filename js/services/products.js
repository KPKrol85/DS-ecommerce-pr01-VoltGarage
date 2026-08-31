import { emit, events } from '../core/events.js';

const DATA_URL = new URL('../../data/products.json', import.meta.url);

let cachedProducts = null;

const handleResponse = async (response) => {
  if (!response.ok) {
    const error = new Error(`Błąd pobierania produktów (${response.status})`);
    error.code = response.status;
    throw error;
  }
  return response.json();
};

export const fetchProducts = async () => {
  if (cachedProducts) return cachedProducts;

  emit(events.products.loading);

  try {
    const response = await fetch(DATA_URL, { cache: 'force-cache' });
    const json = await handleResponse(response);
    cachedProducts = json;
    emit(events.products.loaded, { products: cachedProducts });
    return cachedProducts;
  } catch (error) {
    emit(events.products.error, { error });
    emit(events.app.error, { source: 'products', error });
    throw error;
  }
};

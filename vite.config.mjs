import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import * as html from './scripts/html.mjs';
import { voltGarage } from './scripts/vite-volt-garage.mjs';

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root,
  appType: 'mpa',
  publicDir: 'public',
  plugins: [voltGarage(root)],
  css: { devSourcemap: true },
  server: { host: '127.0.0.1', strictPort: true },
  preview: { host: '127.0.0.1', port: 4173, strictPort: true },
  build: {
    target: 'es2022',
    assetsDir: 'build',
    manifest: true,
    rolldownOptions: {
      input: html.discoverHtml(root).map((file) => path.join(root, file)),
      output: {
        entryFileNames: 'build/[name]-[hash].js',
        chunkFileNames: 'build/[name]-[hash].js',
        assetFileNames: 'build/[name]-[hash][extname]',
      },
    },
  },
});

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwind from '@tailwindcss/vite';
// Local HTTPS (WEBDOCK_DEV_HTTPS) uses certificates from a locally trusted CA, e.g. mkcert.
const cert = process.env.WEBDOCK_DEV_TLS_CERT;
const key = process.env.WEBDOCK_DEV_TLS_KEY;
export default defineConfig({
  plugins: [react(), tailwind()],
  // First-party plugin UIs live in plugins/<id>/ui and share the Console's React and SDK.
  resolve: {
    alias: {
      '@webdock/plugin-ui': fileURLToPath(new URL('./src/plugins/sdk.ts', import.meta.url)),
      '@plugins': fileURLToPath(new URL('../../plugins', import.meta.url)),
    },
    dedupe: ['react', 'react-dom', '@tanstack/react-query', 'zod'],
  },
  build: { target: 'es2022' },
  server: {
    host: '127.0.0.1', port: 3120, strictPort: true,
    ...(cert && key ? { https: { cert: readFileSync(cert), key: readFileSync(key) } } : {}),
    proxy: {
      // Every Core path keeps its Host header; Core decides which surface may use it.
      '^/(api|v1|\\.well-known)/': { target: 'http://127.0.0.1:3130', changeOrigin: false },
      '/console-config.json': { target: 'http://127.0.0.1:3130', changeOrigin: false },
    },
  },
});

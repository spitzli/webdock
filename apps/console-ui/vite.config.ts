import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwind from '@tailwindcss/vite';
export default defineConfig({
  plugins: [react(), tailwind()],
  build: { target: 'es2022' },
  server: {
    host: '127.0.0.1', port: 3120, strictPort: true,
    proxy: {
      '/console-config.json': { target: 'http://127.0.0.1:3130', changeOrigin: false },
      '/api/auth': { target: 'http://127.0.0.1:3130', changeOrigin: false },
      '/api/sso': { target: 'http://127.0.0.1:3130', changeOrigin: false },
      '/api/sites': { target: 'http://127.0.0.1:3130', changeOrigin: false },
      '/api/invitation': { target: 'http://127.0.0.1:3130', changeOrigin: false },
      '/api/tenant': { target: 'http://127.0.0.1:3130', changeOrigin: false },
      '/api/console': { target: 'http://127.0.0.1:3130', changeOrigin: false },
    },
  },
});

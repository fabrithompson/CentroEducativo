import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// El proxy reenvía /api y /uploads al backend Express (puerto 4000)
// para evitar problemas de CORS durante el desarrollo.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:4000',
      '/uploads': 'http://localhost:4000',
    },
  },
});

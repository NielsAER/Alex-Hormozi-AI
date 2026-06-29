import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In dev proxyt Vite /api door naar de Express-server (poort 3001).
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
});

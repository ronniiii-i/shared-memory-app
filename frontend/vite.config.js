import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [
    tailwindcss(),
  ],

  // Load .env files from the monorepo root (one level up)
  envDir: '../',

  server: {
    port: 5173,
    // Proxy /api requests to the Express backend during local dev
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },

  build: {
    outDir: 'dist',
    sourcemap: true,
    // Ensure assets use relative paths for Vercel deployment
    assetsDir: 'assets',
  },

  resolve: {
    alias: {
      '@': '/src',
    },
  },
});

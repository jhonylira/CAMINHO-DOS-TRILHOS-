import { defineConfig } from 'vite';

// base './' permite publicar a pasta dist/ em qualquer hospedagem estatica (subpasta, GitHub Pages, servidor da prefeitura).
export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 1500,
  },
  server: { host: true },
});

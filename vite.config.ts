import { defineConfig } from 'vite';
import { resolve } from 'node:path';

// base './' permite publicar a pasta dist/ em qualquer hospedagem estatica (subpasta, GitHub Pages, servidor da prefeitura).
export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 1500,
    // Duas paginas: o explorador 3D (principal) e a Pagina Conceito.
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        conceito: resolve(import.meta.dirname, 'conceito.html'),
      },
    },
  },
  server: { host: true },
});

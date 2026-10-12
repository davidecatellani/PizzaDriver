import { defineConfig } from 'vite';

// Relative base so the build works from any folder (CrazyGames requires relative paths).
export default defineConfig({
  base: './',
  build: { target: 'es2020', chunkSizeWarningLimit: 1000 },
});

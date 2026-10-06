import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base: './' keeps every asset path relative, so the built app works from
// any folder — including a GitHub Pages project site at
// https://<user>.github.io/<repo>/ — without hard-coding the repo name.
// Routing is hash-based (#/orbits), so Pages needs no 404 fallback either.
export default defineConfig({
  base: './',
  plugins: [react()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});

import { defineConfig } from 'vite';

// Relative base so the build works inside itch.io's iframe.
export default defineConfig({
  base: './',
  build: { target: 'es2020', assetsInlineLimit: 0 },
});

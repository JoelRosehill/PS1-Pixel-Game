import { defineConfig } from 'vite';

export default defineConfig({
  // Relative asset URLs, so the build runs from any folder or sub-path (itch.io, GitHub Pages).
  base: './',
  server: { port: 5173, open: false },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 900,
    rolldownOptions: {
      output: {
        // three.js changes rarely; keep it in its own long-cached chunk.
        codeSplitting: { groups: [{ name: 'three', test: /node_modules[\\/]three[\\/]/ }] },
      },
    },
  },
});

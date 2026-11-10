import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: { environment: 'jsdom', include: ['tests/**/*.test.ts'] },
  // Prepare the optional benchmark dependencies before the first timed comparison in dev.
  optimizeDeps: { include: ['react', 'react-dom/client'] },
  build: { rollupOptions: { input: { index: 'index.html', game: 'game.html', experiment: 'experiment.html' } } },
});

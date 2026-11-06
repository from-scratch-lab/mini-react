import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Virtual DOM 변환·patch를 브라우저 없이 검사하려면 DOM 구현(jsdom)이 필요하다.
    environment: 'jsdom',
    include: ['tests/**/*.test.js'],
  },
});

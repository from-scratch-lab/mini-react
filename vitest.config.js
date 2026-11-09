import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Virtual DOM 변환·patch를 브라우저 없이 검사하려면 DOM 구현(jsdom)이 필요하다.
    environment: 'jsdom',
    include: ['tests/**/*.test.js'],
    // fuzz·벤치 예산 테스트는 CPU를 오래 쓴다. 여러 파일이 동시에 돌면 기본 5초를 넘기므로(혼자 돌면 2초 안팎) 넉넉히 둔다.
    testTimeout: 30000,
  },
});

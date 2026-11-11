import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// 데모 첫 화면: 발표의 주인공인 종합 데모가 가장 먼저, 가장 크게 보이고 다른 데모로도 갈 수 있다.
const here = dirname(fileURLToPath(import.meta.url));
const page = new DOMParser().parseFromString(readFileSync(resolve(here, '../../demo/index.html'), 'utf8'), 'text/html');

describe('데모 첫 화면', () => {
  const cards = () => [...page.querySelectorAll('main.index a.index-card')];

  it('종합 데모가 첫 카드이고 강조 카드다', () => {
    const [first] = cards();
    expect(first.getAttribute('href')).toBe('./integrated/');
    expect(first.classList.contains('featured')).toBe(true);
  });

  it('나머지 데모(Phase 1, Phase 2, 벤치마크)로 가는 링크도 남아 있다', () => {
    const hrefs = cards().map((a) => a.getAttribute('href'));
    expect(hrefs).toEqual(expect.arrayContaining(['./phase1/', './phase2/', './bench/']));
  });
});

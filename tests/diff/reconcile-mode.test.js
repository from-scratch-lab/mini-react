import { describe, it, expect } from 'vitest';
import { createElement as h, render, diff, patch, PatchType } from '../../src/index.js';

const li = (key, text = key) => h('li', { key }, text);
const ul = (items) => h('ul', null, ...items.map((k) => li(k)));
const movesOf = (patches) => patches.filter((p) => p.type === PatchType.MOVE);

describe('reconcileMode: LIS vs lastPlacedIndex', () => {
  it('swap 2 rows (맨 앞과 맨 뒤 교환) 시 MOVE 패치 수 비교', () => {
    // old: A, B, C, D, E
    // new: E, B, C, D, A
    const prev = ul(['A', 'B', 'C', 'D', 'E']);
    const next = ul(['E', 'B', 'C', 'D', 'A']);

    // 1. LIS 모드: E와 A만 이동 (2개)
    const patchesLis = diff(prev, next, { reconcileMode: 'lis' });
    const movesLis = movesOf(patchesLis);
    expect(movesLis).toHaveLength(2);

    // 2. lastPlacedIndex 모드: E(4) 유지, B(1)<4, C(2)<4, D(3)<4, A(0)<4 모두 이동 (4개)
    const patchesLpi = diff(prev, next, { reconcileMode: 'lastPlacedIndex' });
    const movesLpi = movesOf(patchesLpi);
    expect(movesLpi).toHaveLength(4);
  });

  it('last to first (맨 뒤 항목을 맨 앞으로 이동) 시 MOVE 패치 수 비교', () => {
    // old: A, B, C, D
    // new: D, A, B, C
    const prev = ul(['A', 'B', 'C', 'D']);
    const next = ul(['D', 'A', 'B', 'C']);

    // LIS 모드: D만 앞으로 이동 (1개)
    const patchesLis = diff(prev, next, { reconcileMode: 'lis' });
    expect(movesOf(patchesLis)).toHaveLength(1);

    // lastPlacedIndex 모드: D(3) 유지, A(0)<3, B(1)<3, C(2)<3 모두 이동 (3개)
    const patchesLpi = diff(prev, next, { reconcileMode: 'lastPlacedIndex' });
    expect(movesOf(patchesLpi)).toHaveLength(3);
  });

  it('두 모드 모두 patch 후 실제 DOM 결과와 key 순서가 동일하다', () => {
    const scenarios = [
      { prev: ['A', 'B', 'C', 'D', 'E'], next: ['E', 'B', 'C', 'D', 'A'] }, // swap
      { prev: ['A', 'B', 'C', 'D'], next: ['D', 'A', 'B', 'C'] },           // last to first
      { prev: ['1', '2', '3', '4', '5'], next: ['5', '4', '3', '2', '1'] }, // reverse
      { prev: ['A', 'B', 'C'], next: ['B', 'D', 'A', 'E'] },                 // insert + move
      { prev: ['A', 'B', 'C', 'D'], next: ['C', 'A'] },                      // remove + move
    ];

    for (const { prev, next } of scenarios) {
      // Container 1: LIS
      // 이전 트리는 그린 그 트리를 그대로 넘긴다 (새로 만든 가상 노드에는 실제 DOM 참조가 없다)
      const containerLis = document.createElement('div');
      const prevLis = ul(prev);
      render(prevLis, containerLis);
      patch(containerLis, diff(prevLis, ul(next), { reconcileMode: 'lis' }));

      // Container 2: lastPlacedIndex
      const containerLpi = document.createElement('div');
      const prevLpi = ul(prev);
      render(prevLpi, containerLpi);
      patch(containerLpi, diff(prevLpi, ul(next), { reconcileMode: 'lastPlacedIndex' }));

      // DOM HTML 일치 검증
      expect(containerLis.innerHTML).toBe(containerLpi.innerHTML);

      // 텍스트 순서 일치 검증
      const lisTexts = [...containerLis.querySelectorAll('li')].map((el) => el.textContent);
      const lpiTexts = [...containerLpi.querySelectorAll('li')].map((el) => el.textContent);
      expect(lisTexts).toEqual(next);
      expect(lpiTexts).toEqual(next);
    }
  });

  it('생존 노드의 DOM 참조(===) 동일성이 유지된다', () => {
    const prev = ul(['A', 'B', 'C']);
    const next = ul(['C', 'B', 'A']);

    const container = document.createElement('div');
    render(prev, container);
    const [domA, domB, domC] = container.querySelectorAll('li');

    patch(container, diff(prev, next, { reconcileMode: 'lastPlacedIndex' }));
    const [newDomC, newDomB, newDomA] = container.querySelectorAll('li');

    expect(newDomC).toBe(domC);
    expect(newDomB).toBe(domB);
    expect(newDomA).toBe(domA);
  });
});

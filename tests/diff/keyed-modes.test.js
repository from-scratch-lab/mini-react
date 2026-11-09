import { describe, it, expect, vi, afterEach } from 'vitest';
import { diff, patch, h } from '../../src/index.js';
import { checkPair, checkTreePair, randomKeyedPair, randomTreePair, MODES } from '../../scripts/lib/keyed-fuzz.js';
import { mulberry32, PATTERNS, moveFraction, orderStats, range } from '../../scripts/bench/keyed-workloads.js';

// LIS 실험의 정확성 단계: 이동 판단만 다른 두 모드(lis, lastPlacedIndex)가 같은 결과를 내는지.
// 통과는 "이 생성기로 왜곡을 탐지하지 못했다"는 뜻이다. 패치 수·이동 수가 같은지는 기준이 아니다.
// CI에서는 각 fuzz를 200쌍만 돌린다. 1,000쌍씩은 `node scripts/fuzz-keyed.js`.
const PAIRS = 200;

afterEach(() => vi.restoreAllMocks());

const pass = (oldKeys, newKeys, opts) => expect(checkPair(document, oldKeys, newKeys, opts).problems).toEqual([]);

describe('reconcileMode 옵션', () => {
  it('기본값은 lis이고, 알 수 없는 값은 오류다', () => {
    const a = h('ul', null, h('li', { key: 'a' }, 'a'));
    expect(() => diff(a, a, { reconcileMode: 'nope' })).toThrow(/reconcileMode/);
  });

  it('맨 뒤 → 맨 앞: lis는 1번, lastPlacedIndex는 나머지를 모두 옮긴다 (판단만 다르다)', () => {
    const keys = range(6);
    const moved = (mode) => {
      const prev = h('ul', null, keys.map((k) => h('li', { key: k }, k)));
      diff(null, prev);
      const next = h('ul', null, [keys.at(-1), ...keys.slice(0, -1)].map((k) => h('li', { key: k }, k)));
      return diff(prev, next, { reconcileMode: mode }).filter((p) => p.type === 'MOVE').length;
    };
    expect(moved('lis')).toBe(1);
    expect(moved('lastPlacedIndex')).toBe(5);
  });

  it('stats는 앞뒤 건너뛰기만 탄 목록과 key로 짝지은 목록을 따로 센다 (li 안의 텍스트 목록도 목록 하나로 센다)', () => {
    const list = (keys) => h('ul', null, keys.map((k) => h('li', { key: k }, k)));
    const same = list(['a', 'b', 'c']);
    diff(null, same);
    const s1 = { lists: 0, fastPathOnly: 0, keyedMatch: 0, placementSkipped: 0, placementRuns: 0 };
    diff(same, list(['a', 'b', 'c']), { stats: s1 });
    expect(s1).toMatchObject({ lists: 4, fastPathOnly: 4, keyedMatch: 0 }); // ul 1 + li 3
    const prev = list(['a', 'b', 'c', 'd']);
    diff(null, prev);
    const s2 = { lists: 0, fastPathOnly: 0, keyedMatch: 0, placementSkipped: 0, placementRuns: 0 };
    diff(prev, list(['a', 'c', 'b', 'd']), { stats: s2 });
    expect(s2).toMatchObject({ lists: 5, fastPathOnly: 4, keyedMatch: 1, placementRuns: 1 }); // ul만 key 짝짓기
  });
});

describe('두 모드의 정확성: 경계 사례', () => {
  it.each([
    [[], []],
    [[], ['a']],
    [['a'], []],
    [['a'], ['a']],
    [['a'], ['b']],
    [['a', 'b'], ['b', 'a']],
    [['a', 'b'], ['a']],
    [['a', 'b'], ['c', 'a', 'b']],
    [['a', 'b', 'c'], ['c', 'x', 'a']],
  ])('%j → %j', (oldKeys, newKeys) => pass(oldKeys, newKeys));

  it.each(['swap', 'blockShift', 'reverse', 'shuffle'])('패턴 %s (N=200, 항목 요소 10개)', (name) => {
    const keys = range(200);
    pass(keys, PATTERNS[name](keys, mulberry32(7)), { level: 10 });
  });

  it('삽입·삭제·이동을 섞어도, 텍스트가 바뀌어도 맞다', () => {
    const keys = range(30);
    const next = moveFraction(keys, 25, mulberry32(3)).filter((k) => k !== 'k5');
    next.splice(10, 0, 'new1');
    pass(keys, next, { level: 3, texts: new Map([['k9', 'changed']]) });
  });
});

describe('fuzz', () => {
  it('keyed 집중 fuzz: 두 모드 모두 문제를 찾지 못했고, 앞뒤 건너뛰기 경로와 key 짝짓기 경로를 모두 거쳤다', () => {
    const rng = mulberry32(20261109);
    const paths = { fastPathOnly: 0, keyedMatch: 0, placementRuns: 0 };
    for (let round = 0; round < PAIRS; round += 1) {
      const { oldKeys, newKeys, level, texts } = randomKeyedPair(rng, round);
      const { problems, stats } = checkPair(document, oldKeys, newKeys, { level, texts });
      expect(problems, JSON.stringify({ round, oldKeys, newKeys, level })).toEqual([]);
      for (const key of Object.keys(paths)) paths[key] += stats[0][key];
    }
    expect(paths.fastPathOnly).toBeGreaterThan(0);
    expect(paths.keyedMatch).toBeGreaterThan(0);
    expect(paths.placementRuns).toBeGreaterThan(0);
  }, 30000);

  it('일반 트리 fuzz: key 있는·없는 자식이 섞인 트리에서도 두 모드의 결과가 새로 그린 것과 같다', () => {
    for (let seed = 1; seed <= PAIRS; seed += 1) {
      expect(checkTreePair(document, () => randomTreePair(seed)), `seed ${seed}`).toEqual([]);
    }
  }, 30000);

  it('작업 생성기의 순서 통계: 뒤집기는 LIS 1, 그대로는 nonLIS 0', () => {
    const keys = range(10);
    expect(orderStats(keys, PATTERNS.reverse(keys))).toMatchObject({ survivors: 10, lis: 1, nonLIS: 9 });
    expect(orderStats(keys, keys)).toMatchObject({ nonLIS: 0, pNonLIS: 0 });
  });
});

describe('중복 key (생성기는 만들지 않는다): 지금 동작 기록', () => {
  it.each(MODES)('%s: 경고하고 목록 전체를 위치로 비교한다', (mode) => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const list = (keys) => h('ul', null, keys.map((k, i) => h('li', { key: k }, `${k}${i}`)));
    const prev = list(['a', 'a', 'b']);
    const container = document.createElement('div');
    patch(container, diff(null, prev));
    const firstLi = container.querySelector('li');
    patch(container, diff(prev, list(['b', 'a', 'a']), { reconcileMode: mode }));
    expect(warn).toHaveBeenCalledOnce();
    // 위치 비교라 0번 자리끼리 짝짓는데 key가 a → b로 달라 REPLACE된다 (노드를 다시 만든다)
    expect(container.querySelector('li')).not.toBe(firstLi);
    expect(container.textContent).toBe('b0a1a2');
  });
});

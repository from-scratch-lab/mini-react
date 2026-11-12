/**
 * LIS 실험(docs/perf/lis-experiment.md)의 작업 생성기. Node(fuzz·테스트)와 브라우저(demo/bench/lis.html)가 같이 쓴다.
 *
 * 목록 하나 = <ul> 아래 key 있는 항목 N개. 같은 key의 항목은 언제나 같은 내용이다(내부 텍스트·속성 불변).
 * 갱신은 key 순서만 바꾼다(보조 조건: 마지막 항목 텍스트 변경, 1개 추가, 1개 삭제).
 * 모든 무작위는 시드가 있는 생성기(mulberry32)를 쓰므로 같은 시드면 같은 순열이다.
 */
import { h } from '../../src/index.js';
import { longestIncreasingSubsequence } from '../../src/diff/lis.js';

/** 시드가 있는 0~1 난수 생성기 */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * 항목 복잡도. 숫자는 항목 하나의 요소 수.
 *   1: <li>텍스트</li> (기준점 전용)
 *   3·10·50: 깊이 3 고정 <li><div><span>텍스트</span>…</div></li> (span = 요소 수 − 2)
 */
export const LEVELS = [1, 3, 10, 50];

export function item(key, level = 1, text = `item ${key}`) {
  if (level === 1) return h('li', { key }, text);
  const spans = [];
  for (let i = 0; i < level - 2; i += 1) spans.push(h('span', { class: `c${i % 4}` }, i === 0 ? text : `#${i}`));
  return h('li', { key }, h('div', { class: 'row' }, ...spans));
}

/** keys 순서의 목록. texts가 있으면 그 key의 텍스트를 바꾼다(보조 조건용). */
export function listView(keys, level = 1, texts = null) {
  return h('ul', { class: 'list' }, keys.map((k) => item(k, level, texts?.get(k))));
}

export const range = (n, start = 0) => Array.from({ length: n }, (_, i) => `k${start + i}`);

/** 갱신 패턴: 이전 key 배열 → 다음 key 배열 */
export const PATTERNS = {
  /** 1번째와 N−2번째 자리를 맞바꾼다 (js-framework-benchmark의 swap과 같은 자리) */
  swap(keys) {
    const next = keys.slice();
    if (next.length >= 4) [next[1], next[next.length - 2]] = [next[next.length - 2], next[1]];
    else if (next.length >= 2) [next[0], next[1]] = [next[1], next[0]];
    return next;
  },
  /** 10% 덩어리를 무작위 다른 자리로 옮긴다 */
  blockShift(keys, rng) {
    const n = keys.length;
    const size = Math.max(1, Math.round(n * 0.1));
    if (n <= size) return keys.slice();
    const start = Math.floor(rng() * (n - size + 1));
    const block = keys.slice(start, start + size);
    const rest = keys.slice(0, start).concat(keys.slice(start + size));
    let at = Math.floor(rng() * (rest.length + 1));
    if (at === start) at = (at + 1) % (rest.length + 1); // 제자리 방지
    return rest.slice(0, at).concat(block, rest.slice(at));
  },
  reverse(keys) {
    return keys.slice().reverse();
  },
  /** Fisher–Yates 전체 섞기 */
  shuffle(keys, rng) {
    const next = keys.slice();
    for (let i = next.length - 1; i > 0; i -= 1) {
      const j = Math.floor(rng() * (i + 1));
      [next[i], next[j]] = [next[j], next[i]];
    }
    return next;
  },
};

/** 이동 비율 k%: 노드 k%(최소 1개)를 골라 빼고, 하나씩 무작위 자리에 다시 넣는다 */
export function moveFraction(keys, percent, rng) {
  const n = keys.length;
  const m = Math.min(n, Math.max(1, Math.round((n * percent) / 100)));
  const picked = new Set();
  while (picked.size < m) picked.add(Math.floor(rng() * n));
  const moving = [...picked].map((i) => keys[i]);
  const next = keys.filter((_, i) => !picked.has(i));
  for (const key of moving) next.splice(Math.floor(rng() * (next.length + 1)), 0, key);
  return next;
}

/**
 * 순서 변화의 크기. 생존 노드(두 배열에 다 있는 key)의 "이전 위치"를 새 순서로 늘어놓은 수열의 LIS.
 * nonLIS = 생존 노드 중 LIS 밖에 있는 수 = LIS 방식의 이론 최소 이동 수, pNonLIS = 그 비율(%).
 */
export function orderStats(oldKeys, newKeys) {
  const index = new Map(oldKeys.map((k, i) => [k, i]));
  const seq = [];
  for (const k of newKeys) if (index.has(k)) seq.push(index.get(k));
  const lis = longestIncreasingSubsequence(seq).length;
  return { survivors: seq.length, lis, nonLIS: seq.length - lis, pNonLIS: seq.length ? ((seq.length - lis) / seq.length) * 100 : 0 };
}

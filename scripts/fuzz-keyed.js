#!/usr/bin/env node
/**
 * LIS 실험의 정확성 검사를 길게 돌린다 (CI는 tests/diff/keyed-modes.test.js에서 200쌍씩).
 *
 *   node scripts/fuzz-keyed.js                 keyed 집중 1,000쌍 + 일반 트리 1,000쌍 (시드 20261109)
 *   node scripts/fuzz-keyed.js --pairs 5000 --seed 7
 *
 * 두 모드(lis, lastPlacedIndex) 각각과 모드 사이에서 최종 DOM·key 순서·노드 정체성을 확인한다.
 * 문제가 있으면 쌍을 출력하고 종료 코드 1. 통과는 "왜곡을 탐지하지 못했다"는 뜻이다.
 */
import { JSDOM } from 'jsdom';

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : Number(args[i + 1]);
};
const pairs = opt('pairs', 1000);
const seed = opt('seed', 20261109);

const { window } = new JSDOM('<!doctype html><body></body>');
globalThis.window = window;
globalThis.document = window.document;
for (const name of ['Node', 'Element', 'HTMLElement', 'Text', 'DocumentFragment']) globalThis[name] = window[name];

const { checkPair, checkTreePair, randomKeyedPair, randomTreePair } = await import('./lib/keyed-fuzz.js');
const { mulberry32 } = await import('./bench/keyed-workloads.js');

let failures = 0;
const paths = { fastPathOnly: 0, keyedMatch: 0, placementRuns: 0, placementSkipped: 0 };
const rng = mulberry32(seed);
const t0 = performance.now();
for (let round = 0; round < pairs; round += 1) {
  const pair = randomKeyedPair(rng, round);
  const { problems, stats } = checkPair(document, pair.oldKeys, pair.newKeys, pair);
  for (const key of Object.keys(paths)) paths[key] += stats[0][key];
  if (problems.length && failures++ < 5) console.log('keyed', round, JSON.stringify(pair.oldKeys), JSON.stringify(pair.newKeys), problems);
}
for (let s = 1; s <= pairs; s += 1) {
  const problems = checkTreePair(document, () => randomTreePair(seed + s));
  if (problems.length && failures++ < 5) console.log('tree', seed + s, problems);
}
const ms = Math.round(performance.now() - t0);
console.log(`keyed ${pairs}쌍 + 일반 트리 ${pairs}쌍 · 시드 ${seed} · 문제 ${failures} · 경로 ${JSON.stringify(paths)} · ${ms}ms`);
process.exit(failures ? 1 : 0);

/**
 * LIS 실험 하네스 (docs/perf/lis-experiment.md). 브라우저 페이지 demo/bench/lis.html이 쓴다.
 *
 *   A: mini-react + LIS (reconcileMode 'lis')
 *   B: mini-react + 단방향 스캔 (reconcileMode 'lastPlacedIndex', React의 접근을 참고한 자체 구현)
 *   C: React 18.3.1 + ReactDOM 프로덕션 UMD, flushSync로 동기 커밋 (참고용 기준선, 인과 주장 금지). window.React·ReactDOM 필요
 *
 * 시간: T_Diff = diff 호출~반환, T_Commit = patch 호출~반환(DOM 조작 + 핸들러 표 교체), T_JS = 합.
 *   C는 diff와 commit이 나뉘지 않으므로 T_JS(flushSync 전체)만 있다.
 *   컨테이너 준비·처음 그리기·다음 트리 만들기는 타이머 밖이다. 반복마다 A·B 순서를 바꾼다.
 *   N < 100이면 컨테이너 100개를 미리 그려 두고 100번 갱신한 시간을 100으로 나눈다(배치).
 * DOM 지표: 계수기(dom-counter.js)를 붙인 실행을 시간 측정과 따로 한 번 돈다(결정적).
 * 측정용 컨테이너는 body 끝에 붙였다 뗀다 (scripts/bench/scenarios.js와 같은 방식).
 */
import { diff, patch, isTextVNode } from '../../src/index.js';
import { listView, range, PATTERNS, moveFraction, orderStats, mulberry32 } from './keyed-workloads.js';
import { countDomOps } from './dom-counter.js';

const WARMUP = 5;
const RUNS = 21;
const MAX_ROUNDS = 3; // IQR/중앙값이 5%를 넘으면 21회씩 최대 63회까지 늘린다 (파일럿 운영 기준)
const BATCH = 100;

// ---------- 조건 ----------
const BASE = { N: 1000, level: 1, pattern: 'shuffle', k: null, aux: null };

export const PROTOCOL = { WARMUP, RUNS, MAX_ROUNDS, BATCH };

export function conditions() {
  const list = [];
  const add = (axis, over) => list.push({ axis, ...BASE, ...over });
  for (const N of [10, 50, 100, 500, 1000, 5000]) add('size', { N, batchCheck: N === 100 || N === 500 });
  for (const k of [1, 5, 10, 25, 50, 100]) add('ratio', { pattern: null, k });
  for (const pattern of ['swap', 'blockShift', 'reverse', 'shuffle']) add('pattern', { pattern });
  for (const level of [3, 10, 50]) add('complexity', { level });
  for (const aux of ['textLast', 'insertOne', 'deleteOne']) add('aux', { pattern: null, aux });
  return list.map((c, i) => ({ id: `${c.axis}-${i}`, seed: 1000 + i, ...c }));
}

/** 조건 → 이전·다음 key 배열과 텍스트 변경 */
export function workload(c) {
  const rng = mulberry32(c.seed);
  const oldKeys = range(c.N);
  let newKeys = oldKeys;
  let texts = null;
  if (c.pattern) newKeys = PATTERNS[c.pattern](oldKeys, rng);
  else if (c.k != null) newKeys = moveFraction(oldKeys, c.k, rng);
  else if (c.aux === 'textLast') texts = new Map([[oldKeys.at(-1), 'changed']]);
  else if (c.aux === 'insertOne') newKeys = oldKeys.toSpliced(Math.floor(rng() * (c.N + 1)), 0, 'new');
  else if (c.aux === 'deleteOne') newKeys = oldKeys.toSpliced(Math.floor(rng() * c.N), 1);
  return { oldKeys, newKeys, texts };
}

// ---------- 통계 ----------
function quantile(sorted, q) {
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}
function summarize(values) {
  const s = [...values].sort((a, b) => a - b);
  const median = quantile(s, 0.5);
  const q1 = quantile(s, 0.25);
  const q3 = quantile(s, 0.75);
  const r = (x) => Math.round(x * 10000) / 10000;
  return { median: r(median), q1: r(q1), q3: r(q3), iqr: r(q3 - q1), n: s.length, spread: median > 0 ? r((q3 - q1) / median) : null };
}

// ---------- 실행 ----------
const doc = document;
function freshContainer() {
  const el = doc.createElement('div');
  el.className = 'lis-stage';
  doc.body.appendChild(el);
  return el;
}

/** A·B 한 번: 준비(타이머 밖) → diff → patch. 배치면 count개를 한 구간에서 돌린다 */
function timeEngine(mode, c, w, count) {
  const stages = [];
  for (let i = 0; i < count; i += 1) {
    const container = freshContainer();
    const prev = listView(w.oldKeys, c.level);
    patch(container, diff(null, prev));
    stages.push({ container, prev, next: listView(w.newKeys, c.level, w.texts), patches: null });
  }
  const t0 = performance.now();
  for (const s of stages) s.patches = diff(s.prev, s.next, { reconcileMode: mode });
  const t1 = performance.now();
  for (const s of stages) patch(s.container, s.patches);
  const t2 = performance.now();
  for (const s of stages) s.container.remove();
  return { diff: (t1 - t0) / count, commit: (t2 - t1) / count, js: (t2 - t0) / count };
}

// React 기준선: 우리 가상 트리를 같은 모양의 React 요소로 바꿔 그린다 (변환은 타이머 밖)
function toReact(vnode) {
  if (isTextVNode(vnode)) return vnode.props.nodeValue;
  const { class: className, ...rest } = vnode.props;
  const props = { ...rest, key: vnode.key ?? undefined, className };
  return window.React.createElement(vnode.type, props, ...vnode.children.map(toReact));
}
function timeReact(c, w, count) {
  const { ReactDOM } = window;
  const stages = [];
  for (let i = 0; i < count; i += 1) {
    const container = freshContainer();
    const root = ReactDOM.createRoot(container);
    ReactDOM.flushSync(() => root.render(toReact(listView(w.oldKeys, c.level))));
    stages.push({ container, root, next: toReact(listView(w.newKeys, c.level, w.texts)) });
  }
  const t0 = performance.now();
  for (const s of stages) ReactDOM.flushSync(() => s.root.render(s.next));
  const t1 = performance.now();
  for (const s of stages) {
    s.root.unmount();
    s.container.remove();
  }
  return { js: (t1 - t0) / count };
}

/** 계수기를 붙인 실행 (시간 측정과 분리, 한 번) */
function countEngine(mode, c, w) {
  const container = freshContainer();
  const prev = listView(w.oldKeys, c.level);
  patch(container, diff(null, prev));
  const stats = { lists: 0, fastPathOnly: 0, keyedMatch: 0, placementSkipped: 0, placementRuns: 0 };
  const patches = diff(prev, listView(w.newKeys, c.level, w.texts), { reconcileMode: mode, stats });
  const { counts } = countDomOps(container, () => patch(container, patches));
  container.remove();
  const kinds = {};
  for (const p of patches) kinds[p.type] = (kinds[p.type] ?? 0) + 1;
  return { counts, kinds, stats };
}
function countReact(c, w) {
  const { ReactDOM } = window;
  const container = freshContainer();
  const root = ReactDOM.createRoot(container);
  ReactDOM.flushSync(() => root.render(toReact(listView(w.oldKeys, c.level))));
  const next = toReact(listView(w.newKeys, c.level, w.texts));
  const { counts } = countDomOps(container, () => ReactDOM.flushSync(() => root.render(next)));
  root.unmount();
  container.remove();
  return { counts };
}

const pause = () => new Promise((resolve) => setTimeout(resolve, 0));

/** 한 조건: 웜업 → 21회(필요하면 63회까지) → 요약. engines = ['A','B'] 또는 ['A','B','C'] */
export async function runCondition(c, engines, { batch = c.N < 100 } = {}) {
  const w = workload(c);
  const count = batch ? BATCH : 1;
  const samples = Object.fromEntries(engines.map((e) => [e, []]));
  const once = (engine) =>
    engine === 'C' ? timeReact(c, w, count) : timeEngine(engine === 'A' ? 'lis' : 'lastPlacedIndex', c, w, count);
  for (let i = 0; i < WARMUP; i += 1) for (const e of engines) once(e);
  let rounds = 0;
  const spreadOk = () =>
    engines.every((e) => {
      const s = summarize(samples[e].map((x) => x.js));
      return s.spread !== null && s.spread <= 0.05;
    });
  do {
    for (let r = 0; r < RUNS; r += 1) {
      const order = r % 2 === 0 ? engines : [...engines].reverse(); // 반복마다 순서 교대
      for (const e of order) samples[e].push(once(e));
      await pause();
    }
    rounds += 1;
  } while (rounds < MAX_ROUNDS && !spreadOk());

  const result = { ...c, batch, batchSize: count, rounds, order: orderStats(w.oldKeys, w.newKeys), engines: {} };
  for (const e of engines) {
    const s = samples[e];
    const entry = { tJS: summarize(s.map((x) => x.js)) };
    if (e !== 'C') {
      entry.tDiff = summarize(s.map((x) => x.diff));
      entry.tCommit = summarize(s.map((x) => x.commit));
      Object.assign(entry, countEngine(e === 'A' ? 'lis' : 'lastPlacedIndex', c, w));
    } else {
      Object.assign(entry, countReact(c, w));
    }
    result.engines[e] = entry;
  }
  return result;
}

/** performance.now()의 최소 간격과 호출 비용 (기록만, 빈 루프 차감은 하지 않는다) */
export function timerInfo() {
  let minStep = Infinity;
  for (let i = 0; i < 2000; i += 1) {
    const a = performance.now();
    let b = performance.now();
    while (b === a) b = performance.now();
    minStep = Math.min(minStep, b - a);
  }
  const calls = 200000;
  const t0 = performance.now();
  for (let i = 0; i < calls; i += 1) performance.now();
  const callNs = ((performance.now() - t0) / calls) * 1e6;
  return { minStepMs: Math.round(minStep * 10000) / 10000, callOverheadNs: Math.round(callNs * 10) / 10, crossOriginIsolated: window.crossOriginIsolated };
}

export async function environment() {
  let battery = null;
  try {
    if (navigator.getBattery) {
      const b = await navigator.getBattery();
      battery = { charging: b.charging, level: b.level };
    }
  } catch {
    battery = null;
  }
  return {
    userAgent: navigator.userAgent,
    platform: navigator.userAgentData?.platform ?? navigator.platform,
    hardwareConcurrency: navigator.hardwareConcurrency,
    deviceMemoryGB: navigator.deviceMemory ?? null,
    battery,
    date: new Date().toISOString(),
    commit: new URLSearchParams(location.search).get('commit') ?? null,
    react: window.React?.version ?? null,
    reactDom: window.ReactDOM?.version ?? null,
  };
}


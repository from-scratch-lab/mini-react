/**
 * keyed 목록 정확성 검사 (LIS 실험의 "성능 측정 전 필수" 단계). tests/diff/keyed-modes.test.js와 scripts/fuzz-keyed.js가 쓴다.
 *
 * 한 쌍(이전 → 다음)을 두 모드(lis, lastPlacedIndex) 각각으로 diff·patch하고 확인한다.
 *   (1) 최종 DOM(구조·태그·속성·텍스트·순서)이 다음 트리를 처음부터 그린 것과 같다 (innerHTML 비교)
 *   (2) DOM의 항목 순서가 목표 key 순서와 같다 (DOM에 key를 쓰지 않으므로 다음 가상 트리의 vnode.dom으로 확인)
 *   (3) 살아남은 key의 노드는 이전과 같은 노드다 (===)
 *   (4) 새 key는 이전 노드를 다시 쓰지 않는다
 *   그리고 두 모드의 최종 DOM이 서로 같다.
 * 패치 수·이동 수가 모드끼리 같은지는 기준이 아니다(그것이 실험의 종속변수다).
 * 통과는 "이 생성기로는 왜곡을 탐지하지 못했다"는 뜻이다.
 */
import { diff, patch, h } from '../../src/index.js';
import { listView, mulberry32, PATTERNS, moveFraction } from '../bench/keyed-workloads.js';

export const MODES = ['lis', 'lastPlacedIndex'];

const emptyStats = () => ({ lists: 0, fastPathOnly: 0, keyedMatch: 0, placementSkipped: 0, placementRuns: 0 });

function mount(doc, vnode) {
  const container = doc.createElement('div');
  if (vnode) patch(container, diff(null, vnode));
  return container;
}

/** key → 실제 노드 (목록 하나, 형제 단위) */
const keyToDom = (list) => new Map(list.children.map((child) => [child.key, child.dom]));

/**
 * 한 모드로 이전 → 다음을 적용하고 문제 목록을 돌려준다.
 * makeOld·makeNew는 매번 새 가상 트리를 만드는 함수(모드마다 독립된 트리가 필요하다).
 */
export function checkMode(doc, makeOld, makeNew, mode) {
  const problems = [];
  const prev = makeOld();
  const container = mount(doc, prev);
  const before = keyToDom(prev);
  const next = makeNew();
  const stats = emptyStats();
  try {
    patch(container, diff(prev, next, { reconcileMode: mode, stats }));
  } catch (error) {
    return { problems: [`${mode}: 던짐 ${error.message}`], html: null, stats };
  }
  const expected = mount(doc, makeNew()).innerHTML;
  if (container.innerHTML !== expected) problems.push(`${mode}: 최종 DOM이 새로 그린 것과 다름`);
  const ul = container.firstChild;
  next.children.forEach((child, i) => {
    if (ul.childNodes[i] !== child.dom) problems.push(`${mode}: ${i}번째 자리가 key ${child.key}의 노드가 아님`);
  });
  if (ul.childNodes.length !== next.children.length) problems.push(`${mode}: 자식 수 ${ul.childNodes.length} ≠ ${next.children.length}`);
  const oldDoms = new Set(before.values());
  for (const child of next.children) {
    if (before.has(child.key)) {
      if (before.get(child.key) !== child.dom) problems.push(`${mode}: 살아남은 key ${child.key}의 노드가 바뀜`);
    } else if (oldDoms.has(child.dom)) {
      problems.push(`${mode}: 새 key ${child.key}가 이전 노드를 다시 씀`);
    }
  }
  return { problems, html: container.innerHTML, stats };
}

/** 두 모드 모두 검사하고 모드 사이 최종 DOM도 비교한다 */
export function checkPair(doc, oldKeys, newKeys, { level = 1, texts = null } = {}) {
  const makeOld = () => listView(oldKeys, level);
  const makeNew = () => listView(newKeys, level, texts);
  const results = MODES.map((mode) => checkMode(doc, makeOld, makeNew, mode));
  const problems = results.flatMap((r) => r.problems);
  if (results[0].html !== null && results[0].html !== results[1].html) problems.push('두 모드의 최종 DOM이 다름');
  return { problems, stats: results.map((r) => r.stats) };
}

/** keyed 집중 fuzz의 무작위 쌍: 삽입·삭제·이동·텍스트 변경을 섞는다. 중복 key는 만들지 않는다. */
export function randomKeyedPair(rng, round) {
  const n = Math.floor(rng() * 40);
  const oldKeys = Array.from({ length: n }, (_, i) => `k${i}`);
  let next = oldKeys.slice();
  const pick = rng();
  if (pick < 0.25) next = PATTERNS.shuffle(next, rng);
  else if (pick < 0.4) next = PATTERNS.reverse(next);
  else if (pick < 0.55) next = PATTERNS.blockShift(next, rng);
  else if (pick < 0.65) next = PATTERNS.swap(next);
  else if (next.length) next = moveFraction(next, 1 + Math.floor(rng() * 50), rng);
  const deletes = Math.floor(rng() * 4);
  for (let d = 0; d < deletes && next.length; d += 1) next.splice(Math.floor(rng() * next.length), 1);
  const inserts = Math.floor(rng() * 4);
  for (let a = 0; a < inserts; a += 1) next.splice(Math.floor(rng() * (next.length + 1)), 0, `n${round}_${a}`);
  const texts = rng() < 0.2 && next.length ? new Map([[next[Math.floor(rng() * next.length)], 'changed']]) : null;
  const level = [1, 1, 3, 10][Math.floor(rng() * 4)];
  return { oldKeys, newKeys: next, level, texts };
}

/**
 * 일반 트리 fuzz: key 있는·없는 자식이 섞인 무작위 트리 두 개. 같은 시드면 같은 쌍을 새로 만든다
 * (모드마다, 그리고 "새로 그린 정답"용으로 독립된 트리가 필요하다).
 */
export function randomTreePair(seed) {
  const rng = mulberry32(seed);
  const keys = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
  const tree = (depth) => {
    const n = Math.floor(rng() * 6);
    const used = new Set();
    const kids = [];
    for (let i = 0; i < n; i += 1) {
      if (rng() < 0.2) {
        kids.push(['x', 'y', 'z'][Math.floor(rng() * 3)]);
        continue;
      }
      let key;
      if (rng() < 0.7) {
        key = keys[Math.floor(rng() * keys.length)];
        if (used.has(key)) key = undefined; // 중복 key는 만들지 않는다
        else used.add(key);
      }
      const tag = ['div', 'span', 'li'][Math.floor(rng() * 3)];
      const props = key === undefined ? {} : { key };
      if (rng() < 0.3) props.class = ['p', 'q'][Math.floor(rng() * 2)];
      kids.push(depth > 0 ? h(tag, props, ...tree(depth - 1)) : h(tag, props, `t${Math.floor(rng() * 3)}`));
    }
    return kids;
  };
  return { a: h('div', null, ...tree(2)), b: h('div', null, ...tree(2)) };
}

/** 일반 트리 한 쌍을 두 모드로 검사 (트리를 모드마다 새로 만들기 위해 생성 함수를 받는다) */
export function checkTreePair(doc, makePair) {
  const problems = [];
  const htmls = MODES.map((mode) => {
    const { a, b } = makePair();
    const container = mount(doc, a);
    patch(container, diff(a, b, { reconcileMode: mode }));
    const expected = mount(doc, makePair().b).innerHTML;
    if (container.innerHTML !== expected) problems.push(`${mode}: 최종 DOM이 새로 그린 것과 다름`);
    return container.innerHTML;
  });
  if (htmls[0] !== htmls[1]) problems.push('두 모드의 최종 DOM이 다름');
  return problems;
}

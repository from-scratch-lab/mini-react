import { describe, it, expect, vi, afterEach } from 'vitest';
import { createElement as h, diff, patch, PatchType, TEXT_NODE } from '../../src/index.js';

afterEach(() => vi.restoreAllMocks());

// 시드가 고정된 난수 (실패하면 같은 입력으로 다시 재현할 수 있다)
function mulberry32(seed) {
  return function next() {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const TAGS = ['div', 'p', 'span', 'ul', 'li', 'b'];
const KEYS = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];

function randomProps(rand, pick) {
  const props = {};
  if (rand() < 0.5) props.class = pick(['x', 'y', 'z']);
  if (rand() < 0.3) props.title = pick(['t1', 't2']);
  return props;
}

function randomTree(rand, depth) {
  const pick = (xs) => xs[Math.floor(rand() * xs.length)];
  const props = randomProps(rand, pick);
  if (depth === 0) return h(pick(TAGS), props, pick(['가', '나', '다', '']));

  const count = Math.floor(rand() * 6);
  let children;
  if (rand() < 0.5) {
    // key 목록: 키 풀에서 겹치게 골라 섞는다 → 이동·추가·삭제가 섞여 나온다.
    // 태그도 무작위라 "같은 key, 다른 태그"(REPLACE 뒤 MOVE)가 생기고,
    // key 없는 형제가 섞이고(혼합), 가끔 같은 key가 두 번 나온다(중복 → 위치 비교).
    const keys = [...KEYS].sort(() => rand() - 0.5).slice(0, count);
    if (keys.length > 1 && rand() < 0.1) keys[1] = keys[0];
    children = keys.map((key) => h(pick(TAGS), { key, ...randomProps(rand, pick) }, key + pick(['', '!'])));
    if (rand() < 0.4) children.splice(Math.floor(rand() * (children.length + 1)), 0, h(pick(TAGS), null, '키없음'));
    if (rand() < 0.2) children.push('텍스트');
  } else {
    children = Array.from({ length: count }, () =>
      rand() < 0.3 ? pick(['텍스트', '글자']) : randomTree(rand, depth - 1),
    );
  }
  return h(pick(TAGS), props, ...children);
}

// 기대값은 patch와 무관한 가장 단순한 방법(createElement + setAttribute)으로 만든다.
// 같은 코드로 기대값을 만들면 속성 처리 버그가 양쪽에 똑같이 생겨 드러나지 않는다.
function referenceRender(vnode) {
  if (vnode.type === TEXT_NODE) return document.createTextNode(vnode.props.nodeValue);
  const el = document.createElement(vnode.type);
  for (const [name, value] of Object.entries(vnode.props)) el.setAttribute(name, value);
  for (const child of vnode.children) el.appendChild(referenceRender(child));
  return el;
}

// 속성 순서는 의미가 없으므로(기존 요소에 속성을 더하면 뒤에 붙는다) 정렬해서 비교한다.
function canonical(node) {
  if (node.nodeType === 3) return JSON.stringify(node.nodeValue);
  const attrs = [...node.attributes].map((a) => `${a.name}=${JSON.stringify(a.value)}`).sort().join(' ');
  return `<${node.localName} ${attrs}>[${[...node.childNodes].map(canonical).join(',')}]`;
}

function expectedOf(vnode) {
  const c = document.createElement('div');
  c.appendChild(referenceRender(vnode));
  return canonical(c);
}

describe('무작위 트리 비교 (fuzz)', () => {
  it('어떤 이전 트리에서 patch해도 결과 DOM은 새로 그린 다음 트리와 같다', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {}); // 중복 key 경고
    const rand = mulberry32(20261106);
    const seenTypes = new Set();
    for (let round = 0; round < 300; round += 1) {
      const container = document.createElement('div');
      let current = randomTree(rand, 3);
      patch(container, diff(null, current));

      for (let step = 0; step < 4; step += 1) {
        const next = randomTree(rand, 3);
        const expected = expectedOf(next);
        for (const p of patch(container, diff(current, next))) seenTypes.add(p.type);
        expect(canonical(container), `round ${round} step ${step}`).toBe(expected);
        current = next;
      }
    }
    // 무작위 입력이 모든 패치 종류를 실제로 거쳤는지 확인한다 (항상 통과하는 테스트가 되지 않도록).
    expect([...seenTypes].sort()).toEqual(Object.values(PatchType).sort());
  });
});

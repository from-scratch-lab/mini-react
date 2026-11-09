import { describe, it, expect } from 'vitest';
import { h, diff, patch, render, domToVNode, PatchType } from '../../src/index.js';

/**
 * patch 단계의 묶음 처리. diff가 만드는 패치 목록은 그대로이고, patch가 실제 DOM 연산만 줄인다.
 * - 같은 부모에 이어지는 CREATE들은 DocumentFragment 하나로 모아 한 번에 넣는다.
 * - 한 부모의 자식을 모두 지우는 REMOVE들은 한 번에 비운다.
 */

const SVG_NS = 'http://www.w3.org/2000/svg';

function mount(vnode) {
  const container = document.createElement('div');
  patch(container, diff(null, vnode));
  return container;
}

/** fn을 실행하는 동안 container 아래 DOM 변경 기록을 모은다 */
function recordsOf(container, fn) {
  const observer = new MutationObserver(() => {});
  observer.observe(container, { childList: true, subtree: true, attributes: true, characterData: true });
  const result = fn();
  const records = observer.takeRecords();
  observer.disconnect();
  return { result, records };
}

const keyed = (tag, keys, props = {}) => h(tag, null, keys.map((k) => h('li', { key: k, ...props }, k)));
const texts = (c, sel = 'li') => [...c.querySelectorAll(sel)].map((n) => n.textContent);

describe('연속 CREATE 묶기', () => {
  it('빈 부모에 여러 자식을 만들면 패치는 그대로, DOM 변경은 한 번이다', () => {
    const v1 = keyed('ul', []);
    const c = mount(v1);
    const v2 = keyed('ul', ['a', 'b', 'c', 'd']);
    const { result: patches, records } = recordsOf(c, () => patch(c, diff(v1, v2)));
    expect(patches.filter((p) => p.type === PatchType.CREATE)).toHaveLength(4);
    expect(records).toHaveLength(1);
    expect(records[0].addedNodes).toHaveLength(4);
    expect(texts(c)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('가운데에 이어서 끼워 넣어도 순서가 맞고 한 번에 넣는다', () => {
    const v1 = keyed('ul', ['a', 'e']);
    const c = mount(v1);
    const { records } = recordsOf(c, () => patch(c, diff(v1, keyed('ul', ['a', 'b', 'c', 'd', 'e']))));
    expect(texts(c)).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(records).toHaveLength(1);
  });

  it('기존 자식 사이사이에 흩어진 CREATE는 각자 제자리에 들어간다', () => {
    const v1 = keyed('ul', ['a', 'c']);
    const c = mount(v1);
    patch(c, diff(v1, keyed('ul', ['x', 'a', 'y', 'z', 'c', 'w'])));
    expect(texts(c)).toEqual(['x', 'a', 'y', 'z', 'c', 'w']);
  });

  it('이동(MOVE)과 생성이 섞여도 결과 순서가 맞다', () => {
    const v1 = keyed('ul', ['a', 'b', 'c']);
    const c = mount(v1);
    patch(c, diff(v1, keyed('ul', ['c', 'n1', 'n2', 'a', 'n3', 'b'])));
    expect(texts(c)).toEqual(['c', 'n1', 'n2', 'a', 'n3', 'b']);
  });

  it('빈 <svg>에 여러 도형을 만들어도 SVG 네임스페이스로 만든다', () => {
    const v1 = h('svg', null);
    const c = mount(v1);
    patch(c, diff(v1, h('svg', null, h('circle', { key: 1, r: 1 }), h('rect', { key: 2 }), h('g', { key: 3 }, h('path', null)))));
    for (const el of c.querySelectorAll('circle, rect, g, path')) expect(el.namespaceURI).toBe(SVG_NS);
  });

  it('<template> 안에 여러 자식을 만들면 content에 순서대로 들어간다', () => {
    const v1 = h('template', null);
    const c = mount(v1);
    patch(c, diff(v1, h('template', null, h('p', null, '1'), h('p', null, '2'), h('p', null, '3'))));
    const content = c.querySelector('template').content;
    expect([...content.childNodes].map((n) => n.textContent)).toEqual(['1', '2', '3']);
  });

  it('묶음 안의 노드를 만들다 실패하면 하나도 넣지 않는다 (되돌림 없는 patch 직접 호출)', () => {
    const v1 = keyed('ul', ['a']);
    const c = mount(v1);
    // diff는 뒤에서부터 만들므로 실패할 노드를 앞쪽(b)에 둔다: c·d는 이미 만든 뒤 b에서 실패한다
    const bad = h('ul', null, h('li', { key: 'a' }, 'a'), h('li', { key: 'b', 'bad name': '1' }, 'b'), h('li', { key: 'c' }, 'c'), h('li', { key: 'd' }, 'd'));
    expect(() => patch(c, diff(v1, bad))).toThrow();
    expect(c.innerHTML).toBe('<ul><li>a</li></ul>');
  });

  it('render에서 실패하면 직전 화면으로 되돌리고 다음 render도 맞다', () => {
    const c = document.createElement('div');
    render(keyed('ul', ['a']), c);
    const bad = h('ul', null, h('li', { key: 'a' }, 'a'), h('li', { key: 'b', 'bad name': '1' }, 'b'), h('li', { key: 'c' }, 'c'));
    expect(() => render(bad, c)).toThrow();
    expect(c.innerHTML).toBe('<ul><li>a</li></ul>');
    render(keyed('ul', ['a', 'z']), c);
    expect(texts(c)).toEqual(['a', 'z']);
  });
});

describe('전체 지우기 빠른 경로', () => {
  it('자식을 모두 지우면 DOM 변경은 한 번이다', () => {
    const v1 = keyed('ul', ['a', 'b', 'c', 'd']);
    const c = mount(v1);
    const { result: patches, records } = recordsOf(c, () => patch(c, diff(v1, keyed('ul', []))));
    expect(patches.filter((p) => p.type === PatchType.REMOVE)).toHaveLength(4);
    expect(records).toHaveLength(1);
    expect(c.innerHTML).toBe('<ul></ul>');
  });

  it('전부 바꾸면(모두 지우고 모두 만들기) DOM 변경은 두 번이다', () => {
    const v1 = keyed('ul', ['a', 'b', 'c']);
    const c = mount(v1);
    const { records } = recordsOf(c, () => patch(c, diff(v1, keyed('ul', ['x', 'y', 'z']))));
    expect(records).toHaveLength(2);
    expect(texts(c)).toEqual(['x', 'y', 'z']);
  });

  it('가상 트리에 없는 공백 텍스트가 섞인 부모(attach)는 하나씩 지워 공백을 남긴다 (지금과 같은 결과)', () => {
    const c = document.createElement('div');
    c.innerHTML = '<ul>\n  <li>a</li>\n  <li>b</li>\n</ul>';
    const v1 = domToVNode(c.firstChild, { attach: true });
    patch(c, diff(v1, h('ul', null)));
    expect(c.innerHTML).toBe('<ul>\n  \n  \n</ul>');
  });

  it('일부만 지우면 지운 노드만 사라진다', () => {
    const v1 = keyed('ul', ['a', 'b', 'c']);
    const c = mount(v1);
    patch(c, diff(v1, keyed('ul', ['b'])));
    expect(texts(c)).toEqual(['b']);
  });

  it('<template> 안을 모두 지워도 content가 빈다', () => {
    const v1 = h('template', null, h('p', null, '1'), h('p', null, '2'));
    const c = mount(v1);
    patch(c, diff(v1, h('template', null)));
    expect(c.querySelector('template').content.childNodes).toHaveLength(0);
  });

  it('지운 뒤 다시 그려도 기억한 트리와 DOM이 맞는다', () => {
    const c = document.createElement('div');
    render(keyed('ul', ['a', 'b']), c);
    render(keyed('ul', []), c);
    render(keyed('ul', ['c', 'd']), c);
    expect(texts(c)).toEqual(['c', 'd']);
  });
});

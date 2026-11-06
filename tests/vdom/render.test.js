import { describe, it, expect } from 'vitest';
import { createElement as h, render, cloneVNode } from '../../src/index.js';

describe('render', () => {
  it('처음에는 전체를 그리고, 다시 부르면 바뀐 부분만 patch한다', () => {
    const c = document.createElement('div');
    render(h('ul', null, h('li', null, 'a'), h('li', null, 'b')), c);
    const firstLi = c.querySelector('li');

    const patches = render(h('ul', null, h('li', null, 'a'), h('li', null, 'B')), c);
    expect(c.innerHTML).toBe('<ul><li>a</li><li>B</li></ul>');
    expect(c.querySelector('li')).toBe(firstLi);
    expect(patches).toHaveLength(1);
  });

  it('null을 렌더하면 비운다', () => {
    const c = document.createElement('div');
    render(h('p', null, 'x'), c);
    render(null, c);
    expect(c.innerHTML).toBe('');
  });

  it('patch가 중간에 실패하면 실제 DOM을 직전 트리로 되돌리고 오류를 다시 던진다', () => {
    const c = document.createElement('div');
    render(h('div', null, h('p', null, 'a')), c);
    const p = c.querySelector('p');
    // 텍스트 변경(TEXT)이 먼저 적용된 뒤, 잘못된 속성 이름에서 실패한다.
    expect(() => render(h('div', null, h('p', null, 'b'), h('span', { 'bad name': '1' })), c)).toThrow();
    expect(c.innerHTML).toBe('<div><p>a</p></div>');
    // 기억한 트리와 실제 DOM이 맞으므로, 다음 render도 올바르게 동작한다.
    render(h('div', null, h('p', null, 'c')), c);
    expect(c.innerHTML).toBe('<div><p>c</p></div>');
    expect(c.querySelector('p')).toBe(p);
  });

  it('되돌릴 때 줄바꿈 공백 텍스트 노드도 그대로 맞춘다 (중복으로 만들지 않는다)', () => {
    const c = document.createElement('div');
    render(h('div', null, h('b', null, 'a'), '\n  ', h('i', null, 'b')), c);
    expect(() => render(h('div', null, h('b', null, 'x'), h('span', { 'bad name': '1' })), c)).toThrow();
    expect(c.firstChild.childNodes).toHaveLength(3);
    expect(c.innerHTML).toBe('<div><b>a</b>\n  <i>b</i></div>');
  });

  it('첫 render가 실패하면 컨테이너를 비운 상태로 되돌린다', () => {
    const c = document.createElement('div');
    expect(() => render(h('div', null, h('p', null, 'a'), h('span', { 'bad name': '1' })), c)).toThrow();
    expect(c.innerHTML).toBe('');
    render(h('p', null, 'ok'), c);
    expect(c.innerHTML).toBe('<p>ok</p>');
  });

  it('같은 가상 트리를 다시 렌더하면 패치가 없다', () => {
    const c = document.createElement('div');
    const v = h('p', { id: 'a' }, 'x');
    render(v, c);
    expect(render(cloneVNode(v), c)).toEqual([]);
  });
});

describe('cloneVNode', () => {
  it('dom 참조 없이 깊은 복사를 한다', () => {
    const v = h('p', null, 'x');
    v.dom = 'P';
    const copy = cloneVNode(v);
    expect(copy).toEqual(v);
    expect(copy).not.toBe(v);
    expect(copy.children[0]).not.toBe(v.children[0]);
    expect(copy.dom).toBeNull();
  });
});

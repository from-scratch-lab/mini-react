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

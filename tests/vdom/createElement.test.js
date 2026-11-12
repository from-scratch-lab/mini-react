import { describe, it, expect } from 'vitest';
import { createElement as h, TEXT_NODE } from '../../src/index.js';

const text = (value) => ({ type: TEXT_NODE, props: { nodeValue: value }, key: null, children: [] });

describe('createElement', () => {
  it('타입·props·자식으로 가상 노드를 만든다', () => {
    const v = h('div', { id: 'a' }, h('span', null, 'hi'));
    expect(v).toEqual({
      type: 'div',
      props: { id: 'a' },
      key: null,
      children: [{ type: 'span', props: {}, key: null, children: [text('hi')] }],
    });
  });

  it('문자열과 숫자 자식은 텍스트 노드가 된다 (0도 포함)', () => {
    expect(h('p', null, 'a', 1, 0).children).toEqual([text('a'), text('1'), text('0')]);
  });

  it('null·undefined·boolean 자식은 버린다', () => {
    expect(h('p', null, null, false, true, undefined, 'x').children).toEqual([text('x')]);
  });

  it('중첩 배열 자식을 평탄화한다', () => {
    const v = h('ul', null, [[h('li', null, 'a')], h('li', null, 'b')]);
    expect(v.children.map((c) => c.children[0].props.nodeValue)).toEqual(['a', 'b']);
  });

  it('key를 props에서 꺼내 문자열로 저장한다', () => {
    const v = h('li', { key: 1, id: 'x' });
    expect(v.key).toBe('1');
    expect(v.props).toEqual({ id: 'x' });
  });

  it('위치 인자 자식이 없으면 props.children을 자식으로 쓴다', () => {
    expect(h('p', { children: 'hello' }).children).toEqual([text('hello')]);
    expect(h('p', { children: ['a', 'b'] }).children).toEqual([text('a'), text('b')]);
    // 위치 인자가 있으면 그쪽이 우선이다
    expect(h('p', { children: 'x' }, 'y').children).toEqual([text('y')]);
    expect(h('p', { children: 'x' }).props).toEqual({});
  });

  it('가상 노드가 아닌 객체 자식은 TypeError를 던진다', () => {
    expect(() => h('p', null, { foo: 1 })).toThrow(TypeError);
  });

  it('실제 DOM 참조(dom)는 열거되지 않아 비교·직렬화에 섞이지 않는다', () => {
    const v = h('p', null, 'a');
    expect(Object.keys(v)).not.toContain('dom');
    expect(v.dom).toBeNull();
    expect(JSON.stringify(v)).not.toContain('dom');
  });
});

import { describe, it, expect } from 'vitest';
import { VNodeHistory } from '../../demo/phase1/history.js';
import { createElement as h } from '../../src/index.js';

const v = (label) => h('p', null, label);
const label = (vnode) => vnode.children[0].props.nodeValue;

describe('VNodeHistory', () => {
  it('처음 상태 하나로 시작한다', () => {
    const history = new VNodeHistory(v('0'));
    expect(label(history.current)).toBe('0');
    expect(history.index).toBe(0);
    expect(history.length).toBe(1);
    expect(history.canBack).toBe(false);
    expect(history.canForward).toBe(false);
  });

  it('push 후 뒤로·앞으로 이동한다', () => {
    const history = new VNodeHistory(v('0'));
    history.push(v('1'));
    history.push(v('2'));
    expect(label(history.back())).toBe('1');
    expect(label(history.back())).toBe('0');
    expect(history.back()).toBeNull();
    expect(label(history.forward())).toBe('1');
    expect(history.canForward).toBe(true);
  });

  it('중간에서 push하면 앞쪽 기록을 버린다', () => {
    const history = new VNodeHistory(v('0'));
    history.push(v('1'));
    history.push(v('2'));
    history.back();
    history.back();
    history.push(v('x'));
    expect(history.length).toBe(2);
    expect(history.canForward).toBe(false);
    expect(label(history.current)).toBe('x');
  });

  it('go(index)로 특정 기록으로 이동한다', () => {
    const history = new VNodeHistory(v('0'));
    history.push(v('1'));
    history.push(v('2'));
    expect(label(history.go(0))).toBe('0');
    expect(history.go(5)).toBeNull();
    expect(history.index).toBe(0);
  });

  it('저장한 기록은 복사본이라, 넣은 뒤 원본을 바꿔도 영향이 없다', () => {
    const original = v('0');
    const history = new VNodeHistory(original);
    original.children[0].props.nodeValue = '바뀜';
    expect(label(history.current)).toBe('0');
  });

  it('꺼낸 기록을 바꿔도 저장된 기록은 그대로다', () => {
    const history = new VNodeHistory(v('0'));
    history.current.children[0].props.nodeValue = '바뀜';
    expect(label(history.current)).toBe('0');
  });
});

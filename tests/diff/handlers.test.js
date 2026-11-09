import { describe, it, expect, vi } from 'vitest';
import { h, diff, patch, render, PatchType } from '../../src/index.js';

/**
 * 핸들러 교체는 DOM을 바꾸지 않는다. 그래서 함수 → 다른 함수로 바뀐 on* 속성은 PROPS 패치로 만들지 않고,
 * patches.handlers(교체 목록)에 따로 담아 patch가 모든 DOM 패치를 마친 뒤 갈아 끼운다.
 */

const propsPatches = (patches) => patches.filter((p) => p.type === PatchType.PROPS);

// 렌더 번호 r을 기억하는 핸들러로 목록을 그린다. 클릭하면 log에 "r:id"가 남는다.
function list(ids, r, log) {
  return h(
    'ul',
    null,
    ids.map((id) => h('li', { key: id, onClick: () => log.push(`${r}:${id}`) }, id)),
  );
}

describe('핸들러 교체 (함수 → 다른 함수)', () => {
  it('핸들러만 바뀌면 패치를 만들지 않고 교체 목록에만 담는다', () => {
    const c = document.createElement('div');
    const log = [];
    render(list(['a', 'b', 'c'], 1, log), c);
    const patches = render(list(['a', 'b', 'c'], 2, log), c);
    expect(patches).toEqual([]);
    expect(patches.handlers).toHaveLength(3);
  });

  it('교체한 뒤 클릭하면 가장 최근 렌더의 핸들러가 불린다', () => {
    const c = document.createElement('div');
    const log = [];
    render(list(['a', 'b'], 1, log), c);
    render(list(['a', 'b'], 2, log), c);
    c.querySelectorAll('li')[1].click();
    expect(log).toEqual(['2:b']);
  });

  it('다른 속성과 함께 바뀌면 PROPS에는 그 속성만 남는다', () => {
    const v1 = h('button', { class: 'a', onClick: () => {} });
    const v2 = h('button', { class: 'b', onClick: () => {} });
    const c = document.createElement('div');
    render(v1, c);
    const patches = render(v2, c);
    expect(propsPatches(patches)).toHaveLength(1);
    expect(propsPatches(patches)[0].set).toEqual({ class: 'b' });
    expect(patches.handlers).toHaveLength(1);
  });

  it('같은 함수면 교체 목록에도 넣지 않는다', () => {
    const fn = () => {};
    const c = document.createElement('div');
    render(h('button', { onClick: fn }), c);
    expect(render(h('button', { onClick: fn }), c).handlers).toEqual([]);
  });

  it('key로 옮긴 요소는 자기 핸들러를 그대로 가져간다', () => {
    const c = document.createElement('div');
    const log = [];
    render(list(['a', 'b', 'c'], 1, log), c);
    render(list(['c', 'a', 'b'], 2, log), c);
    const items = c.querySelectorAll('li');
    items[0].click();
    items[2].click();
    expect([...items].map((li) => li.textContent)).toEqual(['c', 'a', 'b']);
    expect(log).toEqual(['2:c', '2:b']);
  });

  it('핸들러를 새로 달거나 떼거나 문자열로 바꾸는 것은 지금처럼 PROPS다', () => {
    const fn = () => {};
    const c = document.createElement('div');
    render(h('button', null), c);
    expect(propsPatches(render(h('button', { onClick: fn }), c))).toHaveLength(1);
    expect(propsPatches(render(h('button', { onClick: 'go()' }), c))).toHaveLength(1);
    expect(c.firstChild.getAttribute('onclick')).toBe('go()');
    expect(propsPatches(render(h('button', { onClick: fn }), c))).toHaveLength(1);
    expect(c.firstChild.getAttribute('onclick')).toBeNull();
    expect(propsPatches(render(h('button', null), c))).toHaveLength(1);
  });

  it('patch가 중간에 실패하면 핸들러도 직전 렌더 것으로 남는다', () => {
    const c = document.createElement('div');
    const first = vi.fn();
    const second = vi.fn();
    render(h('div', null, h('button', { onClick: first }, 'go')), c);
    const button = c.querySelector('button');
    // 핸들러 교체 뒤쪽에서 잘못된 속성 이름으로 patch가 실패한다
    expect(() => render(h('div', null, h('button', { onClick: second }, 'go'), h('span', { 'bad name': '1' })), c)).toThrow();
    button.click();
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).not.toHaveBeenCalled();
  });

  it('되돌림 없이 diff·patch를 직접 써도, 실패하면 화면과 핸들러가 함께 직전 렌더에 머문다', () => {
    // render()는 실패하면 restore로 DOM과 핸들러를 되돌리지만, Phase 1·벤치처럼 diff·patch를 직접 쓰면 되돌림이 없다.
    const c = document.createElement('div');
    const first = vi.fn();
    const second = vi.fn();
    const v1 = h('div', null, h('button', { onClick: first, class: 'x' }, 'go'), h('span', null));
    patch(c, diff(null, v1));
    const v2 = h('div', null, h('button', { onClick: second, class: 'x' }, 'go'), h('span', { 'bad name': '1' }));
    expect(() => patch(c, diff(v1, v2))).toThrow();
    c.querySelector('button').click();
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).not.toHaveBeenCalled();
  });

  it('diff 결과를 비교(toEqual)할 때 교체 목록은 섞이지 않는다', () => {
    const patches = diff(h('a', { onClick: () => {} }), h('a', { onClick: () => {} }));
    expect(Object.keys(patches)).toEqual([]);
    expect(patches.handlers).toHaveLength(1);
  });

  it('REPLACE로 새로 만든 요소에는 새 핸들러만 달린다', () => {
    const c = document.createElement('div');
    const log = [];
    render(h('div', null, h('button', { onClick: () => log.push('old') })), c);
    render(h('div', null, h('a', { onClick: () => log.push('new') })), c);
    c.querySelector('a').click();
    expect(log).toEqual(['new']);
  });
});

import { describe, it, expect, vi, afterEach } from 'vitest';
import { createElement as h, diff, PatchType } from '../../src/index.js';

const types = (patches) => patches.map((p) => p.type);
const li = (key, label = key) => h('li', { key }, label);

afterEach(() => vi.restoreAllMocks());

describe('diff: 최소 변경을 찾는 다섯 가지 경우', () => {
  it('같은 트리면 패치가 없다', () => {
    expect(diff(h('div', { id: 'a' }, 'x'), h('div', { id: 'a' }, 'x'))).toEqual([]);
  });

  it('1. 새 자식이 생기면 CREATE', () => {
    const next = h('ul', null, h('li', null, 'a'), h('li', null, 'b'));
    const patches = diff(h('ul', null, h('li', null, 'a')), next);
    expect(types(patches)).toEqual([PatchType.CREATE]);
    expect(patches[0].vnode).toBe(next.children[1]);
    expect(patches[0].parent).toBe(next);
    expect(patches[0].before).toBeNull();
  });

  it('2. 자식이 사라지면 REMOVE', () => {
    const prev = h('ul', null, h('li', null, 'a'), h('li', null, 'b'));
    const patches = diff(prev, h('ul', null, h('li', null, 'a')));
    expect(types(patches)).toEqual([PatchType.REMOVE]);
    expect(patches[0].vnode).toBe(prev.children[1]);
  });

  it('3. 같은 자리의 태그가 바뀌면 하위 트리째 REPLACE', () => {
    const prev = h('div', null, h('p', null, 'a'));
    const next = h('div', null, h('span', null, 'a'));
    const patches = diff(prev, next);
    expect(types(patches)).toEqual([PatchType.REPLACE]);
    expect(patches[0].oldVNode).toBe(prev.children[0]);
    expect(patches[0].vnode).toBe(next.children[0]);
  });

  it('4. 속성이 바뀌면 PROPS (바뀐 것은 set, 사라진 것은 remove)', () => {
    const patches = diff(h('div', { id: 'a', class: 'x' }), h('div', { id: 'b', title: 't' }));
    expect(patches).toHaveLength(1);
    expect(patches[0]).toMatchObject({
      type: PatchType.PROPS,
      set: { id: 'b', title: 't' },
      remove: ['class'],
    });
  });

  it('5. 텍스트가 바뀌면 TEXT', () => {
    const patches = diff(h('p', null, 'a'), h('p', null, 'b'));
    expect(patches).toHaveLength(1);
    expect(patches[0]).toMatchObject({ type: PatchType.TEXT, value: 'b' });
  });
});

describe('diff: 루트', () => {
  it('이전 트리가 없으면 루트 CREATE (부모 없음)', () => {
    const next = h('div');
    expect(diff(null, next)).toEqual([{ type: PatchType.CREATE, parent: null, vnode: next, before: null }]);
  });

  it('다음 트리가 없으면 루트 REMOVE', () => {
    const prev = h('div');
    expect(diff(prev, null)).toEqual([{ type: PatchType.REMOVE, vnode: prev }]);
  });

  it('루트의 key가 바뀌면 REPLACE', () => {
    expect(types(diff(h('div', { key: 'a' }), h('div', { key: 'b' })))).toEqual([PatchType.REPLACE]);
  });
});

describe('diff: key가 있는 자식 목록', () => {
  it('마지막 노드를 맨 앞으로 옮기면 MOVE 한 번', () => {
    const patches = diff(
      h('ul', null, li('a'), li('b'), li('c'), li('d')),
      h('ul', null, li('d'), li('a'), li('b'), li('c')),
    );
    expect(types(patches)).toEqual([PatchType.MOVE]);
    expect(patches[0].vnode.key).toBe('d');
  });

  it('첫 노드를 맨 뒤로 옮겨도 MOVE 한 번 (LIS로 나머지는 고정)', () => {
    const patches = diff(
      h('ul', null, li('a'), li('b'), li('c'), li('d')),
      h('ul', null, li('b'), li('c'), li('d'), li('a')),
    );
    expect(types(patches)).toEqual([PatchType.MOVE]);
    expect(patches[0].vnode.key).toBe('a');
  });

  it('key로 짝을 찾은 노드끼리 내용을 비교한다', () => {
    const patches = diff(
      h('ul', null, li('a', '1'), li('b', '2')),
      h('ul', null, li('b', '2!'), li('a', '1')),
    );
    expect(types(patches).sort()).toEqual([PatchType.MOVE, PatchType.TEXT].sort());
    expect(patches.find((p) => p.type === PatchType.TEXT).value).toBe('2!');
  });

  it('맨 앞에 추가할 때 key가 있으면 CREATE 하나, 없으면 위치로 비교해 TEXT가 줄줄이 생긴다', () => {
    const keyed = diff(
      h('ul', null, li('x'), li('y')),
      h('ul', null, li('z'), li('x'), li('y')),
    );
    expect(types(keyed)).toEqual([PatchType.CREATE]);

    const unkeyed = diff(
      h('ul', null, h('li', null, 'x'), h('li', null, 'y')),
      h('ul', null, h('li', null, 'z'), h('li', null, 'x'), h('li', null, 'y')),
    );
    expect(types(unkeyed).sort()).toEqual([PatchType.CREATE, PatchType.TEXT, PatchType.TEXT].sort());
  });

  it('key가 사라지고 생기면 REMOVE와 CREATE', () => {
    const patches = diff(h('ul', null, li('a'), li('b')), h('ul', null, li('a'), li('c')));
    expect(types(patches).sort()).toEqual([PatchType.CREATE, PatchType.REMOVE].sort());
  });

  it('같은 key가 중복되면 경고하고 위치로 비교한다', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const patches = diff(h('ul', null, li('a', '1'), li('a', '2')), h('ul', null, li('a', '1'), li('a', '3')));
    expect(warn).toHaveBeenCalled();
    expect(types(patches)).toEqual([PatchType.TEXT]);
  });
});

describe('diff: 같은 vnode 객체를 다시 쓸 때', () => {
  it('이전 트리와 같은 객체면 하위 트리를 비교하지 않고 건너뛴다', () => {
    const v = h('p', null, 'a');
    expect(diff(v, v)).toEqual([]);
    const item = h('li', null, 'x');
    expect(diff(h('ul', null, item), h('ul', null, item))).toEqual([]);
  });

  it('PROPS 패치는 자식 패치 뒤에 온다 (select value가 새 option을 찾을 수 있게)', () => {
    const patches = diff(
      h('select', { value: 'a' }, h('option', { value: 'a' }, 'A')),
      h('select', { value: 'b' }, h('option', { value: 'a' }, 'A'), h('option', { value: 'b' }, 'B')),
    );
    expect(types(patches)).toEqual([PatchType.CREATE, PatchType.PROPS]);
  });
});

describe('diff: 실제 DOM 참조 넘기기', () => {
  it('재사용하는 노드의 dom 참조를 새 가상 노드로 옮긴다', () => {
    const prev = h('p', null, 'a');
    prev.dom = 'P';
    prev.children[0].dom = 'T';
    const next = h('p', null, 'b');
    diff(prev, next);
    expect(next.dom).toBe('P');
    expect(next.children[0].dom).toBe('T');
  });
});

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

describe('diff: 자식 목록 빠른 경로 (앞뒤 공통 구간)', () => {
  const ul = (...items) => h('ul', null, ...items);
  const tagged = (patches) => patches.map((p) => [p.type, p.vnode.key ?? p.vnode.props.nodeValue ?? null]);

  it('앞뒤가 같고 가운데 세 행이 뒤집히면 가운데만 비교해 두 번 옮긴다 (최소)', () => {
    const before = ul(li('a'), li('b'), li('c'), li('d'), li('e'));
    diff(null, before);
    const moved = tagged(diff(before, ul(li('a'), li('d'), li('c'), li('b'), li('e'))));
    expect(moved.map(([type]) => type)).toEqual(['MOVE', 'MOVE']);
    expect(moved.every(([, key]) => ['b', 'c', 'd'].includes(key))).toBe(true);
  });

  it('key 없는 자식은 뒤에서부터 맞추지 않는다: 앞에서부터 센 순번으로 짝짓는다', () => {
    const before = ul(h('li', null, 'x'), h('li', null, 'y'));
    diff(null, before);
    // 맨 앞에 key 없는 항목이 생기면 순번이 밀린다: 0↔0, 1↔1은 텍스트만 바뀌고 2번이 새로 생긴다
    expect(types(diff(before, ul(h('li', null, 'new'), h('li', null, 'x'), h('li', null, 'y'))))).toEqual([
      'TEXT',
      'TEXT',
      'CREATE',
    ]);
  });

  it('가운데에 새 행이 생기면 뒤쪽 공통 구간의 첫 행 앞에 넣는다', () => {
    const before = ul(li('a'), li('b'), li('c'));
    diff(null, before);
    const after = ul(li('a'), li('x'), li('b'), li('c'));
    const patches = diff(before, after);
    expect(patches.map((p) => p.type)).toEqual(['CREATE']);
    expect(patches[0].before).toBe(after.children[2]); // 새 트리의 b (뒤쪽 구간의 첫 행)
    expect(patches[0].before.key).toBe('b');
  });

  it("key 1과 '1'은 같은 key로 보고 중복을 경고한다", () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const before = ul(li(1), li('1'));
    diff(null, before);
    diff(before, ul(li(1), li('1')));
    expect(warn).toHaveBeenCalledOnce();
  });

  it('같은 데이터로 다시 그리면 패치가 없다 (1,000행)', () => {
    const rows = (n) => ul(...Array.from({ length: n }, (_, i) => li(`r${i}`, `row ${i}`)));
    const before = rows(1000);
    diff(null, before);
    expect(diff(before, rows(1000))).toEqual([]);
  });
});

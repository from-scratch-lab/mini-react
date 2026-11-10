import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FunctionComponent, useEffect, useFrame, useScene, useState } from '../src/core/component';
import { h, type Child } from '../src/core/element';
import { spriteNode, type SpriteSlot } from '../src/core/scene';
import { diff } from '../src/core/diff';

const roots: FunctionComponent<{}>[] = [];
let callbacks: Map<number, FrameRequestCallback>, nextId: number;
function frame(time: number) { const batch = [...callbacks.values()]; callbacks.clear(); batch.forEach(callback => callback(time)); }
function mount(component: () => Child) {
  const element = document.createElement('div'); document.body.append(element);
  const root = new FunctionComponent(component, element, {}); roots.push(root); root.mount(); return { root, element };
}
beforeEach(() => { callbacks = new Map(); nextId = 0;
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => { callbacks.set(++nextId, callback); return nextId; });
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(id => { callbacks.delete(id); });
});
afterEach(() => { roots.forEach(root => root.unmount()); roots.length = 0; document.body.replaceChildren(); vi.restoreAllMocks(); });

describe('useFrame', () => {
  it('isolates batching: three setters in a normal rAF commit three times, useFrame commits once', () => {
    const ordinary: number[] = [], batched: number[] = [];
    mount(() => {
      const [n, set] = useState(0);
      useEffect(() => { const id = requestAnimationFrame(() => { set(x => x + 1); set(x => x + 1); set(x => x + 1); });
        return () => cancelAnimationFrame(id); }, []);
      useEffect(() => { ordinary.push(n); }); return n;
    });
    mount(() => {
      const [n, set] = useState(0);
      useFrame(() => { set(x => x + 1); set(x => x + 1); set(x => x + 1); });
      useEffect(() => { batched.push(n); }); return n;
    });
    frame(0); expect(ordinary).toEqual([0, 1, 2, 3]); expect(batched).toEqual([0, 3]);
  });
  it('commits ordered functional updates once per frame and keeps ordinary setters synchronous', () => {
    const commits: number[] = []; let set!: (n: number) => void;
    const { element } = mount(() => { const [n, update] = useState(1); set = update;
      useFrame(() => { update(x => x + 2); update(x => x * 3); }); useEffect(() => { commits.push(n); }); return n; });
    frame(10); expect(element.textContent).toBe('9'); expect(commits).toEqual([1, 9]);
    set(4); expect(element.textContent).toBe('4'); expect(commits).toEqual([1, 9, 4]);
  });
  it('uses latest committed callbacks; stops/restarts with zero delta and cleans unmount', () => {
    let enable!: (on: boolean) => void; let label!: (s: string) => void; const seen: unknown[] = [];
    const { root } = mount(() => { const [on, setOn] = useState(true); const [s, setS] = useState('a'); enable = setOn; label = setS;
      useFrame(f => seen.push([s, f.delta]), on); return null; });
    frame(100); label('b'); frame(116); enable(false); expect(callbacks.size).toBe(0);
    frame(900); enable(true); frame(1000); expect(seen).toEqual([['a', 0], ['b', 16], ['b', 0]]);
    expect(callbacks.size).toBe(1); root.unmount(); expect(callbacks.size).toBe(0);
  });
  it('isolates roots and does not install hooks from a failed render', () => {
    let fail = false; const first = vi.fn(), second = vi.fn();
    const a = mount(() => { useFrame(fail ? second : first); if (fail) throw Error('failure'); return null; });
    const b = mount(() => { useFrame(second); return null; });
    fail = true; expect(() => a.root.update()).toThrow('failure'); frame(0);
    expect(first).toHaveBeenCalledTimes(1); expect(second).toHaveBeenCalledTimes(1);
    b.root.unmount(); frame(16); expect(first).toHaveBeenCalledTimes(2); expect(second).toHaveBeenCalledTimes(1);
  });
  it('rejects frame and scene hooks outside a root or inside a child', () => {
    expect(() => useFrame(() => {})).toThrow(/최상위/); expect(() => useScene([])).toThrow(/최상위/);
    expect(() => mount(() => h(() => { useFrame(() => {}); return null; }, {}))).toThrow(/최상위/);
    expect(() => mount(() => h(() => useScene([]), {}))).toThrow(/최상위/);
  });
});

const sprite = (x = 10): SpriteSlot => ({ entityId: 1, kind: 'enemy', x, y: 20, active: true });
describe('useScene', () => {
  it('isolates pooling: removing the first of 1000 packed entities needs 1000 operations, hiding its slot needs one', () => {
    const slots = Array.from({ length: 1000 }, (_, index) => ({ ...sprite(index), entityId: index }));
    const before = slots.map(spriteNode);
    const compacted = before.slice(1);
    const pooled = [spriteNode({ ...slots[0], active: false }), ...before.slice(1)];
    expect(diff(before, compacted)).toHaveLength(1000);
    expect(diff(before, pooled)).toEqual([{ type: 'attributes', path: [0], set: { style: 'transform:translate(0.00px,20.00px);visibility:hidden' }, remove: [] }]);
  });
  it('preserves slots, patches only changes, and reuses inactive nodes for new entities', () => {
    let slots = [sprite(), { ...sprite(), entityId: 2 }];
    const { root, element } = mount(() => h('section', null, useScene(slots)));
    const scene = element.querySelector('.scene'), [first, second] = [...element.querySelectorAll('i')];
    const observer = new MutationObserver(() => {}); observer.observe(element, { subtree: true, attributes: true, childList: true });
    root.update(); expect(observer.takeRecords()).toHaveLength(0);
    slots = [sprite(30), slots[1]]; root.update();
    const changes = observer.takeRecords(); expect(changes).toHaveLength(1); expect(changes[0].attributeName).toBe('style');
    slots = [{ ...slots[0], active: false }, slots[1]]; root.update();
    slots = [{ ...sprite(40), entityId: 3, kind: 'bullet' }, slots[1]]; root.update();
    expect(element.querySelector('.scene')).toBe(scene); expect([...element.querySelectorAll('i')]).toEqual([first, second]);
    expect(first.getAttribute('data-entity')).toBe('3'); expect(first.className).toBe('sprite sprite--bullet'); observer.disconnect();
  });
  it('copies descriptors and discards cache changes from failed renders', () => {
    const slot = { ...sprite() }; let fail = false;
    const { root, element } = mount(() => { const scene = useScene([slot]); if (fail) throw Error('failed'); return scene; });
    slot.x = 100; fail = true; expect(() => root.update()).toThrow('failed');
    expect(element.querySelector('i')!.getAttribute('style')).toContain('10.00px');
    fail = false; root.update(); expect(element.querySelector('i')!.getAttribute('style')).toContain('100.00px');
    root.unmount(); root.mount(); expect(element.querySelectorAll('i')).toHaveLength(1);
  });
  it('handles empty/changing capacities and rejects nonfinite coordinates', () => {
    let slots: SpriteSlot[] = []; const { root, element } = mount(() => useScene(slots));
    slots = [sprite(), sprite(40)]; root.update(); expect(element.querySelectorAll('i')).toHaveLength(2);
    slots = []; root.update(); expect(element.querySelectorAll('i')).toHaveLength(0);
    slots = [sprite(NaN)]; expect(() => root.update()).toThrow(/좌표/);
  });
});

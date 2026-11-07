import { afterEach, describe, expect, it, vi } from 'vitest';
import { FunctionComponent, useEffect, useMemo, useState } from '../src/core/component';
import { h, type Child } from '../src/core/element';

const roots: FunctionComponent<{}>[] = [];
function mount(component: () => Child) {
  const container = document.createElement('div');
  const root = new FunctionComponent(component, container, {});
  roots.push(root); root.mount();
  return { root, container };
}
afterEach(() => { roots.splice(0).forEach(root => root.unmount()); vi.useRealTimers(); });

describe('root state and Phase 1 reconciliation', () => {
  it('retains independent slots, stable setters and lazy initialization', () => {
    const initialize = vi.fn(() => 2); let set!: (value: number | ((n: number) => number)) => void;
    const { root, container } = mount(() => {
      const [count, update] = useState(initialize); const [name] = useState('hello'); set = update;
      return h('p', null, name, count);
    });
    const setter = set; set(n => n + 3); set(n => n * 2);
    expect(container.textContent).toBe('hello10'); expect(set).toBe(setter);
    expect(initialize).toHaveBeenCalledTimes(1); expect(root.hooks).toHaveLength(2);
  });
  it('patches only changed text while retaining elements, text nodes and inputs', () => {
    let set!: (value: number) => void;
    const { container } = mount(() => {
      const [count, update] = useState(0); set = update;
      return h('section', null, h('p', null, count), h('input', { value: 'keep' }));
    });
    const section = container.firstChild; const paragraph = container.querySelector('p')!;
    const text = paragraph.firstChild; const input = container.querySelector('input');
    const observer = new MutationObserver(() => {}); observer.observe(container, { subtree: true, childList: true, attributes: true, characterData: true });
    set(1);
    expect(container.firstChild).toBe(section); expect(container.querySelector('p')).toBe(paragraph);
    expect(paragraph.firstChild).toBe(text); expect(container.querySelector('input')).toBe(input);
    expect(observer.takeRecords().map(record => record.type)).toEqual(['characterData']); observer.disconnect();
  });
  it('bails out for Object.is-equal state including NaN', () => {
    let set!: (value: number) => void; const render = vi.fn();
    const { container } = mount(() => { render(); const [n, update] = useState(NaN); set = update; return h('p', null, n); });
    const observer = new MutationObserver(() => {}); observer.observe(container, { subtree: true, childList: true, characterData: true });
    set(NaN); expect(render).toHaveBeenCalledTimes(1); expect(observer.takeRecords()).toEqual([]); observer.disconnect();
  });
  it('supports function values through initializer/updater wrappers', () => {
    const first = () => 1; const second = () => 2; let set!: (value: () => () => number) => void;
    const { container } = mount(() => { const [fn, update] = useState(() => first); set = update; return fn(); });
    set(() => second); expect(container.textContent).toBe('2');
  });
  it('isolates roots and ignores setters from unmounted or previous mounts', () => {
    const setters: Array<(n: number) => void> = [];
    const App = () => { const [n, set] = useState(0); setters.push(set); return n; };
    const a = mount(App); const b = mount(App); const old = setters[0];
    old(3); expect(a.container.textContent).toBe('3'); expect(b.container.textContent).toBe('0');
    a.root.unmount(); old(4); expect(a.container.textContent).toBe('');
    a.root.mount(); old(5); expect(a.container.textContent).toBe('0');
  });
  it('resolves stateless props, children, nested arrays and conditional/empty output', () => {
    let set!: (n: number) => void;
    const Child = ({ label, children }: { label: string; children?: Child[] }) => h('b', null, label, children);
    const { container } = mount(() => {
      const [n, update] = useState(0); set = update;
      return n === 2 ? null : [h(Child, { label: 'child' }, ['!', false, null]), n === 1 && h('i', null, 'new')];
    });
    const bold = container.firstChild; set(1); expect(container.innerHTML).toBe('<b>child!</b><i>new</i>'); expect(container.firstChild).toBe(bold);
    set(2); expect(container.childNodes).toHaveLength(0); set(0); expect(container.innerHTML).toBe('<b>child!</b>');
  });
  it('replaces, removes and refreshes event handlers without duplicates or stale closures', () => {
    let set!: (n: number) => void; const clicked = vi.fn();
    const { root, container } = mount(() => {
      const [n, update] = useState(0); set = update;
      return h(n === 2 ? 'a' : 'button', { onClick: n === 3 ? null : () => clicked(n) }, n);
    });
    const old = container.firstChild as HTMLElement;
    old.click(); set(1); old.click(); set(2); old.click();
    const replacement = container.firstChild as HTMLElement; replacement.click(); set(3);
    (container.firstChild as HTMLElement).click(); replacement.click();
    expect(clicked.mock.calls).toEqual([[0], [1], [2]]);
    root.unmount(); old.click(); expect(clicked).toHaveBeenCalledTimes(3);
  });
  it('updates input value, checked, boolean/aria props and textarea value', () => {
    let set!: (n: number) => void;
    const { container } = mount(() => {
      const [n, update] = useState(0); set = update;
      return [h('input', { type: 'checkbox', value: String(n), checked: n > 0 }),
        h('textarea', { value: String(n) }), h('button', { disabled: n === 0, 'aria-pressed': n > 0 }, 'toggle')];
    });
    expect(container.querySelector('button')!.getAttribute('aria-pressed')).toBe('false');
    set(1); expect(container.querySelector('input')!.checked).toBe(true); expect(container.querySelector('input')!.value).toBe('1');
    expect(container.querySelector('textarea')!.value).toBe('1'); expect(container.querySelector('button')!.disabled).toBe(false);
  });
});

describe('useMemo and useEffect', () => {
  it('memoizes by Object.is dependencies, including empty, omitted and changed lengths', () => {
    const calculate = vi.fn(() => ({})); let deps: unknown[] | undefined = [NaN]; let value: unknown;
    const { root } = mount(() => { value = useMemo(calculate, deps); return null; });
    const first = value; root.update(); expect(value).toBe(first); expect(calculate).toHaveBeenCalledTimes(1);
    deps = [NaN, 1]; root.update(); expect(calculate).toHaveBeenCalledTimes(2);
    deps = []; root.update(); root.update(); expect(calculate).toHaveBeenCalledTimes(3);
    deps = undefined; root.update(); root.update(); expect(calculate).toHaveBeenCalledTimes(5);
  });
  it('copies dependency arrays and distinguishes negative zero', () => {
    const calculate = vi.fn(() => 1); const deps = [0];
    const { root } = mount(() => { useMemo(calculate, deps); return null; });
    deps[0] = -0; root.update(); expect(calculate).toHaveBeenCalledTimes(2);
  });
  it('runs effects after patch, cleans before rerun and on unmount', () => {
    const events: string[] = []; let set!: (n: number) => void;
    const container = document.createElement('div');
    const root = new FunctionComponent(() => {
      const [n, update] = useState(0); set = update;
      useEffect(() => { events.push(`effect ${n} DOM ${container.textContent}`); return () => { events.push(`cleanup ${n}`); }; }, [n]);
      return n;
    }, container, {});
    roots.push(root); root.mount(); root.update(); set(1); root.unmount(); root.unmount();
    expect(events).toEqual(['effect 0 DOM 0', 'cleanup 0', 'effect 1 DOM 1', 'cleanup 1']);
  });
  it('handles effects with omitted/empty dependencies and no cleanup', () => {
    const always = vi.fn(); const once = vi.fn();
    const { root } = mount(() => { useEffect(always); useEffect(once, []); return null; });
    root.update(); root.update(); expect(always).toHaveBeenCalledTimes(3); expect(once).toHaveBeenCalledTimes(1);
  });
  it('queues updates from effects until all committed effects have run', () => {
    const log: number[] = [];
    const { container } = mount(() => {
      const [n, set] = useState(0);
      useEffect(() => { if (n === 0) { set(v => v + 1); set(v => v + 1); } }, [n]);
      useEffect(() => { log.push(n); }, [n]); return n;
    });
    expect(container.textContent).toBe('2'); expect(log).toEqual([0, 2]);
  });
  it('clears timers on dependency change and unmount', () => {
    vi.useFakeTimers(); let toggle!: (value: boolean) => void;
    const { root, container } = mount(() => {
      const [n, set] = useState(0); const [running, update] = useState(true); toggle = update;
      useEffect(() => { if (!running) return; const timer = setInterval(() => set(v => v + 1), 1000); return () => clearInterval(timer); }, [running]);
      return n;
    });
    vi.advanceTimersByTime(2000); expect(container.textContent).toBe('2'); toggle(false);
    expect(vi.getTimerCount()).toBe(0); vi.advanceTimersByTime(2000); expect(container.textContent).toBe('2');
    toggle(true); root.unmount(); expect(vi.getTimerCount()).toBe(0);
  });
});

describe('Hook boundaries and lifecycle errors', () => {
  it.each([() => useState(0), () => useMemo(() => 0, []), () => useEffect(() => {}, [])])('rejects Hooks outside the root and in child components', hook => {
    expect(hook).toThrow(/최상위/);
    expect(() => mount(() => h(() => { hook(); return null; }, {}))).toThrow(/최상위/);
    expect(mount(() => { const [n] = useState(1); return n; }).container.textContent).toBe('1');
  });
  it.each(['fewer', 'more', 'different'])('rejects %s Hooks before DOM commit', mode => {
    let changed = false;
    const { root, container } = mount(() => {
      if (mode === 'different' && changed) useMemo(() => 0, []); else useState(0);
      if (mode === 'fewer' ? !changed : mode === 'more' && changed) useState(1);
      return changed ? 'new' : 'old';
    });
    changed = true; expect(() => root.update()).toThrow(/Hook 호출/); expect(container.textContent).toBe('old');
  });
  it('rejects state writes during root or child rendering', () => {
    expect(() => mount(() => { const [, set] = useState(0); set(1); return null; })).toThrow(/렌더링 중/);
    expect(() => mount(() => { const [, set] = useState(0); return h(() => { set(1); return null; }, {}); })).toThrow(/렌더링 중/);
  });
  it('does not commit effects or memo values from a failed render and restores context', () => {
    let fail = false; const effect = vi.fn(); const memo = vi.fn();
    const { root, container } = mount(() => {
      useMemo(memo, [fail]); useEffect(effect, [fail]);
      if (fail) throw new Error('failed'); return 'ok';
    });
    fail = true; expect(() => root.update()).toThrow('failed'); expect(effect).toHaveBeenCalledTimes(1);
    fail = false; root.update(); expect(memo).toHaveBeenCalledTimes(2); expect(container.textContent).toBe('ok');
    expect(() => useState(0)).toThrow(/최상위/);
  });
  it('rejects duplicate mount and update before mount; permits remount', () => {
    const container = document.createElement('div'); const root = new FunctionComponent(() => null, container, {}); roots.push(root);
    expect(() => root.update()).toThrow(/mount/); root.mount(); expect(() => root.mount()).toThrow(/이미/);
    expect(() => new FunctionComponent(() => null, container, {}).mount()).toThrow(/전용/);
    root.unmount(); root.mount();
  });
  it('finishes all unmount cleanups and removes DOM even if one cleanup throws', () => {
    const cleanup = vi.fn();
    const { root, container } = mount(() => {
      useEffect(() => () => { throw new Error('cleanup'); }, []); useEffect(() => cleanup, []); return 'mounted';
    });
    expect(() => root.unmount()).toThrow(/cleanup/); expect(cleanup).toHaveBeenCalledTimes(1); expect(container.childNodes).toHaveLength(0);
  });
});

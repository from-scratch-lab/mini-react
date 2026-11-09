import { diff, type Operation } from './diff';
import { patch } from './patch';
import { resolve, type Binding, type Component } from './element';
import type { VNode, VTree } from './vdom';

type Dependencies = readonly unknown[] | undefined;
type Cleanup = void | (() => void);
type StateAction<T> = T | ((previous: T) => T);
type StateHook = { kind: 'state'; value: unknown; set: (action: any) => void };
type MemoHook = { kind: 'memo'; value: unknown; deps: Dependencies };
type EffectHook = { kind: 'effect'; effect: () => Cleanup; deps: Dependencies; cleanup: Cleanup; pending: boolean };
type Hook = StateHook | MemoHook | EffectHook;
type ObservedHook =
  | { kind: 'state'; value: unknown }
  | { kind: 'memo'; value: unknown; reused: boolean }
  | { kind: 'effect'; ran: boolean; cleaned: boolean };
export type RenderObservation =
  | {
    type: 'commit'; components: readonly string[]; hooks: readonly ObservedHook[];
    operations: readonly Operation[]; previousTree: readonly VNode[];
  }
  | { type: 'unchanged'; index: number; value: unknown };
let current: FunctionComponent<any> | null = null;
let rendering = false;
const owners = new WeakMap<Element, FunctionComponent<any>>();
const sameDeps = (a: Dependencies, b: Dependencies): boolean =>
  a !== undefined && b !== undefined && a.length === b.length && a.every((value, index) => Object.is(value, b[index]));
const copyDeps = (deps: Dependencies): Dependencies => deps?.slice();

/** Only this root owns state. Every commit uses Phase 1's unchanged diff/patch. */
export class FunctionComponent<P> {
  hooks: Hook[] = [];
  private tree: VTree = [];
  private listeners = new Map<Node, Map<string, EventListener>>();
  private draft: Hook[] = [];
  private cursor = 0;
  private mounted = false;
  private busy = false;
  private pending = false;
  private rendered = false;

  constructor(private component: Component<P>, private container: Element, private props: P,
    private observe?: (event: RenderObservation) => void) {}

  mount(): void {
    if (rendering) throw new Error('렌더링 중 다른 루트를 mount할 수 없습니다.');
    if (this.mounted) throw new Error('이미 mount된 컴포넌트입니다.');
    if (owners.has(this.container) || this.container.childNodes.length) throw new Error('비어 있는 전용 컨테이너가 필요합니다.');
    owners.set(this.container, this); this.mounted = true;
    try { this.update(); } catch (error) { this.unmount(); throw error; }
  }

  update(): void {
    if (rendering) throw new Error('렌더링 중 update를 호출할 수 없습니다.');
    if (!this.mounted) throw new Error('mount 후 update를 호출하세요.');
    if (this.busy) { this.pending = true; return; }
    this.busy = true;
    try {
      let passes = 0;
      do {
        if (++passes > 100) throw new Error('상태 업데이트가 반복됩니다. Effect 의존성을 확인하세요.');
        this.pending = false; this.cursor = 0; this.draft = this.hooks.slice();
        const components = this.observe ? [this.component.displayName || this.component.name || '(익명)'] : undefined;
        current = this; rendering = true;
        let result: ReturnType<typeof resolve>;
        try {
          let output;
          try { output = this.component(this.props); } finally { current = null; }
          if (this.rendered && this.cursor !== this.hooks.length) throw new Error('Hook 호출 개수와 순서는 매 렌더링마다 같아야 합니다.');
          result = resolve(output, components);
        } finally { rendering = false; }
        const { tree, bindings } = result;
        const previousTree = this.tree;
        const operations = diff(previousTree, tree);
        patch(this.container, operations);
        // Capture the decisions before Effect execution clears the pending flags.
        const observed = components && this.draft.map((hook, index): ObservedHook => {
          switch (hook.kind) {
            case 'state': return { kind: 'state', value: hook.value };
            case 'memo': return { kind: 'memo', value: hook.value, reused: this.hooks[index] === hook };
            case 'effect': return { kind: 'effect', ran: hook.pending, cleaned: hook.pending && !!hook.cleanup };
          }
        });
        this.tree = tree; this.hooks = this.draft; this.rendered = true;
        this.bindEvents(bindings);
        // Effects run after the DOM and handlers have committed. State writes queue a new pass.
        for (const hook of this.hooks) {
          if (hook.kind !== 'effect' || !hook.pending) continue;
          hook.pending = false;
          const cleanup = hook.cleanup; hook.cleanup = undefined;
          if (cleanup) cleanup();
          hook.cleanup = hook.effect();
        }
        if (components && observed) this.observe?.({
          type: 'commit', components, hooks: observed, operations, previousTree: structuredClone(previousTree),
        });
      } while (this.pending);
    } finally { this.busy = false; }
  }

  unmount(): void {
    if (rendering || this.busy) throw new Error('렌더링 또는 Effect 실행 중 unmount할 수 없습니다.');
    if (!this.mounted) return;
    this.mounted = false;
    const errors: unknown[] = [];
    for (const hook of this.hooks) {
      if (hook.kind === 'effect' && hook.cleanup) {
        try { hook.cleanup(); } catch (error) { errors.push(error); }
      }
    }
    this.bindEvents([]);
    patch(this.container, diff(this.tree, []));
    this.tree = []; this.hooks = []; this.draft = []; this.rendered = false;
    owners.delete(this.container);
    if (errors.length) throw new AggregateError(errors, 'Effect cleanup 실패');
  }

  private bindEvents(bindings: Binding[]): void {
    const next = new Map<Node, Map<string, EventListener>>();
    for (const binding of bindings) {
      let node: Node = this.container;
      for (const index of binding.path) node = node.childNodes[index];
      next.set(node, binding.events);
    }
    for (const [node, events] of this.listeners) {
      for (const [name, handler] of events) if (next.get(node)?.get(name) !== handler) node.removeEventListener(name, handler);
    }
    for (const [node, events] of next) {
      for (const [name, handler] of events) if (this.listeners.get(node)?.get(name) !== handler) node.addEventListener(name, handler);
    }
    this.listeners = next;
  }

  slot(kind: Hook['kind']): { index: number; previous: Hook | undefined } {
    const index = this.cursor++;
    const previous = this.hooks[index];
    if ((previous && previous.kind !== kind) || (this.rendered && !previous)) throw new Error('Hook 호출 개수와 순서는 매 렌더링마다 같아야 합니다.');
    return { index, previous };
  }

  state<T>(initial: T | (() => T)): [T, (action: StateAction<T>) => void] {
    const { index, previous } = this.slot('state');
    let hook = previous as StateHook | undefined;
    if (!hook) {
      const state: StateHook = { kind: 'state', value: typeof initial === 'function' ? (initial as () => T)() : initial,
        set: (action: StateAction<T>) => {
          if (rendering) throw new Error('렌더링 중 상태를 변경할 수 없습니다.');
          if (!this.mounted || this.hooks[index] !== state) return;
          const value = typeof action === 'function' ? (action as (previous: T) => T)(state.value as T) : action;
          if (Object.is(state.value, value)) {
            this.observe?.({ type: 'unchanged', index, value });
            return;
          }
          state.value = value; this.update();
        } };
      hook = state; this.draft[index] = hook;
    }
    return [hook.value as T, hook.set];
  }

  memo<T>(factory: () => T, deps: Dependencies): T {
    const { index, previous } = this.slot('memo');
    const old = previous as MemoHook | undefined;
    if (old && sameDeps(old.deps, deps)) return old.value as T;
    const value = factory(); this.draft[index] = { kind: 'memo', value, deps: copyDeps(deps) };
    return value;
  }

  effect(effect: () => Cleanup, deps: Dependencies): void {
    const { index, previous } = this.slot('effect');
    const old = previous as EffectHook | undefined;
    this.draft[index] = { kind: 'effect', effect, deps: copyDeps(deps), cleanup: old?.cleanup,
      pending: !old || !sameDeps(old.deps, deps) };
  }
}

function root(): FunctionComponent<any> {
  if (!current) throw new Error('Hook은 최상위 컴포넌트의 렌더링 중에만 사용할 수 있습니다.');
  return current;
}
export function useState<T>(initial: T | (() => T)): [T, (action: StateAction<T>) => void] { return root().state(initial); }
export function useMemo<T>(factory: () => T, deps?: readonly unknown[]): T { return root().memo(factory, deps); }
export function useEffect(effect: () => Cleanup, deps?: readonly unknown[]): void { root().effect(effect, deps); }

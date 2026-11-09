import type { VNode, VTree } from './vdom';

export type Child = Description | string | number | boolean | null | undefined | Child[];
export type Component<P> = ((props: P) => Child) & { displayName?: string };
type Props = Record<string, unknown>;
export interface Description {
  type: string | Component<any>;
  props: Props;
  children: Child[];
}

/** Build descriptions first; child functions run later, outside the root Hook context. */
export function h<P extends object>(type: Component<P>, props: P, ...children: Child[]): Description;
export function h(type: string, props: Props | null, ...children: Child[]): Description;
export function h(type: string | Component<any>, props: object | null, ...children: Child[]): Description {
  return { type, props: { ...props }, children };
}

export interface Binding { path: number[]; events: Map<string, EventListener> }
export function resolve(output: Child, components?: string[]): { tree: VTree; bindings: Binding[] } {
  const bindings: Binding[] = [];
  function children(items: Child[], parent: number[]): VTree {
    const result: VTree = [];
    function append(item: Child): void {
      if (Array.isArray(item)) { item.forEach(append); return; }
      if (item == null || typeof item === 'boolean') return;
      if (typeof item === 'string' || typeof item === 'number') {
        result.push({ type: 'text', text: String(item) }); return;
      }
      if (typeof item.type === 'function') {
        components?.push(item.type.displayName || item.type.name || '(익명)');
        append(item.type({ ...item.props, children: item.children })); return;
      }
      const path = [...parent, result.length];
      const attrs: Record<string, string> = Object.create(null);
      const events = new Map<string, EventListener>();
      for (const [key, value] of Object.entries(item.props)) {
        if (key.startsWith('on')) {
          if (value != null && typeof value !== 'function') throw new Error(`${key} 이벤트는 함수여야 합니다.`);
          if (value != null) events.set(key.slice(2).toLowerCase(), value as EventListener);
        } else if (value != null) {
          const name = key === 'className' ? 'class' : key === 'htmlFor' ? 'for' : key;
          if (typeof value === 'boolean' && !name.startsWith('aria-') && !name.startsWith('data-')) {
            if (value) attrs[name] = '';
          } else attrs[name] = String(value);
        }
      }
      const vnode: VNode = { type: 'element', tag: item.type, attrs, children: children(item.children, path) };
      if (item.type === 'textarea' && item.props.value != null) {
        vnode.value = String(item.props.value); delete attrs.value;
      }
      if (events.size) bindings.push({ path, events });
      result.push(vnode);
    }
    items.forEach(append);
    return result;
  }
  return { tree: children([output], []), bindings };
}

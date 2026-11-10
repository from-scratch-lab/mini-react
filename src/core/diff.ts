import type { VNode, VTree } from './vdom';
export type Operation =
  | { type: 'insert'; path: number[]; node: VNode }
  | { type: 'remove'; path: number[] }
  | { type: 'replace'; path: number[]; node: VNode }
  | { type: 'text'; path: number[]; text: string }
  | { type: 'value'; path: number[]; value: string }
  | { type: 'attributes'; path: number[]; set: Record<string, string>; remove: string[] };

/** Paths are evaluated sequentially. Common children first, trailing removals backwards. */
export function diff(previous: VTree, next: VTree): Operation[] {
  const operations: Operation[] = [];
  function compareChildren(before: VTree, after: VTree, parent: number[]): void {
    const common = Math.min(before.length, after.length);
    for (let i = 0; i < common; i++) compareNode(before[i], after[i], [...parent, i]);
    for (let i = before.length - 1; i >= after.length; i--) operations.push({ type: 'remove', path: [...parent, i] });
    for (let i = common; i < after.length; i++) operations.push({ type: 'insert', path: [...parent, i], node: structuredClone(after[i]) });
  }
  function compareNode(before: VNode, after: VNode, path: number[]): void {
    if (before === after) return;
    if (before.type !== after.type || (before.type === 'element' && after.type === 'element' && before.tag !== after.tag)) {
      operations.push({ type: 'replace', path, node: structuredClone(after) });
    } else if (before.type === 'element' && after.type === 'element') {
      const set = Object.fromEntries(Object.entries(after.attrs).filter(([key, value]) => before.attrs[key] !== value));
      const remove = Object.keys(before.attrs).filter(key => !Object.hasOwn(after.attrs, key));
      if (Object.keys(set).length || remove.length) operations.push({ type: 'attributes', path, set, remove });
      const childStart = operations.length;
      compareChildren(before.children, after.children, path);
      // Textarea keeps real child nodes and a separate live value (dirty controls may differ).
      if (after.value !== undefined && (before.value !== after.value || operations.length > childStart || Object.keys(set).length > 0 || remove.length > 0)) {
        operations.push({ type: 'value', path, value: after.value });
      }
    } else if (before.type !== 'element' && after.type !== 'element' && before.text !== after.text) {
      operations.push({ type: 'text', path, text: after.text });
    }
  }
  compareChildren(previous, next, []);
  return operations;
}

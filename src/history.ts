import { diff } from './core/diff';
import type { VTree } from './core/vdom';
function immutableSnapshot(tree: VTree): VTree {
  const snapshot = structuredClone(tree);
  function freeze(value: unknown): void {
    if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  }
  freeze(snapshot);
  return snapshot;
}
export class History {
  private snapshots: VTree[];
  private position = 0;
  constructor(initial: VTree) { this.snapshots = [immutableSnapshot(initial)]; }
  get current(): VTree { return this.snapshots[this.position]; }
  get index(): number { return this.position; }
  get length(): number { return this.snapshots.length; }
  get canBack(): boolean { return this.position > 0; }
  get canForward(): boolean { return this.position < this.length - 1; }
  at(index: number): VTree {
    if (!Number.isInteger(index) || index < 0 || index >= this.length) throw new Error('유효하지 않은 이력 위치입니다.');
    return this.snapshots[index];
  }
  moveTo(index: number): void { this.at(index); this.position = index; }
  commit(tree: VTree): boolean {
    if (diff(this.current, tree).length === 0) return false;
    this.snapshots = [...this.snapshots.slice(0, this.position + 1), immutableSnapshot(tree)];
    this.position++;
    return true;
  }
}

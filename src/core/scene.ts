import type { VNode } from './vdom';

/** Application data lives in the root; these records describe display slots only. */
export interface SpriteSlot {
  readonly entityId: number;
  readonly kind: 'player' | 'enemy' | 'bullet';
  readonly x: number;
  readonly y: number;
  readonly active: boolean;
  readonly hit?: boolean;
}

export const SCENE = Symbol('mini-react.scene');
export interface SceneDescription { type: typeof SCENE; node: VNode }

export function spriteAttributes(slot: SpriteSlot): Record<string, string> {
  return {
    class: `sprite sprite--${slot.kind}${slot.hit ? ' sprite--hit' : ''}`,
    'data-entity': String(slot.entityId),
    style: `transform:translate(${slot.x.toFixed(2)}px,${slot.y.toFixed(2)}px);visibility:${slot.active ? 'visible' : 'hidden'}`,
  };
}

export function sameSprite(a: SpriteSlot, b: SpriteSlot): boolean {
  return a.entityId === b.entityId && a.kind === b.kind && a.x === b.x && a.y === b.y
    && a.active === b.active && !!a.hit === !!b.hit;
}

export function spriteNode(slot: SpriteSlot): VNode {
  // Cached nodes are immutable, including their nested data. Diff may safely skip them.
  const node: VNode = { type: 'element', tag: 'i', attrs: spriteAttributes(slot), children: [] };
  Object.freeze(node.attrs); Object.freeze(node.children);
  return Object.freeze(node);
}

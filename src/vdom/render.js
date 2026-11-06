import { diff } from '../diff/diff.js';
import { patch } from '../diff/patch.js';

// 컨테이너마다 마지막으로 그린 가상 트리를 기억한다.
const lastTree = new WeakMap();

/**
 * 가상 트리를 컨테이너에 그린다.
 * 처음에는 이전 트리가 없으니 diff가 CREATE 하나를 만들고, 그다음부터는 바뀐 부분만 patch한다.
 * 실제 DOM을 만드는 일도 patch가 맡는다. (DOM을 바꾸는 곳을 한 군데로 모으기 위해)
 *
 * @returns {Array} 이번에 적용한 패치 목록
 */
export function render(vnode, container) {
  const previous = lastTree.get(container) ?? null;
  const patches = patch(container, diff(previous, vnode ?? null));
  if (vnode == null) lastTree.delete(container);
  else lastTree.set(container, vnode);
  return patches;
}

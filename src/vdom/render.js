import { diff } from '../diff/diff.js';
import { patch } from '../diff/patch.js';
import { createVNode, cloneVNode } from './vnode.js';
import { domToVNode } from './domToVNode.js';

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
  try {
    const patches = commitTree(container, previous, vnode ?? null);
    remember(container, vnode ?? null);
    return patches;
  } catch (error) {
    remember(container, error.restoredTree ?? null);
    throw error;
  }
}

function remember(container, tree) {
  if (tree == null) lastTree.delete(container);
  else lastTree.set(container, tree);
}

/**
 * diff → patch를 하되, 패치가 중간에 실패하면 컨테이너를 직전 트리(prev)의 모습으로 되돌린다.
 *
 * 실패하면 앞쪽 패치만 반영된 채 멈춰서, 기억하는 트리와 실제 DOM이 어긋난다.
 * 그대로 두면 다음 diff가 엉뚱한 노드를 고친다. 그래서 지금 실제 DOM을 다시 읽어(attach) prev와 diff·patch한다.
 * 되돌린 뒤의 트리(dom 참조가 맞는 prev의 복사본)는 error.restoredTree에 실어 다시 던진다.
 * 이 컨테이너의 자식은 이 트리만 그린다고 가정한다.
 *
 * @returns {Array} 적용한 패치 목록
 */
export function commitTree(container, prev, next) {
  const patches = diff(prev, next);
  try {
    return patch(container, patches);
  } catch (error) {
    error.restoredTree = restore(container, prev);
    throw error;
  }
}

function restore(container, prev) {
  const now = domToVNode(container, { attach: true });
  const restored = prev ? cloneVNode(prev) : null;
  // 컨테이너 자신을 루트로 놓고 자식만 prev와 같게 맞춘다. (루트는 type·props가 같아 그대로 둔다)
  const target = createVNode(now.type, now.props, restored ? [restored] : [], now.key);
  patch(container, diff(now, target));
  return restored;
}

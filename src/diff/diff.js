import { TEXT_NODE, cloneVNode } from '../vdom/vnode.js';
import { longestIncreasingSubsequence } from './lis.js';

/**
 * 패치 종류. diff가 만든 패치 목록을 patch가 순서대로 실제 DOM에 반영한다.
 *
 *   CREATE  { parent, vnode, before }    새 노드를 만들어 parent.dom 안, before.dom 앞에 넣는다 (before가 null이면 맨 뒤)
 *   REMOVE  { vnode }                    vnode.dom을 떼어 낸다
 *   REPLACE { oldVNode, vnode }          태그·key가 다르면 하위 트리째 새로 만들어 바꾼다
 *   PROPS   { vnode, set, remove, prev } 바뀐 속성만 고친다. type·multiple이 바뀌면 한 노드에 둘 나온다(자식 패치 앞·뒤)
 *   TEXT    { vnode, value, oldValue }   텍스트 노드의 내용만 바꾼다
 *   MOVE    { parent, vnode, before }    key로 찾은 기존 노드를 before 앞으로 옮긴다
 */
export const PatchType = Object.freeze({
  CREATE: 'CREATE',
  REMOVE: 'REMOVE',
  REPLACE: 'REPLACE',
  PROPS: 'PROPS',
  TEXT: 'TEXT',
  MOVE: 'MOVE',
});

/**
 * 이전·다음 가상 트리를 비교해 최소 패치 목록을 만든다. 실제 DOM API는 쓰지 않는다.
 *
 * 재사용하는 노드는 이전 가상 노드의 dom 참조를 다음 가상 노드로 옮긴다(next.dom = prev.dom).
 * 그래서 다음 번 비교에서는 이번 "다음 트리"를 그대로 "이전 트리"로 쓸 수 있다.
 *
 * vnode 객체 재사용: dom 참조가 vnode 객체에 붙어 있어서, 한 객체가 두 자리를 차지하면 참조가 덮인다.
 *   - 짝이 된 이전 노드와 같은 객체면(old === new) 하위 트리를 비교하지 않고 건너뛴다. (상수로 빼 둔 하위 트리)
 *   - 이전 트리의 객체가 다른 자리에 오거나, 다음 트리에 같은 객체가 두 번 나오면 복제본으로 바꿔 끼운다.
 *     이때 다음 트리의 children 배열이 바뀐다.
 *
 * 핸들러 교체: on* 속성이 함수에서 다른 함수로만 바뀌면 PROPS 패치를 만들지 않는다.
 *   렌더마다 새로 만든 화살표 함수 때문에 생기는 변경이라 실제 DOM은 바뀌지 않기 때문이다(리스너는 요소마다 한 번만 달려 있다).
 *   대신 { vnode, name, value } 를 결과 배열의 handlers(열거되지 않는 속성)에 담는다.
 *   patch가 모든 DOM 패치를 마친 뒤 이 목록대로 요소의 핸들러 표만 갈아 끼운다.
 *   (Vue 3의 invoker, React의 "이벤트 때 props에서 핸들러를 읽기"와 같은 생각. 패치 수 = DOM을 바꾸는 일의 수로 맞춘다)
 */
export function diff(oldVNode, newVNode) {
  const ctx = { patches: [], handlers: [], oldNodes: collectNodes(oldVNode), seen: new Set() };
  Object.defineProperty(ctx.patches, 'handlers', { value: ctx.handlers, enumerable: false });
  if (oldVNode === newVNode) return ctx.patches;

  if (oldVNode == null) {
    ctx.patches.push({ type: PatchType.CREATE, parent: null, vnode: own(newVNode, ctx, true), before: null });
  } else if (newVNode == null) {
    ctx.patches.push({ type: PatchType.REMOVE, vnode: oldVNode });
  } else {
    diffNode(oldVNode, own(newVNode, ctx, false), ctx);
  }
  return ctx.patches;
}

function collectNodes(root, out = new Set()) {
  if (root == null) return out;
  out.add(root);
  for (const child of root.children) collectNodes(child, out);
  return out;
}

/**
 * 다음 트리의 이 자리에 쓸 vnode를 정한다. 이전 트리의 객체이거나 이번 트리에서 이미 쓴 객체면 복제한다.
 * deep이 true면(새로 만들 하위 트리) 자손까지 같은 검사를 한다. 비교할 하위 트리는 diffNode가 내려가며 검사한다.
 */
function own(vnode, ctx, deep) {
  const result = ctx.oldNodes.has(vnode) || ctx.seen.has(vnode) ? cloneVNode(vnode) : vnode;
  ctx.seen.add(result);
  if (deep) {
    result.children.forEach((child, i) => {
      result.children[i] = own(child, ctx, true);
    });
  }
  return result;
}

function diffNode(oldVNode, newVNode, ctx) {
  const { patches } = ctx;
  // 경우 3: 태그나 key가 다르면 같은 노드로 보지 않는다. 하위 트리를 비교하지 않고 통째로 새로 만든다.
  if (oldVNode.type !== newVNode.type || oldVNode.key !== newVNode.key) {
    newVNode.children.forEach((child, i) => {
      newVNode.children[i] = own(child, ctx, true);
    });
    patches.push({ type: PatchType.REPLACE, oldVNode, vnode: newVNode });
    return;
  }

  newVNode.dom = oldVNode.dom;

  // 경우 5: 텍스트 내용 변경
  if (newVNode.type === TEXT_NODE) {
    if (oldVNode.props.nodeValue !== newVNode.props.nodeValue) {
      patches.push({
        type: PatchType.TEXT,
        vnode: newVNode,
        value: newVNode.props.nodeValue,
        oldValue: oldVNode.props.nodeValue,
      });
    }
    return;
  }

  // 경우 4: 속성 변경. 보통은 자식 패치 뒤에 둔다. <select value>는 새 option이 생긴 뒤에 넣어야 선택된다.
  // 단 type·multiple은 자식과 다른 속성의 뜻을 바꾸므로 따로 떼어 자식 패치 앞에 둔다(EARLY_PROPS).
  const propsPatch = diffProps(oldVNode.props, newVNode.props, newVNode, ctx.handlers);
  // multiple이 바뀐 뒤 option 선택을 맞추는 일은 patch가 모든 패치 뒤에 한다(선택 그룹 다시 맞추기).
  const [early, late] = propsPatch ? splitEarlyProps(propsPatch) : [null, null];
  if (early) patches.push({ type: PatchType.PROPS, vnode: newVNode, ...early });
  diffChildren(oldVNode, newVNode, ctx);
  if (late) patches.push({ type: PatchType.PROPS, vnode: newVNode, ...late });
}

/**
 * 다른 속성·자식보다 먼저 넣어야 하는 속성.
 * - multiple: 없는 동안 select는 "하나만 선택" 규칙을 쓴다. option의 selected를 먼저 넣으면 마지막 하나만 남는다.
 * - type: input의 value 처리 방식이 type마다 다르다. range의 value를 지운 뒤 radio로 바꾸면
 *   HTML 표준대로 그때의 value("50")가 속성으로 복사된다. React도 type을 가장 먼저 넣는다.
 */
export const EARLY_PROPS = ['type', 'multiple'];

/** PROPS 변경을 [먼저 넣을 것, 나중에 넣을 것]으로 나눈다. 빈 쪽은 null. */
function splitEarlyProps({ set, remove, prev }) {
  const early = { set: {}, remove: [], prev: {} };
  const late = { set: {}, remove: [], prev: {} };
  const part = (name) => (EARLY_PROPS.includes(name) ? early : late);
  for (const [name, value] of Object.entries(set)) part(name).set[name] = value;
  for (const name of remove) part(name).remove.push(name);
  for (const [name, value] of Object.entries(prev)) part(name).prev[name] = value;
  const isEmpty = (p) => p.remove.length === 0 && Object.keys(p.set).length === 0;
  return [isEmpty(early) ? null : early, isEmpty(late) ? null : late];
}

function diffProps(oldProps, newProps, vnode, handlers) {
  const set = {};
  const prev = {};
  const remove = [];
  let changed = false;

  for (const [name, value] of Object.entries(newProps)) {
    if (value == null) continue; // null·undefined는 "없음"과 같다. 아래에서 remove로 처리된다.
    if (isHandlerSwap(name, oldProps[name], value)) {
      if (oldProps[name] !== value) handlers.push({ vnode, name, value });
      continue;
    }
    if (!samePropValue(oldProps[name], value)) {
      set[name] = value;
      prev[name] = oldProps[name];
      changed = true;
    }
  }
  for (const name of Object.keys(oldProps)) {
    if (oldProps[name] != null && newProps[name] == null) {
      remove.push(name);
      prev[name] = oldProps[name];
      changed = true;
    }
  }
  return changed ? { set, remove, prev } : null;
}

/** 함수 → 함수인 이벤트 핸들러. 이 변경은 DOM을 바꾸지 않으므로 PROPS가 아니라 교체 목록으로 보낸다. */
function isHandlerSwap(name, oldValue, newValue) {
  return name.startsWith('on') && typeof oldValue === 'function' && typeof newValue === 'function';
}

function samePropValue(a, b) {
  if (Object.is(a, b)) return true;
  // style 객체는 매 렌더마다 새로 만들어지므로 내용으로 비교한다.
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    const keysA = Object.keys(a);
    const keysB = Object.keys(b);
    return keysA.length === keysB.length && keysA.every((k) => Object.is(a[k], b[k]));
  }
  return false;
}

/**
 * 자식 목록 비교. key가 있으면 key로, 없으면 위치로 짝을 짓는다.
 *
 * 1) 짝 찾기: 자식마다 비교용 이름을 붙인다. key가 있으면 "k:key", 없으면 key 없는 형제 중 몇 번째인지 "u:n".
 *    그래서 key 없는 목록은 위치끼리, key 있는 목록은 key끼리 비교된다.
 *    같은 key가 중복되면 짝을 확정할 수 없으므로 경고하고 전체를 위치로 비교한다.
 * 2) 짝이 있는 자식은 재귀 비교, 짝이 없는 이전 자식은 REMOVE (경우 2).
 * 3) 자리 맞추기: 짝이 있는 자식의 "이전 위치"를 새 순서대로 늘어놓고 LIS를 구한다.
 *    LIS에 든 노드는 상대 순서가 이미 맞으니 그대로 두고, 나머지는 MOVE, 짝이 없는 새 자식은 CREATE (경우 1).
 *    뒤에서부터 처리하므로 "바로 뒤 형제(before)"는 항상 이미 제자리에 있다.
 */
function diffChildren(oldParent, newParent, ctx) {
  const { patches } = ctx;
  const oldChildren = oldParent.children;
  const newChildren = newParent.children;

  let oldNames = matchNames(oldChildren);
  let newNames = matchNames(newChildren);
  if (hasDuplicate(oldNames) || hasDuplicate(newNames)) {
    console.warn(
      `[mini-react] <${newParent.type}>의 자식에 같은 key가 있습니다. 이 목록은 key 대신 위치로 비교합니다.`,
    );
    oldNames = oldChildren.map((_, i) => `p:${i}`);
    newNames = newChildren.map((_, i) => `p:${i}`);
  }

  const oldIndexByName = new Map(oldNames.map((name, i) => [name, i]));
  const matchedOldIndex = new Array(newChildren.length).fill(-1);
  const used = new Set();

  newChildren.forEach((child, i) => {
    const j = oldIndexByName.get(newNames[i]);
    if (j !== undefined && oldChildren[j] === child && !ctx.seen.has(child)) {
      // 같은 객체를 같은 자리에 다시 썼다: 하위 트리 전체가 그대로다.
      ctx.seen.add(child);
      matchedOldIndex[i] = j;
      used.add(j);
      return;
    }
    const owned = own(child, ctx, j === undefined);
    newChildren[i] = owned;
    if (j === undefined) return;
    matchedOldIndex[i] = j;
    used.add(j);
    diffNode(oldChildren[j], owned, ctx);
  });

  oldChildren.forEach((child, j) => {
    if (!used.has(j)) patches.push({ type: PatchType.REMOVE, vnode: child });
  });

  const matchedNewIndexes = [];
  const sequence = [];
  matchedOldIndex.forEach((j, i) => {
    if (j !== -1) {
      matchedNewIndexes.push(i);
      sequence.push(j);
    }
  });
  const stays = new Set(longestIncreasingSubsequence(sequence).map((k) => matchedNewIndexes[k]));

  for (let i = newChildren.length - 1; i >= 0; i -= 1) {
    const before = newChildren[i + 1] ?? null;
    if (matchedOldIndex[i] === -1) {
      patches.push({ type: PatchType.CREATE, parent: newParent, vnode: newChildren[i], before });
    } else if (!stays.has(i)) {
      patches.push({ type: PatchType.MOVE, parent: newParent, vnode: newChildren[i], before });
    }
  }
}

function matchNames(children) {
  let unkeyed = 0;
  return children.map((child) => (child.key != null ? `k:${child.key}` : `u:${unkeyed++}`));
}

function hasDuplicate(names) {
  return new Set(names).size !== names.length;
}

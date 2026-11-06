/**
 * 가상 노드(VNode) 구조
 *
 *   { type, props, children, key }   + 열거되지 않는 dom 참조
 *
 * - type: 태그 이름('div', 'linearGradient' …) 또는 텍스트 노드 표시 TEXT_NODE
 * - props: 속성 객체. 텍스트 노드는 { nodeValue }만 가진다.
 * - children: 자식 VNode 배열 (텍스트 노드는 항상 빈 배열)
 * - key: 형제 사이에서 노드를 구별하는 문자열, 없으면 null
 * - dom: 이 가상 노드가 가리키는 실제 DOM 노드. diff가 재사용할 노드의 참조를 새 트리로 옮기고,
 *        patch가 그 참조로 실제 DOM을 바꾼다. 열거되지 않게 두어서 비교(toEqual)와 JSON 출력에 섞이지 않는다.
 */
export const TEXT_NODE = '#text';

export function createVNode(type, props = {}, children = [], key = null) {
  const vnode = { type, props, children, key };
  Object.defineProperty(vnode, 'dom', { value: null, writable: true, enumerable: false, configurable: true });
  return vnode;
}

export function createTextVNode(value) {
  return createVNode(TEXT_NODE, { nodeValue: String(value) }, [], null);
}

export function isTextVNode(vnode) {
  return vnode != null && vnode.type === TEXT_NODE;
}

export function isVNode(value) {
  return value != null && typeof value === 'object' && 'type' in value && Array.isArray(value.children);
}

/** dom 참조 없이 깊은 복사한다. 기록(history)에 넣거나 꺼낼 때 원본과 섞이지 않게 쓴다. */
export function cloneVNode(vnode) {
  if (vnode == null) return vnode;
  return createVNode(vnode.type, cloneProps(vnode.props), vnode.children.map(cloneVNode), vnode.key);
}

function cloneProps(props) {
  const copy = {};
  for (const [name, value] of Object.entries(props)) {
    copy[name] = value !== null && typeof value === 'object' ? { ...value } : value;
  }
  return copy;
}

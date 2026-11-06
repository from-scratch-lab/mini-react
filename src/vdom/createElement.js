import { createVNode, createTextVNode, isVNode } from './vnode.js';

/**
 * createElement('ul', { id: 'list' }, createElement('li', { key: 'a' }, 'A'))
 *
 * JSX가 컴파일되면 부르는 함수와 같은 모양이다.
 * - 문자열·숫자 자식은 텍스트 노드가 된다.
 * - null·undefined·true·false 자식은 버린다. (조건부 렌더링 `cond && <p/>` 를 위해)
 * - 배열 자식은 평탄화한다. (`items.map(...)` 결과를 그대로 넣을 수 있게)
 * - key는 props가 아니라 노드 자체에 문자열로 저장한다.
 */
export function createElement(type, props, ...children) {
  const { key = null, children: propChildren, ...rest } = props ?? {};
  // 위치 인자 자식이 없으면 props.children을 쓴다. h(Box, { children: 'hi' })도 h(Box, null, 'hi')와 같게.
  const source = children.length === 0 && propChildren !== undefined ? [propChildren] : children;
  return createVNode(type, rest, normalizeChildren(source), key == null ? null : String(key));
}

export const h = createElement;

function normalizeChildren(list, out = []) {
  for (const child of list) {
    if (Array.isArray(child)) {
      normalizeChildren(child, out);
    } else if (child == null || typeof child === 'boolean') {
      continue;
    } else if (typeof child === 'string' || typeof child === 'number') {
      out.push(createTextVNode(child));
    } else if (isVNode(child)) {
      out.push(child);
    } else {
      throw new TypeError(`createElement: 자식으로 쓸 수 없는 값입니다 (${Object.prototype.toString.call(child)})`);
    }
  }
  return out;
}

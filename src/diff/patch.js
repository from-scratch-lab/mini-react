import { TEXT_NODE } from '../vdom/vnode.js';
import { PatchType } from './diff.js';
import { toAttributeName, toKebabCase } from '../vdom/serialize.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

// 폼 상태처럼 "속성"과 따로 노는 "프로퍼티"가 있는 boolean 속성.
// 사용자가 체크박스를 클릭하는 등 프로퍼티가 한 번 바뀌면(dirty) 속성을 바꿔도 화면이 따라오지 않으므로 프로퍼티도 맞춘다.
const BOOLEAN_PROPERTIES = new Set(['checked', 'selected', 'disabled', 'multiple', 'muted', 'open']);
// value를 프로퍼티로 맞춰야 하는 폼 요소. li·progress·meter 같은 요소의 value는 그냥 속성으로 둔다.
const FORM_VALUE_ELEMENTS = new Set(['input', 'textarea', 'select']);
// 다른 속성(type, min, max, 자식 option)이 먼저 있어야 올바로 반영되는 속성. 만들 때 맨 마지막에 넣는다.
const DEFERRED_PROPS = ['value', 'checked', 'selected'];
// on + 이름을 소문자로 바꾼 것과 실제 이벤트 이름이 다른 경우
const EVENT_NAME_ALIASES = { doubleclick: 'dblclick' };
const HANDLERS = Symbol('miniReactHandlers');

/**
 * diff가 만든 패치 목록을 실제 DOM에 순서대로 반영한다.
 * 이 프로젝트에서 실제 DOM을 바꾸는 곳은 이 파일뿐이다.
 *
 * @param {Element} container 루트를 붙일 부모. 부모가 없는 루트 CREATE에서만 쓴다.
 * @param {Array} patches diff(oldVNode, newVNode)의 결과
 * @returns {Array} 반영한 패치 목록 (그대로 돌려준다)
 */
export function patch(container, patches) {
  for (const p of patches) applyPatch(container, p);
  return patches;
}

function applyPatch(container, p) {
  switch (p.type) {
    case PatchType.CREATE: {
      const parentDom = childContainer(p.parent ? p.parent.dom : container);
      const dom = createDom(p.vnode, parentDom);
      parentDom.insertBefore(dom, p.before ? p.before.dom : null);
      break;
    }
    case PatchType.REMOVE:
      p.vnode.dom.remove();
      break;
    case PatchType.REPLACE: {
      const oldDom = p.oldVNode.dom;
      const dom = createDom(p.vnode, oldDom.parentNode ?? container);
      oldDom.replaceWith(dom);
      break;
    }
    case PatchType.PROPS:
      for (const name of p.remove) setProp(p.vnode.dom, name, null, p.prev[name]);
      for (const [name, value] of Object.entries(p.set)) setProp(p.vnode.dom, name, value, p.prev[name]);
      break;
    case PatchType.TEXT:
      p.vnode.dom.nodeValue = p.value;
      break;
    case PatchType.MOVE:
      childContainer(p.parent.dom).insertBefore(p.vnode.dom, p.before ? p.before.dom : null);
      break;
    default:
      throw new Error(`알 수 없는 패치 종류: ${p.type}`);
  }
}

/** 자식을 넣을 곳. <template>의 자식은 요소 자체가 아니라 template.content(DocumentFragment)에 들어간다. */
function childContainer(dom) {
  return dom.localName === 'template' && dom.content ? dom.content : dom;
}

/** 가상 노드로 실제 DOM 노드를 만든다(하위 트리 포함). 만든 노드는 vnode.dom에 연결한다. */
function createDom(vnode, parentDom) {
  const doc = parentDom.ownerDocument ?? parentDom;
  if (vnode.type === TEXT_NODE) {
    vnode.dom = doc.createTextNode(vnode.props.nodeValue);
    return vnode.dom;
  }

  const inSvg = vnode.type === 'svg' || (parentDom.namespaceURI === SVG_NS && parentDom.localName !== 'foreignObject');
  const dom = inSvg ? doc.createElementNS(SVG_NS, vnode.type) : doc.createElement(vnode.type);
  vnode.dom = dom;

  const target = childContainer(dom);
  for (const child of vnode.children) target.appendChild(createDom(child, dom));

  // 속성은 자식을 만든 뒤에 넣고, value·checked는 그중에서도 마지막에 넣는다.
  // <select value>는 option이 있어야 선택되고, range input의 value는 max를 알아야 잘리지 않는다.
  const entries = Object.entries(vnode.props);
  const isDeferred = ([name]) => DEFERRED_PROPS.includes(name);
  for (const [name, value] of entries.filter((e) => !isDeferred(e))) setProp(dom, name, value, undefined);
  for (const [name, value] of entries.filter(isDeferred)) setProp(dom, name, value, undefined);
  return dom;
}

function setProp(dom, name, value, prevValue) {
  if (name.startsWith('on') && (typeof value === 'function' || typeof prevValue === 'function')) {
    setEventHandler(dom, toEventName(name), typeof value === 'function' ? value : null);
    if (typeof value === 'function') return;
    // 함수였다가 함수가 아닌 값(문자열 등)으로 바뀌면 핸들러를 뗀 뒤, 아래에서 일반 속성으로 쓴다.
  }
  if (name === 'style' && (isObject(value) || isObject(prevValue))) {
    setStyle(dom, prevValue, value);
    return;
  }
  if (name === 'value' && FORM_VALUE_ELEMENTS.has(dom.localName)) {
    const next = value == null ? '' : String(value);
    if (dom.value !== next) dom.value = next; // 같으면 건드리지 않는다: 입력 중인 커서 위치를 지키기 위해
    if (dom.localName === 'input') setAttribute(dom, 'value', value);
    return;
  }
  if (BOOLEAN_PROPERTIES.has(name) && name in dom) {
    // HTML에서 읽은 값은 문자열('')이다. boolean 속성은 "있으면 참"이므로 문자열도 참으로 본다.
    const on = value != null && value !== false;
    dom[name] = on;
    setAttribute(dom, name, typeof value === 'string' ? value : on || null);
    return;
  }
  setAttribute(dom, toAttributeName(name), value);
}

function setAttribute(dom, name, value) {
  if (value == null || value === false || typeof value === 'function') dom.removeAttribute(name);
  else dom.setAttribute(name, value === true ? '' : String(value));
}

function toEventName(propName) {
  const name = propName.slice(2).toLowerCase();
  return EVENT_NAME_ALIASES[name] ?? name;
}

/**
 * 이벤트 핸들러는 요소마다 이벤트 종류별로 리스너를 한 번만 달고, 실제 호출할 함수는 표에서 찾는다.
 * 렌더할 때마다 새 함수가 와도 removeEventListener/addEventListener를 반복하지 않는다.
 * (캡처 단계 핸들러 onClickCapture 같은 것은 지원하지 않는다.)
 */
function setEventHandler(dom, eventName, handler) {
  const handlers = (dom[HANDLERS] ??= {});
  if (!(eventName in handlers)) {
    dom.addEventListener(eventName, (event) => handlers[eventName]?.(event));
  }
  handlers[eventName] = handler;
}

/** style은 문자열(속성 그대로)과 객체({ fontSize: '12px' }) 둘 다 받는다. */
function setStyle(dom, prev, next) {
  if (!isObject(next)) {
    setAttribute(dom, 'style', next);
    return;
  }
  if (!isObject(prev)) {
    // 이전 값이 문자열이었다면 그 선언들을 모두 지우고 객체로 새로 쓴다.
    dom.removeAttribute('style');
    prev = {};
  }
  for (const name of Object.keys(prev)) {
    if (!(name in next)) dom.style.removeProperty(toKebabCase(name));
  }
  for (const [name, value] of Object.entries(next)) {
    if (value == null || value === '') dom.style.removeProperty(toKebabCase(name));
    else dom.style.setProperty(toKebabCase(name), String(value));
  }
  if (dom.getAttribute('style') === '') dom.removeAttribute('style');
}

function isObject(value) {
  return value !== null && typeof value === 'object';
}

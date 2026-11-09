import { TEXT_NODE } from '../vdom/vnode.js';
import { PatchType, EARLY_PROPS } from './diff.js';
import { toAttributeName, toKebabCase, styleValue } from '../vdom/serialize.js';

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
// value prop으로 선택을 정하는 select와 그 값 (선택 그룹을 다시 맞출 때 option 속성보다 우선한다)
const SELECT_VALUES = new WeakMap();
const ATTRIBUTE_NAMESPACES = {
  xlink: 'http://www.w3.org/1999/xlink',
  xml: 'http://www.w3.org/XML/1998/namespace',
};

/**
 * diff가 만든 패치 목록을 실제 DOM에 순서대로 반영한다.
 * 이 프로젝트에서 실제 DOM을 바꾸는 곳은 이 파일뿐이다.
 *
 * @param {Element} container 루트를 붙일 부모. 부모가 없는 루트 CREATE에서만 쓴다.
 * @param {Array} patches diff(oldVNode, newVNode)의 결과
 * @returns {Array} 반영한 패치 목록 (그대로 돌려준다)
 */
export function patch(container, patches) {
  const groups = { selects: new Set(), inputs: new Set(), radios: null };
  // 지우거나 바꾸기 전에 봐야 하는 것(지울 노드가 속한 그룹)은 반영 전에, 새로 생긴 노드는 반영 뒤에 모은다.
  for (const p of patches) noteBeforePatch(p, groups, container);
  for (let i = 0; i < patches.length; ) i = applyFrom(container, patches, i);
  for (const p of patches) noteAfterPatch(p, groups);
  syncSelectionGroups(container, groups);
  // 핸들러 교체는 DOM 패치가 모두 성공한 뒤에 한다. 중간에 실패하면 화면과 함께 핸들러도 직전 렌더 것으로 남는다.
  for (const { vnode, name, value } of patches.handlers ?? []) setEventHandler(vnode.dom, toEventName(name), value);
  return patches;
}

/**
 * patches[i]부터 반영하고 다음에 볼 인덱스를 돌려준다.
 * 패치 목록은 diff가 만든 그대로 두고, 이어지는 패치를 실제 DOM 연산 한 번으로 묶을 수 있으면 묶는다.
 *   - 같은 부모에 이어서 만드는 CREATE들 → DocumentFragment에 모아 insertBefore 한 번 (createRunEnd)
 *   - 한 부모의 자식을 전부 지우는 REMOVE들 → textContent = '' 한 번 (clearRunEnd)
 * 브라우저는 DOM이 바뀔 때마다 변경 기록을 남기고 레이아웃을 다시 계산할 준비를 하므로, 1,000번을 1번으로 줄인다.
 */
function applyFrom(container, patches, i) {
  const p = patches[i];
  if (p.type === PatchType.CREATE && p.parent) {
    const end = createRunEnd(patches, i);
    if (end - i > 1) {
      insertRun(patches, i, end);
      return end;
    }
  } else if (p.type === PatchType.REMOVE) {
    const end = clearRunEnd(patches, i);
    if (end > i) {
      p.vnode.dom.parentNode.textContent = '';
      return end;
    }
  }
  applyPatch(container, p);
  return i + 1;
}

/**
 * patches[i]에서 시작해 "같은 부모에 이어서 넣는" CREATE가 어디까지인지.
 * diff는 자식을 뒤에서부터 처리하므로, 이어지는 CREATE는 before가 바로 앞 패치에서 만든 형제다.
 */
function createRunEnd(patches, i) {
  let j = i + 1;
  while (j < patches.length) {
    const q = patches[j];
    if (q.type !== PatchType.CREATE || q.parent !== patches[i].parent || q.before !== patches[j - 1].vnode) break;
    j += 1;
  }
  return j;
}

/**
 * 묶은 CREATE들을 앞에서부터 차례로 fragment에 만들어 붙이고, 맨 뒤 형제(첫 패치의 before) 앞에 한 번에 넣는다.
 * - 노드는 진짜 부모를 기준으로 만든다(createDom이 부모의 네임스페이스로 SVG 여부를 정하므로). fragment에는 붙이기만 한다.
 * - 앞에서부터 넣으므로 빈 <select>에 option들을 넣으면 처음부터 그린 것처럼 첫 option이 선택된다.
 *   (하나씩 넣던 때는 뒤에서부터 들어가 마지막 option이 먼저 들어와 선택됐다)
 * - 만들다 실패하면 fragment는 버려지고 실제 DOM은 그대로다.
 */
function insertRun(patches, start, end) {
  const parentDom = childContainer(patches[start].parent.dom);
  const fragment = (parentDom.ownerDocument ?? parentDom).createDocumentFragment();
  for (let k = end - 1; k >= start; k -= 1) fragment.appendChild(createDom(patches[k].vnode, parentDom));
  const before = patches[start].before;
  parentDom.insertBefore(fragment, before ? before.dom : null);
}

/**
 * patches[i]에서 시작하는 REMOVE들이 한 부모의 실제 자식을 "전부" 지우면 그 끝 인덱스, 아니면 i.
 * 실제 자식 수(childNodes)와 지울 노드 수가 같을 때만 묶는다. attach로 읽은 트리처럼
 * 가상 트리에 없는 공백 텍스트가 섞인 부모는 하나씩 지워 그 공백을 지금처럼 남긴다.
 * textarea(텍스트가 기본값)와 template content(요소가 아님)는 묶지 않는다.
 */
function clearRunEnd(patches, i) {
  const parentDom = patches[i].vnode.dom?.parentNode;
  if (!parentDom || parentDom.nodeType !== 1 || parentDom.localName === 'textarea') return i;
  const count = parentDom.childNodes.length;
  if (count < 2) return i;
  let j = i;
  while (j < patches.length && j - i < count) {
    const q = patches[j];
    if (q.type !== PatchType.REMOVE || q.vnode.dom?.parentNode !== parentDom) break;
    j += 1;
  }
  return j - i === count ? j : i;
}

/**
 * 선택 그룹: 하나만 고르는 select의 option들, 같은 form·같은 name의 radio들.
 * 브라우저는 그룹 안 한 요소의 선택을 바꾸면 형제의 선택도 바꾼다(앞 option을 고르면 뒤 option이 풀린다).
 * diff는 바뀐 속성만 다시 넣으므로, 속성이 그대로인 형제는 다른 형제 때문에 풀린 채 남을 수 있다.
 * 그래서 이번 렌더에서 선택에 영향을 준 그룹만 모아 두었다가, 모든 패치 뒤에 그룹 전체를 속성대로 다시 맞춘다.
 * 선택과 상관없는 변경(속성 없는 option 덧붙이기, checked 속성 없는 radio의 name 바꾸기 등)은 모으지 않아
 * 사용자가 고른 것을 건드리지 않는다. multiple select의 option은 서로 영향을 주지 않으므로 그룹이 아니다.
 */
function noteSelectionChange(p, groups) {
  const dom = p.vnode.dom;
  const changed = [...Object.keys(p.set), ...p.remove];
  if (dom.localName === 'option') {
    if (changed.includes('selected')) noteSelect(dom.closest('select'), groups);
  } else if (dom.localName === 'select') {
    // multiple을 켜고 끄면 브라우저는 이전 선택을 그대로 두므로, 이때는 multiple이어도 속성대로 다시 맞춘다
    if (changed.includes('multiple') || changed.includes('value')) groups.selects.add(dom);
  } else if (dom.localName === 'input') {
    if (changed.includes('checked')) groups.inputs.add(dom);
    // checked 속성이 있는 input이 그룹을 옮기거나 종류가 바뀌면(radio → checkbox 등) 바뀌는 동안 풀렸을 수 있다
    else if (changesGroup(changed) && dom.defaultChecked) groups.inputs.add(dom);
  }
}

/** 반영 전: 지우는 노드와 그룹을 떠나는 radio가 지금 속한 그룹을 모은다 (반영 뒤에는 이 관계가 사라진다). */
function noteBeforePatch(p, groups, container) {
  if (p.type === PatchType.REMOVE) noteSubtree(p.vnode.dom, groups, container, true);
  else if (p.type === PatchType.REPLACE) noteSubtree(p.oldVNode.dom, groups, container, true);
  else if (p.type === PatchType.PROPS && changesGroup([...Object.keys(p.set), ...p.remove])) {
    const dom = p.vnode.dom;
    if (isDefaultCheckedRadio(dom)) for (const radio of radiosOf(dom, container, groups)) if (radio !== dom) groups.inputs.add(radio);
  }
}

/** 반영 뒤: 속성이 바뀐 요소, 새로 생기거나 옮겨진 노드가 속한 그룹을 모은다. */
function noteAfterPatch(p, groups) {
  if (p.type === PatchType.PROPS) noteSelectionChange(p, groups);
  else if (p.type === PatchType.CREATE || p.type === PatchType.REPLACE || p.type === PatchType.MOVE) {
    noteSubtree(p.vnode.dom, groups, null, false);
  }
}

const changesGroup = (changed) => changed.includes('name') || changed.includes('type');
const isDefaultCheckedRadio = (dom) => dom.localName === 'input' && dom.type === 'radio' && dom.defaultChecked;

function noteSelect(select, groups) {
  if (select && !select.multiple) groups.selects.add(select);
}

/**
 * 구조 패치로 생기거나 빠지거나 옮겨진 option·radio 중 그룹의 선택을 바꿀 수 있는 것만 그룹으로 모은다.
 * - selected·checked 속성이 있는 것, 지우는 쪽이면 지금 선택된 것
 * - value prop으로 선택을 정하는 select 안의 option (option이 바뀌면 브라우저가 선택을 다시 정한다)
 */
function noteSubtree(dom, groups, container, removing) {
  if (dom?.nodeType !== 1) return;
  const nodes = dom.localName === 'option' || dom.localName === 'input' ? [dom] : [dom, ...dom.querySelectorAll('option, input')];
  for (const node of nodes) {
    if (node.localName === 'option') {
      const select = node.closest('select');
      if (select && (SELECT_VALUES.has(select) || node.defaultSelected || (removing && node.selected))) {
        if (SELECT_VALUES.has(select)) groups.selects.add(select);
        else noteSelect(select, groups);
      }
    } else if (node.localName === 'input' && node.type === 'radio' && (node.defaultChecked || (removing && node.checked))) {
      // 지우는 radio는 곧 그룹을 떠나므로 남는 형제를 모은다
      if (removing && node.name) {
        for (const radio of radiosOf(node, container, groups)) if (radio !== node) groups.inputs.add(radio);
      } else {
        groups.inputs.add(node);
      }
    }
  }
}

/** 처음부터 그린 것과 같게 맞춘다: 속성(defaultSelected·defaultChecked)을 문서 순서대로 넣으면 뒤의 것이 이긴다(파서와 같다). */
function syncSelectionGroups(container, groups) {
  // 같은 패치에서 함께 지워진 요소는 건너뛴다. 떨어져 나간 radio는 form이 없어져 엉뚱한 그룹을 가리킨다.
  const live = (el) => container.contains(el);
  for (const select of groups.selects) {
    if (!live(select)) continue;
    if (SELECT_VALUES.has(select)) select.value = SELECT_VALUES.get(select);
    else for (const option of select.options) option.selected = option.defaultSelected;
  }
  groups.radios = null; // 반영 뒤의 그룹으로 다시 만든다
  const done = new Set();
  for (const input of groups.inputs) {
    if (done.has(input) || !live(input)) continue;
    if (input.type === 'radio' && input.name) {
      for (const radio of radiosOf(input, container, groups)) {
        radio.checked = radio.defaultChecked;
        done.add(radio);
      }
    } else if (input.type === 'radio' || input.type === 'checkbox') {
      input.checked = input.defaultChecked;
    }
  }
}

/**
 * input과 같은 radio 그룹(같은 form 소유자, 같은 name)을 문서 순서대로. 이 컨테이너가 그린 것만 다룬다.
 * 컨테이너의 radio를 patch 한 번에 한 번만 훑어 (form, name)별로 묶어 둔다 (그룹마다 전체를 훑지 않도록).
 */
function radiosOf(input, container, groups) {
  if (!input.name) return [input];
  if (!groups.radios) {
    groups.radios = new Map();
    for (const el of container.querySelectorAll('input')) {
      if (el.type !== 'radio' || !el.name) continue;
      const byName = groups.radios.get(el.form) ?? new Map();
      groups.radios.set(el.form, byName);
      byName.set(el.name, [...(byName.get(el.name) ?? []), el]);
    }
  }
  return groups.radios.get(input.form)?.get(input.name) ?? [];
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
      for (const [name, value] of deferLast(Object.entries(p.set))) setProp(p.vnode.dom, name, value, p.prev[name]);
      break;
    case PatchType.TEXT: {
      const dom = p.vnode.dom;
      dom.nodeValue = p.value;
      // textarea의 텍스트 자식은 "기본값"일 뿐이다. 사용자가 입력한 뒤에도 화면 값이 따라오도록 value도 맞춘다.
      const parent = dom.parentNode;
      if (parent && parent.localName === 'textarea' && parent.value !== parent.defaultValue) {
        parent.value = parent.defaultValue;
      }
      break;
    }
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

  // type·multiple은 자식보다 먼저 넣는다. multiple이 없는 select에 option을 붙이면 "하나만 선택" 규칙이 먼저 적용된다.
  const entries = Object.entries(vnode.props);
  const isEarly = ([name]) => EARLY_PROPS.includes(name);
  for (const [name, value] of entries.filter(isEarly)) setProp(dom, name, value, undefined);

  const target = childContainer(dom);
  for (const child of vnode.children) target.appendChild(createDom(child, dom));

  // 나머지 속성은 자식을 만든 뒤에 넣고, value·checked는 그중에서도 마지막에 넣는다.
  // <select value>는 option이 있어야 선택되고, range input의 value는 max를 알아야 잘리지 않는다.
  const rest = entries.filter((e) => !isEarly(e));
  for (const [name, value] of deferLast(rest)) setProp(dom, name, value, undefined);
  return dom;
}

/** [이름, 값] 목록에서 value·checked·selected를 맨 뒤로 보낸다. 만들 때와 갱신할 때 모두 쓴다. */
function deferLast(entries) {
  const isDeferred = ([name]) => DEFERRED_PROPS.includes(name);
  return [...entries.filter((e) => !isDeferred(e)), ...entries.filter(isDeferred)];
}

function setProp(dom, name, value, prevValue) {
  if (name.startsWith('on') && (typeof value === 'function' || typeof prevValue === 'function')) {
    setEventHandler(dom, toEventName(name), typeof value === 'function' ? value : null);
    if (typeof value === 'function') {
      // 문자열 인라인 핸들러(onclick="...")였다면 속성을 지운다. 남겨 두면 두 핸들러가 함께 실행된다.
      if (prevValue != null && typeof prevValue !== 'function') dom.removeAttribute(name.toLowerCase());
      return;
    }
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
    // value로 선택을 정하는 select는 기억해 두고, 선택 그룹을 다시 맞출 때 option 속성 대신 이 값을 쓴다.
    if (dom.localName === 'select') {
      if (value == null) SELECT_VALUES.delete(dom);
      else SELECT_VALUES.set(dom, next);
    }
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
  const remove = value == null || value === false || typeof value === 'function';
  const text = value === true ? '' : String(value);
  // xlink:href, xml:lang 같은 접두어 속성은 네임스페이스가 있어야 SVG(<use> 등)가 알아본다.
  const ns = ATTRIBUTE_NAMESPACES[name.split(':')[0]];
  if (ns && name.includes(':')) {
    if (remove) dom.removeAttributeNS(ns, name.slice(name.indexOf(':') + 1));
    else dom.setAttributeNS(ns, name, text);
    return;
  }
  if (remove) dom.removeAttribute(name);
  else dom.setAttribute(name, text);
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
    else dom.style.setProperty(toKebabCase(name), styleValue(name, value));
  }
  if (dom.getAttribute('style') === '') dom.removeAttribute('style');
}

function isObject(value) {
  return value !== null && typeof value === 'object';
}

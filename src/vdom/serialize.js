import { isTextVNode } from './vnode.js';

const VOID_ELEMENTS = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr',
]);
// 내용을 이스케이프하지 않고 그대로 쓰는 요소 (HTML 파서가 이 안의 글자를 태그·엔티티로 해석하지 않는다).
// noscript는 스크립트가 켜진 브라우저 기준이다. SVG 안의 style·script는 해당하지 않는다.
const RAW_TEXT_ELEMENTS = new Set(['style', 'script', 'xmp', 'iframe', 'noembed', 'noframes', 'noscript', 'plaintext']);
// 공백이 내용인 요소: 이 요소 안쪽(자손 포함)에는 들여쓰기를 넣으면 내용이 바뀐다
const WHITESPACE_SENSITIVE = new Set(['pre', 'textarea', 'listing', 'plaintext']);
// HTML 파서는 이 요소의 여는 태그 바로 뒤 줄바꿈 하나를 버린다. 내용이 줄바꿈으로 시작하면 하나 더 써 둬야 보존된다.
const LEADING_NEWLINE_DROPPED = new Set(['pre', 'textarea', 'listing']);
const SVG_ROOT = 'svg';
const SVG_HTML_ISLAND = 'foreignObject';

const INDENT = '  ';

/**
 * 가상 노드를 HTML 문자열로 바꾼다. 테스트 영역에 코드로 보여 줄 때 쓴다.
 *
 * 자식이 모두 요소면 한 줄에 하나씩 들여써서 읽기 좋게 만든다.
 * 이때 생기는 "줄바꿈+공백" 텍스트는 domToVNode가 버리므로, 다시 읽어도 같은 가상 트리가 된다.
 * 텍스트가 섞인 자식이나 pre 안쪽은 공백이 내용이므로 줄을 나누지 않는다.
 */
const ROOT_CONTEXT = { parentType: null, preserve: false, rawText: false, inSvg: false };

export function vnodeToHTML(vnode) {
  return serializeNode(vnode, 0, ROOT_CONTEXT);
}

export function childrenToHTML(children) {
  return serializeChildren(children, 0, ROOT_CONTEXT);
}

function serializeNode(vnode, depth, ctx) {
  if (isTextVNode(vnode)) {
    const value = vnode.props.nodeValue;
    return ctx.rawText ? value : escapeText(value);
  }
  const open = `<${vnode.type}${attributesToHTML(vnode.props)}>`;
  if (VOID_ELEMENTS.has(vnode.type) && !ctx.inSvg) return open;

  const inSvg = (ctx.inSvg || vnode.type === SVG_ROOT) && vnode.type !== SVG_HTML_ISLAND;
  const rawText = !inSvg && RAW_TEXT_ELEMENTS.has(vnode.type);
  const childCtx = {
    parentType: vnode.type,
    preserve: ctx.preserve || WHITESPACE_SENSITIVE.has(vnode.type) || rawText,
    rawText,
    inSvg,
  };
  const close = `</${vnode.type}>`;
  if (shouldBreakLines(vnode.children, childCtx)) {
    return `${open}\n${serializeChildren(vnode.children, depth + 1, childCtx)}\n${INDENT.repeat(depth)}${close}`;
  }
  const first = vnode.children[0];
  const extraNewline =
    !inSvg && LEADING_NEWLINE_DROPPED.has(vnode.type) && isTextVNode(first) && first.props.nodeValue.startsWith('\n')
      ? '\n'
      : '';
  return `${open}${extraNewline}${serializeChildren(vnode.children, depth + 1, childCtx)}${close}`;
}

function serializeChildren(children, depth, ctx) {
  if (shouldBreakLines(children, ctx)) {
    const pad = INDENT.repeat(depth);
    return children.map((child) => pad + serializeNode(child, depth, ctx)).join('\n');
  }
  return children.map((child) => serializeNode(child, depth, ctx)).join('');
}

function shouldBreakLines(children, ctx) {
  return !ctx.preserve && children.length > 0 && children.every((child) => !isTextVNode(child));
}

/** props → ` name="value"` 문자열. 함수(이벤트 핸들러)와 false·null은 HTML 속성이 아니므로 뺀다. */
export function attributesToHTML(props) {
  let out = '';
  for (const [name, value] of Object.entries(props)) {
    if (value == null || value === false || typeof value === 'function') continue;
    const attrName = toAttributeName(name);
    if (value === true) {
      out += ` ${attrName}`;
    } else if (name === 'style' && typeof value === 'object') {
      out += ` style="${escapeAttribute(styleToString(value))}"`;
    } else {
      out += ` ${attrName}="${escapeAttribute(String(value))}"`;
    }
  }
  return out;
}

export function toAttributeName(name) {
  if (name === 'className') return 'class';
  if (name === 'htmlFor') return 'for';
  return name;
}

export function styleToString(style) {
  return Object.entries(style)
    .filter(([, v]) => v != null && v !== '')
    .map(([k, v]) => `${toKebabCase(k)}: ${v};`)
    .join(' ');
}

export function toKebabCase(name) {
  return name.startsWith('--') ? name : name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
}

function escapeText(value) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeAttribute(value) {
  return escapeText(value).replace(/"/g, '&quot;');
}

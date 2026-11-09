import { createVNode, createTextVNode, isTextVNode } from './vnode.js';

const ELEMENT_NODE = 1;
const TEXT = 3;

// 이 요소들 안에서는 공백도 내용이라 그대로 둔다.
const WHITESPACE_SENSITIVE = new Set(['pre', 'textarea', 'listing', 'plaintext']);

// sanitize: 스크립트를 실행하거나 페이지 전체에 영향을 주는 요소
const BLOCKED_ELEMENTS = new Set([
  'script', 'iframe', 'frame', 'frameset', 'object', 'embed', 'base', 'meta', 'link', 'plaintext',
  'style', // 페이지 전체 스타일을 덮어써 버튼을 숨기는 등 되돌릴 수 없게 만들 수 있다 (style 속성은 허용)
]);
// sanitize: URL을 받는 속성 (javascript: 같은 스킴을 막는다)
const URL_ATTRIBUTES = new Set(['href', 'src', 'action', 'formaction', 'xlink:href', 'poster', 'background']);
const DANGEROUS_URL = /^(javascript|vbscript|data):/i;

// DOM API(createElement, setAttribute)가 받는 이름 = XML Name 규칙. 파서는 `<p<b>`, `@click`처럼 이보다 넓게 받아들인다.
const NAME_START =
  ':A-Z_a-z\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u02FF\\u0370-\\u037D\\u037F-\\u1FFF\\u200C-\\u200D' +
  '\\u2070-\\u218F\\u2C00-\\u2FEF\\u3001-\\uD7FF\\uF900-\\uFDCF\\uFDF0-\\uFFFD';
const NAME_CHAR = `${NAME_START}\\-.0-9\\u00B7\\u0300-\\u036F\\u203F-\\u2040`;
const VALID_TAG_NAME = new RegExp(`^[A-Za-z][${NAME_CHAR}]*$`);
const VALID_ATTRIBUTE_NAME = new RegExp(`^[${NAME_START}][${NAME_CHAR}]*$`);

/**
 * 실제 DOM 노드를 읽어 가상 노드로 바꾼다. DOM은 읽기만 한다.
 *
 * - 주석·처리 지시 노드는 버린다. 그래서 붙게 된 텍스트(`a<!-- -->b`)는 하나로 합친다(attach일 때는 합치지 않는다).
 * - 줄바꿈이 들어 있는 공백 전용 텍스트(들여쓰기)는 버린다. 줄바꿈 없는 공백(`<b>a</b> <i>b</i>`)은 글자 사이 간격이라 남긴다.
 *   공백은 HTML의 ASCII 공백만 본다(&nbsp;는 내용이다).
 *   절충: 인라인 요소 사이의 줄바꿈(`<b>a</b>\n<i>b</i>`)도 들여쓰기로 보고 버리므로 화면의 "a b"가 "ab"가 된다.
 *   JSX가 줄바꿈 공백을 버리는 것과 같은 규칙이다. 띄어쓰기가 필요하면 같은 줄에 공백을 쓴다.
 * - `key` 속성은 가상 노드의 key로도 읽는다. (HTML로 쓴 목록도 key로 비교할 수 있게)
 * - <template>는 template.content 안의 노드를 자식으로 읽는다.
 * - DOM API가 받지 않는 태그·속성 이름은 버린다(요소는 자식만 남긴다). 버린 것은 onWarning으로 알린다.
 *
 * @param {Node} node
 * @param {{ attach?: boolean, preserveWhitespace?: boolean, sanitize?: boolean, onWarning?: (message: string) => void }} options
 *   attach: 가상 노드에 원래 DOM 노드를 연결한다. 이미 화면에 있는 DOM을 이어받아 patch할 때(hydration) 쓴다.
 *   preserveWhitespace: 들여쓰기 공백 텍스트도 버리지 않고 읽는다. 실제 DOM을 노드 하나까지 그대로 옮겨야 할 때(실패 복구) 쓴다.
 *   sanitize: 사용자가 입력한 HTML을 화면에 옮길 때의 "실수 방지" 필터.
 *     script·iframe·object·embed·base·meta·link 요소, on* 속성, srcdoc, javascript:/data: URL을 버린다.
 *     신뢰할 수 없는 HTML을 안전하게 만드는 보안 sanitizer는 아니다.
 * @returns {object|null} 변환할 수 없는 노드면 null
 */
export function domToVNode(node, options = {}) {
  return convert(node, options, Boolean(options.preserveWhitespace))[0] ?? null;
}

/**
 * HTML 문자열을 최상위 가상 노드 배열로 바꾼다.
 * <template>의 내용은 문서와 분리된 DocumentFragment라서, 파싱해도 화면의 DOM은 바뀌지 않고 스크립트도 실행되지 않는다.
 */
export function htmlToVNodes(html, options = {}) {
  const template = document.createElement('template');
  template.innerHTML = html;
  return convertChildren(template.content.childNodes, options, false);
}

// 노드 하나를 변환한 결과를 배열로 돌려준다: 보통 0개 또는 1개, 이름이 잘못된 요소는 자식들.
function convert(node, options, preserveWhitespace) {
  if (node.nodeType === TEXT) {
    if (!preserveWhitespace && isFormattingWhitespace(node.nodeValue)) return [];
    return [attach(createTextVNode(node.nodeValue), node, options)];
  }
  if (node.nodeType !== ELEMENT_NODE) return [];

  const type = node.localName; // HTML은 소문자, SVG는 원래 대소문자(linearGradient)를 유지한다.
  if (options.sanitize && BLOCKED_ELEMENTS.has(type)) return [];

  const keepSpace = preserveWhitespace || WHITESPACE_SENSITIVE.has(type);
  const source = type === 'template' && node.content ? node.content : node;
  const children = convertChildren(source.childNodes, options, keepSpace);

  if (!VALID_TAG_NAME.test(type)) {
    warn(options, `잘못된 태그 이름 <${type}>: 요소는 건너뛰고 내용만 남겼습니다.`);
    return children;
  }

  const props = {};
  for (const { name, value } of node.attributes) {
    if (!VALID_ATTRIBUTE_NAME.test(name)) {
      warn(options, `잘못된 속성 이름 ${name} (<${type}>): 건너뛰었습니다.`);
      continue;
    }
    if (options.sanitize && isBlockedAttribute(name, value)) continue;
    props[name] = value;
  }

  const key = props.key ?? null;
  return [attach(createVNode(type, props, children, key), node, options)];
}

function convertChildren(nodes, options, preserveWhitespace) {
  const children = [];
  for (const child of nodes) {
    for (const vnode of convert(child, options, preserveWhitespace)) {
      // 주석을 버리면 `a<!-- -->b`의 텍스트가 둘로 갈려 남는다. HTML로 쓰면 "ab" 하나가 되므로 읽을 때도 합친다.
      // attach일 때는 합치지 않는다: 가상 노드 하나가 실제 텍스트 노드 하나를 가리켜야 TEXT 패치가 맞다.
      const last = children[children.length - 1];
      if (!options.attach && isTextVNode(vnode) && isTextVNode(last)) {
        last.props.nodeValue += vnode.props.nodeValue;
      } else {
        children.push(vnode);
      }
    }
  }
  return children;
}

function isBlockedAttribute(name, value) {
  const lower = name.toLowerCase();
  if (lower.startsWith('on') || lower === 'srcdoc') return true;
  // 브라우저는 URL 앞뒤 공백과 제어 문자를 무시하므로 같은 방식으로 지운 뒤 스킴을 본다.
  return URL_ATTRIBUTES.has(lower) && DANGEROUS_URL.test(value.replace(/[\u0000- ]/g, ''));
}

// HTML의 공백은 ASCII 공백(스페이스, 탭, 줄바꿈, 폼피드, CR)뿐이다. String.prototype.trim은 &nbsp;까지 지우므로 쓰지 않는다.
function isFormattingWhitespace(text) {
  return text.includes('\n') && /^[ \t\n\f\r]*$/.test(text);
}

function warn(options, message) {
  options.onWarning?.(message);
}

function attach(vnode, node, options) {
  if (options.attach) vnode.dom = node;
  return vnode;
}

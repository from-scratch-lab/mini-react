/**
 * 차등(differential) fuzz 하네스.
 *
 * 정답지는 브라우저 자신의 HTML 파서다. 무작위 HTML을 `div.innerHTML`로 그린 결과와,
 * Phase 1 경로(htmlToVNodes → 이전 트리와 diff → patch)로 그린 결과를 단계마다 비교한다.
 * 같은 컨테이너를 여러 단계 이어서 고치므로 "어떤 이전 상태에서 patch해도 맞는가"를 본다.
 *
 * 불일치 종류
 *   dom         속성·자식 구조. 정답지는 domToVNode 규칙대로 주석·줄바꿈 공백을 걷어 내고 붙은 텍스트를 합친다.
 *               patch 결과는 걷어 내지 않고 그대로 비교한다(남은 공백 텍스트, 둘로 쪼개진 텍스트도 잡는다).
 *   live        폼 프로퍼티: input value/checked, select selectedIndex, option selected, textarea value, details open
 *   refs        가상 노드와 실제 노드가 하나씩 맞물린다: 모든 가상 노드가 dom을 갖고, 그 dom의 종류·내용이 같고,
 *               부모가 부모 가상 노드의 dom이고, 컨테이너 안 실제 노드 수가 가상 노드 수와 같다
 *               ("이전 트리 노드는 모두 dom을 가진다" — perf의 collectNodes 대체 조건)
 *   idempotent  테스트 영역에 보여 줄 코드(childrenToHTML)를 다시 읽어 diff하면 패치가 0이어야 한다
 *   throw       diff·patch가 예외를 던짐
 *
 * 불일치가 나면 그 단계를 "빈 컨테이너 → 이전 단계 HTML → 이번 HTML" 두 번의 patch로 다시 만들어 보고,
 * 같은 종류로 실패하는 동안 맨 위 단계 노드를 하나씩 빼서 최소 재현(minimal)을 함께 보고한다.
 *
 * 브라우저 환경(전역 document)이 필요하다: vitest(jsdom) 또는 scripts/fuzz.js.
 */
import {
  htmlToVNodes,
  diff,
  patch as realPatch,
  createVNode,
  childrenToHTML,
  domToVNode,
  TEXT_NODE,
} from '../../src/index.js';
import { measureMutations } from '../../scripts/lib/mutations.js';

/** 시드가 고정된 난수. 같은 시드면 같은 입력이 나와 실패를 그대로 재현할 수 있다. */
export function mulberry32(seed) {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 엔티티·공백·이모지·따옴표가 섞인 텍스트. '\n  '은 줄바꿈 공백(버려지는 들여쓰기)이다.
const TEXTS = ['a', 'b', ' ', '&amp;', '&lt;x&gt;', '&nbsp;', '한글', '\n  ', ' c ', '&#x1F600;', '"q"'];
const ATTRS = [
  'class="x"', 'class="y"', 'title="t &quot;1&quot;"', 'data-k="1"', 'hidden', 'id="i"',
  'style="color: red"', 'key="a"', 'key="b"', 'key="c"', 'aria-label="L"',
];

/**
 * 무작위 HTML 조각 하나. table·form·select·textarea·pre·svg·details·dl·void·커스텀 요소·key 목록을 섞는다.
 * form은 맨 위 단계에서만 만든다: <p> 안의 <form>은 파서가 p를 닫아 버려, 직렬화 후 다시 읽으면 다른 트리가 된다(B5, HTML의 한계).
 */
export function randomHTML(rand) {
  const pick = (xs) => xs[Math.floor(rand() * xs.length)];
  const attrs = () => {
    let out = '';
    const used = new Set();
    for (let i = Math.floor(rand() * 3); i > 0; i -= 1) {
      const a = pick(ATTRS);
      const name = a.split('=')[0];
      if (!used.has(name)) {
        used.add(name);
        out += ` ${a}`;
      }
    }
    return out;
  };
  const many = (n, make) => Array.from({ length: Math.floor(rand() * n) }, make).join(pick(['', '\n  ', ' ']));

  function node(depth, top) {
    if (depth === 0 || rand() < 0.2) return pick(TEXTS);
    const kinds = ['block', 'block', 'list', 'table', 'select', 'svg', 'pre', 'details', 'void', 'textarea', 'dl'];
    if (top) kinds.push('form');
    switch (pick(kinds)) {
      case 'block': {
        const tag = pick(['div', 'p', 'span', 'b', 'i', 'section', 'em', 'a', 'my-el']);
        return `<${tag}${attrs()}>${many(4, () => node(depth - 1, false))}</${tag}>`;
      }
      case 'list': {
        const tag = pick(['ul', 'ol']);
        return `<${tag}${attrs()}>${many(5, () => `<li${attrs()}>${node(depth - 1, false)}</li>`)}</${tag}>`;
      }
      case 'table':
        return `<table${attrs()}>${pick(['', '<caption>c</caption>'])}<tbody>${many(3, () =>
          `<tr>${many(3, () => {
            const cell = pick(['td', 'th']);
            return `<${cell}${attrs()}>${node(depth - 1, false)}</${cell}>`;
          })}</tr>`)}</tbody></table>`;
      case 'form':
        return `<form>${many(4, () =>
          pick([
            `<input type="checkbox"${pick(['', ' checked'])}>`,
            `<input value="${pick(['v', 'w', ''])}">`,
            `<input type="radio" name="r"${pick(['', ' checked'])}>`,
            `<button${pick(['', ' disabled'])}>b</button>`,
            '<label for="i">l</label>',
            `<input type="range" min="0" max="300" value="${pick(['50', '250'])}">`,
          ]))}</form>`;
      case 'select':
        return `<select${pick(['', ' multiple'])}>${many(4, () =>
          `<option${pick(['', ' selected', ' value="z"'])}>${pick(['o1', 'o2', 'o3'])}</option>`)}</select>`;
      case 'svg':
        return `<svg viewBox="0 0 10 10">${many(3, () =>
          pick([
            '<circle cx="1" r="1"/>',
            `<rect width="2" height="${pick(['1', '2'])}"/>`,
            '<g class="x"><path d="M0 0L1 1"/></g>',
            '<text>t</text>',
            '<linearGradient id="g"><stop offset="0"/></linearGradient>',
          ]))}</svg>`;
      case 'pre':
        return `<pre>${pick(['\n', '', '\n\n'])}${pick(['x', '  y\n z', '&lt;'])}</pre>`;
      case 'textarea':
        return `<textarea>${pick(['\n', '', '\n\n'])}${pick(['x', '  y', '&lt;b&gt;'])}</textarea>`;
      case 'details':
        return `<details${pick(['', ' open'])}><summary>s</summary>${node(depth - 1, false)}</details>`;
      case 'dl':
        return `<dl>${many(3, () => `<dt>t</dt><dd>${node(depth - 1, false)}</dd>`)}</dl>`;
      default:
        return pick(['<br>', '<hr>', '<img alt="x">', '<wbr>']);
    }
  }
  return Array.from({ length: 1 + Math.floor(rand() * 4) }, () => node(3, true)).join(pick(['', '\n', ' ']));
}

const SVG_NS = 'http://www.w3.org/2000/svg';
// src/vdom/domToVNode.js와 같은 목록
const WHITESPACE_SENSITIVE = new Set(['pre', 'textarea', 'listing', 'plaintext']);

/**
 * 비교용 문자열. 속성은 정렬한다(순서는 의미 없음).
 * 정답지(strict: false)는 domToVNode가 버리는 것(주석, 줄바꿈이 든 공백 텍스트)을 걷어 내고 붙은 텍스트를 합친다.
 * patch 결과(strict: true)는 그대로 쓴다. patch가 만든 DOM에는 버릴 것이 없어야 하기 때문이다.
 */
export function canonical(node, { strict = false } = {}, keepSpace = false) {
  if (node.nodeType === 3) return JSON.stringify(node.nodeValue);
  if (node.nodeType !== 1) return `#${node.nodeName}`;
  const attrs = [...node.attributes].map((a) => `${a.name}=${JSON.stringify(a.value)}`).sort().join(' ');
  const space = keepSpace || WHITESPACE_SENSITIVE.has(node.localName);
  const parts = [];
  let text = null;
  const source = node.localName === 'template' && node.content ? node.content : node;
  for (const child of source.childNodes) {
    if (strict) {
      parts.push(canonical(child, { strict }, space));
      continue;
    }
    if (child.nodeType === 3) {
      if (!space && child.nodeValue.includes('\n') && /^[ \t\n\f\r]*$/.test(child.nodeValue)) continue;
      text = (text ?? '') + child.nodeValue;
      continue;
    }
    if (child.nodeType !== 1) continue;
    if (text !== null) parts.push(JSON.stringify(text));
    text = null;
    parts.push(canonical(child, { strict }, space));
  }
  if (text !== null) parts.push(JSON.stringify(text));
  const ns = node.namespaceURI === SVG_NS ? 'svg:' : '';
  return `<${ns}${node.localName} ${attrs}>[${parts.join(',')}]`;
}

/** 속성에는 드러나지 않는 화면 상태(프로퍼티) */
export function liveState(root) {
  const out = [];
  for (const el of root.querySelectorAll('input,select,textarea,option,details')) {
    if (el.localName === 'input') out.push(`input[${el.type}] value=${el.value} checked=${el.checked}`);
    else if (el.localName === 'select') out.push(`select selectedIndex=${el.selectedIndex}`);
    else if (el.localName === 'textarea') out.push(`textarea value=${JSON.stringify(el.value)}`);
    else if (el.localName === 'option') out.push(`option selected=${el.selected}`);
    else out.push(`details open=${el.open}`);
  }
  return out.join('\n');
}

/**
 * 가상 노드와 실제 노드가 하나씩 맞물리는지. 문제가 있으면 설명, 없으면 null.
 * - 루트 가상 노드는 컨테이너를 가리킨다.
 * - 모든 가상 노드가 서로 다른 dom을 갖고, dom의 종류(태그 이름, 텍스트면 내용)가 같다.
 * - dom의 부모가 부모 가상 노드의 dom이다(<template>이면 그 content).
 * - 컨테이너 안 실제 노드 수(template content 포함)가 가상 노드 수와 같다. 그래서 가상 트리가 모르는 노드가 없다.
 */
export function checkDomRefs(root, container) {
  if (root.dom !== container) return '루트 가상 노드가 컨테이너를 가리키지 않음';
  const problems = [];
  const seen = new Set();
  let count = 0;
  (function walk(vnode, path) {
    const holder = vnode.dom.localName === 'template' && vnode.dom.content ? vnode.dom.content : vnode.dom;
    vnode.children.forEach((child, i) => {
      const at = `${path}/${i}:${child.type}`;
      count += 1;
      const dom = child.dom;
      if (dom == null) return problems.push(`${at}: dom이 없음`);
      if (seen.has(dom)) return problems.push(`${at}: 다른 가상 노드와 같은 dom을 가리킴`);
      seen.add(dom);
      if (dom.parentNode !== holder) problems.push(`${at}: dom의 부모가 부모 가상 노드의 dom이 아님`);
      const sameKind =
        child.type === TEXT_NODE
          ? dom.nodeType === 3 && dom.nodeValue === child.props.nodeValue
          : dom.nodeType === 1 && dom.localName === child.type;
      if (!sameKind) problems.push(`${at}: dom의 종류·내용이 다름 (${dom.nodeName})`);
      else if (dom.nodeType === 1) walk(child, at);
    });
  })(root, root.type);
  const actual = countNodes(container);
  if (actual !== count) problems.push(`컨테이너 안 실제 노드 ${actual}개, 가상 노드 ${count}개`);
  return problems.length ? problems.join('\n') : null;
}

function countNodes(node) {
  const holder = node.localName === 'template' && node.content ? node.content : node;
  let n = 0;
  for (const child of holder.childNodes) n += 1 + countNodes(child);
  return n;
}

class Mismatch {
  constructor(fields) {
    Object.assign(this, fields);
  }

  toString() {
    const lines = [
      `seed ${this.seed} · round ${this.round} · step ${this.step} · ${this.kind}`,
      `이전 단계 HTML: ${JSON.stringify(this.previous)}`,
      `HTML: ${JSON.stringify(this.html)}`,
    ];
    if (this.minimal) {
      lines.push(`최소 재현: 빈 컨테이너 → ${JSON.stringify(this.minimal.previous)} → ${JSON.stringify(this.minimal.html)}`);
    }
    lines.push(`기대: ${this.expected}`, `실제: ${this.got}`);
    return lines.join('\n');
  }
}

/**
 * 한 단계: rendered(지금 그려진 트리)에서 children으로 patch하고 정답지(html을 브라우저가 파싱한 것)와 비교한다.
 * @returns {{ rendered: object, measured?: object, mismatch?: { kind: string, expected: string, got: string } }}
 */
function runStep(container, rendered, children, html, { patchImpl, serialize }) {
  const next = createVNode('div', {}, children, null);
  const reference = document.createElement('div');
  reference.innerHTML = html;

  let measured;
  try {
    measured = measureMutations(container, () => patchImpl(container, diff(rendered, next)));
  } catch (error) {
    return { rendered, mismatch: { kind: 'throw', expected: '예외 없음', got: error.stack } };
  }
  const result = { rendered: next, measured };

  const expectedDom = canonical(reference);
  const gotDom = canonical(container, { strict: true });
  if (gotDom !== expectedDom) return { ...result, mismatch: { kind: 'dom', expected: expectedDom, got: gotDom } };

  const expectedLive = liveState(reference);
  const gotLive = liveState(container);
  if (gotLive !== expectedLive) return { ...result, mismatch: { kind: 'live', expected: expectedLive, got: gotLive } };

  const refs = checkDomRefs(next, container);
  if (refs) return { ...result, mismatch: { kind: 'refs', expected: '가상 노드와 실제 노드가 하나씩 맞물림', got: refs } };

  // 테스트 영역에 보여 줄 코드를 고치지 않고 다시 Patch하면 아무것도 바뀌지 않아야 한다.
  const shown = serialize(next.children);
  const noop = diff(next, createVNode('div', {}, htmlToVNodes(shown, { sanitize: true }), null));
  if (noop.length > 0) {
    return {
      ...result,
      mismatch: { kind: 'idempotent', expected: '패치 0개', got: `${noop.map((p) => p.type).join(', ')}\n보여 준 코드: ${shown}` },
    };
  }
  return result;
}

/** 빈 컨테이너에서 previous → html 두 번 patch했을 때 두 번째 단계의 불일치 종류 (첫 단계가 실패하거나 맞으면 null) */
function reproduce(previous, html, options) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  try {
    const empty = domToVNode(container, { attach: true });
    const first = runStep(container, empty, htmlToVNodes(previous, { sanitize: true }), previous, options);
    if (first.mismatch) return null;
    const second = runStep(container, first.rendered, htmlToVNodes(html, { sanitize: true }), html, options);
    return second.mismatch?.kind ?? null;
  } finally {
    container.remove();
  }
}

/** 맨 위 단계 노드들의 HTML 조각 (빼 보기 단위) */
function topLevelParts(html) {
  const template = document.createElement('template');
  template.innerHTML = html;
  const box = document.createElement('div');
  return [...template.content.childNodes].map((node) => {
    if (node.nodeType === 1) return node.outerHTML;
    box.textContent = node.nodeType === 3 ? node.nodeValue : '';
    return box.innerHTML;
  });
}

/**
 * 같은 종류로 실패하는 동안 이전 단계·이번 단계 HTML에서 맨 위 노드를 하나씩 뺀다.
 * 두 단계만으로 다시 만들 수 없으면(앞의 여러 단계가 쌓인 상태가 필요하면) null.
 */
function shrink(previous, html, kind, options) {
  if (reproduce(previous, html, options) !== kind) return null;
  let parts = { previous: topLevelParts(previous), html: topLevelParts(html) };
  const join = (p) => ({ previous: p.previous.join(''), html: p.html.join('') });
  for (const side of ['previous', 'html']) {
    for (let i = 0; i < parts[side].length; ) {
      const candidate = { ...parts, [side]: parts[side].filter((_, j) => j !== i) };
      const { previous: p, html: h } = join(candidate);
      if (reproduce(p, h, options) === kind) parts = candidate;
      else i += 1;
    }
  }
  return join(parts);
}

/**
 * @param {object} options
 * @param {number} options.seed
 * @param {number} [options.rounds=100] 새 컨테이너로 시작하는 횟수
 * @param {number} [options.steps=4] 한 컨테이너에서 이어서 patch하는 횟수
 * @param {number} [options.reuse=0] 단계마다 이전 트리의 하위 트리 객체를 다음 트리 맨 위 단계에 다시 넣을 확률 (두 자리에 넣기도 한다)
 * @param {Function} [options.patchImpl] patch 대신 쓸 함수 (하네스 자체를 검사할 때)
 * @param {Function} [options.serialize] 테스트 영역 코드를 만드는 함수 (기본 childrenToHTML, 하네스 검사용)
 * @param {number} [options.maxMismatches=5] 이만큼 모이면 멈춘다
 */
export function runDifferential({
  seed,
  rounds = 100,
  steps = 4,
  reuse = 0,
  patchImpl = realPatch,
  serialize = childrenToHTML,
  maxMismatches = 5,
}) {
  const options = { patchImpl, serialize };
  const rand = mulberry32(seed);
  const report = { seed, steps: 0, reused: 0, mismatches: [], patchesByType: {}, records: 0, nodesAdded: 0, nodesRemoved: 0, created: 0 };

  for (let round = 0; round < rounds && report.mismatches.length < maxMismatches; round += 1) {
    const container = document.createElement('div');
    document.body.appendChild(container);
    let rendered = domToVNode(container, { attach: true });
    let previous = '';
    try {
      for (let step = 0; step < steps; step += 1) {
        report.steps += 1;
        let html = randomHTML(rand);
        const children = htmlToVNodes(html, { sanitize: true });
        if (reuse > 0 && rand() < reuse) {
          report.reused += reuseSubtrees(rand, rendered, children);
          // 정답지도 재사용한 트리를 직렬화한 것. 이 단계에서는 htmlToVNodes·직렬화 버그가 정답지에도 들어가므로
          // 그런 버그는 재사용하지 않는 단계가 잡는다.
          html = childrenToHTML(children);
        }
        const result = runStep(container, rendered, children, html, options);
        if (result.measured) {
          for (const p of result.measured.result) report.patchesByType[p.type] = (report.patchesByType[p.type] ?? 0) + 1;
          report.records += result.measured.records;
          report.nodesAdded += result.measured.nodesAdded;
          report.nodesRemoved += result.measured.nodesRemoved;
          report.created += result.measured.created;
        }
        if (result.mismatch) {
          const minimal = shrink(previous, html, result.mismatch.kind, options);
          report.mismatches.push(new Mismatch({ seed, round, step, previous, html, minimal, ...result.mismatch }));
          break;
        }
        rendered = result.rendered;
        previous = html;
      }
    } finally {
      container.remove();
    }
  }
  return report;
}

// 재사용해도 다시 읽었을 때 같은 자리에 오는 태그만 고른다(맨 위 단계는 div 안이다). 텍스트는 옆 텍스트와 합쳐지므로 뺀다.
const REUSABLE = new Set(['div', 'section', 'span', 'b', 'i', 'em', 'ul', 'ol', 'dl', 'table', 'select', 'svg', 'pre', 'details', 'textarea', 'br', 'hr', 'img']);

/** 이전 트리(rendered)의 하위 트리 객체를 children 맨 위 단계에 그대로(복사하지 않고) 끼워 넣는다. 넣은 개수를 돌려준다. */
function reuseSubtrees(rand, rendered, children) {
  const candidates = [];
  (function collect(vnode) {
    for (const child of vnode.children) {
      if (REUSABLE.has(child.type) && !hasForm(child)) candidates.push(child);
      collect(child);
    }
  })(rendered);
  if (candidates.length === 0) return 0;
  const chosen = candidates[Math.floor(rand() * candidates.length)];
  const times = rand() < 0.3 ? 2 : 1; // 같은 객체를 두 자리에
  for (let i = 0; i < times; i += 1) children.splice(Math.floor(rand() * (children.length + 1)), 0, chosen);
  return times;
}

function hasForm(vnode) {
  return vnode.type === 'form' || vnode.children.some(hasForm);
}

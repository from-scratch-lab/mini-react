/**
 * 차등(differential) fuzz 하네스.
 *
 * 정답지는 브라우저 자신의 HTML 파서다. 무작위 HTML을 `div.innerHTML`로 그린 결과와,
 * Phase 1 경로(htmlToVNodes → 이전 트리와 diff → patch)로 그린 결과를 단계마다 비교한다.
 * 같은 컨테이너를 여러 단계 이어서 고치므로 "어떤 이전 상태에서 patch해도 맞는가"를 본다.
 *
 * 불일치 종류
 *   dom         속성·자식 구조 (domToVNode 규칙대로 주석·줄바꿈 공백은 걷어 내고 비교)
 *   live        폼 프로퍼티: input value/checked, select selectedIndex, option selected, textarea value, details open
 *   idempotent  테스트 영역에 보여 줄 코드(childrenToHTML)를 다시 읽어 diff하면 패치가 0이어야 한다
 *   refs        그린 트리의 모든 가상 노드가 서로 다른, 컨테이너 안의 실제 노드를 가리켜야 한다
 *               ("이전 트리 노드는 모두 dom을 가진다" — perf의 collectNodes 대체 조건)
 *   throw       diff·patch가 예외를 던짐
 *
 * 브라우저 환경(전역 document)이 필요하다: vitest(jsdom) 또는 scripts/fuzz.js.
 */
import { htmlToVNodes, diff, patch as realPatch, createVNode, childrenToHTML, domToVNode } from '../../src/index.js';
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
          `<tr>${many(3, () => `<${pick(['td', 'th'])}${attrs()}>${node(depth - 1, false)}</td>`)}</tr>`)}</tbody></table>`;
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
const WHITESPACE_SENSITIVE = new Set(['pre', 'textarea', 'listing']);

/**
 * 비교용 문자열. 속성은 정렬하고(순서는 의미 없음), domToVNode가 버리는 것(주석, 줄바꿈이 든 공백 텍스트)은 걷어 낸다.
 * 붙어 있는 텍스트 노드는 하나로 합친다(화면에 보이는 결과가 같다).
 */
export function canonical(node, keepSpace = false) {
  if (node.nodeType === 3) return JSON.stringify(node.nodeValue);
  const attrs = [...node.attributes].map((a) => `${a.name}=${JSON.stringify(a.value)}`).sort().join(' ');
  const space = keepSpace || WHITESPACE_SENSITIVE.has(node.localName);
  const parts = [];
  let text = null;
  const source = node.localName === 'template' && node.content ? node.content : node;
  for (const child of source.childNodes) {
    if (child.nodeType === 3) {
      if (!space && child.nodeValue.includes('\n') && /^[ \t\n\f\r]*$/.test(child.nodeValue)) continue;
      text = (text ?? '') + child.nodeValue;
      continue;
    }
    if (child.nodeType !== 1) continue;
    if (text !== null) parts.push(JSON.stringify(text));
    text = null;
    parts.push(canonical(child, space));
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

/** 그린 트리의 모든 가상 노드가 서로 다른, container 안의 실제 노드를 가리키는지. 문제가 있으면 설명, 없으면 null */
export function checkDomRefs(root, container) {
  const seen = new Map();
  const problems = [];
  (function walk(vnode, path) {
    const dom = vnode.dom;
    if (dom == null) problems.push(`${path}: dom이 없음`);
    else if (!isInside(dom, container)) problems.push(`${path}: dom이 컨테이너 밖`);
    else if (seen.has(dom)) problems.push(`${path}: ${seen.get(dom)}와 같은 dom을 가리킴`);
    else seen.set(dom, path);
    vnode.children.forEach((child, i) => walk(child, `${path}/${i}:${child.type}`));
  })(root, root.type);
  return problems.length ? problems.join('\n') : null;
}

// <template> 안 노드는 content(DocumentFragment)에 있어 contains()로 찾을 수 없다. host를 따라 올라간다.
function isInside(node, container) {
  for (let n = node; n; n = n.parentNode ?? n.host) {
    if (n === container) return true;
    if (n.nodeType === 11 && !n.host) {
      const owner = [...container.querySelectorAll('template')].find((t) => t.content === n);
      if (!owner) return false;
      n = owner;
      if (n === container) return true;
    }
  }
  return false;
}

class Mismatch {
  constructor(fields) {
    Object.assign(this, fields);
  }

  toString() {
    const where = `seed ${this.seed} · round ${this.round} · step ${this.step} · ${this.kind}`;
    return [where, `이전 단계 HTML: ${JSON.stringify(this.previous)}`, `HTML: ${JSON.stringify(this.html)}`, `기대: ${this.expected}`, `실제: ${this.got}`].join('\n');
  }
}

/**
 * @param {object} options
 * @param {number} options.seed
 * @param {number} [options.rounds=100] 새 컨테이너로 시작하는 횟수
 * @param {number} [options.steps=4] 한 컨테이너에서 이어서 patch하는 횟수
 * @param {number} [options.reuse=0] 단계마다 이전 트리의 하위 트리 객체를 다음 트리 맨 위 단계에 다시 넣을 확률 (두 자리에 넣기도 한다)
 * @param {Function} [options.patchImpl] patch 대신 쓸 함수 (하네스 자체를 검사할 때)
 * @param {number} [options.maxMismatches=5] 이만큼 모이면 멈춘다
 */
export function runDifferential({ seed, rounds = 100, steps = 4, reuse = 0, patchImpl = realPatch, maxMismatches = 5 }) {
  const rand = mulberry32(seed);
  const report = { seed, steps: 0, reused: 0, mismatches: [], patchesByType: {}, records: 0, nodesAdded: 0, nodesRemoved: 0, created: 0 };
  const fail = (fields) => report.mismatches.push(new Mismatch({ seed, ...fields }));

  for (let round = 0; round < rounds && report.mismatches.length < maxMismatches; round += 1) {
    const container = document.createElement('div');
    document.body.appendChild(container);
    let rendered = domToVNode(container, { attach: true });
    let previous = "";
    try {
      for (let step = 0; step < steps; step += 1) {
        report.steps += 1;
        const at = { round, step, previous };
        let html = randomHTML(rand);
        const children = htmlToVNodes(html, { sanitize: true });
        if (reuse > 0 && rand() < reuse) {
          report.reused += reuseSubtrees(rand, rendered, children);
          html = childrenToHTML(children); // 정답지도 재사용한 트리 그대로
        }
        const next = createVNode('div', {}, children, null);

        const reference = document.createElement('div');
        reference.innerHTML = html;

        let measured;
        try {
          measured = measureMutations(container, () => patchImpl(container, diff(rendered, next)));
        } catch (error) {
          fail({ ...at, kind: 'throw', html, expected: '예외 없음', got: error.stack });
          break;
        }
        rendered = next;
        previous = html;
        for (const p of measured.result) report.patchesByType[p.type] = (report.patchesByType[p.type] ?? 0) + 1;
        report.records += measured.records;
        report.nodesAdded += measured.nodesAdded;
        report.nodesRemoved += measured.nodesRemoved;
        report.created += measured.created;

        const expectedDom = canonical(reference);
        const gotDom = canonical(container);
        if (gotDom !== expectedDom) {
          fail({ ...at, kind: 'dom', html, expected: expectedDom, got: gotDom });
          break;
        }
        const expectedLive = liveState(reference);
        const gotLive = liveState(container);
        if (gotLive !== expectedLive) {
          fail({ ...at, kind: 'live', html, expected: expectedLive, got: gotLive });
          break;
        }
        const refs = checkDomRefs(rendered, container);
        if (refs) {
          fail({ ...at, kind: 'refs', html, expected: '모든 가상 노드가 서로 다른 실제 노드를 가리킴', got: refs });
          break;
        }
        // 테스트 영역에 보여 줄 코드를 고치지 않고 다시 Patch하면 아무것도 바뀌지 않아야 한다.
        const shown = childrenToHTML(rendered.children);
        const again = createVNode('div', {}, htmlToVNodes(shown, { sanitize: true }), null);
        const noop = diff(rendered, again);
        if (noop.length > 0) {
          fail({ ...at, kind: 'idempotent', html, expected: '패치 0개', got: `${noop.map((p) => p.type).join(', ')}\n보여 준 코드: ${shown}` });
          break;
        }
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

import { describe, it, expect } from 'vitest';
import { domToVNode, htmlToVNodes, TEXT_NODE } from '../../src/index.js';

function container(html) {
  const div = document.createElement('div');
  div.innerHTML = html;
  return div;
}

const text = (value) => ({ type: TEXT_NODE, props: { nodeValue: value }, key: null, children: [] });

describe('domToVNode', () => {
  it('요소·속성·텍스트를 가상 노드로 바꾼다', () => {
    const node = container('<p class="x" data-id="1">hi</p>').firstChild;
    expect(domToVNode(node)).toEqual({
      type: 'p',
      props: { class: 'x', 'data-id': '1' },
      key: null,
      children: [text('hi')],
    });
  });

  it('줄바꿈이 섞인 공백 텍스트(들여쓰기)는 버린다', () => {
    const ul = container('<ul>\n  <li>a</li>\n  <li>b</li>\n</ul>').firstChild;
    expect(domToVNode(ul).children.map((c) => c.type)).toEqual(['li', 'li']);
  });

  it('줄바꿈 없는 공백은 인라인 간격이라 유지한다', () => {
    const p = container('<p><b>a</b> <i>b</i></p>').firstChild;
    expect(domToVNode(p).children.map((c) => c.type)).toEqual(['b', TEXT_NODE, 'i']);
  });

  it('pre 안에서는 공백 텍스트를 그대로 둔다', () => {
    const pre = container('<pre><b>a</b>\n  <i>b</i></pre>').firstChild;
    expect(domToVNode(pre).children.map((c) => c.type)).toEqual(['b', TEXT_NODE, 'i']);
  });

  it('주석 노드는 무시한다', () => {
    const div = container('<div><!-- memo -->x</div>').firstChild;
    expect(domToVNode(div).children).toEqual([text('x')]);
  });

  it('key 속성을 가상 노드의 key로도 읽는다', () => {
    const li = container('<li key="a">x</li>').firstChild;
    const v = domToVNode(li);
    expect(v.key).toBe('a');
    expect(v.props.key).toBe('a');
  });

  it('attach: true면 각 가상 노드에 원래 DOM 노드를 연결한다', () => {
    const p = container('<p>hi</p>').firstChild;
    const v = domToVNode(p, { attach: true });
    expect(v.dom).toBe(p);
    expect(v.children[0].dom).toBe(p.firstChild);
  });

  it('NBSP(&nbsp;)는 들여쓰기 공백이 아니라 내용이라 남긴다', () => {
    const p = container('<p><b>a</b>\n&nbsp;\n<i>b</i></p>').firstChild;
    expect(domToVNode(p).children.map((c) => c.type)).toEqual(['b', TEXT_NODE, 'i']);
  });

  it('template은 content 안의 노드를 자식으로 읽는다', () => {
    const template = container('<template><p>t</p></template>').firstChild;
    expect(domToVNode(template).children.map((c) => c.type)).toEqual(['p']);
  });

  it('SVG 요소 이름의 대소문자를 유지한다', () => {
    const svg = container('<svg><linearGradient id="g"></linearGradient></svg>').firstChild;
    expect(domToVNode(svg).children[0].type).toBe('linearGradient');
  });
});

describe('htmlToVNodes', () => {
  it('HTML 문자열을 최상위 가상 노드 배열로 바꾼다', () => {
    const list = htmlToVNodes('<p>a</p>\n<p>b</p>');
    expect(list.map((v) => v.type)).toEqual(['p', 'p']);
  });

  it('sanitize 옵션이면 script 요소와 on* 속성을 버린다', () => {
    const list = htmlToVNodes('<img src="x.png" onerror="alert(1)"><script>alert(2)</script>', {
      sanitize: true,
    });
    expect(list).toEqual([{ type: 'img', props: { src: 'x.png' }, key: null, children: [] }]);
  });

  it('sanitize 옵션이면 페이지 전체에 영향을 주는 요소와 javascript: URL도 버린다', () => {
    const list = htmlToVNodes(
      '<iframe srcdoc="<script>1</script>"></iframe><object data="x"></object><embed src="x">' +
        '<base href="/"><meta http-equiv="refresh" content="0"><link rel="stylesheet" href="x.css">' +
        '<a href=" JavaScript:alert(1)">a</a><a href="https://example.com">b</a>',
      { sanitize: true },
    );
    expect(list.map((v) => [v.type, v.props])).toEqual([
      ['a', {}],
      ['a', { href: 'https://example.com' }],
    ]);
  });

  it('sanitize 옵션이면 페이지 스타일을 덮어쓸 수 있는 <style>도 버린다', () => {
    const list = htmlToVNodes('<style>#app{display:none}</style><p>x</p>', { sanitize: true });
    expect(list.map((v) => v.type)).toEqual(['p']);
  });

  it('DOM API가 받지 않는 태그·속성 이름은 버리고 경고로 알린다 (자식은 남긴다)', () => {
    const warnings = [];
    const list = htmlToVNodes('<div><x<y>안</x<y></div><button @click="go" title="t">ok</button>', {
      onWarning: (message) => warnings.push(message),
    });
    expect(list[0].children.map((c) => c.props.nodeValue)).toEqual(['안']);
    expect(list[1].props).toEqual({ title: 't' });
    expect(warnings).toHaveLength(2);
  });

  it('문서(document)의 실제 트리는 바꾸지 않는다', () => {
    document.body.innerHTML = '<main>그대로</main>';
    htmlToVNodes('<p>a</p><p>b</p>');
    expect(document.body.innerHTML).toBe('<main>그대로</main>');
  });
});

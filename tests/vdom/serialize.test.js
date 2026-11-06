import { describe, it, expect } from 'vitest';
import { createElement as h, vnodeToHTML, childrenToHTML, htmlToVNodes } from '../../src/index.js';

describe('vnodeToHTML', () => {
  it('요소와 텍스트를 HTML 문자열로 바꾼다', () => {
    expect(vnodeToHTML(h('p', { class: 'a' }, 'x'))).toBe('<p class="a">x</p>');
  });

  it('텍스트와 속성 값을 이스케이프한다', () => {
    expect(vnodeToHTML(h('p', { title: '"<&>' }, '<b>&'))).toBe(
      '<p title="&quot;&lt;&amp;&gt;">&lt;b&gt;&amp;</p>',
    );
  });

  it('void 요소는 닫는 태그를 쓰지 않는다', () => {
    expect(vnodeToHTML(h('br'))).toBe('<br>');
    expect(vnodeToHTML(h('img', { src: 'a.png' }))).toBe('<img src="a.png">');
  });

  it('자식이 모두 요소면 한 줄에 하나씩 들여쓴다', () => {
    expect(vnodeToHTML(h('ul', null, h('li', null, 'a'), h('li', null, 'b')))).toBe(
      '<ul>\n  <li>a</li>\n  <li>b</li>\n</ul>',
    );
  });

  it('텍스트가 섞인 자식은 공백이 바뀌지 않도록 한 줄로 쓴다', () => {
    expect(vnodeToHTML(h('p', null, 'a ', h('b', null, 'b')))).toBe('<p>a <b>b</b></p>');
  });

  it('true는 값 없는 속성으로 쓰고, false·null·함수 값은 생략한다', () => {
    const v = h('input', { disabled: true, hidden: false, value: null, onClick() {} });
    expect(vnodeToHTML(v)).toBe('<input disabled>');
  });

  it('className과 style 객체를 HTML 속성으로 바꾼다', () => {
    const v = h('div', { className: 'a', style: { color: 'red', fontSize: '12px' } });
    expect(vnodeToHTML(v)).toBe('<div class="a" style="color: red; font-size: 12px;"></div>');
  });
});

describe('HTML ↔ 가상 노드 왕복', () => {
  const samples = [
    '<h1 class="title">제목</h1><p>본문 <b>굵게</b> 그리고 <i>기울임</i></p>',
    '<ul id="list">\n  <li key="a">A</li>\n  <li key="b">B &amp; C</li>\n</ul>',
    '<div><input type="checkbox" checked><label for="x">라벨</label><br><img src="a.png" alt="&quot;q&quot;"></div>',
    '<pre>  공백\n    유지</pre><table><tbody><tr><td>1</td><td>2</td></tr></tbody></table>',
    '<svg viewBox="0 0 10 10"><circle cx="5" cy="5" r="4"></circle></svg>',
    // HTML 파서는 pre·textarea 여는 태그 바로 뒤의 줄바꿈 하나를 버린다
    '<pre>\n\ncode</pre>',
    '<textarea>\nline</textarea>',
    '<p><b>a</b>\n&nbsp;\n<i>b</i></p>',
    // 내용을 원문 그대로 읽는 요소
    '<xmp>a &amp; <b></xmp><style>a > b { color: red }</style>',
    '<template><p>t</p></template>',
    // SVG 안의 style은 원문 텍스트가 아니라 일반 텍스트로 읽힌다
    '<svg><style>a &lt; b</style></svg>',
  ];

  it.each(samples)('직렬화 후 다시 읽어도 같은 가상 트리다: %s', (html) => {
    const first = htmlToVNodes(html);
    const again = htmlToVNodes(childrenToHTML(first));
    expect(again).toEqual(first);
  });
});

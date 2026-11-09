import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { startPhase1 } from '../../demo/phase1/app.js';

// Phase 1 검증 페이지의 기능 테스트: 사용자가 하는 일(코드 수정, 버튼 클릭)을 그대로 흉내 낸다.
let actual;
let root;
let app;

const textarea = () => root.querySelector('textarea');
const button = (name) => root.querySelector(`button[data-action="${name}"]`);
const status = () => root.querySelector('[data-role="history-status"]').textContent;

function edit(code) {
  textarea().value = code;
  textarea().dispatchEvent(new Event('input', { bubbles: true }));
}

beforeEach(() => {
  document.body.innerHTML = `
    <div id="actual">
      <h1>제목</h1>
      <ul>
        <li key="a">A</li>
        <li key="b">B</li>
      </ul>
    </div>
    <div id="app"></div>`;
  actual = document.getElementById('actual');
  root = document.getElementById('app');
  app = startPhase1({ actual, root });
});

afterEach(() => {
  vi.restoreAllMocks();
  app.destroy();
});

describe('Phase 1 검증 페이지', () => {
  it('로드하면 실제 영역의 HTML로 테스트 영역 코드를 채운다', () => {
    expect(textarea().value).toBe('<h1>제목</h1>\n<ul>\n  <li key="a">A</li>\n  <li key="b">B</li>\n</ul>');
    expect(status()).toBe('1 / 1');
  });

  it('Patch를 누르면 바뀐 부분만 실제 영역에 반영하고 기록에 저장한다', () => {
    const h1 = actual.querySelector('h1');
    const liA = actual.querySelector('li[key="a"]');
    edit(textarea().value.replace('>B<', '>B2<'));
    button('patch').click();

    expect(actual.querySelector('li[key="b"]').textContent).toBe('B2');
    expect(actual.querySelector('h1')).toBe(h1);
    expect(actual.querySelector('li[key="a"]')).toBe(liA);
    expect(status()).toBe('2 / 2');
    expect(root.querySelector('[data-role="patch-log"]').textContent).toContain('TEXT');
  });

  it('뒤로가기·앞으로가기를 누르면 실제 영역과 테스트 영역이 함께 바뀐다', () => {
    const original = textarea().value;
    edit(original.replace('제목', '새 제목'));
    button('patch').click();
    const patched = textarea().value;

    button('back').click();
    expect(actual.querySelector('h1').textContent).toBe('제목');
    expect(textarea().value).toBe(original);
    expect(status()).toBe('1 / 2');

    button('forward').click();
    expect(actual.querySelector('h1').textContent).toBe('새 제목');
    expect(textarea().value).toBe(patched);
    expect(status()).toBe('2 / 2');
  });

  it('처음에는 뒤로가기, 끝에서는 앞으로가기가 비활성이다', () => {
    expect(button('back').disabled).toBe(true);
    expect(button('forward').disabled).toBe(true);
    edit(textarea().value.replace('A', 'AA'));
    button('patch').click();
    expect(button('back').disabled).toBe(false);
    expect(button('forward').disabled).toBe(true);
  });

  it('바뀐 것이 없으면 기록을 늘리지 않는다', () => {
    button('patch').click();
    expect(status()).toBe('1 / 1');
    expect(root.querySelector('[data-role="patch-log"]').textContent).toContain('변경 없음');
  });

  it('목록 순서를 바꾸면 기존 li 노드를 옮겨서 재사용한다', () => {
    const liA = actual.querySelector('li[key="a"]');
    const liB = actual.querySelector('li[key="b"]');
    edit('<h1>제목</h1>\n<ul>\n  <li key="b">B</li>\n  <li key="a">A</li>\n</ul>');
    button('patch').click();
    const items = [...actual.querySelectorAll('li')];
    expect(items).toEqual([liB, liA]);
    expect(root.querySelector('[data-role="patch-log"]').textContent).toContain('MOVE');
  });

  it('기록 목록에서 특정 기록을 눌러 바로 이동한다', () => {
    edit(textarea().value.replace('A', 'A1'));
    button('patch').click();
    edit(textarea().value.replace('A1', 'A2'));
    button('patch').click();
    root.querySelector('[data-history-index="0"]').click();
    expect(actual.querySelector('li[key="a"]').textContent).toBe('A');
    expect(status()).toBe('1 / 3');
  });

  it('DOM이 받지 않는 이름은 건너뛰고, 건너뛴 것을 변경 로그에 알린다', () => {
    edit('<button @click="go">ok</button>');
    button('patch').click();
    const patched = actual.querySelector('button');
    expect(patched.textContent).toBe('ok');
    expect(patched.attributes).toHaveLength(0);
    expect(root.querySelector('[data-role="warnings"]').textContent).toContain('@click');
  });

  it('patch가 중간에 실패하면 오류를 보여 주고 실제 영역을 직전 상태로 되돌린다', () => {
    const original = Element.prototype.setAttribute;
    vi.spyOn(Element.prototype, 'setAttribute').mockImplementation(function setAttribute(name, value) {
      if (name === 'data-boom') throw new DOMException('테스트용 실패', 'InvalidCharacterError');
      return original.call(this, name, value);
    });
    const h1 = actual.querySelector('h1');
    // h1 텍스트 변경(TEXT)이 먼저 적용된 뒤, 새 p를 만들다 실패한다.
    edit(textarea().value.replace('제목', '바뀐 제목') + '\n<p data-boom="1">x</p>');
    button('patch').click();

    expect(root.querySelector('[data-role="warnings"]').textContent).toContain('테스트용 실패');
    expect(actual.querySelector('h1').textContent).toBe('제목');
    expect(actual.querySelector('p')).toBeNull();
    expect(status()).toBe('1 / 1');

    vi.restoreAllMocks();
    // 실패한 뒤에도 편집기에는 사용자가 쓴 코드가 남아 있다(고쳐서 다시 Patch할 수 있게).
    expect(textarea().value).toContain('data-boom');
    edit('<h1>다시 바뀐 제목</h1>\n<ul>\n  <li key="a">A</li>\n  <li key="b">B</li>\n</ul>');
    button('patch').click();
    expect(actual.querySelector('h1').textContent).toBe('다시 바뀐 제목');
    expect(actual.querySelector('h1')).toBe(h1);
  });

  it('script 요소와 on* 속성은 실제 영역에 넣지 않는다', () => {
    edit('<p onclick="alert(1)">x</p><script>window.__hacked = true</script>');
    button('patch').click();
    expect(actual.querySelector('script')).toBeNull();
    expect(actual.querySelector('p').hasAttribute('onclick')).toBe(false);
  });
});

describe('실제 영역에 주석이 있을 때', () => {
  beforeEach(() => {
    app.destroy();
    actual.innerHTML = '<p>a<!-- note -->b</p>';
    app = startPhase1({ actual, root });
  });

  it('아무것도 고치지 않고 Patch하면 패치가 0개이고 기록도 늘지 않는다', () => {
    // 로드할 때 붙어 있던 텍스트 두 개를 patch로 하나로 합쳐 둔다.
    expect(actual.innerHTML).toBe('<p>ab<!-- note --></p>');
    button('patch').click();
    expect(actual.innerHTML).toBe('<p>ab<!-- note --></p>');
    expect(root.querySelector('[data-role="patch-log"]').textContent).toContain('변경 없음');
    expect(status()).toBe('1 / 1');
  });

  it('텍스트를 고쳐 Patch하면 실제 영역이 코드와 같아진다', () => {
    expect(textarea().value).toBe('<p>ab</p>');
    edit('<p>abc</p>');
    button('patch').click();
    expect(actual.querySelector('p').textContent).toBe('abc');
    edit('<p>z</p>');
    button('patch').click();
    expect(actual.querySelector('p').textContent).toBe('z');
    button('back').click();
    expect(actual.querySelector('p').textContent).toBe('abc');
  });
});

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { startPhase1 } from '../../demo/phase1/app.js';
import { PRESETS } from '../../demo/phase1/presets.js';

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

describe('Phase 1 프리셋 시나리오 (다양한 태그로 여러 변화 확인)', () => {
  const presetButtons = () => [...root.querySelectorAll('button[data-preset]')];
  const click = (id, step) => root.querySelector(`button[data-preset="${id}"][data-step="${step}"]`).click();
  const patchTypes = () =>
    [...root.querySelectorAll('[data-role="patch-log"] .op')].map((el) => el.textContent);

  it('table·form·select·중첩 목록·key 재정렬 프리셋이 있다', () => {
    const ids = new Set(presetButtons().map((b) => b.dataset.preset));
    expect([...ids].sort()).toEqual(['form', 'nested', 'reorder', 'select', 'table']);
  });

  it('프리셋 단계를 누르면 테스트 영역 코드만 바뀌고, Patch를 눌러야 실제 영역에 반영된다', () => {
    const before = actual.innerHTML;
    click('table', 1);
    expect(textarea().value).toContain('<table');
    expect(actual.innerHTML).toBe(before);
    button('patch').click();
    expect(actual.querySelector('table')).not.toBeNull();
  });

  it('프리셋에는 <form>이 없다 (실제 영역에서 Enter로 제출되면 페이지가 새로 고쳐진다)', () => {
    for (const b of presetButtons()) {
      b.click();
      expect(textarea().value).not.toContain('<form');
    }
  });

  it('table 2단계(정렬)는 행을 다시 만들지 않고 MOVE만 한다', () => {
    click('table', 1);
    button('patch').click();
    const rows = [...actual.querySelectorAll('tbody tr')];
    click('table', 2);
    button('patch').click();
    expect(new Set(patchTypes())).toEqual(new Set(['MOVE']));
    const after = [...actual.querySelectorAll('tbody tr')];
    expect(after.every((tr) => rows.includes(tr))).toBe(true); // 같은 tr 노드를 옮겼을 뿐이다
    expect(after.map((tr) => tr.getAttribute('key'))).toEqual(['lee', 'park', 'kim', 'choi']);
  });

  it('reorder: key가 있으면 순서를 바꿀 때 MOVE만, key가 없으면 같은 변화를 TEXT로 고친다', () => {
    click('reorder', 1);
    button('patch').click();
    click('reorder', 2);
    button('patch').click();
    expect(new Set(patchTypes())).toEqual(new Set(['MOVE']));
    click('reorder', 3);
    button('patch').click();
    click('reorder', 4);
    button('patch').click();
    expect(new Set(patchTypes())).toEqual(new Set(['TEXT']));
  });

  it('각 단계 버튼에 적힌 예상 패치 종류가 실제로 나온 패치 종류와 같다', () => {
    for (const preset of PRESETS) {
      preset.steps.forEach((step, i) => {
        click(preset.id, i + 1);
        button('patch').click();
        if (step.expect) expect([...new Set(patchTypes())].sort(), `${preset.id} ${i + 1}`).toEqual(step.expect.split('·').sort());
      });
    }
  });

  it('모든 프리셋의 모든 단계를 차례로 Patch해도 오류 없이 실제 영역이 코드와 같아진다', () => {
    for (const b of presetButtons()) {
      b.click();
      button('patch').click();
      expect(root.querySelector('[data-role="warnings"]')).toBeNull();
      expect(root.querySelector('.badge').textContent).toBe('실제 영역과 같음');
    }
  });
});

describe('Phase 1 기록 이동이 실패할 때', () => {
  it('뒤로가기가 patch 도중 실패하면 화면과 함께 기록 위치도 그대로 남는다', () => {
    const base = textarea().value;
    edit(`${base}\n<p data-nav="1">x</p>`);
    button('patch').click(); // 2번째 기록: data-nav 속성이 있는 p
    edit(base);
    button('patch').click(); // 3번째 기록: p 없음
    expect(status()).toBe('3 / 3');

    const original = Element.prototype.setAttribute;
    vi.spyOn(Element.prototype, 'setAttribute').mockImplementation(function setAttribute(name, value) {
      if (name === 'data-nav') throw new DOMException('테스트용 실패', 'InvalidCharacterError');
      return original.call(this, name, value);
    });
    button('back').click(); // 2번째 기록으로 가려면 data-nav p를 만들어야 하는데 실패한다

    expect(root.querySelector('[data-role="warnings"]').textContent).toContain('테스트용 실패');
    expect(actual.querySelector('p')).toBeNull(); // 화면은 3번째 기록 그대로
    expect(status()).toBe('3 / 3'); // 기록 위치도 3번째 그대로
    expect(textarea().value).toBe(base);
  });
});

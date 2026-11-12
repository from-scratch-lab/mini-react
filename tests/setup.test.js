import { describe, it, expect } from 'vitest';

// 테스트 환경이 브라우저 DOM(jsdom)을 제공하는지 확인한다.
// Virtual DOM 변환과 patch 테스트가 모두 이 환경에 기대므로, 설정이 빠지면 여기서 먼저 실패한다.
describe('테스트 환경', () => {
  it('document와 DOM API를 쓸 수 있다', () => {
    expect(typeof document).toBe('object');
    const div = document.createElement('div');
    div.innerHTML = '<p class="x">hi</p>';
    expect(div.firstChild.nodeName).toBe('P');
    expect(div.firstChild.getAttribute('class')).toBe('x');
  });
});

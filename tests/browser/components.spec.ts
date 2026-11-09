import { expect, test } from '@playwright/test';

test('counter, memo, latest handlers and name input preserve existing DOM and focus', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await page.getByRole('tab', { name: /^Phase 2/ }).click();
  const demo = page.locator('#hooks-lab');
  await expect(demo.locator('#counter-value')).toHaveText('0');
  await expect(demo.getByRole('button', { name: '카운터 감소' })).toBeDisabled();
  await demo.evaluate(element => {
    const input = element.querySelector('input')!; const output = element.querySelector('#counter-value')!;
    (window as any).hookNodes = { input, output, text: output.firstChild, card: element.querySelector('.hook-card'), heading: element.querySelector('h2') };
  });
  await demo.getByRole('button', { name: '카운터 증가' }).click();
  await demo.getByRole('button', { name: '카운터 증가' }).click();
  await demo.getByRole('button', { name: '카운터 증가' }).click();
  await expect(demo.locator('#counter-value')).toHaveText('3'); await expect(demo.locator('#memo-value')).toHaveText('6');
  const name = demo.getByRole('textbox', { name: '데모 이름' });
  await name.fill('우진'); await expect(demo.getByRole('heading', { name: '우진님의 누적 합' })).toBeVisible(); await expect(name).toBeFocused();
  expect(await demo.evaluate(element => {
    const saved = (window as any).hookNodes; const output = element.querySelector('#counter-value')!;
    return saved.input === element.querySelector('input') && saved.output === output && saved.text === output.firstChild
      && saved.card === element.querySelector('.hook-card') && saved.heading === element.querySelector('h2');
  })).toBe(true);
  await demo.getByRole('button', { name: '카운터 감소' }).click(); await expect(demo.locator('#counter-value')).toHaveText('2');
  await demo.getByRole('button', { name: '초기화', exact: true }).click(); await expect(demo.locator('#memo-value')).toHaveText('0');
  await expect(demo.getByRole('button', { name: '카운터 감소' })).toBeDisabled(); expect(errors).toEqual([]);
});

test('effect starts one timer, cleans it on stop and restarts without duplicate intervals', async ({ page }) => {
  await page.clock.install(); await page.goto('/'); const demo = page.locator('#hooks-lab');
  await page.getByRole('tab', { name: /^Phase 2/ }).click();
  const inspector = page.getByRole('region', { name: '렌더링 관찰' });
  await inspector.getByText('Hook 상세', { exact: true }).click();
  await demo.getByRole('button', { name: '자동 증가 시작' }).click();
  await expect(demo.getByRole('button', { name: '자동 증가 중지' })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('tab', { name: /^Phase 1/ }).click();
  await page.clock.runFor(3000);
  await page.getByRole('tab', { name: /^Phase 2/ }).click();
  await expect(demo.locator('#counter-value')).toHaveText('3');
  await demo.getByRole('button', { name: '자동 증가 중지' }).click();
  await expect(inspector.locator('#render-state')).toHaveText('running true → false');
  await expect(inspector.locator('#render-hooks')).toContainText('cleanup 실행 → Effect 실행');
  await page.clock.runFor(3000); await expect(demo.locator('#counter-value')).toHaveText('3');
  await demo.getByRole('button', { name: '자동 증가 시작' }).click();
  await page.clock.runFor(1000); await expect(demo.locator('#counter-value')).toHaveText('4');
  await demo.getByRole('button', { name: '자동 증가 중지' }).click();
});

test('the Phase 2 inspector distinguishes state changes, DOM patches and skipped renders', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/');
  await page.getByRole('tab', { name: /^Phase 2/ }).click();
  const inspector = page.getByRole('region', { name: '렌더링 관찰' });
  await expect(inspector).toBeVisible();
  await expect(inspector.locator('#render-state')).toContainText('초기 상태');
  await expect(inspector.locator('#render-cycle')).toContainText('mount()');
  await inspector.getByText('Hook 상세', { exact: true }).click();
  await expect(inspector.locator('#render-hooks li')).toHaveCount(5);
  await expect(inspector.locator('#render-hooks')).toContainText('hooks[0] · useState · count · 초기값 0 저장');
  await page.getByRole('button', { name: '초기화', exact: true }).click();
  await expect(inspector.locator('#render-state')).toContainText('count 0 → 0');
  await expect(inspector.locator('#render-components')).toHaveText('렌더링 생략');
  await expect(inspector.locator('#render-patches')).toHaveText('Patch 0개');
  await expect(inspector.locator('#render-hook-status')).toBeVisible();
  await expect(inspector.locator('#render-hooks li')).toHaveCount(5);

  const increase = page.getByRole('button', { name: '카운터 증가' });
  await increase.click();
  await expect(inspector.locator('#render-patches')).toHaveText('Patch 3개');
  const highlighted = await increase.evaluate(button => {
    (button as HTMLButtonElement).click();
    return [...document.querySelectorAll('#hooks-demo *')]
      .filter(element => element.getAnimations().length > 0)
      .map(element => element.id);
  });
  expect(highlighted).toEqual(['counter-value', 'memo-value']);
  await expect(inspector.locator('#render-state')).toHaveText('count 1 → 2');
  await expect(inspector.locator('#render-components')).toHaveText('App → Counter, Summary');
  await expect(inspector.locator('#render-cycle')).toContainText('update()');
  await expect(inspector.locator('#render-patches')).toHaveText('Patch 2개');
  await expect(inspector.locator('#render-hook-status')).toBeHidden();
  await expect(inspector.locator('#render-hooks')).toContainText('hooks[0] · useState · count · 1 → 2');
  await expect(inspector.locator('#render-hooks')).toContainText('다시 계산 · 누적 합 3');
  await inspector.getByText('컴포넌트와 props', { exact: true }).click();
  await expect(inspector.locator('#counter-props')).toHaveText('Counter({ count: 2, increase, decrease, reset })');
  await expect(inspector.locator('#summary-props')).toHaveText('Summary({ name: "방문자", total: 3 })');
  await inspector.getByText('DOM 변경 목록', { exact: true }).click();
  await expect(inspector.locator('#render-operations li')).toHaveText(['카운터 값 텍스트 "1" → "2"', '누적 합 텍스트 "1" → "3"']);

  await page.getByRole('textbox', { name: '데모 이름' }).fill('새 이름');
  await expect(inspector.locator('#render-state')).toHaveText('name "방문자" → "새 이름"');
  await expect(inspector.locator('#summary-props')).toHaveText('Summary({ name: "새 이름", total: 3 })');
  await expect(inspector.locator('#render-hooks')).toContainText('hooks[0] · useState · count · 2 유지');
  await expect(inspector.locator('#render-hooks')).toContainText('이전 결과 재사용 · 누적 합 3');
  await expect(inspector.locator('#render-hooks')).toContainText('의존성이 같아 건너뜀');
  await expect(inspector.locator('#render-operations')).toContainText('value "방문자" → "새 이름"');
});

test('the DOM diagram and tree reveal Patch targets and link a change to the actual element', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await page.getByRole('tab', { name: /^Phase 2/ }).click();
  const increase = page.getByRole('button', { name: '카운터 증가' });
  await increase.click();
  await increase.click();

  const inspector = page.getByRole('region', { name: '렌더링 관찰' });
  await inspector.getByText('DOM 변경 목록', { exact: true }).click();
  const diagram = inspector.getByRole('region', { name: 'DOM 구조도' });
  const tree = inspector.getByRole('list', { name: '실제 DOM 트리' });
  await expect(diagram.locator('.dom-diagram-node:has(.dom-tree-change) code')).toHaveText(['#text "2"', '#text "3"']);
  await expect(diagram.getByText('output#counter-value · 카운터 값', { exact: true })).toBeVisible();
  await expect(tree.locator('.dom-tree-change:not([hidden])')).toHaveCount(2);
  const text = tree.getByText('#text "2"', { exact: true });
  await expect(text).toBeVisible();
  await expect(tree.getByText('#text "3"', { exact: true })).toBeVisible();
  await tree.getByText('output#counter-value · 카운터 값', { exact: true }).click();
  await expect(text).toBeHidden();

  const change = inspector.getByRole('button', { name: '카운터 값 텍스트 "1" → "2"' });
  await change.focus();
  await change.press('Enter');
  await expect(text).toBeVisible();
  await expect(text).toHaveAttribute('aria-current', 'true');
  await expect(diagram.locator('[aria-current] code')).toHaveText('#text "2"');
  await expect.poll(() => page.locator('#counter-value').evaluate(node => getComputedStyle(node).boxShadow)).not.toBe('none');
  await expect(page.locator('#memo-value')).toHaveCSS('box-shadow', 'none');

  const reset = page.getByRole('button', { name: '초기화', exact: true });
  await reset.click();
  await reset.click();
  await expect(tree.locator('.dom-tree-change:not([hidden]), [aria-current]')).toHaveCount(0);
  await expect(diagram.locator('.dom-tree-change, [aria-current]')).toHaveCount(0);
  await expect(diagram.getByText('div#hooks-demo', { exact: true })).toBeVisible();
  await expect(page.locator('#counter-value')).toHaveCSS('box-shadow', 'none');
});

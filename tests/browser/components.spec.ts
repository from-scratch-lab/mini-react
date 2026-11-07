import { expect, test } from '@playwright/test';

test('counter, memo, latest handlers and name input preserve existing DOM and focus', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
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
  await demo.getByRole('button', { name: '자동 증가 시작' }).click();
  await expect(demo.getByRole('button', { name: '자동 증가 중지' })).toHaveAttribute('aria-pressed', 'true');
  await page.clock.runFor(3000); await expect(demo.locator('#counter-value')).toHaveText('3');
  await demo.getByRole('button', { name: '자동 증가 중지' }).click();
  await page.clock.runFor(3000); await expect(demo.locator('#counter-value')).toHaveText('3');
  await demo.getByRole('button', { name: '자동 증가 시작' }).click();
  await page.clock.runFor(1000); await expect(demo.locator('#counter-value')).toHaveText('4');
  await demo.getByRole('button', { name: '자동 증가 중지' }).click();
});

test('mobile demo stays within viewport and remains interactive', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await page.goto('/');
  const demo = page.locator('#hooks-lab');
  await demo.getByRole('button', { name: '카운터 증가' }).click(); await expect(demo.locator('#counter-value')).toHaveText('1');
  expect(await demo.evaluate(element => element.getBoundingClientRect().right <= window.innerWidth)).toBe(true);
});

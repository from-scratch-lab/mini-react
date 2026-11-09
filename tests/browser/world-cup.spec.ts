import { expect, test, type Page } from '@playwright/test';

async function unlockWorldCup(page: Page): Promise<void> {
  const phase1 = page.getByRole('tab', { name: /^Phase 1/ });
  const phase2 = page.getByRole('tab', { name: /^Phase 2/ });
  await phase2.click();
  await phase1.click();
  await phase2.click();
  await phase1.click();
}

test('the photo tournament advances, preserves match DOM and restarts with keyboard focus', async ({ page }) => {
  await page.goto('/');
  const phase1 = page.getByRole('tab', { name: /^Phase 1/ });
  const phase2 = page.getByRole('tab', { name: /^Phase 2/ });
  const worldCupTab = page.getByRole('tab', { name: /^Phase2\.1\s*\(이상형 월드컵\)$/ });
  await phase1.press('ArrowDown');
  await page.getByRole('button', { name: '카운터 증가' }).click();

  const game = page.getByRole('region', { name: '이상형 월드컵' });
  await expect(game).toBeHidden();
  await expect(page.locator('#phase-2-1')).toBeHidden();
  await phase2.press('ArrowUp');
  await phase1.press('ArrowDown');
  await phase2.press('ArrowUp');
  await expect(worldCupTab).toBeFocused();
  await expect(worldCupTab).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#hooks-lab')).toBeHidden();

  const first = game.getByRole('button', { name: '후보 1' });
  const third = game.getByRole('button', { name: '후보 3' });
  const fourth = game.getByRole('button', { name: '후보 4' });
  const leftButton = await first.elementHandle();
  const leftImage = await first.locator('img').elementHandle();
  const photosLoaded = () => game.locator('img').evaluateAll(images =>
    images.every(image => image instanceof HTMLImageElement && image.complete && image.naturalWidth === 512));

  await expect.poll(photosLoaded).toBe(true);
  await first.press('Enter');
  await expect(game.getByRole('status')).toHaveText('4강 · 2/2');
  await expect(third).toBeFocused();
  expect(await third.evaluate((node, original) => node === original, leftButton)).toBe(true);
  expect(await third.locator('img').evaluate((node, original) => node === original, leftImage)).toBe(true);
  await expect.poll(photosLoaded).toBe(true);

  await phase1.click();
  await worldCupTab.click();
  await expect(game.getByRole('status')).toHaveText('4강 · 2/2');
  await fourth.click();
  await expect(game.getByRole('status')).toHaveText('결승 · 1/1');
  await expect(first).toBeVisible();
  const winningPhoto = await fourth.locator('img').getAttribute('src');
  await fourth.press('Enter');

  const winner = game.getByRole('heading', { name: '후보 4 우승' });
  await expect(winner).toBeFocused();
  await expect(game.locator('img')).toHaveAttribute('src', winningPhoto!);
  await expect(game.locator('img')).toHaveCSS('animation-name', 'world-cup-winner-reveal');
  await expect(game.locator('.world-cup-confetti')).toHaveAttribute('aria-hidden', 'true');
  await expect(game.locator('.world-cup-confetti span').first()).toHaveCSS('animation-name', 'world-cup-burst');
  await expect.poll(photosLoaded).toBe(true);
  await page.keyboard.press('Tab');
  const restart = game.getByRole('button', { name: '다시 시작' });
  await expect(restart).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(game.getByRole('status')).toHaveText('4강 · 1/2');
  await expect(first).toBeFocused();
  await phase2.click();
  await expect(page.locator('#counter-value')).toHaveText('1');
});

test('reloading reopens the World Cup after unlocking it with clicks', async ({ page }) => {
  await page.goto('/');
  const worldCupTab = page.getByRole('tab', { name: /^Phase2\.1\s*\(이상형 월드컵\)$/ });
  await expect(page.locator('#phase-2-1')).toBeHidden();
  await unlockWorldCup(page);
  await expect(worldCupTab).toBeFocused();
  await expect(worldCupTab).toHaveAttribute('aria-selected', 'true');
  await page.reload();

  await expect(worldCupTab).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('tabpanel', { name: /^Phase2\.1/ })).toBeVisible();
  await expect(page.locator('#hooks-lab')).toBeHidden();
});

test('the sidebar close button hides the World Cup until the sequence is repeated', async ({ page }) => {
  await page.goto('/');
  const phase1 = page.getByRole('tab', { name: /^Phase 1/ });
  const phase2 = page.getByRole('tab', { name: /^Phase 2/ });
  const worldCupTab = page.getByRole('tab', { name: /^Phase2\.1/ });
  const close = page.getByRole('button', { name: '이상형 월드컵 닫기' });
  const game = page.getByRole('region', { name: '이상형 월드컵' });
  await expect(close).toBeHidden();
  await unlockWorldCup(page);
  await game.getByRole('button', { name: '후보 1' }).click();
  await expect(game.getByRole('status')).toHaveText('4강 · 2/2');

  await worldCupTab.focus();
  await page.keyboard.press('Tab');
  await expect(close).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(worldCupTab).toBeHidden();
  await expect(close).toBeHidden();
  await expect(game).toBeHidden();
  await expect(phase1).toBeFocused();

  await unlockWorldCup(page);
  await expect(game.getByRole('status')).toHaveText('4강 · 2/2');
  await phase2.click();
  await close.click();
  await expect(phase2).toBeFocused();
  await page.reload();
  await expect(phase2).toHaveAttribute('aria-selected', 'true');
  await expect(worldCupTab).toBeHidden();
  await expect(close).toBeHidden();
});

test('selection feedback remains visible with reduced motion and the next match still opens', async ({ page }) => {
  const time = new Date('2026-11-09T00:00:00Z');
  await page.clock.install({ time });
  await page.clock.pauseAt(new Date(time.getTime() + 1000));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await unlockWorldCup(page);

  const game = page.getByRole('region', { name: '이상형 월드컵' });
  const first = game.getByRole('button', { name: '후보 1' });
  const second = game.getByRole('button', { name: '후보 2' });
  await first.press('Enter');
  await expect(first).toHaveAttribute('data-state', 'selected');
  await expect(first.getByText('✓ 선택')).toBeVisible();
  await expect(first).toHaveCSS('transform', 'none');
  await expect(second).toHaveAttribute('data-state', 'passed');
  await expect(second).toHaveCSS('opacity', '0.5');

  await page.clock.runFor(420);
  await expect(game.getByRole('status')).toHaveText('4강 · 2/2');
  await game.getByRole('button', { name: '후보 3' }).press('Enter');
  await page.clock.runFor(420);
  await first.press('Enter');
  await page.clock.runFor(420);
  await expect(game.getByRole('heading', { name: '후보 1 우승' })).toBeVisible();
  await expect(game.locator('img')).toHaveCSS('animation-name', 'none');
  await expect(game.locator('.world-cup-confetti')).toBeHidden();
});

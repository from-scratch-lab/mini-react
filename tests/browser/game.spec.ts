import { expect, test } from '@playwright/test';

test('keyboard movement preserves nodes and blur pauses and clears held input', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.clock.install(); await page.goto('/game.html');
  await expect(page.getByRole('button', { name: '생존 시작' })).toBeFocused();
  await page.getByRole('button', { name: '생존 시작' }).click();
  const player = page.locator('.sprite--player');
  await player.evaluate(node => { (window as any).savedPlayer = node; });
  await page.keyboard.down('d'); await page.clock.runFor(1000); await page.keyboard.up('d');
  const position = await player.evaluate(node => Number((node as HTMLElement).style.transform.match(/[\d.]+/)![0]));
  expect(position).toBeGreaterThan(600);
  expect(await player.evaluate(node => node === (window as any).savedPlayer)).toBe(true);
  await page.keyboard.down('w'); await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await expect(page.getByRole('button', { name: '계속하기', exact: true })).toBeFocused();
  const paused = await player.getAttribute('style'); await page.clock.runFor(10_000); expect(await player.getAttribute('style')).toBe(paused);
  await page.keyboard.up('w'); await page.getByRole('button', { name: '계속하기', exact: true }).click();
  await page.clock.runFor(500); expect(await player.getAttribute('style')).toBe(paused);
  expect(errors).toEqual([]);
});

test('level-up pauses combat, focuses upgrades and permits keyboard selection', async ({ page }) => {
  await page.clock.install(); await page.goto('/game.html'); await page.getByRole('button', { name: '생존 시작' }).click();
  await page.clock.runFor(30_000);
  await expect(page.locator('.game-shell')).toHaveAttribute('data-phase', 'upgrade');
  await expect(page.locator('.upgrade').first()).toBeFocused();
  const time = await page.getByTestId('time').textContent(); await page.clock.runFor(5000);
  await expect(page.getByTestId('time')).toHaveText(time!);
  await page.keyboard.press('1'); await expect(page.locator('.game-shell')).toHaveAttribute('data-phase', 'running');
  await expect(page.getByLabel('전투 경기장')).toBeFocused();
});

test('defeat and repeated restart restore one fresh simulation', async ({ page }) => {
  test.setTimeout(90_000);
  await page.clock.install(); await page.goto('/game.html'); await page.getByRole('button', { name: '생존 시작' }).click();
  for (let run = 0; run < 2; run++) {
    for (let step = 0; step < 12; step++) {
      await page.clock.runFor(30_000);
      const phase = await page.locator('.game-shell').getAttribute('data-phase');
      if (phase === 'lost') break;
      if (phase === 'upgrade') await page.keyboard.press('3');
    }
    await expect(page.locator('.game-shell')).toHaveAttribute('data-phase', 'lost');
    await page.getByRole('button', { name: '다시 도전' }).click();
    await expect(page.getByTestId('health')).toHaveText('100');
    await expect(page.getByTestId('kills')).toHaveText('000');
    await page.clock.runFor(1000);
    await expect(page.getByTestId('time')).toHaveText('02:59');
    await expect(page.locator('.scene > i')).toHaveCount(429);
  }
});

test('experiment runs all four renderers and verifies DOM and deterministic state', async ({ page }) => {
  await page.goto('/experiment.html');
  const results = await page.evaluate(async () => {
    const results = [];
    for (const renderer of ['mini-baseline', 'mini-scene', 'react-baseline', 'react-memo']) results.push(await window.benchmark.run(renderer,
      { count: 100, scenario: 'battle', warmupMs: 50, durationMs: 150, seed: 17 }));
    return results;
  });
  for (const result of results) { expect(result.domCorrect).toBe(true); expect(result.finalChecksum).toBe(result.expectedChecksum); expect(result.frames).toBeGreaterThan(1); }
  await expect(page.locator('#results tr')).toHaveCount(4);
});

test('experiment applies the selected duration to both renderers and explains the comparison', async ({ page }) => {
  const reactRequests: string[] = [];
  page.on('request', request => { if (/\/react-adapter[.-]/.test(request.url())) reactRequests.push(request.url()); });
  await page.goto('/game.html');
  await expect(page.getByRole('button', { name: '생존 시작' })).toBeVisible();
  await page.goto('/experiment.html');
  await expect(page.getByRole('combobox', { name: '렌더러', exact: true })).toHaveValue('mini-scene');
  await expect(page.getByRole('combobox', { name: '비교 상대' })).toHaveValue('react-baseline');
  await page.getByRole('combobox', { name: '측정 시간' }).selectOption('20');
  await expect(page.locator('.experiment-duration')).toContainText('총 약 50초');
  await page.getByRole('combobox', { name: '측정 시간' }).selectOption('3');
  await expect(page.locator('.experiment-duration')).toContainText('총 약 8초');
  await page.getByRole('combobox', { name: '몹 수' }).selectOption('100');
  expect(reactRequests).toHaveLength(0);
  await page.getByRole('button', { name: '비교 시작' }).click();
  await expect(page.getByRole('status')).toContainText('비교 완료', { timeout: 20_000 });
  expect(reactRequests.length).toBeGreaterThan(0);
  const summary = page.locator('.summary-table');
  await expect(summary.getByRole('columnheader', { name: 'Mini React 특화' })).toBeVisible();
  await expect(summary.getByRole('columnheader', { name: 'React 기본' })).toBeVisible();
  await expect(summary.locator('tbody tr')).toHaveCount(4);
  const configs = await page.evaluate(() => window.benchmark.results.map(result => result.config));
  expect(configs).toHaveLength(2);
  expect(configs[0]).toEqual(configs[1]);
  expect(configs[0]).toMatchObject({ warmupMs: 1000, durationMs: 3000, count: 100 });
  await page.getByText('숫자는 무엇을 뜻하나요?').click();
  await expect(page.getByText('프레임 사이 간격의 95%', { exact: false })).toBeVisible();
});

import { expect, test } from '@playwright/test';

test('Phase 1 opens with a full-height editor beside two independently scrollable notes', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/');

  await expect(page.getByRole('heading', { name: 'Mini React', level: 1 })).toBeVisible();
  await expect(page.getByRole('tab', { name: /^Phase 1/ })).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#hooks-lab')).toBeHidden();

  const editor = page.getByRole('textbox', { name: 'HTML 편집기' });
  const preview = page.getByRole('region', { name: '미리보기', exact: true });
  const actual = page.getByRole('region', { name: '실제 DOM', exact: true });
  const patch = page.getByRole('button', { name: 'Patch 적용' });
  await expect(patch).toBeInViewport({ ratio: 1 });

  const [editorBox, previewBox, actualBox] = await Promise.all([
    editor.boundingBox(), preview.boundingBox(), actual.boundingBox(),
  ]);
  expect(editorBox!.width).toBeGreaterThan(550);
  expect(editorBox!.height).toBeGreaterThan(450);
  expect(previewBox!.x).toBeGreaterThanOrEqual(editorBox!.x + editorBox!.width);
  expect(previewBox!.y).toBeCloseTo(editorBox!.y);
  expect(actualBox!.x).toBeCloseTo(previewBox!.x);
  expect(actualBox!.y).toBeGreaterThan(previewBox!.y + previewBox!.height);
  await expect(preview.locator('textarea')).toBeInViewport({ ratio: 1 });
  await expect(actual.locator('textarea')).toBeInViewport({ ratio: 1 });

  await editor.fill('<p>새 메모</p>'.repeat(80));
  await preview.evaluate(element => { element.scrollTop = 200; });
  expect(await preview.evaluate(element => element.scrollTop)).toBeGreaterThan(0);
  expect(await actual.evaluate(element => element.scrollTop)).toBe(0);
  await expect(patch).toBeInViewport({ ratio: 1 });
});

test('keyboard selection moves between phases and Tab enters the selected panel', async ({ page }) => {
  await page.goto('/');
  const phase1 = page.getByRole('tab', { name: /^Phase 1/ });
  const phase2 = page.getByRole('tab', { name: /^Phase 2/ });
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: '사이드바', exact: true })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(phase1).toBeFocused();

  await page.keyboard.press('ArrowDown');
  await expect(phase2).toBeFocused();
  await expect(phase2).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#dom-lab')).toBeHidden();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('textbox', { name: '데모 이름' })).toBeFocused();

  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Home');
  await expect(phase1).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('textbox', { name: 'HTML 편집기' })).toBeFocused();
});

test('switching phases preserves the draft, committed history and Hooks state', async ({ page }) => {
  await page.goto('/');
  const phase1 = page.getByRole('tab', { name: /^Phase 1/ });
  const phase2 = page.getByRole('tab', { name: /^Phase 2/ });
  const editor = page.getByRole('textbox', { name: 'HTML 편집기' });
  const actual = page.locator('#actual-host');
  await editor.fill('<p>확정한 노트</p>');
  await page.getByRole('button', { name: 'Patch 적용' }).click();
  await editor.fill('<p>작성 중인 노트</p>');

  await phase2.click();
  await page.getByRole('textbox', { name: '데모 이름' }).fill('테스터');
  await page.getByRole('button', { name: '카운터 증가' }).click();
  await phase1.click();

  await expect(editor).toHaveValue('<p>작성 중인 노트</p>');
  await expect(page.locator('#preview-host p')).toHaveText('작성 중인 노트');
  await expect(actual.locator('p')).toHaveText('확정한 노트');
  await expect(page.locator('#history-position')).toHaveText('2 / 2');
  await phase2.click();
  await expect(page.getByRole('textbox', { name: '데모 이름' })).toHaveValue('테스터');
  await expect(page.locator('#counter-value')).toHaveText('1');
});

test('reloading restores the last phase selected by mouse or keyboard', async ({ page }) => {
  await page.goto('/');
  const phase1 = page.getByRole('tab', { name: /^Phase 1/ });
  const phase2 = page.getByRole('tab', { name: /^Phase 2/ });

  await phase2.click();
  await page.reload();
  await expect(phase2).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('heading', { name: 'Hooks', exact: true })).toBeVisible();
  await expect(page.locator('#dom-lab')).toBeHidden();

  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  await expect(phase2).toBeFocused();
  await page.keyboard.press('ArrowUp');
  await page.reload();
  await expect(phase1).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('textbox', { name: 'HTML 편집기' })).toBeVisible();
  await expect(page.locator('#hooks-lab')).toBeHidden();
});

test('the sidebar can be collapsed from either phase and leaves more room for the editor', async ({ page }) => {
  await page.goto('/');
  const toggle = page.getByRole('button', { name: '사이드바', exact: true });
  const tabList = page.getByRole('tablist', { name: '실험 단계' });
  const editor = page.getByRole('textbox', { name: 'HTML 편집기' });
  await editor.fill('<p>편집 중인 내용</p>');
  const initialWidth = (await editor.boundingBox())!.width;

  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(tabList).toBeHidden();
  expect((await editor.boundingBox())!.width).toBeGreaterThan(initialWidth);
  await expect(editor).toHaveValue('<p>편집 중인 내용</p>');

  await toggle.press('Enter');
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await expect(tabList).toBeVisible();
  expect((await editor.boundingBox())!.width).toBeCloseTo(initialWidth);

  const phase2 = page.getByRole('tab', { name: /^Phase 2/ });
  await phase2.click();
  await page.getByRole('button', { name: '카운터 증가' }).click();
  await toggle.click();
  await expect(page.getByRole('heading', { name: 'Hooks', exact: true })).toBeVisible();
  await expect(page.locator('#counter-value')).toHaveText('1');
  await toggle.press('Space');
  await expect(phase2).toHaveAttribute('aria-selected', 'true');
});

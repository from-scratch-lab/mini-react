import { expect, test, type Page } from '@playwright/test';
const actual = (page: Page) => page.locator('#actual-host #content');
const preview = (page: Page) => page.locator('#preview-host #content');
async function edit(page: Page, html: string) { await page.getByRole('textbox', { name: 'HTML 편집기', exact: true }).fill(html); }
async function apply(page: Page, html: string) { await edit(page, html); await page.getByRole('button', { name: 'Patch 적용' }).click(); }
async function synced(page: Page, html: string) {
  expect(await actual(page).innerHTML()).toBe(html); expect(await preview(page).innerHTML()).toBe(html);
  await expect(page.getByRole('textbox', { name: 'HTML 편집기', exact: true })).toHaveValue(html);
}
test.beforeEach(async ({ page }) => { await page.goto('/'); });
test('initial DOM conversion, isolated preview, text patch and preserved DOM identities', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  const initial = await actual(page).innerHTML(); expect(await preview(page).innerHTML()).toBe(initial);
  await expect(page.locator('#html-editor')).toHaveValue(initial); await expect(page.locator('#history-position')).toHaveText('1 / 1');
  await expect(page.getByRole('button', { name: '뒤로가기' })).toBeDisabled(); await expect(page.getByRole('button', { name: '앞으로가기' })).toBeDisabled();
  await actual(page).evaluate(element => {
    const paragraph = element.querySelector('article > p')!;
    (window as any).identities = { article: element.firstChild, heading: element.querySelector('h2'), paragraph, text: paragraph.firstChild, strong: paragraph.querySelector('strong'), input: element.querySelector('input') };
  });
  const changed = initial.replace('오늘은 ', '이번에는 ');
  await edit(page, changed); expect(await actual(page).innerHTML()).toBe(initial); expect(await preview(page).innerHTML()).toBe(changed);
  await expect(page.locator('#message')).toHaveText('적용 대기 중');
  await expect(page.locator('#operation-count')).toHaveText('작업 1개');
  await page.getByRole('button', { name: 'Patch 적용' }).click(); await synced(page, changed);
  await expect(page.locator('#message')).toHaveText('실제 DOM에 적용했습니다.');
  expect(await actual(page).evaluate(element => {
    const saved = (window as any).identities; const paragraph = element.querySelector('article > p')!;
    return saved.article === element.firstChild && saved.heading === element.querySelector('h2') && saved.paragraph === paragraph && saved.text === paragraph.firstChild && saved.strong === paragraph.querySelector('strong') && saved.input === element.querySelector('input');
  })).toBe(true);
  await expect(page.locator('#operation-count')).toHaveText('작업 1개'); expect(errors).toEqual([]);
});
test('history back, forward, discard draft, no-op future preservation and branching', async ({ page }) => {
  await apply(page, '<p>A</p>'); await apply(page, '<p>B</p>'); await apply(page, '<p>C</p>');
  await page.getByRole('button', { name: '뒤로가기' }).click(); await synced(page, '<p>B</p>');
  await page.getByRole('button', { name: 'Patch 적용' }).click(); await expect(page.locator('#history-position')).toHaveText('3 / 4'); await expect(page.getByRole('button', { name: '앞으로가기' })).toBeEnabled();
  await edit(page, '<p>uncommitted</p>'); await page.getByRole('button', { name: '앞으로가기' }).click(); await synced(page, '<p>C</p>');
  await page.getByRole('button', { name: '뒤로가기' }).click(); await apply(page, '<p>D</p>'); await synced(page, '<p>D</p>');
  await expect(page.locator('#history-position')).toHaveText('4 / 4'); await expect(page.getByRole('button', { name: '앞으로가기' })).toBeDisabled();
  await page.getByRole('button', { name: '뒤로가기' }).click(); await synced(page, '<p>B</p>');
  await page.getByRole('button', { name: '뒤로가기' }).click(); await synced(page, '<p>A</p>');
  await page.getByRole('button', { name: '뒤로가기' }).click(); await expect(page.getByRole('button', { name: '뒤로가기' })).toBeDisabled();
});
test('empty roots, multiple roots, nested edits, middle insertion, consecutive removals and attributes', async ({ page }) => {
  await apply(page, '<p id="old" title="remove">A</p><ul><li>1</li><li>2</li><li>3</li></ul><footer>end</footer>');
  await actual(page).evaluate(element => { (window as any).footer = element.querySelector('footer'); });
  const target = '<p id="new">A</p><ul><li>1</li></ul><footer>end</footer>';
  await apply(page, target); await synced(page, target);
  expect(await actual(page).evaluate(element => element.querySelector('footer') === (window as any).footer)).toBe(true);
  await apply(page, '<p>A</p><b>middle</b><div><section><p><em>deep</em></p></section></div>');
  await expect(actual(page).locator('em')).toHaveText('deep');
  await apply(page, ''); await synced(page, ''); await expect(page.locator('#history-position')).toHaveText('5 / 5');
  await page.getByRole('button', { name: '뒤로가기' }).click(); await expect(actual(page).locator('em')).toHaveText('deep');
});
test('live controls are read from preview DOM and restored through history', async ({ page }) => {
  await apply(page, '<input aria-label="note" value="original"><input aria-label="check" type="checkbox" checked><textarea aria-label="memo">original</textarea>');
  await preview(page).getByRole('textbox', { name: 'note', exact: true }).fill('live value');
  await preview(page).getByRole('checkbox').uncheck(); await preview(page).getByRole('textbox', { name: 'memo', exact: true }).fill('live\ntext');
  await expect(page.locator('#message')).toHaveText('적용 대기 중');
  await expect(actual(page).getByRole('textbox', { name: 'note', exact: true })).toHaveValue('original');
  await page.getByRole('button', { name: 'Patch 적용' }).click();
  await expect(actual(page).getByRole('textbox', { name: 'note', exact: true })).toHaveValue('live value'); await expect(actual(page).getByRole('checkbox')).not.toBeChecked(); await expect(actual(page).locator('textarea')).toHaveValue('live\ntext');
  const current = '<input aria-label="note" value="live value"><input aria-label="check" type="checkbox" value="on"><textarea aria-label="memo">live\ntext</textarea>';
  await expect(page.locator('#html-editor')).toHaveValue(current);
  // The textarea retains its default text child; .value is its managed current state.
  expect(await actual(page).locator('textarea').textContent()).toBe('original');
  await page.getByRole('button', { name: '뒤로가기' }).click(); await expect(preview(page).getByRole('checkbox')).toBeChecked(); await expect(actual(page).locator('textarea')).toHaveValue('original');
  await page.getByRole('button', { name: '앞으로가기' }).click(); await expect(page.locator('#html-editor')).toHaveValue(current);
  await expect(actual(page).getByRole('textbox', { name: 'note', exact: true })).toHaveValue('live value');
  await expect(actual(page).getByRole('checkbox')).not.toBeChecked();
  await expect(actual(page).locator('textarea')).toHaveValue('live\ntext');
  await expect(preview(page).getByRole('textbox', { name: 'note', exact: true })).toHaveValue('live value');
  await expect(preview(page).getByRole('checkbox')).not.toBeChecked();
  await expect(preview(page).locator('textarea')).toHaveValue('live\ntext');
  expect(await preview(page).innerHTML()).toBe(await actual(page).innerHTML());
});
test('unsafe content is excluded and style/ID scopes do not interfere', async ({ page }) => {
  await edit(page, '<script>window.hacked=true</script><style>body{display:none}</style><svg></svg><p id="patch" onclick="window.hacked=true">safe</p><a href="javascript:alert(1)">link</a>');
  await expect(preview(page).locator('script, style, svg')).toHaveCount(0); await expect(preview(page).locator('p')).not.toHaveAttribute('onclick');
  await page.getByRole('button', { name: 'Patch 적용' }).click(); await expect(actual(page).locator('p')).toHaveText('safe'); expect(await page.evaluate(() => (window as any).hacked)).toBeUndefined();
  await expect(page.locator('#message')).toBeVisible(); await expect(page.getByRole('button', { name: 'Patch 적용' })).toBeVisible();
});
test('no-change patch causes no actual DOM mutations and creates no history', async ({ page }) => {
  await actual(page).evaluate(element => {
    (window as any).mutations = []; (window as any).observer = new MutationObserver(records => (window as any).mutations.push(...records));
    (window as any).observer.observe(element, { childList: true, subtree: true, attributes: true, characterData: true });
  });
  await page.getByRole('button', { name: 'Patch 적용' }).click(); await expect(page.locator('#history-position')).toHaveText('1 / 1');
  await expect(page.locator('#message')).toHaveText('적용할 변경 사항이 없습니다.');
  await expect(page.locator('#operation-count')).toHaveText('작업 0개');
  expect(await page.evaluate(() => (window as any).mutations.length)).toBe(0);
});

test('typing in an initially empty textarea patches its live value and keeps its DOM identity', async ({ page }) => {
  await apply(page, '<textarea aria-label="empty"></textarea><p>keep</p>');
  await actual(page).evaluate(element => { (window as any).emptyTextarea = element.firstChild; (window as any).keptParagraph = element.lastChild; });
  await preview(page).locator('textarea').fill('typed from empty');
  await page.getByRole('button', { name: 'Patch 적용' }).click();
  await expect(actual(page).locator('textarea')).toHaveValue('typed from empty');
  await expect(page.locator('#html-editor')).toHaveValue('<textarea aria-label="empty">typed from empty</textarea><p>keep</p>');
  expect(await actual(page).evaluate(element => element.firstChild === (window as any).emptyTextarea && element.lastChild === (window as any).keptParagraph)).toBe(true);
  await expect(page.locator('#operation-count')).toHaveText('작업 1개');
  await page.getByRole('button', { name: '뒤로가기' }).click();
  await expect(actual(page).locator('textarea')).toHaveValue(''); await expect(preview(page).locator('textarea')).toHaveValue('');
  await expect(page.locator('#html-editor')).toHaveValue('<textarea aria-label="empty"></textarea><p>keep</p>');
  await page.getByRole('button', { name: '앞으로가기' }).click();
  await expect(actual(page).locator('textarea')).toHaveValue('typed from empty'); await expect(preview(page).locator('textarea')).toHaveValue('typed from empty');
});

test('unsupported attribute names are removed before patching and history stays consistent', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await apply(page, '<p>A</p><div>B</div>');
  await edit(page, '<p>X</p><div @click="x" foo@bar="x" data-note="keep">B</div>');
  await expect(page.locator('#message')).toContainText('2개 제외');
  await page.getByRole('button', { name: 'Patch 적용' }).click();
  await synced(page, '<p>X</p><div data-note="keep">B</div>');
  await expect(page.locator('#history-position')).toHaveText('3 / 3');
  await page.getByRole('button', { name: '뒤로가기' }).click(); await synced(page, '<p>A</p><div>B</div>');
  await page.getByRole('button', { name: '앞으로가기' }).click(); await synced(page, '<p>X</p><div data-note="keep">B</div>');
  expect(errors).toEqual([]);
});

test('leading textarea newlines survive unrelated HTML edits and history navigation', async ({ page }) => {
  await apply(page, '<textarea></textarea><p>old</p>');
  await preview(page).locator('textarea').fill('\n\nhello');
  await page.getByRole('button', { name: 'Patch 적용' }).click();
  await actual(page).evaluate(element => { (window as any).savedTextarea = element.firstChild; });
  const source = await page.locator('#html-editor').inputValue();
  await apply(page, source.replace('<p>old</p>', '<p>new</p>'));
  await expect(actual(page).locator('textarea')).toHaveValue('\n\nhello');
  await expect(preview(page).locator('textarea')).toHaveValue('\n\nhello');
  expect(await actual(page).evaluate(element => element.firstChild === (window as any).savedTextarea)).toBe(true);
  await page.getByRole('button', { name: '뒤로가기' }).click();
  await expect(actual(page).locator('textarea')).toHaveValue('\n\nhello');
  await expect(preview(page).locator('textarea')).toHaveValue('\n\nhello');
  await page.getByRole('button', { name: '앞으로가기' }).click();
  await expect(actual(page).locator('textarea')).toHaveValue('\n\nhello');
  await expect(preview(page).locator('textarea')).toHaveValue('\n\nhello');
  await page.getByRole('button', { name: 'Patch 적용' }).click();
  await expect(page.locator('#operation-count')).toHaveText('작업 0개');
  await expect(page.locator('#history-position')).toHaveText('4 / 4');
});

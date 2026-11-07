import { afterEach, expect, it } from 'vitest';

afterEach(() => document.body.replaceChildren());

it('keeps the sidebar button and controlled navigation in sync', async () => {
  document.body.innerHTML = '<div id="app"></div>';
  await import('../src/main');

  const toggle = document.querySelector<HTMLButtonElement>('#sidebar-toggle')!;
  const navigation = document.getElementById(toggle.getAttribute('aria-controls')!)!;
  expect(navigation.hidden).toBe(false);
  expect(toggle.getAttribute('aria-expanded')).toBe('true');

  toggle.click();
  expect(navigation.hidden).toBe(true);
  expect(toggle.getAttribute('aria-expanded')).toBe('false');

  toggle.click();
  expect(navigation.hidden).toBe(false);
  expect(toggle.getAttribute('aria-expanded')).toBe('true');
});

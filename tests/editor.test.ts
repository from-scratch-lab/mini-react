import { expect, it } from 'vitest';
import { parseEditorHTML, serializeTree } from '../src/editor';
import { readDOM } from '../src/core/vdom';
it('removes executable content, namespaces, unsupported tags and unsafe attributes', () => {
  const result = parseEditorHTML('<script>window.hacked=1</script><svg><circle/></svg><iframe srcdoc="x"></iframe><style>p{display:none}</style><x-custom></x-custom><p onclick="bad()" style="color:red">safe</p><a href=" java&#10;script:bad()">link</a><input type="file" autofocus>');
  const container = document.createElement('div'); container.append(result.content);
  expect(container.innerHTML).toBe('<p>safe</p><a>link</a><input type="text">'); expect(result.removed).toBeGreaterThan(0);
});
it('handles invalid URLs without interrupting editing and preserves comments and whitespace', () => {
  const container = document.createElement('div'); container.append(parseEditorHTML(' hi <!--note--><a href="http://[">bad URL</a><a href="/relative">ok</a>').content);
  expect(container.innerHTML).toBe(' hi <!--note--><a>bad URL</a><a href="/relative">ok</a>');
});
it('serializes live form state for the editor without changing the preview', () => {
  const container = document.createElement('div'); container.innerHTML = '<input value="default" checked><textarea>default</textarea>';
  const input = container.querySelector('input')!; input.value = 'new "value"'; input.checked = false; container.querySelector('textarea')!.value = 'new\ntext';
  const html = serializeTree(readDOM(container)); expect(html).toContain('value="new &quot;value&quot;"'); expect(html).not.toContain('checked'); expect(html).toContain('<textarea>new\ntext</textarea>'); expect(input.getAttribute('value')).toBe('default');
});

it('excludes attribute names that cannot be recreated by the DOM API', () => {
  const result = parseEditorHTML('<p @click="x" foo@bar="x" [title]="x" data-note="keep" aria-label="keep" 한글="keep">safe</p>');
  expect(result.removed).toBe(3);
  const html = serializeTree(readDOM(result.content));
  expect(html).toBe('<p data-note="keep" aria-label="keep" 한글="keep">safe</p>');
});

it.each(['', 'hello', '\n', '\nhello', '\n\nhello', '\n<&</textarea>'])('preserves textarea value through repeated HTML round trips: %j', value => {
  const container = document.createElement('div'); container.innerHTML = '<textarea>default</textarea><p>old</p>';
  const textarea = container.querySelector('textarea')!; textarea.value = value;
  let tree = readDOM(container);
  for (let i = 0; i < 3; i++) {
    const parsed = parseEditorHTML(serializeTree(tree).replace('<p>old</p>', '<p>new</p>'));
    expect(parsed.content.querySelector('textarea')!.value).toBe(value);
    tree = readDOM(parsed.content);
  }
  expect(textarea.value).toBe(value); expect(textarea.textContent).toBe('default');
});

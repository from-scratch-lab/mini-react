import { describe, expect, it } from 'vitest';
import { createDOM, domToVNode, readDOM, renderPreview, type VTree } from '../src/core/vdom';
import { diff } from '../src/core/diff';
import { patch } from '../src/core/patch';
function container(html: string): HTMLDivElement { const node = document.createElement('div'); node.innerHTML = html; return node; }
function tree(html: string): VTree { return readDOM(container(html)); }
function freeze<T>(value: T): T { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; }

describe('DOM conversion and rendering', () => {
  it('preserves whitespace, text, attributes, comments and child order without DOM references', () => {
    const actual = readDOM(container(' hello <p id="a" title="한글">one <b>two</b> three</p><!--note-->'));
    expect(actual).toEqual([{ type: 'text', text: ' hello ' }, { type: 'element', tag: 'p', attrs: { id: 'a', title: '한글' }, children: [{ type: 'text', text: 'one ' }, { type: 'element', tag: 'b', attrs: {}, children: [{ type: 'text', text: 'two' }] }, { type: 'text', text: ' three' }] }, { type: 'comment', text: 'note' }]);
    expect(structuredClone(actual)).toEqual(actual);
  });
  it.each(['', 'a<p>x</p><hr>tail', '<div><section><article><p><b>deep</b></p></article></section></div>'])('renders exact structure: %s', html => {
    const target = document.createElement('div'); renderPreview(target, tree(html)); expect(readDOM(target)).toEqual(tree(html)); expect(target.innerHTML).toBe(container(html).innerHTML);
  });
  it('captures live input and textarea state and renders it consistently', () => {
    const original = container('<input value="default"><input type="checkbox" checked><textarea>default</textarea>');
    original.querySelector('input')!.value = 'edited';
    original.querySelectorAll('input')[1].checked = false;
    original.querySelector('textarea')!.value = 'edited\ntext';
    const snapshot = readDOM(original); const target = document.createElement('div'); renderPreview(target, snapshot);
    expect(target.querySelector('input')!.value).toBe('edited'); expect(target.querySelectorAll('input')[1].checked).toBe(false);
    expect(target.querySelector('textarea')!.value).toBe('edited\ntext'); expect(readDOM(target)).toEqual(snapshot);
  });
  it('rejects unsupported namespace nodes explicitly', () => expect(() => domToVNode(document.createElementNS('http://www.w3.org/2000/svg', 'svg'))).toThrow());
});

describe('pure diff and incremental patch', () => {
  it.each([
    ['<p>A</p>', '<p>A</p>', []],
    ['', '<p>A</p>', ['insert']],
    ['<p>A</p>', '', ['remove']],
    ['<p>A</p>', '<div>A</div>', ['replace']],
    ['a', '<p>A</p>', ['replace']],
    ['<p>A</p>', '<p>B</p>', ['text']],
    ['<p id="old" title="remove">A</p>', '<p id="new" class="add">A</p>', ['attributes']],
  ])('computes operations for %s → %s', (before, after, types) => {
    const previous = freeze(tree(before)); const next = freeze(tree(after)); const saved = structuredClone([previous, next]);
    const operations = diff(previous, next); expect(operations.map(op => op.type)).toEqual(types);
    expect([previous, next]).toEqual(saved);
    const actual = container(before); patch(actual, operations); expect(readDOM(actual)).toEqual(next);
  });
  it.each([
    ['<ul><li>A</li><li>B</li><li>C</li><li>D</li></ul>', '<ul><li>A</li></ul>'],
    ['<p>A</p><p>B</p>', '<p>A</p><i>middle</i><p>B</p>'],
    ['<div><b>A</b><i>B</i><p>C</p></div><hr><aside>end</aside>', '<div><b>X</b></div><section><p>new</p><p>next</p></section>'],
    ['<a title="remove" href="/a">a</a>', '<a>a</a>'],
    ['', 'text<p>one</p><p>two</p>'],
    ['<p>one</p><p>two</p>', ''],
    ['<div><section><p><b>old</b></p></section></div>', '<div><section><p><b>new</b><i>deep</i></p></section></div>'],
    ['<!--a-->x', '<!--b-->y'],
    ['<input value="old" checked><textarea>old</textarea>', '<input value="new"><textarea>new</textarea>'],
  ])('patch reaches target with stable sequential paths: %s', (before, after) => {
    const actual = container(before); const next = tree(after); patch(actual, diff(readDOM(actual), next)); expect(readDOM(actual)).toEqual(next);
  });
  it('keeps unrelated and text-only edited nodes identical', () => {
    const actual = container('<h2>keep</h2><p title="old">old <b>keep</b></p><footer>keep</footer>');
    const [heading, paragraph, footer] = Array.from(actual.children); const text = paragraph.firstChild; const bold = paragraph.lastChild;
    patch(actual, diff(readDOM(actual), tree('<h2>keep</h2><p title="new">new <b>keep</b></p><footer>keep</footer>')));
    expect(actual.children[0]).toBe(heading); expect(actual.children[1]).toBe(paragraph); expect(actual.children[2]).toBe(footer); expect(paragraph.firstChild).toBe(text); expect(paragraph.lastChild).toBe(bold);
  });
  it('performs zero mutations for identical trees', async () => {
    const actual = container('<p title="same">same</p>'); const records: MutationRecord[] = [];
    const observer = new MutationObserver(changes => records.push(...changes)); observer.observe(actual, { subtree: true, childList: true, attributes: true, characterData: true });
    const operations = diff(readDOM(actual), readDOM(actual)); patch(actual, operations); await Promise.resolve(); observer.disconnect();
    expect(operations).toEqual([]); expect(records).toEqual([]);
  });
  it('patches dirty live form properties, including unchecked input', () => {
    const actual = container('<input value="old" checked><textarea>old</textarea>'); actual.querySelector('input')!.value = 'dirty'; actual.querySelector('textarea')!.value = 'dirty';
    const desired = tree('<input value="new"><textarea>new</textarea>'); patch(actual, diff(readDOM(actual), desired));
    expect(actual.querySelector('input')!.value).toBe('new'); expect(actual.querySelector('input')!.checked).toBe(false); expect(actual.querySelector('textarea')!.value).toBe('new'); expect(readDOM(actual)).toEqual(desired);
  });
});

it('keeps empty textarea child paths real while preserving dirty live values separately', () => {
  const actual = container('<textarea></textarea>'); const draft = container('<textarea></textarea>');
  draft.querySelector('textarea')!.value = 'typed into empty textarea';
  const first = readDOM(actual); const next = readDOM(draft);
  expect((next[0] as Extract<VTree[number], {type: 'element'}>).children).toEqual([]);
  patch(actual, diff(first, next)); expect(readDOM(actual)).toEqual(next); expect(actual.querySelector('textarea')!.value).toBe('typed into empty textarea');
  const empty = tree('<textarea></textarea>'); patch(actual, diff(next, empty)); expect(readDOM(actual)).toEqual(empty);
});

it('removes attributes whose names overlap Object.prototype', () => {
  const actual = container('<p constructor="remove" __proto__="remove">text</p>');
  const next = tree('<p>text</p>'); patch(actual, diff(readDOM(actual), next)); expect(readDOM(actual)).toEqual(next);
});

it.each([true, false])('preserves dirty value and checked=%s when unrelated attributes change', checked => {
  const actual = container(`<input type="text" value="default" title="old"${checked ? '' : ' checked'}>`);
  const input = actual.querySelector('input')!;
  input.value = 'dirty'; input.checked = checked;
  const before = readDOM(actual); const next = structuredClone(before);
  if (next[0].type !== 'element') throw new Error('Expected input');
  delete next[0].attrs.title; next[0].attrs.class = 'new';
  patch(actual, diff(before, next));
  expect(readDOM(actual)).toEqual(next); expect(actual.firstChild).toBe(input);
  expect(input.getAttribute('value')).toBe('default');
});

it.each(['value', 'checked', 'type'])('preserves other dirty input state when %s changes', attribute => {
  const actual = container('<input value="default" checked>');
  const input = actual.querySelector('input')!; input.value = 'dirty'; input.checked = false;
  const before = readDOM(actual); const next = structuredClone(before);
  if (next[0].type !== 'element') throw new Error('Expected input');
  next[0].attrs[attribute] = attribute === 'value' ? 'new' : attribute === 'type' ? 'checkbox' : '';
  patch(actual, diff(before, next));
  expect(readDOM(actual)).toEqual(next); expect(actual.firstChild).toBe(input);
});

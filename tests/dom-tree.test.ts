import { describe, expect, it } from 'vitest';
import { createDomDiagram, createDomTree } from '../src/dom-tree';

describe('Phase 2 DOM tree', () => {
  it('opens the ancestors of changed text and retains branches across value updates', () => {
    const root = document.createElement('div');
    root.innerHTML = '<section><output>1</output></section><aside><p>Keep</p></aside>';
    const list = document.createElement('ul');
    const tree = createDomTree(root, list);
    const text = root.querySelector('output')!.firstChild!;

    tree.update([text]);
    expect([...list.querySelectorAll('details[open] > summary code')].map(label => label.textContent))
      .toEqual(['div', 'section', 'output']);
    expect(list.querySelector('.dom-tree-change:not([hidden])')?.previousElementSibling?.textContent).toBe('#text "1"');

    const outputBranch = [...list.querySelectorAll('details')].find(branch =>
      branch.querySelector('summary')?.textContent?.startsWith('output'))!;
    outputBranch.open = false;
    tree.select(text);
    expect(outputBranch.open).toBe(true);
    expect(list.querySelector('[aria-current]')?.textContent).toBe('#text "1"');

    text.nodeValue = '2';
    tree.update([]);
    expect(list.contains(outputBranch)).toBe(true);
    expect(outputBranch.textContent).toContain('#text "2"');
    expect(list.querySelector('[aria-current], .dom-tree-change:not([hidden])')).toBeNull();
  });

  it('shows inserted nodes and drops removed nodes when the DOM structure changes', () => {
    const root = document.createElement('div');
    root.innerHTML = '<p>Before</p>';
    const list = document.createElement('ul');
    const tree = createDomTree(root, list);
    tree.update([root.firstChild!], true);

    const button = document.createElement('button');
    button.textContent = 'After';
    root.replaceChildren(button);
    tree.update([button], true);
    expect(list.textContent).not.toContain('Before');
    expect(list.querySelector('.dom-tree-change:not([hidden])')?.previousElementSibling?.textContent).toBe('button');
    expect(list.textContent).toContain('#text "After"');
  });
});

describe('Phase 2 DOM diagram', () => {
  it('keeps the parent path to each changed node and clears selection for the next observation', () => {
    const root = document.createElement('div');
    root.innerHTML = '<main><section><output>2</output><button>Unchanged</button></section><aside><output>3</output></aside></main>';
    const list = document.createElement('ul');
    const diagram = createDomDiagram(root, list);
    const [counter, total] = [...root.querySelectorAll('output')].map(element => element.firstChild!);
    diagram.update([counter, total]);

    const label = [...list.querySelectorAll('code')].find(code => code.textContent === '#text "2"')!;
    const parent = label.closest('li')!.parentElement!.closest('li')!;
    expect(parent.querySelector(':scope > .dom-diagram-node code')?.textContent).toBe('output');
    expect([...list.querySelectorAll('.dom-tree-change')].map(badge => badge.previousElementSibling?.textContent))
      .toEqual(['#text "2"', '#text "3"']);
    expect(list.textContent).not.toContain('Unchanged');

    diagram.select(total);
    expect(list.querySelector('[aria-current] code')?.textContent).toBe('#text "3"');

    diagram.update([]);
    expect(list.querySelector('[aria-current], .dom-tree-change')).toBeNull();
    expect([...list.querySelectorAll('code')].map(code => code.textContent)).toEqual(['div', 'main', 'section', 'aside']);
  });
});

interface TreeRow {
  label: HTMLElement;
  change: HTMLElement;
  branch?: HTMLDetailsElement;
}

function nodeLabel(node: Node): string {
  if (!(node instanceof Element)) return `${node.nodeName} ${JSON.stringify(node.nodeValue)}`;
  const selector = node.id ? `#${node.id}` : Array.from(node.classList, name => `.${name}`).join('');
  const heading = node.localName === 'section' ? node.querySelector(':scope > h3')?.textContent : undefined;
  const name = node.getAttribute('aria-label') || heading;
  return `${node.localName}${selector}${name ? ` · ${name}` : ''}`;
}

function changeBadge(document: Document): HTMLSpanElement {
  const badge = document.createElement('span');
  badge.className = 'dom-tree-change';
  badge.textContent = '변경';
  return badge;
}

export function createDomTree(root: Element, list: HTMLElement) {
  const document = list.ownerDocument;
  let rows = new Map<Node, TreeRow>();
  let changed: readonly Node[] = [];
  let selected: HTMLElement | undefined;

  function rebuild(): void {
    const previousRows = rows;
    rows = new Map();

    function add(node: Node): HTMLLIElement {
      const item = document.createElement('li');
      const label = document.createElement('code');
      const change = changeBadge(document);
      change.hidden = true;
      const row: TreeRow = { label, change };
      rows.set(node, row);

      if (node.hasChildNodes()) {
        const branch = document.createElement('details');
        branch.open = node === root || !!previousRows.get(node)?.branch?.open;
        const summary = document.createElement('summary');
        summary.append(label, change);
        const children = document.createElement('ul');
        children.append(...Array.from(node.childNodes, add));
        branch.append(summary, children);
        item.append(branch);
        row.branch = branch;
      } else {
        item.append(label, change);
      }
      return item;
    }

    list.replaceChildren(add(root));
  }

  function reveal(node: Node): void {
    for (let current: Node | null = node; current; current = current.parentNode) {
      const branch = rows.get(current)?.branch;
      if (branch) branch.open = true;
      if (current === root) break;
    }
  }

  return {
    update(targets: readonly Node[], structureChanged = false): void {
      selected?.removeAttribute('aria-current');
      selected = undefined;
      for (const node of changed) {
        const row = rows.get(node);
        if (row) row.change.hidden = true;
      }
      if (structureChanged || rows.size === 0) rebuild();
      for (const [node, row] of rows) {
        const label = nodeLabel(node);
        if (row.label.textContent !== label) row.label.textContent = label;
      }
      for (const node of targets) {
        const row = rows.get(node);
        if (row) {
          row.change.hidden = false;
          reveal(node);
        }
      }
      changed = targets;
    },
    select(node: Node): void {
      selected?.removeAttribute('aria-current');
      selected = rows.get(node)?.label;
      selected?.setAttribute('aria-current', 'true');
      reveal(node);
    },
  };
}

export function createDomDiagram(root: Element, list: HTMLElement) {
  const document = list.ownerDocument;
  const labels = new Map<Node, HTMLElement>();
  let selected: HTMLElement | undefined;

  return {
    update(targets: readonly Node[]): void {
      labels.clear();
      selected = undefined;
      const changed = new Set(targets);
      const paths = new Set<Node>();
      for (const target of changed) {
        for (let node: Node | null = target; node; node = node.parentNode) {
          paths.add(node);
          if (node === root) break;
        }
      }

      function add(node: Node, depth: number): HTMLLIElement {
        const item = document.createElement('li');
        const label = document.createElement('span');
        label.className = 'dom-diagram-node';
        const name = document.createElement('code');
        name.textContent = nodeLabel(node);
        label.append(name);
        if (changed.has(node)) label.append(changeBadge(document));
        labels.set(node, label);
        item.append(label);

        // Keep the first two levels for context and follow Patch paths below them.
        const children = Array.from(node.childNodes).filter(child =>
          paths.has(child) || (depth < 2 && child instanceof Element));
        if (children.length) {
          const branches = document.createElement('ul');
          branches.append(...children.map(child => add(child, depth + 1)));
          item.append(branches);
        }
        return item;
      }

      list.replaceChildren(add(root, 0));
    },
    select(node: Node): void {
      selected?.removeAttribute('aria-current');
      selected = labels.get(node);
      selected?.setAttribute('aria-current', 'true');
    },
  };
}

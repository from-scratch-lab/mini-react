/** A snapshot contains data only. Container nodes are deliberately excluded. */
export type VNode =
  | { type: 'text'; text: string }
  | { type: 'comment'; text: string }
  | { type: 'element'; tag: string; attrs: Record<string, string>; children: VNode[]; value?: string };
export type VTree = VNode[];

export function domToVNode(node: Node): VNode {
  if (node.nodeType === Node.TEXT_NODE) return { type: 'text', text: node.nodeValue ?? '' };
  if (node.nodeType === Node.COMMENT_NODE) return { type: 'comment', text: node.nodeValue ?? '' };
  if (!(node instanceof HTMLElement)) throw new Error('HTML 요소, 텍스트, 주석만 지원합니다.');
  const attrs = Object.fromEntries(Array.from(node.attributes, a => [a.name, a.value]));
  if (node instanceof HTMLInputElement) {
    attrs.value = node.value;
    if (node.checked) attrs.checked = ''; else delete attrs.checked;
  }
  const vnode: VNode = { type: 'element', tag: node.localName, attrs, children: readDOM(node) };
  if (node instanceof HTMLTextAreaElement) vnode.value = node.value;
  return vnode;
}

export function readDOM(container: Node): VTree {
  return Array.from(container.childNodes, domToVNode);
} 

/** Initialize from attributes, or restore the intended live state after an attribute patch. */
export function syncControl(element: Element, state?: { value: string; checked: boolean }): void {
  if (element instanceof HTMLInputElement) {
    const value = state?.value ?? element.getAttribute('value') ?? '';
    if (element.value !== value) element.value = value;
    const checked = state?.checked ?? element.hasAttribute('checked');
    if (element.checked !== checked) element.checked = checked;
  }
}

export function createDOM(vnode: VNode): Node {
  if (vnode.type === 'text') return document.createTextNode(vnode.text);
  if (vnode.type === 'comment') return document.createComment(vnode.text);
  const element = document.createElement(vnode.tag);
  for (const [name, value] of Object.entries(vnode.attrs)) element.setAttribute(name, value);
  for (const child of vnode.children) element.appendChild(createDOM(child));
  syncControl(element);
  if (element instanceof HTMLTextAreaElement && vnode.value !== undefined) element.value = vnode.value;
  return element;
}

/** Full rendering is reserved for the editable preview and initial creation. */
export function renderPreview(container: Element | DocumentFragment, tree: VTree): void {
  const fragment = document.createDocumentFragment();
  for (const node of tree) fragment.appendChild(createDOM(node));
  container.replaceChildren(fragment);
}

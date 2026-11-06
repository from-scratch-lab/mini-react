import { createDOM, type VTree } from './core/vdom';
// Inert parsing happens only here. Only this sanitized DOM enters the preview.
const allowedTags = new Set('a abbr address article aside b bdi bdo blockquote br button caption cite code col colgroup data dd del details dfn dialog div dl dt em fieldset figcaption figure footer form h1 h2 h3 h4 h5 h6 header hgroup hr i img input ins kbd label legend li main mark menu meter nav ol optgroup option output p picture pre progress q rp rt ruby s samp section select small source span strong sub summary sup table tbody td textarea tfoot th thead time tr u ul var wbr'.split(' '));
function isUnsafeURL(value: string): boolean {
  try { return !['http:', 'https:', 'mailto:', 'tel:'].includes(new URL(value, 'https://preview.invalid/').protocol); }
  catch { return true; }
}
export function parseEditorHTML(html: string): { content: DocumentFragment; removed: number } {
  const template = document.createElement('template'); template.innerHTML = html;
  let removed = 0;
  function clean(parent: ParentNode): void {
    for (const child of Array.from(parent.children)) {
      if (child.namespaceURI !== 'http://www.w3.org/1999/xhtml' || !allowedTags.has(child.localName)) { child.remove(); removed++; continue; }
      for (const attr of Array.from(child.attributes)) {
        const name = attr.name.toLowerCase();
        const unsafeURL = ['href', 'src', 'action', 'formaction', 'poster', 'background', 'cite'].includes(name)
          && isUnsafeURL(attr.value);
        // Inline styles may load external resources; sample styles live outside managed content.
        if (name.startsWith('on') || ['srcdoc', 'srcset', 'style', 'autofocus', 'is'].includes(name) || unsafeURL) { child.removeAttribute(attr.name); removed++; }
      }
      if (child instanceof HTMLInputElement && child.type === 'file') { child.type = 'text'; removed++; }
      clean(child);
    }
  }
  clean(template.content);
  return { content: template.content, removed };
}
export function serializeTree(tree: VTree): string {
  const container = document.createElement('div');
  for (const vnode of tree) container.appendChild(createDOM(vnode));
  for (const textarea of container.querySelectorAll('textarea')) textarea.textContent = textarea.value;
  return container.innerHTML;
}

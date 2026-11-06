import type { Operation } from './diff';
import { createDOM, syncControl } from './vdom';

export function patch(container: Node, operations: Operation[]): void {
  for (const operation of operations) {
    let parent = container;
    for (const index of operation.path.slice(0, -1)) {
      const child = parent.childNodes[index];
      if (!child) throw new Error('Patch 부모 경로가 실제 DOM과 일치하지 않습니다.');
      parent = child;
    }
    const index = operation.path.at(-1)!;
    const current = parent.childNodes[index];
    if (operation.type === 'insert') {
      parent.insertBefore(createDOM(operation.node), current ?? null);
    } else {
      if (!current) throw new Error('Patch 대상이 실제 DOM과 일치하지 않습니다.');
      switch (operation.type) {
        case 'remove': parent.removeChild(current); break;
        case 'replace': parent.replaceChild(createDOM(operation.node), current); break;
        case 'text': current.nodeValue = operation.text; break;
        case 'value':
          if (!(current instanceof HTMLTextAreaElement)) throw new Error('value Patch 대상이 textarea가 아닙니다.');
          if (current.value !== operation.value) current.value = operation.value;
          break;
        case 'attributes': {
          if (!(current instanceof Element)) throw new Error('속성 Patch 대상이 요소가 아닙니다.');
          for (const name of operation.remove) current.removeAttribute(name);
          for (const [name, value] of Object.entries(operation.set)) current.setAttribute(name, value);
          syncControl(current);
        }
      }
    }
  }
}

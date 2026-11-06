export { TEXT_NODE, createVNode, createTextVNode, isTextVNode, cloneVNode } from './vdom/vnode.js';
export { createElement, h } from './vdom/createElement.js';
export { domToVNode, htmlToVNodes } from './vdom/domToVNode.js';
export { vnodeToHTML, childrenToHTML } from './vdom/serialize.js';
export { render } from './vdom/render.js';
export { diff, PatchType } from './diff/diff.js';
export { patch } from './diff/patch.js';

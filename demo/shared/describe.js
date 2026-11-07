import { PatchType, isTextVNode } from '../../src/index.js';

/** 패치 하나를 사람이 읽을 수 있는 한 줄로 바꾼다. (검증 페이지의 변경 로그용) */
export function describePatch(p) {
  switch (p.type) {
    case PatchType.CREATE:
      return `${label(p.vnode)} 추가`;
    case PatchType.REMOVE:
      return `${label(p.vnode)} 삭제`;
    case PatchType.REPLACE:
      return `${label(p.oldVNode)} → ${label(p.vnode)} 교체`;
    case PatchType.TEXT:
      return `${quote(p.oldValue)} → ${quote(p.value)}`;
    case PatchType.MOVE:
      return `${label(p.vnode)} 위치 이동`;
    case PatchType.PROPS: {
      const changes = [
        ...Object.entries(p.set).map(([name, value]) => `${name}: ${show(p.prev[name])} → ${show(value)}`),
        ...p.remove.map((name) => `${name} 삭제`),
      ];
      return `${label(p.vnode)} ${changes.join(', ')}`;
    }
    default:
      return p.type;
  }
}

function label(vnode) {
  if (isTextVNode(vnode)) return quote(vnode.props.nodeValue);
  const key = vnode.key != null ? ` key="${vnode.key}"` : '';
  return `<${vnode.type}${key}>`;
}

function quote(text, max = 24) {
  const oneLine = String(text).replace(/\s+/g, ' ');
  return `"${oneLine.length > max ? `${oneLine.slice(0, max)}…` : oneLine}"`;
}

function show(value) {
  if (value === undefined) return '(없음)';
  if (typeof value === 'function') return 'ƒ';
  return typeof value === 'string' ? quote(value) : JSON.stringify(value);
}

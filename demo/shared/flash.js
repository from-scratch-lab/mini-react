/**
 * MutationObserver 기록에 나온 요소를 잠깐 강조한다.
 * Web Animations API는 스타일 애니메이션만 걸고 DOM 트리·속성은 바꾸지 않는다. (실제 DOM 변경은 patch만 한다)
 */
export function flash(records) {
  const targets = new Set();
  for (const record of records) {
    const nodes = record.type === 'childList' ? [...record.addedNodes] : [record.target];
    for (const node of nodes) {
      const element = node.nodeType === 1 ? node : node.parentElement;
      if (element) targets.add(element);
    }
  }
  for (const element of targets) {
    element.animate?.(
      [{ backgroundColor: 'rgba(255, 196, 0, 0.55)', outline: '2px solid rgba(255, 160, 0, 0.9)' }, {}],
      { duration: 900, easing: 'ease-out' },
    );
  }
}

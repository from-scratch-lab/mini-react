/**
 * fn을 실행하는 동안 container 아래 실제 DOM이 얼마나 바뀌었는지 동기로 잰다.
 * 차등 fuzz(tests/support/differential.js)와 성능 예산(scripts/bench)이 같은 정의를 쓰도록 한곳에 둔다.
 *
 *   records       MutationObserver 기록 수 (DOM이 변경을 알린 횟수)
 *   nodesAdded    기록 안 addedNodes 합 (붙인 하위 트리 뿌리 수. fragment로 한 번에 붙여도 노드 수만큼 센다)
 *   nodesRemoved  기록 안 removedNodes 합
 *   created       fn 뒤 container 안에 새로 생긴 노드 수 (만드는 API와 상관없이, TreeWalker로 전후 차집합)
 *                 <template>의 content(문서 밖 DocumentFragment) 안쪽은 TreeWalker가 들어가지 않으므로 세지 않는다.
 *
 * MutationObserver는 원래 마이크로태스크에서 기록을 알려 주지만, takeRecords()로 fn 직후 바로 꺼내므로
 * "이 fn이 바꾼 것"만 센다.
 *
 * @template T
 * @param {Element} container
 * @param {() => T} fn
 * @returns {{ result: T, records: number, nodesAdded: number, nodesRemoved: number, created: number }}
 */
export function measureMutations(container, fn) {
  const MO = container.ownerDocument.defaultView.MutationObserver;
  const observer = new MO(() => {});
  observer.observe(container, { childList: true, subtree: true, attributes: true, characterData: true });
  const before = allNodes(container);
  let records;
  let result;
  try {
    result = fn();
    records = observer.takeRecords();
  } finally {
    observer.disconnect();
  }
  let nodesAdded = 0;
  let nodesRemoved = 0;
  for (const r of records) {
    nodesAdded += r.addedNodes.length;
    nodesRemoved += r.removedNodes.length;
  }
  let created = 0;
  for (const node of allNodes(container)) if (!before.has(node)) created += 1;
  return { result, records: records.length, nodesAdded, nodesRemoved, created };
}

/** root 아래 모든 노드 (root 제외) */
function allNodes(root) {
  const out = new Set();
  const walker = root.ownerDocument.createTreeWalker(root);
  while (walker.nextNode()) out.add(walker.currentNode);
  return out;
}

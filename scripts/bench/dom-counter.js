/**
 * DOM 조작 계수기 (LIS 실험의 1차 DOM 지표). Node(jsdom)와 브라우저에서 같이 쓴다.
 *
 * countDomOps(container, fn): fn을 실행하는 동안 container 안에서 일어난 구조 변경을 DOM API 단위로 센다.
 *   movedExistingNodes  측정 창 시작 때 container 안에 있던 노드를 다른 자리로 넣은 수 (1차 지표)
 *   insertedNewNodes    측정 창 안에서 처음 들어온 노드 수 (fragment로 들어온 것 포함)
 *   removedNodes        떼어 낸 노드 수 (remove·removeChild, textContent=''는 지워진 자식 수)
 *   replacedNodes       replaceWith로 바뀐 노드 수
 *   sameSpotInserts     이미 그 자리에 있는 노드를 같은 자리에 다시 넣은 수 (이동이 아니다)
 *   fragmentAppends     DocumentFragment에 노드를 넣은 수
 *   fragmentInsertions  fragment를 container 안에 넣은 수
 *   apiCalls            위 계측 API를 container 안(또는 fragment)에 부른 수
 *
 * 계측하는 API: insertBefore, appendChild, removeChild, remove(), replaceWith(), textContent 쓰기.
 * 엔진(src/diff/patch.js)이 쓰는 것 전부와 React DOM이 쓰는 removeChild를 덮는다.
 * 원래 메서드는 try/finally로 반드시 되돌린다. 계측이 시간을 늘리므로 시간 측정과 따로 돌린다.
 * 노드 정체성은 DOM 노드 객체로 본다(DOM에 key 속성을 쓰지 않는다).
 */
export function countDomOps(container, fn) {
  const win = container.ownerDocument.defaultView;
  const { Node, Element, CharacterData, DocumentFragment } = win;
  const counts = {
    movedExistingNodes: 0,
    insertedNewNodes: 0,
    removedNodes: 0,
    replacedNodes: 0,
    sameSpotInserts: 0,
    fragmentAppends: 0,
    fragmentInsertions: 0,
    apiCalls: 0,
  };

  // 측정 창 시작 때 container 안에 있던 노드 (출처 추적: fragment에 잠시 들어가도 "기존 노드"로 남는다)
  const existing = new WeakSet();
  const walker = container.ownerDocument.createTreeWalker(container);
  while (walker.nextNode()) existing.add(walker.currentNode);

  const isFragment = (node) => node instanceof DocumentFragment;
  const inScope = (parent) => parent != null && (isFragment(parent) || parent === container || container.contains(parent));

  /** 한 노드가 parent의 ref 앞에 들어갈 때 */
  function noteInsert(parent, node, ref) {
    if (isFragment(parent)) {
      counts.fragmentAppends += 1;
      return;
    }
    if (isFragment(node)) {
      counts.fragmentInsertions += 1;
      for (const child of node.childNodes) {
        if (existing.has(child)) counts.movedExistingNodes += 1;
        else counts.insertedNewNodes += 1;
      }
      return;
    }
    if (existing.has(node)) {
      const sameSpot = node.parentNode === parent && (node === ref || node.nextSibling === ref);
      if (sameSpot) counts.sameSpotInserts += 1;
      else counts.movedExistingNodes += 1;
    } else {
      counts.insertedNewNodes += 1;
    }
  }

  const original = {
    insertBefore: Node.prototype.insertBefore,
    appendChild: Node.prototype.appendChild,
    removeChild: Node.prototype.removeChild,
    elementRemove: Element.prototype.remove,
    dataRemove: CharacterData.prototype.remove,
    elementReplaceWith: Element.prototype.replaceWith,
    dataReplaceWith: CharacterData.prototype.replaceWith,
    textContent: Object.getOwnPropertyDescriptor(Node.prototype, 'textContent'),
  };

  Node.prototype.insertBefore = function insertBefore(node, ref) {
    if (inScope(this)) {
      counts.apiCalls += 1;
      noteInsert(this, node, ref);
    }
    return original.insertBefore.call(this, node, ref);
  };
  Node.prototype.appendChild = function appendChild(node) {
    if (inScope(this)) {
      counts.apiCalls += 1;
      noteInsert(this, node, null);
    }
    return original.appendChild.call(this, node);
  };
  Node.prototype.removeChild = function removeChild(child) {
    if (inScope(this)) {
      counts.apiCalls += 1;
      counts.removedNodes += 1;
    }
    return original.removeChild.call(this, child);
  };
  const wrapRemove = (fnOriginal) =>
    function remove() {
      if (inScope(this.parentNode)) {
        counts.apiCalls += 1;
        counts.removedNodes += 1;
      }
      return fnOriginal.call(this);
    };
  Element.prototype.remove = wrapRemove(original.elementRemove);
  CharacterData.prototype.remove = wrapRemove(original.dataRemove);
  const wrapReplace = (fnOriginal) =>
    function replaceWith(...nodes) {
      if (inScope(this.parentNode)) {
        counts.apiCalls += 1;
        counts.replacedNodes += 1;
      }
      return fnOriginal.apply(this, nodes);
    };
  Element.prototype.replaceWith = wrapReplace(original.elementReplaceWith);
  CharacterData.prototype.replaceWith = wrapReplace(original.dataReplaceWith);
  Object.defineProperty(Node.prototype, 'textContent', {
    ...original.textContent,
    set(value) {
      if (inScope(this) && this.nodeType === 1) {
        counts.apiCalls += 1;
        if (value === '' || value == null) counts.removedNodes += this.childNodes.length;
      }
      original.textContent.set.call(this, value);
    },
  });

  try {
    const result = fn();
    return { result, counts };
  } finally {
    Node.prototype.insertBefore = original.insertBefore;
    Node.prototype.appendChild = original.appendChild;
    Node.prototype.removeChild = original.removeChild;
    Element.prototype.remove = original.elementRemove;
    CharacterData.prototype.remove = original.dataRemove;
    Element.prototype.replaceWith = original.elementReplaceWith;
    CharacterData.prototype.replaceWith = original.dataReplaceWith;
    Object.defineProperty(Node.prototype, 'textContent', original.textContent);
  }
}

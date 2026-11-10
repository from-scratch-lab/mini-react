import type { RenderObservation } from './core/component';
import type { Operation } from './core/diff';
import type { VNode } from './core/vdom';
import { createDomDiagram, createDomTree } from './dom-tree';

// The demo declares these useState calls in a fixed order in App.
const stateNames = ['count', 'name', 'running'];
const format = (value: unknown) => typeof value === 'string' ? JSON.stringify(value) : String(value);
const optionalValue = (value: string | undefined) => value === undefined ? '없음' : format(value);

function operationNode(container: Element, operation: Operation): Node | undefined {
  if (operation.type === 'remove') return undefined;
  return operation.path.reduce<Node | undefined>((parent, index) => parent?.childNodes[index], container);
}

function previousNode(tree: readonly VNode[], path: readonly number[]): VNode | undefined {
  let children = tree;
  let node: VNode | undefined;
  for (const index of path) {
    node = children[index];
    children = node?.type === 'element' ? node.children : [];
  }
  return node;
}

function describeOperation(operation: Operation, target: Element | null, before: VNode | undefined): string {
  const label = target?.getAttribute('aria-label') || (target ? `<${target.localName}>` : `[${operation.path.join(', ')}]`);
  switch (operation.type) {
    case 'insert': return `${label} 추가`;
    case 'remove': return `${label} 삭제`;
    case 'replace': return `${label} 교체`;
    case 'text': {
      const old = before?.type === 'text' || before?.type === 'comment' ? before.text : undefined;
      return `${label} 텍스트 ${optionalValue(old)} → ${format(operation.text)}`;
    }
    case 'value': {
      const old = before?.type === 'element' ? before.value : undefined;
      return `${label} 값 ${optionalValue(old)} → ${format(operation.value)}`;
    }
    case 'attributes': {
      const attrs = before?.type === 'element' ? before.attrs : {};
      const changes = [...Object.entries(operation.set), ...operation.remove.map(name => [name, undefined] as const)];
      return `${label} 속성 · ${changes.map(([name, value]) =>
        `${name} ${optionalValue(attrs[name])} → ${optionalValue(value)}`).join(', ')}`;
    }
  }
}

function setList(list: Element, entries: string[]): void {
  list.replaceChildren(...entries.map(entry => {
    const item = list.ownerDocument.createElement('li');
    item.textContent = entry;
    return item;
  }));
}

export function createRenderInspector(demo: Element, panel: Element): (event: RenderObservation) => void {
  panel.innerHTML = `
    <h3 id="render-inspector-title">렌더링 관찰</h3>
    <p>카운터를 1로 만든 뒤 <code>+</code>를 한 번 더 눌러 보세요. 어떤 함수가 실행되고 화면의 어디가 바뀔까요?</p>
    <dl class="render-steps">
      <div><dt>1. 상태 변경</dt><dd id="render-state"></dd></div>
      <div><dt>2. 컴포넌트 실행</dt><dd id="render-components"></dd><dd id="render-cycle"></dd></div>
      <div><dt>3. 실제 DOM 변경</dt><dd id="render-patches"></dd></div>
    </dl>
    <details>
      <summary>컴포넌트와 props</summary>
      <p><code>FunctionComponent(App)</code> 인스턴스가 루트 함수 <code>App</code>을 감쌉니다. 이 Mini React에서는 루트 App만 상태를 관리하고 Hook을 호출합니다.
        자식 <code>Counter</code>와 <code>Summary</code>는 전달받은 props로 UI를 반환하는 상태 없는 함수입니다.</p>
      <ul class="render-props" aria-label="App이 자식에게 전달한 props">
        <li><code id="counter-props"></code></li>
        <li><code id="summary-props"></code></li>
      </ul>
      <p>값은 App에서 자식으로 내려갑니다. Counter의 <code>+</code> 버튼은 <code>props.increase()</code>를 호출해
        App의 <code>setCount()</code>에 변경을 요청합니다. 값이 바뀌면 <code>update()</code>가 자동으로 실행됩니다.
        공유 상태를 부모에 두는 이 구조를 <strong>Lifting State Up</strong>이라고 합니다.</p>
    </details>
    <details>
      <summary>Hook 상세</summary>
      <p><strong>함수는 다시 실행되는데 상태는 어떻게 유지될까요?</strong> App을 감싼 인스턴스가 <code>hooks</code> 배열을 보관합니다.
        매 렌더링에서 Hook은 0번부터 호출 순서대로 같은 슬롯을 읽습니다. 호출 순서를 고정해야 같은 값을 찾을 수 있어요.</p>
      <p id="render-hook-status" hidden></p>
      <ul id="render-hooks" aria-label="Hook 슬롯"></ul>
      <p>이름을 바꾸면 <code>useState</code>의 이름 슬롯이 갱신되고, <code>useMemo</code>는 <code>[count]</code>가 같아 결과를 재사용합니다.
        자동 증가를 끄면 DOM 반영 뒤 <code>useEffect</code>의 cleanup이 이전 타이머를 해제합니다.</p>
    </details>
    <details>
      <summary>DOM 변경 목록</summary>
      <ol>
        <li><strong>Virtual DOM</strong> · 컴포넌트가 반환한 화면을 새 <code>VNode[]</code> 데이터로 만듭니다.</li>
        <li><strong>Diff</strong> · Phase 1의 <code>diff(이전 VDOM, 새 VDOM)</code>이 변경 목록을 만듭니다.</li>
        <li><strong>Patch</strong> · Phase 1의 <code>patch()</code>가 변경 목록만 적용해 나머지 DOM 노드를 유지합니다.</li>
      </ol>
      <p>아래 목록은 이전 VDOM과 비교해 실제로 적용한 작업입니다.</p>
      <ul id="render-operations"></ul>
      <h4 id="render-dom-diagram-title">DOM 구조도</h4>
      <p>연결선은 부모와 자식의 관계를 나타냅니다. 상위 구조와 최근 Patch가 적용된 노드까지의 경로를 보여줍니다.</p>
      <div class="dom-diagram-scroll" role="region" aria-labelledby="render-dom-diagram-title" tabindex="0">
        <ul id="render-dom-diagram"></ul>
      </div>
      <h4 id="render-dom-tree-title">실제 DOM 트리</h4>
      <p>최근 Patch가 적용된 가지가 자동으로 열립니다. 변경 항목을 누르면 구조도, 트리, 데모에서 해당 위치를 강조합니다.</p>
      <ul id="render-dom-tree" aria-labelledby="render-dom-tree-title"></ul>
    </details>`;

  const state = panel.querySelector('#render-state')!;
  const components = panel.querySelector('#render-components')!;
  const cycle = panel.querySelector('#render-cycle')!;
  const patches = panel.querySelector('#render-patches')!;
  const counterProps = panel.querySelector('#counter-props')!;
  const summaryProps = panel.querySelector('#summary-props')!;
  const hooks = panel.querySelector('#render-hooks')!;
  const hookStatus = panel.querySelector<HTMLElement>('#render-hook-status')!;
  const operations = panel.querySelector('#render-operations')!;
  const diagram = createDomDiagram(demo, panel.querySelector<HTMLElement>('#render-dom-diagram')!);
  const tree = createDomTree(demo, panel.querySelector<HTMLElement>('#render-dom-tree')!);
  let previous: Extract<RenderObservation, { type: 'commit' }>['hooks'] = [];
  let highlights: Animation[] = [];
  const highlightStyle = { boxShadow: '0 0 0 2px var(--color-accent)' };

  function clearHighlights(): void {
    for (const highlight of highlights) highlight.cancel();
    highlights = [];
  }

  return event => {
    clearHighlights();

    if (event.type === 'unchanged') {
      const value = format(event.value);
      state.textContent = `${stateNames[event.index]} ${value} → ${value} (같은 값)`;
      components.textContent = '렌더링 생략';
      cycle.textContent = '같은 상태 값 · update() 호출 생략';
      patches.textContent = 'Patch 0개';
      hookStatus.textContent = '이번에는 Hook을 실행하지 않았습니다. 아래는 직전 렌더링의 슬롯입니다.';
      hookStatus.hidden = false;
      setList(operations, ['적용된 변경이 없습니다.']);
      diagram.update([]);
      tree.update([]);
      return;
    }

    const initial = previous.length === 0;
    const changes: string[] = [];
    const hookDetails: string[] = [];
    event.hooks.forEach((hook, index) => {
      const old = previous[index];
      if (hook.kind === 'state') {
        const name = stateNames[index];
        const value = format(hook.value);
        let detail = `초기값 ${value} 저장`;
        if (old?.kind !== 'state') changes.push(`${name} = ${value}`);
        else if (Object.is(old.value, hook.value)) detail = `${value} 유지`;
        else {
          detail = `${format(old.value)} → ${value}`;
          changes.push(`${name} ${detail}`);
        }
        hookDetails.push(`hooks[${index}] · useState · ${name} · ${detail}`);
      } else if (hook.kind === 'memo') {
        const action = hook.reused ? '이전 결과 재사용' : initial ? '첫 계산' : '다시 계산';
        hookDetails.push(`hooks[${index}] · useMemo [count] · ${action} · 누적 합 ${format(hook.value)}`);
      } else if (hook.kind === 'effect') {
        const action = hook.cleaned ? 'cleanup 실행 → Effect 실행' : hook.ran ? 'Effect 실행' : '의존성이 같아 건너뜀';
        hookDetails.push(`hooks[${index}] · useEffect [running] · ${action}`);
      } else if (hook.kind === 'frame') {
        hookDetails.push(`hooks[${index}] · useFrame · ${hook.enabled ? '실행' : '중지'}`);
      } else {
        hookDetails.push(`hooks[${index}] · useScene · 슬롯 ${hook.slots}개`);
      }
    });
    state.textContent = initial ? `초기 상태 · ${changes.join(', ')}` : changes.join(', ') || '상태 변경 없음';
    components.textContent = `${event.components[0]} → ${event.components.slice(1).join(', ')}`;
    cycle.textContent = initial ? 'mount() · 빈 VDOM에서 첫 화면' : 'update() · 현재 상태로 App 다시 실행';
    patches.textContent = `Patch ${event.operations.length}개`;
    const [count, name, , total] = event.hooks;
    if (count?.kind === 'state' && name?.kind === 'state' && total?.kind === 'memo') {
      counterProps.textContent = `Counter({ count: ${format(count.value)}, increase, decrease, reset })`;
      summaryProps.textContent = `Summary({ name: ${format(name.value)}, total: ${format(total.value)} })`;
    }

    const nodes = event.operations.map(operation => operationNode(demo, operation));
    const targets = nodes.map(node => node instanceof Element ? node : node?.parentElement ?? null);
    const changedNodes = nodes.filter(node => node !== undefined);
    diagram.update(changedNodes);
    tree.update(changedNodes, event.operations.some(operation =>
      operation.type === 'insert' || operation.type === 'remove' || operation.type === 'replace'));
    const items = event.operations.map((operation, index) => {
      const node = nodes[index];
      const target = targets[index];
      const item = panel.ownerDocument.createElement('li');
      const description = describeOperation(operation, target, previousNode(event.previousTree, operation.path));
      if (!node) {
        item.textContent = description;
        return item;
      }
      const button = panel.ownerDocument.createElement('button');
      button.type = 'button';
      button.textContent = description;
      button.addEventListener('click', () => {
        diagram.select(node);
        tree.select(node);
        clearHighlights();
        // Keep the selected element visible without changing its DOM or requiring motion.
        const highlight = target?.animate?.([highlightStyle], { duration: 0, fill: 'forwards' });
        if (highlight) highlights.push(highlight);
      });
      item.append(button);
      return item;
    });
    hookStatus.hidden = true;
    setList(hooks, hookDetails);
    if (items.length) operations.replaceChildren(...items);
    else setList(operations, ['적용된 변경이 없습니다.']);
    previous = event.hooks;

    if (initial || demo.ownerDocument.defaultView?.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    for (const target of new Set(targets)) {
      const highlight = target?.animate?.([
        highlightStyle,
        { boxShadow: '0 0 0 2px transparent' },
      ], { duration: 950, easing: 'ease-out' });
      if (highlight) highlights.push(highlight);
    }
  };
}

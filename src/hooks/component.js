import { createTextVNode, createVNode, isVNode } from '../vdom/vnode.js';
import { commitTree } from '../vdom/render.js';

// 매크로태스크(이벤트·타이머)로 한 번도 양보하지 않고 이어진 렌더가 이 횟수를 넘으면 무한 반복으로 보고 멈춘다.
// effect 안의 setState가 동기로 불리든 Promise로 불리든 모두 마이크로태스크 안에서 이어지므로 같은 방법으로 잡힌다.
// (카운터는 setTimeout(0)으로 되돌린다. setTimeout까지 가짜로 바꾸는 테스트에서는 되돌려지지 않는다는 점에 주의)
const UPDATE_CHAIN_LIMIT = 50;

// 지금 렌더 중인 루트 컴포넌트. 훅은 이 값으로 "어느 컴포넌트의 몇 번째 훅인지"를 찾는다.
let current = null;

export function getCurrentComponent() {
  return current;
}

/**
 * 함수형 컴포넌트를 감싸는 클래스.
 *
 * 함수 컴포넌트는 렌더할 때마다 처음부터 다시 실행되므로 지역 변수에 상태를 둘 수 없다.
 * 그래서 상태는 이 객체의 hooks 배열에 두고, 훅은 "몇 번째로 불렸는지(hookIndex)"로 자기 칸을 찾는다.
 * 렌더마다 훅을 같은 순서로 불러야 하는 이유가 이것이다.
 *
 *   mount()  : 처음 렌더 → diff(null, 트리) → patch → effect 실행
 *   update() : 다시 렌더 → diff(이전 트리, 새 트리) → 바뀐 부분만 patch → effect 실행
 *
 * 자식 컴포넌트는 상태가 없는 순수 함수다. 렌더할 때 그 자리에서 불러 결과 트리로 펼친다(훅을 부르면 오류).
 *
 * 오류 처리: effect·정리 함수·onCommit의 오류는 options.onError가 있으면 그쪽으로 보내고, 없으면 던진다.
 * 어느 경우든 나머지 effect와 정리는 끝까지 실행하고, 화면(DOM)과 기억한 트리(vnode)가 어긋나지 않게 둔다.
 */
export class FunctionComponent {
  constructor(component, props = {}, container, options = {}) {
    this.component = component;
    this.props = props;
    this.container = container;
    this.options = options;
    this.hooks = [];
    this.hookIndex = 0;
    this.vnode = null; // 마지막으로 그린 가상 트리 (다음 diff의 "이전 트리")
    this.pendingEffects = []; // 이번 렌더에서 실행하기로 한 effect 훅
    this.isRendering = false;
    this.childDepth = 0; // 자식 컴포넌트를 펼치는 중이면 1 이상 → 훅 금지
    this.busy = false; // mount·update(렌더 + patch + effect) 실행 중
    this.committing = false;
    this.mounted = false;
    this.unmounted = false;
    this.updateQueued = false;
    this.stale = false; // 상태는 바뀌었는데 화면에 반영되지 못함 (반복 한도에 걸린 경우)
    this.chainCount = 0;
    this.chainResetScheduled = false;
  }

  mount() {
    if (this.mounted || this.unmounted) throw new Error('이미 mount한 컴포넌트입니다.');
    this.enter();
    let errors;
    try {
      let next;
      let patches;
      try {
        next = this.renderTree();
        patches = commitTree(this.container, null, next);
      } catch (error) {
        this.hooks = []; // 일부만 만들어진 훅을 남기지 않는다 → 고친 뒤 다시 mount할 수 있다
        this.pendingEffects = [];
        throw error;
      }
      this.vnode = next;
      this.mounted = true;
      errors = this.commit(patches);
    } finally {
      this.busy = false;
    }
    if (errors.length > 0 && !this.options.onError) {
      // 인스턴스를 돌려주지 못하면 정리할 방법이 없으므로, 이미 실행된 effect와 DOM을 스스로 정리하고 던진다.
      try {
        this.unmount();
      } catch {
        // 첫 오류를 던지는 것이 더 중요하다
      }
      throw errors[0];
    }
    this.report(errors);
    return this;
  }

  /** 다시 렌더링하고 바뀐 부분만 patch한다. 적용한 패치 목록을 돌려준다. */
  update() {
    if (!this.mounted) throw new Error('mount() 전에는 update()할 수 없습니다.');
    if (this.unmounted) return [];
    this.enter();
    this.updateQueued = false; // 이미 예약된 렌더는 이번 렌더로 대신한다
    let patches;
    let errors;
    try {
      const next = this.renderTree();
      try {
        patches = commitTree(this.container, this.vnode, next);
      } catch (error) {
        // commitTree가 실제 DOM을 이전 트리 모습으로 되돌렸다. 기억하는 트리도 그 복사본으로 바꾼다.
        if ('restoredTree' in error) this.vnode = error.restoredTree;
        this.pendingEffects = [];
        throw error;
      }
      this.vnode = next;
      this.stale = false;
      errors = this.commit(patches);
    } finally {
      this.busy = false;
    }
    this.report(errors);
    return patches;
  }

  unmount() {
    if (this.unmounted) return;
    this.unmounted = true;
    this.updateQueued = false;
    const errors = [];
    for (const hook of this.hooks) {
      if (hook.kind === 'useEffect') callCleanup(hook, errors);
    }
    if (this.vnode) {
      try {
        commitTree(this.container, this.vnode, null);
      } catch (error) {
        errors.push(error);
      }
      this.vnode = null;
    }
    this.report(errors);
  }

  /**
   * setState가 부른다. 다시 그리는 일은 바로 하지 않고 마이크로태스크로 미룬다.
   * 같은 이벤트 처리 중에 setState를 여러 번 불러도 렌더는 한 번만 일어난다(배칭).
   */
  scheduleUpdate() {
    if (!this.mounted || this.unmounted || this.updateQueued) return;
    this.updateQueued = true;
    queueMicrotask(() => this.flushScheduledUpdate());
  }

  flushScheduledUpdate() {
    if (!this.updateQueued || this.unmounted) return; // update()를 직접 불러 이미 처리됐다
    this.updateQueued = false;
    this.chainCount += 1;
    if (!this.chainResetScheduled) {
      this.chainResetScheduled = true;
      setTimeout(() => {
        this.chainCount = 0;
        this.chainResetScheduled = false;
      }, 0);
    }
    try {
      if (this.chainCount > UPDATE_CHAIN_LIMIT) {
        // 이번 렌더를 버리면 effect도 다시 돌지 않으므로 루프는 여기서 끊긴다. 다음 setState는 새로 센다.
        this.chainCount = 0;
        this.stale = true;
        throw new Error(
          '렌더를 너무 많이 반복했습니다. useEffect 안에서 setState를 부르는데 deps가 없거나 매번 바뀌는지 확인하세요.',
        );
      }
      this.update();
    } catch (error) {
      if (this.options.onError) this.options.onError(error);
      else throw error;
    }
  }

  /** 렌더·patch·effect 실행 중에 update()를 다시 부르면 끝없는 재귀가 되므로 막는다. */
  enter() {
    if (this.busy) {
      throw new Error('렌더·effect 실행 중에는 update()를 직접 부를 수 없습니다. 상태를 바꾸려면 setState를 쓰세요.');
    }
    this.busy = true;
  }

  /** 컴포넌트 함수를 실행해 자식 컴포넌트까지 펼친 가상 트리(태그·텍스트만 있는)를 만든다. */
  renderTree() {
    const previous = current;
    const expectedHooks = this.hooks.length;
    current = this;
    this.hookIndex = 0;
    this.childDepth = 0;
    this.isRendering = true;
    this.pendingEffects = [];
    try {
      const nodes = expand(this.component(this.props), this);
      if (this.mounted && this.hookIndex !== expectedHooks) {
        throw new Error(
          `훅 개수가 바뀌었습니다 (이전 ${expectedHooks}개, 이번 ${this.hookIndex}개). 조건문·반복문 안에서 훅을 부르지 마세요.`,
        );
      }
      if (nodes.length > 1) throw new Error('루트 컴포넌트는 요소 하나를 돌려줘야 합니다.');
      return nodes[0] ?? null;
    } catch (error) {
      this.pendingEffects = [];
      throw error;
    } finally {
      this.isRendering = false;
      current = previous;
    }
  }

  /** patch 뒤 처리: effect 실행 → onCommit 알림. 생긴 오류를 모아 돌려준다. */
  commit(patches) {
    const previous = this.committing;
    this.committing = true;
    const errors = [];
    try {
      this.runEffects(errors);
      if (!this.unmounted && this.options.onCommit) {
        try {
          this.options.onCommit(patches, this);
        } catch (error) {
          errors.push(error);
        }
      }
    } finally {
      this.committing = previous;
    }
    return errors;
  }

  /**
   * patch가 끝난 뒤(실제 DOM이 바뀐 뒤)에 effect를 실행한다. 다시 실행하기 전에는 이전 정리 함수부터 부른다.
   * 하나가 던져도 나머지는 실행한다. 도중에 unmount되면 남은 effect는 실행하지 않는다(정리될 기회가 없으므로).
   */
  runEffects(errors) {
    const hooks = this.pendingEffects;
    this.pendingEffects = [];
    for (const hook of hooks) {
      if (this.unmounted) break;
      const { effect, deps } = hook.next;
      hook.next = null;
      hook.deps = deps;
      hook.initialized = true;
      callCleanup(hook, errors);
      try {
        const result = effect();
        if (typeof result === 'function') hook.cleanup = result;
        else if (result !== undefined) {
          console.warn('[mini-react] useEffect는 정리 함수나 undefined만 돌려줘야 합니다. 받은 값:', result);
        }
      } catch (error) {
        errors.push(error);
      }
    }
  }

  report(errors) {
    if (errors.length === 0) return;
    if (this.options.onError) errors.forEach((error) => this.options.onError(error));
    else throw errors[0];
  }
}

/** 정리 함수를 꺼내 비운 뒤 부른다. 던져도 다시 불리지 않는다. */
function callCleanup(hook, errors) {
  const cleanup = hook.cleanup;
  hook.cleanup = undefined;
  if (typeof cleanup !== 'function') return;
  try {
    cleanup();
  } catch (error) {
    errors.push(error);
  }
}

/** 컴포넌트를 만들어 바로 mount한다. */
export function mountComponent(component, container, props = {}, options = {}) {
  return new FunctionComponent(component, props, container, options).mount();
}

/** 예약된 렌더와 그 effect가 모두 끝날 때까지 기다린다. (테스트용) */
export function flushUpdates() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/**
 * 컴포넌트가 돌려준 값을 태그·텍스트 가상 노드 배열로 펼친다.
 * - 함수 타입 노드(자식 컴포넌트)는 props와 children을 넘겨 불러 결과를 다시 펼친다.
 *   컴포넌트에 준 key는 결과 노드가 물려받는다(컴포넌트 목록도 key로 비교되도록).
 * - 매번 새 가상 노드를 만든다. 사용자가 상수로 둔 vnode를 여러 렌더에서 써도 dom 참조가 섞이지 않는다.
 * - 자식을 h(Child) 대신 Child(props)처럼 직접 부르면 훅 금지 검사를 피해 가므로 그렇게 쓰지 않는다.
 */
function expand(node, component) {
  if (node == null || typeof node === 'boolean') return [];
  if (typeof node === 'string' || typeof node === 'number') return [createTextVNode(node)];
  if (Array.isArray(node)) return node.flatMap((child) => expand(child, component));
  if (!isVNode(node)) throw new TypeError('컴포넌트는 가상 노드, 문자열, 배열, null 중 하나를 돌려줘야 합니다.');

  if (typeof node.type === 'function') {
    component.childDepth += 1;
    let output;
    try {
      output = node.type({ ...node.props, children: node.children });
    } finally {
      component.childDepth -= 1;
    }
    const result = expand(output, component);
    if (node.key != null && result.length === 1 && result[0].key == null) result[0].key = node.key;
    return result;
  }

  const children = node.children.flatMap((child) => expand(child, component));
  return [createVNode(node.type, node.props, children, node.key)];
}

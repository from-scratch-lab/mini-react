import { getCurrentComponent } from './component.js';

/**
 * 지금 렌더 중인 컴포넌트에서 이번 차례의 훅 칸을 꺼낸다.
 * 처음 렌더에서는 칸을 만들고, 이후 렌더에서는 같은 순서의 칸을 다시 쓴다.
 * 종류가 다르거나 칸이 모자라면 호출 순서가 바뀐 것이므로 바로 오류를 낸다(다른 상태를 읽는 버그를 막기 위해).
 */
function nextHook(kind, create) {
  const component = getCurrentComponent();
  if (!component || !component.isRendering) {
    throw new Error(`${kind}: 훅은 컴포넌트 렌더 중에만 부를 수 있습니다.`);
  }
  if (component.childDepth > 0) {
    throw new Error(`${kind}: 훅은 루트 컴포넌트에서만 부를 수 있습니다. 자식 컴포넌트는 props만 받는 순수 함수로 만드세요.`);
  }
  const index = component.hookIndex;
  component.hookIndex += 1;
  let hook = component.hooks[index];
  if (!hook) {
    if (component.mounted) {
      throw new Error(`훅 개수가 바뀌었습니다 (${index + 1}번째 ${kind}가 새로 생김). 조건문·반복문 안에서 훅을 부르지 마세요.`);
    }
    hook = { kind, ...create() };
    component.hooks[index] = hook;
  } else if (hook.kind !== kind) {
    throw new Error(
      `훅 호출 순서가 바뀌었습니다: ${index + 1}번째 훅이 이전에는 ${hook.kind}, 이번에는 ${kind}입니다. 조건문·반복문 안에서 훅을 부르지 마세요.`,
    );
  }
  return { hook, component };
}

function depsChanged(prev, next) {
  if (prev === undefined || next === undefined) return true;
  if (prev.length !== next.length) {
    console.warn('[mini-react] deps 배열의 길이가 렌더마다 달라졌습니다. deps에는 항상 같은 개수의 값을 넣으세요.');
    return true;
  }
  return next.some((value, i) => !Object.is(value, prev[i]));
}

/**
 * const [value, setValue] = useState(initial)
 *
 * setValue(next) 또는 setValue(prev => next)
 * - 값은 바로 바꾸고, 다시 그리는 일은 예약만 한다. 여러 번 불러도 렌더는 한 번(배칭).
 * - 같은 값(Object.is)이면 아무것도 하지 않는다.
 * - setValue 함수는 렌더가 바뀌어도 같은 함수다.
 */
export function useState(initial) {
  const { hook, component } = nextHook('useState', () => ({
    value: typeof initial === 'function' ? initial() : initial,
  }));
  if (!hook.setState) {
    hook.setState = (action) => {
      if (component.isRendering) {
        throw new Error('렌더 중에는 setState를 부를 수 없습니다. 이벤트 핸들러나 useEffect 안에서 부르세요.');
      }
      if (component.unmounted) return;
      const next = typeof action === 'function' ? action(hook.value) : action;
      // 같은 값이면 건너뛴다. 단, 화면이 상태를 따라오지 못한 상태(stale)면 같은 값이라도 다시 그린다.
      if (Object.is(next, hook.value) && !component.stale) return;
      hook.value = next;
      component.scheduleUpdate();
    };
  }
  return [hook.value, hook.setState];
}

/**
 * useEffect(effect, deps)
 *
 * 렌더 결과가 실제 DOM에 반영된 뒤에 effect를 실행한다. (렌더 중 부수 효과 금지 → 부수 효과는 여기서)
 * - deps가 없으면 렌더마다, []이면 처음 한 번, [a, b]이면 a나 b가 바뀌었을 때만 실행한다.
 * - effect가 함수를 돌려주면 정리 함수로 기억했다가, 다음 실행 전과 unmount 때 부른다.
 */
export function useEffect(effect, deps) {
  const { hook, component } = nextHook('useEffect', () => ({ deps: undefined, cleanup: undefined, initialized: false }));
  if (!hook.initialized || depsChanged(hook.deps, deps)) {
    hook.next = { effect, deps };
    component.pendingEffects.push(hook);
  }
}

/**
 * const value = useMemo(() => 비싼 계산, deps)
 * deps가 그대로면 이전 결과(같은 참조)를 돌려주고, 바뀌었을 때만 다시 계산한다.
 * (렌더가 이 뒤에서 실패해도 새로 계산한 값과 deps는 남는다. 계산은 순수해야 하므로 결과에는 영향이 없다.)
 */
export function useMemo(factory, deps) {
  const { hook } = nextHook('useMemo', () => ({ value: undefined, deps: undefined, initialized: false }));
  if (!hook.initialized || depsChanged(hook.deps, deps)) {
    hook.value = factory();
    hook.deps = deps;
    hook.initialized = true;
  }
  return hook.value;
}

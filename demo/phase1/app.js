import {
  createElement as h,
  createVNode,
  render,
  diff,
  patch,
  domToVNode,
  htmlToVNodes,
  childrenToHTML,
  cloneVNode,
} from '../../src/index.js';
import { VNodeHistory } from './history.js';
import { describePatch } from '../shared/describe.js';
import { flash } from '../shared/flash.js';
import { PRESETS } from './presets.js';

/**
 * Phase 1 검증 페이지.
 *
 *   실제 영역(actual): 페이지에 있던 샘플 HTML. 처음에 읽어 가상 트리로 만들고, 이후에는 patch로만 바뀐다.
 *   테스트 영역(root): 가상 트리를 HTML 코드로 보여 주는 편집기와 버튼. 이 화면도 render(가상 DOM)로 그린다.
 *
 * Patch 버튼: 편집기 코드 → 가상 트리 → 이전 트리와 diff → 바뀐 부분만 실제 영역에 patch → 기록에 저장
 * 뒤로가기/앞으로가기: 기록의 가상 트리로 diff·patch하고, 편집기 코드도 그 트리로 다시 쓴다.
 *
 * @returns {{ destroy(): void }}
 */
export function startPhase1({ actual, root }) {
  // 실제 영역에 지금 그려진 가상 트리. 이미 화면에 있는 DOM을 이어받는다(attach) → 첫 Patch부터 부분 갱신.
  let rendered = domToVNode(actual, { attach: true });
  // 주석 사이 텍스트처럼 붙어 있는 텍스트 노드를 처음에 한 번 합쳐 둔다(diff·patch로).
  // 그래야 테스트 영역 코드("ab")와 실제 영역이 같은 트리가 되어, 고치지 않은 Patch가 아무것도 바꾸지 않는다.
  const normalized = domToVNode(actual);
  patch(actual, diff(rendered, normalized));
  rendered = normalized;
  const history = new VNodeHistory(rendered);

  const state = {
    code: childrenToHTML(rendered.children),
    patches: null, // null: 아직 아무것도 하지 않음, []: 변경 없음
    mutations: 0,
    warnings: [], // 입력 HTML에서 건너뛴 것
    error: null, // patch 도중 실패한 이유
  };

  // 실제 DOM 변화를 감지하는 브라우저 API. patch가 실제로 몇 번 DOM을 바꿨는지 세고, 바뀐 곳을 깜빡여 보여 준다.
  const observer =
    typeof MutationObserver === 'function' ? new MutationObserver(() => {}) : null;
  observer?.observe(actual, { childList: true, subtree: true, attributes: true, characterData: true });

  function applyTo(next) {
    const patches = diff(rendered, next);
    patch(actual, patches);
    rendered = next;
    const records = observer ? observer.takeRecords() : [];
    flash(records);
    state.patches = patches;
    state.mutations = records.length;
    state.code = childrenToHTML(rendered.children);
    return patches;
  }

  /**
   * 적용하다 실패하면(예: 브라우저가 받지 않는 이름) 앞쪽 패치만 반영된 채 멈춘다.
   * 그러면 지금 실제 DOM을 다시 읽어(attach) 직전 가상 트리와 diff·patch해서 되돌린다.
   * 실제 DOM과 rendered가 어긋난 채로 남으면 다음 Patch가 엉뚱한 노드를 고치기 때문이다.
   */
  function tryApply(next) {
    try {
      state.error = null;
      return applyTo(next);
    } catch (error) {
      state.error = `Patch 실패: ${error.message} (실제 영역을 직전 상태로 되돌렸습니다)`;
      const now = domToVNode(actual, { attach: true });
      const target = cloneVNode(rendered);
      patch(actual, diff(now, target));
      rendered = target;
      observer?.takeRecords();
      state.patches = null;
      return null;
    }
  }

  function onPatch() {
    const warnings = [];
    const children = htmlToVNodes(state.code, { sanitize: true, onWarning: (m) => warnings.push(m) });
    state.warnings = warnings;
    // 루트(실제 영역 컨테이너)는 그대로 두고 자식만 바꾼다.
    const next = createVNode(rendered.type, { ...rendered.props }, children, rendered.key);
    const patches = tryApply(next);
    if (patches && patches.length > 0) history.push(next);
    draw();
  }

  function navigate(index) {
    const from = history.index;
    const target = history.go(index);
    if (!target) return;
    state.warnings = [];
    // 적용에 실패하면 화면은 직전 트리로 되돌아가므로, 기록 위치도 원래 칸으로 돌려 둘을 맞춘다.
    if (tryApply(target) === null) history.go(from);
    draw();
  }

  const onBack = () => navigate(history.index - 1);
  const onForward = () => navigate(history.index + 1);
  const onInput = (event) => {
    state.code = event.target.value;
    draw();
  };
  const onKeyDown = (event) => {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      onPatch();
    }
  };

  function view() {
    const dirty = state.code !== childrenToHTML(rendered.children);
    return h(
      'div',
      { class: 'test-area' },
      h(
        'div',
        { class: 'panel-head' },
        h('h2', null, '테스트 영역'),
        h('span', { class: dirty ? 'badge badge-warn' : 'badge' }, dirty ? '수정됨 · 아직 반영 안 됨' : '실제 영역과 같음'),
      ),
      h('textarea', {
        class: 'code',
        value: state.code,
        spellcheck: 'false',
        'aria-label': '테스트 영역 HTML 코드',
        onInput,
        onKeyDown,
      }),
      h(
        'div',
        { class: 'toolbar' },
        h('button', { type: 'button', 'data-action': 'back', disabled: !history.canBack, onClick: onBack }, '← 뒤로가기'),
        h('button', { type: 'button', class: 'primary', 'data-action': 'patch', onClick: onPatch }, 'Patch'),
        h(
          'button',
          { type: 'button', 'data-action': 'forward', disabled: !history.canForward, onClick: onForward },
          '앞으로가기 →',
        ),
        h('span', { class: 'history-status', 'data-role': 'history-status' }, `${history.index + 1} / ${history.length}`),
      ),
      h('p', { class: 'hint' }, 'Ctrl+Enter로도 Patch할 수 있습니다.'),
      presetsView(),
      h(
        'ol',
        { class: 'timeline', 'aria-label': 'State History' },
        Array.from({ length: history.length }, (_, i) =>
          h(
            'li',
            { key: String(i) },
            h(
              'button',
              {
                type: 'button',
                class: i === history.index ? 'current' : null,
                'data-history-index': String(i),
                'aria-current': i === history.index ? 'step' : null,
                onClick: () => navigate(i),
              },
              i === 0 ? '초기' : `#${i}`,
            ),
          ),
        ),
      ),
      patchLogView(),
    );
  }

  /**
   * 프리셋: 표·폼·선택 상자·중첩 목록·key 재정렬을 단계별로 바꿔 보며 어떤 패치가 나오는지 확인한다.
   * 단계 버튼은 테스트 영역 코드만 바꾼다. 실제 영역에 반영하는 것은 Patch 버튼이다.
   */
  const loadPreset = (html) => {
    state.code = html;
    draw();
  };

  function presetsView() {
    return h(
      'section',
      { class: 'presets', 'aria-label': '프리셋 시나리오' },
      h('h3', null, '프리셋 시나리오 ', h('small', null, '단계를 눌러 코드를 바꾼 뒤 Patch · 예상 패치는 바로 앞 단계를 Patch한 상태 기준')),
      h(
        'ul',
        null,
        PRESETS.map((preset) =>
          h(
            'li',
            { key: preset.id },
            h('span', { class: 'preset-name' }, preset.label),
            preset.steps.map((step, i) =>
              h(
                'button',
                {
                  type: 'button',
                  'data-preset': preset.id,
                  'data-step': String(i + 1),
                  title: step.expect ? `앞 단계에서 Patch하면 예상 패치: ${step.expect}` : '이 프리셋 불러오기',
                  onClick: () => loadPreset(step.html),
                },
                `${i + 1}. ${step.label}`,
                step.expect ? h('small', null, ` → ${step.expect}`) : null,
              ),
            ),
          ),
        ),
      ),
    );
  }

  function patchLogView() {
    const { patches, mutations } = state;
    let body;
    if (patches === null) {
      body = [h('li', { class: 'empty' }, '아직 Patch하지 않았습니다.')];
    } else if (patches.length === 0) {
      body = [h('li', { class: 'empty' }, '변경 없음: 이전 가상 트리와 같습니다.')];
    } else {
      body = patches.map((p) =>
        h('li', null, h('span', { class: `op op-${p.type.toLowerCase()}` }, p.type), ' ', describePatch(p)),
      );
    }
    const notices = [...(state.error ? [state.error] : []), ...state.warnings];
    return h(
      'section',
      { class: 'log' },
      notices.length > 0
        ? h('ul', { class: 'warnings', 'data-role': 'warnings', role: 'alert' }, notices.map((m) => h('li', null, m)))
        : null,
      h(
        'h3',
        null,
        '마지막 변경 ',
        patches && patches.length > 0
          ? h('small', null, `패치 ${patches.length}개 · 실제 DOM 변경 ${mutations}건`)
          : null,
      ),
      h('ol', { 'data-role': 'patch-log' }, body),
    );
  }

  function draw() {
    render(view(), root);
  }

  draw();

  return {
    destroy() {
      observer?.disconnect();
      render(null, root);
    },
  };
}

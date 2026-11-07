import './style.css';
import { readDOM, renderPreview, type VTree } from './core/vdom';
import { diff } from './core/diff';
import { patch } from './core/patch';
import { History } from './history';
import { parseEditorHTML, serializeTree } from './editor';
import { initialHTML, previewStyles } from './sample';
import { mountComponentsDemo } from './components-demo';
import { bindPhaseTabs } from './phase-tabs';

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <aside class="sidebar">
    <div class="sidebar-header">
      <h1>Mini React</h1>
      <button id="sidebar-toggle" type="button" aria-label="사이드바" aria-expanded="true" aria-controls="phase-navigation" title="사이드바 접기">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" aria-hidden="true">
          <rect x="3" y="4" width="18" height="16" rx="2"/>
          <path d="M9 4v16"/>
        </svg>
      </button>
    </div>
    <div id="phase-navigation" class="phase-tabs" role="tablist" aria-label="실험 단계" aria-orientation="vertical">
      <button id="phase-1" type="button" role="tab" aria-selected="true" aria-controls="dom-lab">
        <span>Phase 1</span>
        <span class="tab-detail">DOM · Diff · Patch</span>
      </button>
      <button id="phase-2" type="button" role="tab" aria-selected="false" aria-controls="hooks-lab" tabindex="-1">
        <span>Phase 2</span>
        <span class="tab-detail">Component · Hooks</span>
      </button>
    </div>
  </aside>
  <main class="workspace">
    <section id="dom-lab" role="tabpanel" aria-labelledby="phase-1">
      <header class="workspace-heading">
        <div>
          <h2>DOM 편집기</h2>
          <p>Patch는 HTML에서 바뀐 부분만 실제 DOM에 반영합니다.</p>
        </div>
        <div class="history-controls" role="group" aria-label="변경 이력">
          <span class="history-label">이력 <span id="history-position"></span></span>
          <button id="back" type="button" aria-label="뒤로가기">←</button>
          <button id="forward" type="button" aria-label="앞으로가기">→</button>
        </div>
      </header>
      <div class="dom-workspace">
        <section class="editor-panel">
          <label class="panel-title" for="html-editor">HTML 편집기</label>
          <textarea id="html-editor" spellcheck="false"></textarea>
          <div class="editor-actions">
            <div class="activity" role="status">
              <p id="message">초기 DOM을 불러왔습니다.</p>
              <span id="operation-count">작업 0개</span>
            </div>
            <button id="patch" type="button">Patch 적용</button>
          </div>
        </section>
        <div class="note-panels">
          <section class="note-panel">
            <h3 id="preview-title" class="panel-title">미리보기</h3>
            <div class="canvas" role="region" aria-labelledby="preview-title" tabindex="0"><div id="preview-host"></div></div>
          </section>
          <section class="note-panel">
            <h3 id="actual-title" class="panel-title">실제 DOM</h3>
            <div class="canvas" role="region" aria-labelledby="actual-title" tabindex="0"><div id="actual-host"></div></div>
          </section>
        </div>
      </div>
    </section>
    <section id="hooks-lab" role="tabpanel" aria-labelledby="phase-2" hidden></section>
  </main>`;

const phaseNavigation = document.querySelector<HTMLElement>('#phase-navigation')!;
const sidebarToggle = document.querySelector<HTMLButtonElement>('#sidebar-toggle')!;
bindPhaseTabs(phaseNavigation);
sidebarToggle.addEventListener('click', () => {
  phaseNavigation.hidden = !phaseNavigation.hidden;
  sidebarToggle.setAttribute('aria-expanded', String(!phaseNavigation.hidden));
  sidebarToggle.title = phaseNavigation.hidden ? '사이드바 열기' : '사이드바 접기';
});
const editor = document.querySelector<HTMLTextAreaElement>('#html-editor')!;
const back = document.querySelector<HTMLButtonElement>('#back')!;
const forward = document.querySelector<HTMLButtonElement>('#forward')!;
const patchButton = document.querySelector<HTMLButtonElement>('#patch')!;
function createSurface(id: string, inert: boolean): HTMLDivElement {
  const shadow = document.querySelector(id)!.attachShadow({ mode: 'open' });
  const style = document.createElement('style'); style.textContent = previewStyles;
  const content = document.createElement('div'); content.id = 'content'; content.inert = inert;
  shadow.append(style, content);
  // The playground must not navigate or submit the surrounding app.
  shadow.addEventListener('click', event => { if (event.composedPath().some(node => node instanceof HTMLAnchorElement)) event.preventDefault(); });
  shadow.addEventListener('submit', event => event.preventDefault());
  return content;
}
const actual = createSurface('#actual-host', true);
const preview = createSurface('#preview-host', false);
// Required bootstrap order: actual HTML → read actual DOM → render preview → editor → history.
actual.innerHTML = initialHTML;
const initialTree = readDOM(actual);
renderPreview(preview, initialTree);
editor.value = serializeTree(initialTree);
const history = new History(initialTree);
let renderedSource = editor.value;
function updateControls(): void {
  back.disabled = !history.canBack; forward.disabled = !history.canForward;
  document.querySelector('#history-position')!.textContent = `${history.index + 1} / ${history.length}`;
}
function report(message: string, count: number): void {
  document.querySelector('#message')!.textContent = message;
  document.querySelector('#operation-count')!.textContent = `작업 ${count}개`;
}
function reportDraft(tree: VTree, removed = 0): void {
  const pending = diff(history.current, tree).length;
  const message = pending ? '적용 대기 중' : '적용할 변경 사항이 없습니다.';
  report(removed ? `${message} · 지원하지 않는 요소/속성 ${removed}개 제외` : message, pending);
}
function updatePreviewFromEditor(): void {
  const result = parseEditorHTML(editor.value);
  preview.replaceChildren(result.content);
  renderedSource = editor.value;
  reportDraft(readDOM(preview), result.removed);
}
function syncEditor(tree: VTree): void { editor.value = serializeTree(tree); renderedSource = editor.value; }
function applyDraft(): void {
  try {
    if (renderedSource !== editor.value) updatePreviewFromEditor();
    const next = readDOM(preview);
    const operations = diff(history.current, next);
    patch(actual, operations);
    const saved = history.commit(next);
    syncEditor(next); updateControls();
    report(saved ? '실제 DOM에 적용했습니다.' : '적용할 변경 사항이 없습니다.', operations.length);
  } catch (error) {
    report(`적용 실패: ${error instanceof Error ? error.message : String(error)}`, 0);
  }
}
function navigateHistory(index: number): void {
  const target = history.at(index);
  const operations = diff(history.current, target);
  patch(actual, operations);
  history.moveTo(index);
  renderPreview(preview, target); syncEditor(target); updateControls();
  report(`${index + 1}번째 이력을 복원했습니다.`, operations.length);
}
editor.addEventListener('input', updatePreviewFromEditor);
// Keep the editor in sync with live values without replacing focused preview controls.
for (const name of ['input', 'change']) {
  preview.addEventListener(name, () => {
    const tree = readDOM(preview);
    syncEditor(tree);
    reportDraft(tree);
  });
}
patchButton.addEventListener('click', applyDraft);
back.addEventListener('click', () => { if (history.canBack) navigateHistory(history.index - 1); });
forward.addEventListener('click', () => { if (history.canForward) navigateHistory(history.index + 1); });
updateControls();
const componentsDemo = mountComponentsDemo(document.querySelector('#hooks-lab')!);
if (import.meta.hot) import.meta.hot.dispose(() => componentsDemo.unmount());

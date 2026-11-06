import './style.css';
import { readDOM, renderPreview, type VTree } from './core/vdom';
import { diff } from './core/diff';
import { patch } from './core/patch';
import { History } from './history';
import { parseEditorHTML, serializeTree } from './editor';
import { initialHTML, previewStyles } from './sample';

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <header class="topbar"><a class="brand" href="/">m<span>·</span>dom</a><span class="phase">MINI REACT LAB <span>/</span> PHASE 01</span><span class="live-dot">Vanilla TypeScript</span></header>
  <main>
    <div class="intro"><div><p class="overline">THE DOM PLAYGROUND</p><h1>변화를 작게, 이해는 깊게.</h1><p class="subtitle">HTML을 고치고, 두 트리의 차이만 실제 화면에 반영해 보세요.</p></div><span class="intro-mark" aria-hidden="true">&lt;/&gt;</span></div>
    <div class="toolbar"><div class="history-controls"><button id="back" aria-label="뒤로가기">←</button><button id="forward" aria-label="앞으로가기">→</button><span>HISTORY <strong id="history-position"></strong></span></div><div class="patch-controls"><span id="edit-status">확정 상태와 동기화됨</span><button id="patch">Patch 적용 <span>↗</span></button></div></div>
    <div class="workspace">
      <section class="panel actual-panel"><div class="panel-heading"><div><span class="panel-number">01</span><h2>실제 영역</h2></div><span class="badge">COMMITTED</span></div><p class="panel-description">Patch로 확정된 DOM · 이력을 따라 이동합니다.</p><div class="canvas"><div id="actual-host"></div></div></section>
      <section class="panel test-panel"><div class="panel-heading"><div><span class="panel-number">02</span><h2>테스트 영역</h2></div><span class="badge draft">DRAFT</span></div><p class="panel-description">자유롭게 실험하세요. 적용 전에는 실제 영역이 유지됩니다.</p><div class="editor-heading"><label for="html-editor">HTML EDITOR</label><span>실시간 미리보기</span></div><textarea id="html-editor" spellcheck="false" aria-label="HTML 편집기"></textarea><div class="preview-heading">PREVIEW <span>입력 요소도 직접 조작할 수 있어요</span></div><div class="canvas preview-canvas"><div id="preview-host"></div></div></section>
    </div>
    <div class="activity"><span class="activity-dot"></span><p id="message" role="status" aria-live="polite">초기 DOM에서 Virtual DOM을 생성했습니다.</p><span id="operation-count">0 operations</span></div>
    <footer><span>DOM → VIRTUAL DOM → DIFF → PATCH</span><span>프레임워크 없이, 원리부터.</span></footer>
  </main>`;
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
  const dirty = diff(history.current, readDOM(preview)).length > 0;
  document.querySelector('#edit-status')!.textContent = dirty ? '적용되지 않은 변경 사항' : '확정 상태와 동기화됨';
}
function report(message: string, count: number): void {
  document.querySelector('#message')!.textContent = message;
  document.querySelector('#operation-count')!.textContent = `${count} operation${count === 1 ? '' : 's'}`;
}
function updatePreviewFromEditor(): void {
  const result = parseEditorHTML(editor.value);
  preview.replaceChildren(result.content);
  renderedSource = editor.value;
  updateControls();
  report(result.removed ? `미리보기 갱신 · 지원하지 않는 요소/속성 ${result.removed}개 제외` : '미리보기를 갱신했습니다. Patch를 누르면 실제 영역에 반영됩니다.', 0);
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
    report(saved ? '변경된 부분을 실제 DOM에 적용하고 이력을 저장했습니다.' : '변경 사항이 없습니다. 기존 이력을 유지합니다.', operations.length);
  } catch (error) { report(`적용 실패: ${error instanceof Error ? error.message : String(error)}`, 0); }
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
for (const name of ['input', 'change']) preview.addEventListener(name, () => { syncEditor(readDOM(preview)); updateControls(); });
patchButton.addEventListener('click', applyDraft);
back.addEventListener('click', () => { if (history.canBack) navigateHistory(history.index - 1); });
forward.addEventListener('click', () => { if (history.canForward) navigateHistory(history.index + 1); });
updateControls();

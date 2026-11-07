export const initialHTML = `<article>
  <h2>실험 노트</h2>
  <p>오늘은 <strong>입력값</strong>이 이력에 남는지 확인합니다.
    <a href="https://developer.mozilla.org/ko/docs/Web/API/Document_Object_Model">DOM 문서</a>
  </p>
  <section>
    <h3>확인할 항목</h3>
    <ul>
      <li>텍스트와 속성</li>
      <li>추가하거나 삭제한 요소</li>
    </ul>
  </section>
  <section class="note-fields">
    <label>메모 <input aria-label="메모" value="첫 번째 변경"></label>
    <label>긴 메모 <textarea aria-label="긴 메모" rows="2">다음 실험에서 확인할 내용</textarea></label>
    <label><input type="checkbox" value="on" checked> 검토 완료</label>
  </section>
</article>`;

export const previewStyles = `
:host {
  display: block;
  color: var(--color-text);
  font: var(--font-weight-body) var(--font-size-small)/1.5 var(--font-body);
}

* { box-sizing: border-box; }
h1, h2, h3, h4, h5, h6 {
  margin: 0 0 var(--space-1);
  font-weight: var(--font-weight-heading);
  line-height: 1.25;
  word-break: keep-all;
  overflow-wrap: anywhere;
}

h1 { font-size: var(--font-size-display); }
h2 { font-size: var(--font-size-heading); }
h3, h4, h5, h6 { font-size: var(--font-size-body); }
p, ul, ol { margin: 0 0 var(--space-1); }
ul, ol { padding-inline-start: var(--space-3); }
a { color: inherit; text-underline-offset: .25em; }
a:hover { text-decoration-color: var(--color-accent); }
label { display: block; margin: var(--space-1) 0 0; }
.note-fields {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  align-items: start;
  column-gap: var(--space-2);
}

input, textarea, button { color: inherit; font: inherit; }
input:where(:not([type]), [type=text], [type=search], [type=email], [type=url], [type=tel], [type=password], [type=number]),
textarea {
  display: block;
  width: 100%;
  padding: .25rem var(--space-1);
  border: 1px solid var(--color-control-line);
  border-radius: .25rem;
  background: var(--color-editor);
}

textarea { resize: vertical; }
:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 2px; }
input:is([type=checkbox], [type=radio]) { accent-color: var(--color-accent); }
`;

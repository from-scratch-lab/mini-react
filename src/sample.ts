export const initialHTML = `<article class="sample-card">
  <p class="eyebrow">HELLO, VIRTUAL DOM</p>
  <h2>작은 변화부터 시작해요.</h2>
  <p>이 문단을 수정하고 <strong>Patch</strong>를 눌러 보세요.</p>
  <section>
    <h3>오늘의 실험</h3>
    <ul>
      <li>텍스트 하나 바꾸기</li>
      <li>새로운 요소 추가하기</li>
      <li>속성을 수정하고 이력 돌아보기</li>
    </ul>
  </section>
  <p><a href="https://developer.mozilla.org/ko/docs/Web/API/Document_Object_Model">DOM 알아보기 ↗</a></p>
  <label>메모 <input aria-label="메모" value="직접 입력해 보세요"></label>
  <label class="check"><input type="checkbox" value="on" checked> 변경을 관찰할 준비가 됐어요</label>
  <textarea aria-label="긴 메모" rows="2">여러 줄 메모도 지원합니다.</textarea>
</article>`;
export const previewStyles = `
:host { display:block; color:#203c3c; font:15px/1.65 system-ui,sans-serif; }
* { box-sizing:border-box; } h2 {font-size:27px;line-height:1.3;letter-spacing:-1px;margin:12px 0 20px;} h3{font-size:16px;margin:24px 0 8px;}
p {margin:12px 0;} .eyebrow{font-size:10px;letter-spacing:2px;color:#62897c;font-weight:800;}
ul {padding-left:22px;} li {padding:3px 0;} a{color:#35745b;text-underline-offset:4px;}
label {display:block;margin:14px 0;} input:not([type=checkbox]),textarea{display:block;width:100%;padding:10px 12px;border:1px solid #d4dfd8;border-radius:6px;background:#fff;font:inherit;color:inherit;}
.check{font-size:13px;} input[type=checkbox]{accent-color:#36735b;} textarea{resize:vertical;} button{font:inherit;}
`;

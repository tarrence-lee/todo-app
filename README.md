# 할 일 관리 (To-Do App)

순수 HTML/CSS/JavaScript(ES6+)로 만든 개인용 할 일 관리 웹 앱. 외부 라이브러리·빌드 도구 없이 `index.html`만 열면 동작합니다.

## 주요 기능
- 할 일 추가/수정/삭제/완료 토글, 드래그 정렬
- 카테고리(개인·업무·공부) 분류 및 필터, 진행 상태 필터
- 날짜별 기록 탐색(◀ ▶ 오늘), 전체/카테고리별 진행률 표시
- 다크 모드, 반응형, localStorage 저장

## 비밀번호 잠금
접속 시 비밀번호 입력 화면이 표시됩니다(**기본: `ok`**).

> ⚠️ 이 잠금은 가벼운 차단막일 뿐 진짜 보안이 아닙니다. 코드는 브라우저로 전송되므로 개발자 도구로 우회하거나 localStorage 데이터를 직접 열람할 수 있습니다. 민감한 정보 보호 용도로는 사용하지 마세요.

비밀번호 변경: 브라우저 콘솔에서 아래로 해시를 구한 뒤 `app.js`의 `PASSWORD_HASH`를 교체하세요.
```js
crypto.subtle.digest('SHA-256', new TextEncoder().encode('새비번'))
  .then(b => console.log([...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('')));
```

## 실행
- 로컬: `index.html` 더블클릭
- GitHub Pages: 저장소 Settings → Pages 에서 배포

'use strict';

/* =========================================================
   개인용 할 일 관리 앱 — app.js

   사용 방법:
   - index.html 을 브라우저에서 열면 바로 실행됩니다(빌드 불필요).
   - 데이터는 브라우저 localStorage('todos')에 JSON 으로 저장됩니다.
   - 테마 선택은 localStorage('theme')에 저장됩니다.

   구조:
   - 상태(state) 하나를 단일 소스로 두고, 변경 시 render()로 화면을 다시 그립니다.
   - 모든 클릭 처리는 컨테이너 단위 이벤트 위임으로 묶여 있습니다.

   주요 동작:
   - 추가: 텍스트 + 카테고리 + 선택 날짜로 항목 생성
   - 토글/수정/삭제, 드래그 정렬
   - 날짜 탐색(◀ ▶ 오늘), 카테고리·상태 필터, 진행률 표시, 다크 모드
   ========================================================= */

/* =========================================================
   상수
   ========================================================= */
const STORAGE_KEY = 'todos'; // localStorage 항목 키
const THEME_KEY = 'theme'; // localStorage 테마 키
const DEFAULT_CATEGORY = '개인'; // 기본 카테고리
const COMPLETE_PERCENT = 100; // 완료(축하) 기준 진행률
const DATE_PAD = 2; // 날짜 두 자리 패딩 길이

/* 요일 라벨 (0=일 ~ 6=토) */
const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

/* 카테고리 목록 */
const CATEGORIES = ['개인', '업무', '공부'];

/* 키워드 → 카테고리 자동 분류 맵 (길고 구체적인 키워드를 앞에 배치) */
const KEYWORD_CATEGORY_MAP = [
  {
    category: '업무',
    keywords: [
      '회의', '미팅', '보고서', '발표', '프레젠테이션', '기획', '제안서',
      '업무', '출장', '거래처', '클라이언트', '이메일', '메일', '계약',
      '야근', '마감', '프로젝트', '팀', '상사', '부하', '고객', '영업',
    ],
  },
  {
    category: '공부',
    keywords: [
      '공부', '강의', '수업', '강좌', '과제', '시험', '퀴즈', '복습',
      '예습', '독서', '책', '논문', '자격증', '자격', '학원', '스터디',
      '강습', '레슨', '튜토리얼', '강의노트', '요약', '암기', '단어',
    ],
  },
];

/* 카테고리 필터 버튼 (value: 'all' | 카테고리명) */
const CATEGORY_FILTERS = [
  { value: 'all', label: '전체' },
  { value: '개인', label: '개인' },
  { value: '업무', label: '업무' },
  { value: '공부', label: '공부' },
];

/* 상태 필터 목록 */
const STATUS_FILTERS = ['전체', '진행중', '완료'];

/* =========================================================
   날짜 유틸
   ========================================================= */

/**
 * Date 객체를 'YYYY-MM-DD' 문자열로 변환한다(로컬 기준).
 * @param {Date} date - 변환할 Date 객체
 * @returns {string} 'YYYY-MM-DD' 형식 문자열
 */
function toDateStr(date) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(DATE_PAD, '0');
  const dd = String(date.getDate()).padStart(DATE_PAD, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * 'YYYY-MM-DD' 를 'YYYY년 MM월 DD일 (요일)' 표시 문자열로 변환한다.
 * @param {string} dateStr - 'YYYY-MM-DD' 형식 문자열
 * @returns {string} 표시용 한글 날짜 문자열
 */
function toDisplayStr(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  const mm = String(m).padStart(DATE_PAD, '0');
  const dd = String(d).padStart(DATE_PAD, '0');
  return `${y}년 ${mm}월 ${dd}일 (${WEEKDAYS[dt.getDay()]})`;
}

/**
 * 날짜 문자열에 일수를 더한 새 날짜 문자열을 반환한다(로컬 기준).
 * @param {string} dateStr - 기준 'YYYY-MM-DD'
 * @param {number} days - 더할 일수(음수면 과거)
 * @returns {string} 이동된 'YYYY-MM-DD'
 */
function shiftDate(dateStr, days) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  return toDateStr(dt);
}

/**
 * 오늘 날짜 문자열을 반환한다.
 * @returns {string} 오늘의 'YYYY-MM-DD'
 */
function getToday() {
  return toDateStr(new Date());
}

/* =========================================================
   전역 상태
   ========================================================= */
const state = {
  todos: [],
  selectedDate: getToday(),
  activeCategory: 'all', // 카테고리 필터
  statusFilter: '전체', // 진행 상태 필터
  theme: 'light',
};

/* 드래그 중인 항목 id (정렬용, 드래그가 없을 땐 null) */
let draggedId = null;

/* 입력창에서 키워드로 자동 분류된 카테고리 (추가 시 사용) */
let pendingCategory = DEFAULT_CATEGORY;

/* =========================================================
   localStorage 헬퍼
   ========================================================= */

/**
 * localStorage에서 todos 배열을 읽어 반환한다(없거나 파싱 오류 시 빈 배열).
 * @returns {Array<object>} 저장된 할 일 배열
 */
function getTodos() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.error('todos 읽기 실패:', err);
    return [];
  }
}

/**
 * todos 배열을 JSON으로 직렬화해 localStorage에 저장한다.
 * @param {Array<object>} todos - 저장할 할 일 배열
 * @returns {void}
 */
function saveTodos(todos) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(todos));
  } catch (err) {
    console.error('todos 저장 실패:', err);
  }
}

/**
 * 저장된 테마를 읽어 반환한다('light' 기본).
 * @returns {('light'|'dark')} 테마 값
 */
function getTheme() {
  try {
    return localStorage.getItem(THEME_KEY) === 'dark' ? 'dark' : 'light';
  } catch (err) {
    return 'light';
  }
}

/**
 * 테마 값을 localStorage에 저장한다.
 * @param {('light'|'dark')} theme - 저장할 테마
 * @returns {void}
 */
function saveTheme(theme) {
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch (err) {
    console.error('theme 저장 실패:', err);
  }
}

/* =========================================================
   CRUD
   ========================================================= */

/**
 * 새 할 일을 생성해 상태에 추가하고 저장·렌더한다(공백만이면 무시).
 * @param {string} text - 할 일 내용
 * @param {string} category - 카테고리('개인'|'업무'|'공부')
 * @param {string} date - 대상 날짜 'YYYY-MM-DD'
 * @returns {boolean} 추가 성공 여부
 */
function addTodo(text, category, date) {
  const trimmed = String(text).trim();
  if (!trimmed) return false; // 공백만 입력 → early return

  const todo = {
    id: Date.now(),
    text: trimmed,
    category: category,
    done: false,
    date: date,
    createdAt: new Date().toISOString(),
  };

  state.todos.push(todo);
  saveTodos(state.todos);
  render();
  return true;
}

/**
 * 해당 id 항목의 완료 상태를 토글하고 저장·렌더한다.
 * @param {number} id - 대상 항목 id
 * @returns {void}
 */
function toggleTodo(id) {
  const todo = state.todos.find((t) => t.id === id);
  if (!todo) return;
  todo.done = !todo.done;
  saveTodos(state.todos);
  render();
}

/**
 * 해당 id 항목의 카테고리를 CATEGORIES 순서대로 순환시키고 저장·렌더한다.
 * @param {number} id - 대상 항목 id
 * @returns {void}
 */
function toggleCategory(id) {
  const todo = state.todos.find((t) => t.id === id);
  if (!todo) return;
  const idx = CATEGORIES.indexOf(todo.category);
  todo.category = CATEGORIES[(idx + 1) % CATEGORIES.length];
  saveTodos(state.todos);
  render();
}

/**
 * 해당 id 항목을 삭제하고 저장·렌더한다.
 * @param {number} id - 대상 항목 id
 * @returns {void}
 */
function deleteTodo(id) {
  state.todos = state.todos.filter((t) => t.id !== id);
  saveTodos(state.todos);
  render();
}

/**
 * 해당 id 항목의 텍스트를 수정하고 저장·렌더한다(공백이면 변경 취소).
 * @param {number} id - 대상 항목 id
 * @param {string} newText - 새 텍스트
 * @returns {void}
 */
function editTodo(id, newText) {
  const trimmed = String(newText).trim();
  if (!trimmed) {
    render(); // 빈 값이면 변경 취소하고 원래대로 다시 그림
    return;
  }
  const todo = state.todos.find((t) => t.id === id);
  if (!todo) return;
  todo.text = trimmed;
  saveTodos(state.todos);
  render();
}

/**
 * fromId 항목을 toId 항목 앞으로 이동시키고 저장·렌더한다.
 * @param {number} fromId - 이동할 항목 id
 * @param {number} toId - 기준(대상) 항목 id
 * @returns {void}
 */
function reorderTodos(fromId, toId) {
  if (fromId === toId) return;
  const todos = state.todos;
  const fromIdx = todos.findIndex((t) => t.id === fromId);
  if (fromIdx === -1) return;

  const [moved] = todos.splice(fromIdx, 1);
  const toIdx = todos.findIndex((t) => t.id === toId);
  if (toIdx === -1) {
    todos.push(moved); // 대상이 없으면 맨 뒤로
  } else {
    todos.splice(toIdx, 0, moved);
  }

  saveTodos(todos);
  render();
}

/* =========================================================
   날짜 탐색 · 필터 · 테마
   ========================================================= */

/**
 * 선택 날짜를 days 만큼 이동하고 렌더한다.
 * @param {number} days - 이동할 일수(음수면 과거)
 * @returns {void}
 */
function changeDate(days) {
  state.selectedDate = shiftDate(state.selectedDate, days);
  render();
}

/**
 * 선택 날짜를 오늘로 되돌리고 렌더한다.
 * @returns {void}
 */
function goToday() {
  state.selectedDate = getToday();
  render();
}

/**
 * 카테고리 필터를 변경하고 렌더한다.
 * @param {string} category - 'all' 또는 카테고리명
 * @returns {void}
 */
function setActiveCategory(category) {
  state.activeCategory = category;
  render();
}

/**
 * 진행 상태 필터를 변경하고 렌더한다.
 * @param {('전체'|'진행중'|'완료')} status - 상태 필터 값
 * @returns {void}
 */
function setStatusFilter(status) {
  state.statusFilter = status;
  render();
}

/**
 * 테마를 적용하고(문서 속성 변경) 저장한다.
 * @param {('light'|'dark')} theme - 적용할 테마
 * @returns {void}
 */
function applyTheme(theme) {
  state.theme = theme;
  document.documentElement.setAttribute('data-theme', theme);
  saveTheme(theme);
}

/**
 * 라이트/다크 테마를 토글하고 헤더를 갱신한다.
 * @returns {void}
 */
function toggleTheme() {
  applyTheme(state.theme === 'dark' ? 'light' : 'dark');
  renderHeader(); // 토글 버튼 라벨 갱신
}

/* =========================================================
   렌더링
   ========================================================= */

/**
 * 헤더(제목·테마 토글·전체/카테고리별 진행률·완료 메시지)를 렌더한다.
 * @returns {void}
 */
function renderHeader() {
  const headerEl = document.getElementById('header');
  if (!headerEl) return;
  headerEl.replaceChildren();

  // 상단 줄: 제목 + 테마 토글
  const topRow = document.createElement('div');
  topRow.className = 'header-top';

  const title = document.createElement('h1');
  title.className = 'app-title';
  title.textContent = '할 일 관리';
  topRow.appendChild(title);

  const themeBtn = document.createElement('button');
  themeBtn.type = 'button';
  themeBtn.id = 'theme-toggle';
  themeBtn.className = 'theme-toggle';
  themeBtn.textContent = state.theme === 'dark' ? '☀️ 라이트' : '🌙 다크';
  themeBtn.setAttribute('aria-label', '테마 전환');
  topRow.appendChild(themeBtn);

  headerEl.appendChild(topRow);

  // 전체 진행률 (선택 날짜의 모든 항목 기준, 분모 0 방지)
  const dayItems = state.todos.filter((t) => t.date === state.selectedDate);
  const total = dayItems.length;
  const doneCount = dayItems.filter((t) => t.done).length;
  const percent =
    total === 0 ? 0 : Math.round((doneCount / total) * COMPLETE_PERCENT);

  const label = document.createElement('p');
  label.className = 'progress-label';
  label.textContent = `완료 ${doneCount}건 / 전체 ${total}건 · ${percent}%`;
  headerEl.appendChild(label);

  // <progress> 막대 (100%면 초록색)
  const isComplete = total > 0 && percent === COMPLETE_PERCENT;
  const bar = document.createElement('progress');
  bar.className = 'progress' + (isComplete ? ' complete' : '');
  bar.max = COMPLETE_PERCENT;
  bar.value = percent;
  bar.setAttribute('aria-label', '오늘 할 일 진행률');
  bar.setAttribute('aria-valuenow', String(percent));
  bar.setAttribute('aria-valuemin', '0');
  bar.setAttribute('aria-valuemax', String(COMPLETE_PERCENT));
  headerEl.appendChild(bar);

  // 완료 축하 메시지 (전체 100% 달성 시)
  if (isComplete) {
    const celebrate = document.createElement('p');
    celebrate.className = 'celebrate';
    celebrate.textContent = '🎉 오늘 할 일을 모두 완료했어요!';
    headerEl.appendChild(celebrate);
  }

  // 카테고리별 진행률 (해당 날짜에 항목이 있는 카테고리만)
  const catWrap = document.createElement('div');
  catWrap.className = 'cat-progress';

  CATEGORIES.forEach((cat) => {
    const catItems = dayItems.filter((t) => t.category === cat);
    if (catItems.length === 0) return;
    const catDone = catItems.filter((t) => t.done).length;
    const catPercent = Math.round((catDone / catItems.length) * COMPLETE_PERCENT);

    const row = document.createElement('div');
    row.className = 'cat-progress-row';

    const name = document.createElement('span');
    name.className = 'badge cat-' + cat;
    name.textContent = cat;
    row.appendChild(name);

    row.appendChild(
      createProgressBar(catPercent, 'cat-progress-fill cat-fill-' + cat)
    );

    const num = document.createElement('span');
    num.className = 'cat-progress-num';
    num.textContent = `${catDone}/${catItems.length}`;
    row.appendChild(num);

    catWrap.appendChild(row);
  });

  if (catWrap.children.length > 0) headerEl.appendChild(catWrap);
}

/**
 * 채워진 진행률 막대(트랙+값) 요소를 생성해 반환한다.
 * @param {number} percent - 채움 비율(0~100)
 * @param {string} fillClass - 값 요소에 부여할 클래스
 * @returns {HTMLDivElement} 진행률 막대 요소
 */
function createProgressBar(percent, fillClass) {
  const bar = document.createElement('div');
  bar.className = 'progress-bar';
  const fill = document.createElement('div');
  fill.className = fillClass;
  fill.style.width = `${percent}%`;
  bar.appendChild(fill);
  return bar;
}

/**
 * 날짜 탐색 영역(◀ / 날짜 / ▶ / 오늘)을 렌더한다.
 * @returns {void}
 */
function renderDateNav() {
  const navEl = document.getElementById('date-nav');
  if (!navEl) return;
  navEl.replaceChildren();

  const prevBtn = document.createElement('button');
  prevBtn.type = 'button';
  prevBtn.className = 'nav-btn';
  prevBtn.dataset.action = 'prev';
  prevBtn.textContent = '◀';
  prevBtn.setAttribute('aria-label', '이전 날짜');
  navEl.appendChild(prevBtn);

  const dateLabel = document.createElement('span');
  dateLabel.className = 'date-label';
  dateLabel.textContent = toDisplayStr(state.selectedDate);
  navEl.appendChild(dateLabel);

  const nextBtn = document.createElement('button');
  nextBtn.type = 'button';
  nextBtn.className = 'nav-btn';
  nextBtn.dataset.action = 'next';
  nextBtn.textContent = '▶';
  nextBtn.setAttribute('aria-label', '다음 날짜');
  navEl.appendChild(nextBtn);

  const todayBtn = document.createElement('button');
  todayBtn.type = 'button';
  todayBtn.className = 'today-btn';
  todayBtn.dataset.action = 'today';
  todayBtn.textContent = '오늘';
  todayBtn.setAttribute('aria-label', '오늘로 이동');
  if (state.selectedDate === getToday()) todayBtn.disabled = true;
  navEl.appendChild(todayBtn);
}

/**
 * 필터 바(카테고리 그룹 + 상태 그룹)를 렌더한다.
 * @returns {void}
 */
function renderFilterBar() {
  const barEl = document.getElementById('filter-bar');
  if (!barEl) return;
  barEl.replaceChildren();

  // 카테고리 필터 그룹
  const catGroup = document.createElement('div');
  catGroup.className = 'filter-group';
  CATEGORY_FILTERS.forEach((f) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    const isActive = state.activeCategory === f.value;
    btn.className = 'filter-btn' + (isActive ? ' active' : '');
    // 'all'이 아닌 카테고리 버튼은 카테고리 색상 클래스 부여
    if (f.value !== 'all') btn.classList.add('cat-' + f.value);
    btn.dataset.filter = f.value;
    btn.textContent = f.label;
    btn.setAttribute('aria-label', `카테고리 필터: ${f.label}`);
    btn.setAttribute('aria-pressed', String(isActive));
    catGroup.appendChild(btn);
  });
  barEl.appendChild(catGroup);

  // 상태 필터 그룹
  const statusGroup = document.createElement('div');
  statusGroup.className = 'filter-group';
  STATUS_FILTERS.forEach((s) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    const isActive = state.statusFilter === s;
    btn.className = 'status-btn' + (isActive ? ' active' : '');
    btn.dataset.status = s;
    btn.textContent = s;
    btn.setAttribute('aria-label', `상태 필터: ${s}`);
    btn.setAttribute('aria-pressed', String(isActive));
    statusGroup.appendChild(btn);
  });
  barEl.appendChild(statusGroup);
}

/**
 * 할 일 1건을 표현하는 <li> 요소를 생성해 반환한다.
 * @param {object} todo - 할 일 객체
 * @returns {HTMLLIElement} 목록 행 요소
 */
function createTodoElement(todo) {
  const li = document.createElement('li');
  li.className = 'todo-item' + (todo.done ? ' done' : '');
  li.dataset.id = todo.id;
  li.draggable = true; // 드래그 정렬

  // 드래그 핸들 (보조기기에서는 숨김)
  const handle = document.createElement('span');
  handle.className = 'drag-handle';
  handle.textContent = '⋮⋮';
  handle.setAttribute('aria-hidden', 'true');
  li.appendChild(handle);

  // 체크박스
  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.className = 'todo-check';
  checkbox.checked = todo.done;
  checkbox.setAttribute('aria-label', `${todo.text} 완료 표시`);
  li.appendChild(checkbox);

  // 카테고리 뱃지 (클릭 시 순환 변경)
  const badge = document.createElement('span');
  badge.className = 'badge cat-' + todo.category;
  badge.textContent = todo.category;
  badge.dataset.action = 'toggle-category';
  badge.setAttribute('role', 'button');
  badge.setAttribute('title', '클릭으로 카테고리 변경');
  badge.setAttribute('aria-label', `카테고리: ${todo.category}. 클릭으로 변경`);
  li.appendChild(badge);

  // 텍스트 (긴 텍스트는 CSS word-break 로 자연스럽게 줄바꿈)
  const span = document.createElement('span');
  span.className = 'todo-text';
  span.textContent = todo.text;
  li.appendChild(span);

  // 수정 버튼
  const editBtn = document.createElement('button');
  editBtn.type = 'button';
  editBtn.className = 'edit-btn';
  editBtn.textContent = '수정';
  editBtn.setAttribute('aria-label', `${todo.text} 수정`);
  li.appendChild(editBtn);

  // 삭제 버튼
  const delBtn = document.createElement('button');
  delBtn.type = 'button';
  delBtn.className = 'delete-btn';
  delBtn.textContent = '삭제';
  delBtn.setAttribute('aria-label', `${todo.text} 삭제`);
  li.appendChild(delBtn);

  return li;
}

/**
 * 특정 행을 수정 모드로 전환한다(텍스트 span → input 교체).
 * @param {HTMLLIElement} li - 대상 행 요소
 * @param {object} todo - 해당 할 일 객체
 * @returns {void}
 */
function enterEditMode(li, todo) {
  const span = li.querySelector('.todo-text');
  if (!span) return;

  li.draggable = false; // 편집 중에는 드래그 비활성화

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'edit-input';
  input.value = todo.text;

  li.replaceChild(input, span);
  input.focus();
  input.setSelectionRange(input.value.length, input.value.length);

  let committed = false;
  const commit = () => {
    if (committed) return; // blur + Enter 중복 호출 방지
    committed = true;
    editTodo(todo.id, input.value);
  };

  // 포커스 아웃 또는 Enter 로 저장, Esc 로 취소
  input.addEventListener('blur', commit);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      input.blur(); // blur 핸들러가 commit 수행
    } else if (e.key === 'Escape') {
      committed = true; // 저장 막고
      render(); // 원래 상태로 복원
    }
  });
}

/**
 * 선택 날짜(1차)→카테고리(2차)→상태(3차) 필터를 적용해 목록을 렌더한다.
 * DocumentFragment로 대량 항목도 한 번에 DOM에 삽입한다.
 * @returns {void}
 */
function renderList() {
  const listEl = document.getElementById('todo-list');
  if (!listEl) return;

  listEl.replaceChildren();

  // 1차: 선택 날짜
  let items = state.todos.filter((t) => t.date === state.selectedDate);
  const dayCount = items.length; // 필터 전, 해당 날짜의 전체 개수
  // 2차: 카테고리
  if (state.activeCategory !== 'all') {
    items = items.filter((t) => t.category === state.activeCategory);
  }
  // 3차: 진행 상태
  if (state.statusFilter === '진행중') items = items.filter((t) => !t.done);
  else if (state.statusFilter === '완료') items = items.filter((t) => t.done);

  // 4차: 카테고리 순서로 정렬 (개인 → 업무 → 공부), 같은 카테고리 내 순서 유지
  items = [...items].sort(
    (a, b) => CATEGORIES.indexOf(a.category) - CATEGORIES.indexOf(b.category)
  );

  if (items.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'empty-msg';
    // 날짜에 항목 자체가 0건이면 추가 유도 문구, 필터로 비었으면 일반 문구
    empty.textContent =
      dayCount === 0
        ? '이 날의 할 일이 없습니다. 새 항목을 추가해 보세요!'
        : '조건에 맞는 할 일이 없습니다.';
    listEl.appendChild(empty);
    return;
  }

  // DocumentFragment에 모아 한 번에 삽입 (대량 항목 시 리플로우 최소화)
  const fragment = document.createDocumentFragment();
  const ul = document.createElement('ul');
  ul.className = 'todo-ul';
  items.forEach((todo) => ul.appendChild(createTodoElement(todo)));
  fragment.appendChild(ul);
  listEl.appendChild(fragment);
}

/**
 * 현재 state 기준으로 화면 전체를 다시 그린다.
 * @returns {void}
 */
function render() {
  renderHeader();
  renderDateNav();
  renderList();
}

/* =========================================================
   입력 처리
   ========================================================= */

/**
 * 입력값을 검증해 새 할 일을 추가하고 입력창을 초기화한다.
 * @returns {void}
 */
function handleAdd() {
  const input = document.getElementById('todo-input');
  const errorEl = document.getElementById('input-error');

  const text = input.value.trim();

  // 유효성: 공백만 입력 → 안내 후 early return
  if (!text) {
    input.classList.add('invalid');
    if (errorEl) errorEl.hidden = false;
    input.focus();
    return;
  }

  // 정상 입력 → 오류 표시 제거
  input.classList.remove('invalid');
  if (errorEl) errorEl.hidden = true;

  addTodo(text, pendingCategory, state.selectedDate);

  // 입력창·카테고리 초기화
  input.value = '';
  pendingCategory = DEFAULT_CATEGORY;
  input.focus();
}

/* =========================================================
   초기화 · 이벤트 바인딩
   ========================================================= */
document.addEventListener('DOMContentLoaded', () => {
  state.todos = getTodos();
  applyTheme(getTheme());
  render();

  const addBtn = document.getElementById('add-btn');
  const input = document.getElementById('todo-input');
  const errorEl = document.getElementById('input-error');
  const listEl = document.getElementById('todo-list');
  const navEl = document.getElementById('date-nav');
  const headerEl = document.getElementById('header');

  // 추가: 버튼 클릭
  if (addBtn) addBtn.addEventListener('click', handleAdd);

  // 추가: Enter 키 + 입력 시 오류 표시 해제 + 키워드 자동 카테고리 분류
  if (input) {
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') handleAdd();
    });
    input.addEventListener('input', () => {
      const text = input.value.trim();
      if (text) {
        input.classList.remove('invalid');
        if (errorEl) errorEl.hidden = true;
      }
      // 키워드 자동 분류 — 매칭되면 pendingCategory 업데이트, 없으면 유지
      if (text) {
        const lower = text.toLowerCase();
        const matched = KEYWORD_CATEGORY_MAP.find((m) =>
          m.keywords.some((kw) => lower.includes(kw))
        );
        if (matched) pendingCategory = matched.category;
      } else {
        pendingCategory = DEFAULT_CATEGORY;
      }
    });
  }

  // 헤더: 테마 토글 (위임)
  if (headerEl) {
    headerEl.addEventListener('click', (e) => {
      if (e.target.closest('#theme-toggle')) toggleTheme();
    });
  }

  // 날짜 탐색: 이벤트 위임 (◀ / ▶ / 오늘)
  if (navEl) {
    navEl.addEventListener('click', (e) => {
      const action = e.target.dataset.action;
      if (action === 'prev') changeDate(-1);
      else if (action === 'next') changeDate(1);
      else if (action === 'today') goToday();
    });
  }

  // 목록: 이벤트 위임으로 체크/수정/삭제 처리
  if (listEl) {
    listEl.addEventListener('click', (e) => {
      const li = e.target.closest('.todo-item');
      if (!li) return;
      const id = Number(li.dataset.id);

      if (e.target.classList.contains('todo-check')) {
        toggleTodo(id);
      } else if (e.target.dataset.action === 'toggle-category') {
        toggleCategory(id);
      } else if (e.target.classList.contains('delete-btn')) {
        deleteTodo(id);
      } else if (e.target.classList.contains('edit-btn')) {
        const todo = state.todos.find((t) => t.id === id);
        if (todo) enterEditMode(li, todo);
      }
    });

    // 드래그 정렬: 이벤트 위임
    listEl.addEventListener('dragstart', (e) => {
      const li = e.target.closest('.todo-item');
      if (!li) return;
      draggedId = Number(li.dataset.id);
      li.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
    });

    listEl.addEventListener('dragover', (e) => {
      e.preventDefault(); // drop 허용
      e.dataTransfer.dropEffect = 'move';
      const li = e.target.closest('.todo-item');
      document
        .querySelectorAll('.todo-item.drag-over')
        .forEach((el) => el.classList.remove('drag-over'));
      if (li && Number(li.dataset.id) !== draggedId) {
        li.classList.add('drag-over');
      }
    });

    listEl.addEventListener('drop', (e) => {
      e.preventDefault();
      const li = e.target.closest('.todo-item');
      if (li && draggedId !== null) {
        reorderTodos(draggedId, Number(li.dataset.id));
      }
      draggedId = null;
    });

    listEl.addEventListener('dragend', () => {
      draggedId = null;
      document
        .querySelectorAll('.todo-item.dragging, .todo-item.drag-over')
        .forEach((el) => el.classList.remove('dragging', 'drag-over'));
    });
  }
});

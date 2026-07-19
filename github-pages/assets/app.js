import {
  calendarMonth,
  filterNotesByDate,
  formatDateKeyLabel,
  formatMonthLabel,
  latestNoteMonth,
  noteCountsByDate,
  paginate,
  paginationItems,
  shiftMonthKey,
} from "./view-model.js";

const coverColors = ["#8f4038", "#315c4b", "#334867", "#b27332", "#6c4b3f", "#4f5e69"];
const SHELF_PAGE_SIZE = 6;
const NOTES_PAGE_SIZE = 20;
const state = {
  data: null,
  tab: "shelf",
  query: "",
  shelfPage: 1,
  notesPage: 1,
  calendarMonth: null,
  selectedDate: null,
};

const elements = {
  shelfCount: document.querySelector("#shelfCount"),
  noteCount: document.querySelector("#noteCount"),
  overallTime: document.querySelector("#overallTime"),
  weekTime: document.querySelector("#weekTime"),
  weekCopy: document.querySelector("#weekCopy"),
  monthTime: document.querySelector("#monthTime"),
  overallCopy: document.querySelector("#overallCopy"),
  syncTime: document.querySelector("#syncTime"),
  continueReading: document.querySelector("#continueReading"),
  shelfPanel: document.querySelector("#shelfPanel"),
  notesPanel: document.querySelector("#notesPanel"),
  shelfHeading: document.querySelector("#shelfHeading"),
  notesHeading: document.querySelector("#notesHeading"),
  shelfList: document.querySelector("#shelfList"),
  notesList: document.querySelector("#notesList"),
  shelfEmpty: document.querySelector("#shelfEmpty"),
  notesEmpty: document.querySelector("#notesEmpty"),
  shelfPagination: document.querySelector("#shelfPagination"),
  notesPagination: document.querySelector("#notesPagination"),
  notesFilterSummary: document.querySelector("#notesFilterSummary"),
  calendarTitle: document.querySelector("#calendarTitle"),
  calendarGrid: document.querySelector("#calendarGrid"),
  calendarPrev: document.querySelector("#calendarPrev"),
  calendarNext: document.querySelector("#calendarNext"),
  calendarAll: document.querySelector("#calendarAll"),
  searchInput: document.querySelector("#searchInput"),
};

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#039;",
  }[char]));
}

function cssUrl(value) {
  return String(value ?? "").replace(/[\\")\n\r]/g, "");
}

function formatDuration(totalSeconds) {
  const seconds = Math.max(0, Number.parseInt(totalSeconds ?? 0, 10) || 0);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) return `${hours}小时${minutes > 0 ? `${minutes}分钟` : ""}`;
  return `${minutes}分钟`;
}

function formatDate(unixSeconds) {
  const value = Number.parseInt(unixSeconds ?? 0, 10);
  if (!value) return "日期未知";
  const parts = new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(value * 1000));
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function formatSyncTime(value) {
  if (!value) return "上次同步 · 尚未同步";
  return `上次同步 · ${new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value))}`;
}

function periodCopy(period = {}) {
  const compare = period.compare;
  const comparison = compare === null || compare === undefined
    ? ""
    : compare >= 0
      ? `，较上一周期增长 ${Math.round(compare * 100)}%`
      : `，较上一周期减少 ${Math.abs(Math.round(compare * 100))}%`;
  return `阅读 ${period.readDays ?? 0} 天，自然日均 ${formatDuration(period.dayAverageSeconds)}${comparison}`;
}

function setTab(tab) {
  state.tab = tab;
  document.querySelectorAll("[data-tab]").forEach((button) => {
    button.classList.toggle("active", button.dataset.tab === tab && button.closest("nav"));
  });
  elements.shelfPanel.hidden = tab !== "shelf";
  elements.notesPanel.hidden = tab !== "notes";
  renderLists();
}

function filteredBooks() {
  const keyword = state.query.trim().toLowerCase();
  const books = state.data?.books ?? [];
  if (!keyword) return books;
  return books.filter((book) => `${book.title}${book.author}${book.category}`.toLowerCase().includes(keyword));
}

function filteredNotes() {
  const keyword = state.query.trim().toLowerCase();
  const notes = state.data?.notes ?? [];
  const searched = keyword
    ? notes.filter((note) => `${note.book}${note.quote}${note.note}${note.chapter}`.toLowerCase().includes(keyword))
    : notes;
  return filterNotesByDate(searched, state.selectedDate);
}

function renderBook(book, index) {
  const cover = book.cover ? `background-image:linear-gradient(180deg,#18130b10,#18130bc9),url("${cssUrl(book.cover)}")` : "";
  const href = book.link ? `href="${escapeHtml(book.link)}"` : "";
  return `<article class="bookCard">
    <a class="cover${book.cover ? " hasCover" : ""}" ${href} style="background-color:${coverColors[index % coverColors.length]};${cover}">
      <small>枕书藏本 · ${String(index + 1).padStart(2, "0")}</small>
      <strong>${escapeHtml(book.title)}</strong>
      <span>${escapeHtml(book.author || book.category || "微信读书")}</span>
    </a>
    <div class="bookMeta">
      <span>${escapeHtml(book.status)}</span>
      <b>${escapeHtml(book.title)}</b>
      <small>${escapeHtml(book.author || book.category || "微信读书")}</small>
      <div class="progress"><i style="width:${Math.max(0, Math.min(100, book.progress ?? 0))}%"></i></div>
      <em>${book.progress ?? 0}%</em>
    </div>
  </article>`;
}

function renderNote(note, index) {
  const quote = note.quote ? `<blockquote>“${escapeHtml(note.quote)}”</blockquote>` : "";
  const body = note.note ? `<p>${escapeHtml(note.note)}</p>` : "";
  const link = note.link ? `<a href="${escapeHtml(note.link)}">在微信读书中打开 →</a>` : "";
  const chapter = note.chapter ? ` · ${escapeHtml(note.chapter)}` : "";
  return `<article class="note">
    <div class="noteNo">${String(index + 1).padStart(2, "0")}</div>
    <div>
      <span>${escapeHtml(note.book)} · ${formatDate(note.createTime)}${chapter}</span>
      ${quote}
      ${body}
      <div class="noteFooter"><small>${note.kind === "highlight" ? "#划线" : "#想法"}</small>${link}</div>
    </div>
  </article>`;
}

function renderPagination(element, page, itemLabel) {
  if (page.totalPages <= 1) {
    element.hidden = true;
    element.innerHTML = "";
    return;
  }

  const pageButtons = paginationItems(page.page, page.totalPages).map((item) => {
    if (item === "ellipsis") return '<span class="pageEllipsis" aria-hidden="true">…</span>';
    const current = item === page.page;
    return `<button type="button" data-page="${item}" ${current ? 'class="current" aria-current="page"' : ""} aria-label="第 ${item} 页">${item}</button>`;
  }).join("");

  element.hidden = false;
  element.innerHTML = `<p>共 ${page.totalItems} ${itemLabel} · 第 ${page.page}/${page.totalPages} 页</p>
    <div class="pageControls">
      <button type="button" data-page="${page.page - 1}" ${page.page === 1 ? "disabled" : ""} aria-label="上一页">←</button>
      ${pageButtons}
      <button type="button" data-page="${page.page + 1}" ${page.page === page.totalPages ? "disabled" : ""} aria-label="下一页">→</button>
    </div>`;
}

function emptyNotesMessage() {
  if (!(state.data?.notes ?? []).length) return "还没有同步到划线或想法。";
  if (state.selectedDate && state.query.trim()) return "这一天没有匹配当前搜索的批注。";
  if (state.selectedDate) return "这一天没有批注。";
  return "没有找到相关批注。";
}

function renderLists() {
  const books = paginate(filteredBooks(), state.shelfPage, SHELF_PAGE_SIZE);
  const notes = paginate(filteredNotes(), state.notesPage, NOTES_PAGE_SIZE);
  state.shelfPage = books.page;
  state.notesPage = notes.page;

  elements.shelfList.innerHTML = books.items.map((book, index) => renderBook(book, books.start + index)).join("");
  elements.notesList.innerHTML = notes.items.map((note, index) => renderNote(note, notes.start + index)).join("");
  elements.shelfEmpty.hidden = books.totalItems > 0;
  elements.notesEmpty.hidden = notes.totalItems > 0;
  if (!books.totalItems) {
    elements.shelfEmpty.textContent = (state.data?.books ?? []).length
      ? "没有找到这本书，换个关键词试试。"
      : "还没有同步到书架内容。";
  }
  if (!notes.totalItems) elements.notesEmpty.textContent = emptyNotesMessage();

  renderPagination(elements.shelfPagination, books, "本");
  renderPagination(elements.notesPagination, notes, "条");
  const filterLabel = state.selectedDate ? formatDateKeyLabel(state.selectedDate) : (state.query.trim() ? "搜索结果" : "全部批注");
  elements.notesFilterSummary.textContent = `${filterLabel} · ${notes.totalItems} 条`;
}

function renderCalendar() {
  if (!state.calendarMonth) return;
  const notes = state.data?.notes ?? [];
  const counts = noteCountsByDate(notes);
  const cells = calendarMonth(state.calendarMonth, counts, state.selectedDate);
  elements.calendarTitle.textContent = formatMonthLabel(state.calendarMonth);
  elements.calendarAll.classList.toggle("active", !state.selectedDate);
  elements.calendarAll.setAttribute("aria-pressed", String(!state.selectedDate));
  elements.calendarGrid.innerHTML = cells.map((cell) => {
    if (!cell) return '<span class="calendarBlank" aria-hidden="true"></span>';
    const label = `${formatDateKeyLabel(cell.dateKey)}，${cell.count ? `${cell.count} 条批注` : "没有批注"}`;
    return `<button type="button" class="calendarDay${cell.selected ? " selected" : ""}${cell.count ? " hasNotes" : ""}"
      data-date="${cell.dateKey}" aria-label="${label}" aria-pressed="${cell.selected}" ${cell.count ? "" : "disabled"}>
      <span>${cell.day}</span>${cell.count ? `<small>${cell.count}</small>` : ""}
    </button>`;
  }).join("");
}

function renderSummary() {
  const data = state.data;
  const summary = data?.summary ?? {};
  const stats = data?.stats ?? {};
  elements.shelfCount.textContent = summary.shelfCount ?? 0;
  elements.noteCount.textContent = summary.noteCount ?? 0;
  elements.overallTime.textContent = formatDuration(summary.overallSeconds ?? stats.overall?.totalSeconds);
  elements.weekTime.textContent = formatDuration(stats.weekly?.totalSeconds);
  elements.weekCopy.textContent = `${periodCopy(stats.weekly)}。${stats.weekly?.topTitle ? `本周读得最多的是《${stats.weekly.topTitle}》。` : "同步后，这里会显示本周阅读足迹。"}`;
  elements.monthTime.textContent = formatDuration(stats.monthly?.totalSeconds);
  elements.overallCopy.textContent = `累计阅读 · ${formatDuration(stats.overall?.totalSeconds)}`;
  elements.syncTime.textContent = formatSyncTime(data?.generatedAtMs);

  const latestBook = (data?.books ?? []).find((book) => book.sourceType === "book" && book.progress > 0 && book.progress < 100)
    ?? (data?.books ?? []).find((book) => book.sourceType === "book");
  elements.continueReading.hidden = !latestBook?.link;
  if (latestBook?.link) elements.continueReading.href = latestBook.link;
}

function changePage(kind, requestedPage) {
  const isShelf = kind === "shelf";
  const key = isShelf ? "shelfPage" : "notesPage";
  state[key] = Number(requestedPage);
  renderLists();
  const heading = isShelf ? elements.shelfHeading : elements.notesHeading;
  const pagination = isShelf ? elements.shelfPagination : elements.notesPagination;
  requestAnimationFrame(() => {
    heading.scrollIntoView({ behavior: "smooth", block: "start" });
    pagination.querySelector(`[data-page="${state[key]}"]`)?.focus({ preventScroll: true });
  });
}

function handlePagination(event, kind) {
  const button = event.target.closest("button[data-page]");
  if (!button || button.disabled) return;
  changePage(kind, button.dataset.page);
}

async function loadData() {
  const response = await fetch("./data/reading-room.json", { cache: "no-store" });
  if (!response.ok) throw new Error("无法读取阅读数据。");
  state.data = await response.json();
  state.calendarMonth = latestNoteMonth(state.data.notes);
  renderSummary();
  renderCalendar();
  renderLists();
}

document.querySelectorAll("[data-tab]").forEach((button) => {
  button.addEventListener("click", () => setTab(button.dataset.tab));
});
elements.searchInput.addEventListener("input", (event) => {
  state.query = event.target.value;
  state.shelfPage = 1;
  state.notesPage = 1;
  renderLists();
});
elements.shelfPagination.addEventListener("click", (event) => handlePagination(event, "shelf"));
elements.notesPagination.addEventListener("click", (event) => handlePagination(event, "notes"));
elements.calendarPrev.addEventListener("click", () => {
  state.calendarMonth = shiftMonthKey(state.calendarMonth, -1);
  renderCalendar();
});
elements.calendarNext.addEventListener("click", () => {
  state.calendarMonth = shiftMonthKey(state.calendarMonth, 1);
  renderCalendar();
});
elements.calendarAll.addEventListener("click", () => {
  state.selectedDate = null;
  state.notesPage = 1;
  renderCalendar();
  renderLists();
});
elements.calendarGrid.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-date]");
  if (!button || button.disabled) return;
  state.selectedDate = state.selectedDate === button.dataset.date ? null : button.dataset.date;
  state.notesPage = 1;
  renderCalendar();
  renderLists();
});

loadData().catch((error) => {
  elements.shelfEmpty.hidden = false;
  elements.shelfEmpty.textContent = error.message;
  elements.notesEmpty.hidden = false;
  elements.notesEmpty.textContent = error.message;
});

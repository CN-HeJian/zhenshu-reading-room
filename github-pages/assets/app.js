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
import { SYNC_TRIGGER_URL } from "./sync-config.js";

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
  syncing: false,
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
  actionsLink: document.querySelector("#actionsLink"),
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
  syncModal: document.querySelector("#syncModal"),
  syncClose: document.querySelector("#syncClose"),
  syncMessage: document.querySelector("#syncMessage"),
  syncForm: document.querySelector("#syncForm"),
  syncKey: document.querySelector("#syncKey"),
  syncSubmit: document.querySelector("#syncSubmit"),
  syncStatus: document.querySelector("#syncStatus"),
  syncStatusDot: document.querySelector("#syncStatusDot"),
  syncStatusText: document.querySelector("#syncStatusText"),
  syncStatusDetail: document.querySelector("#syncStatusDetail"),
  syncRetry: document.querySelector("#syncRetry"),
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

function storedSyncKey() {
  try {
    return sessionStorage.getItem("zhenshu_sync_key") ?? "";
  } catch {
    return "";
  }
}

function saveSyncKey(key) {
  try {
    sessionStorage.setItem("zhenshu_sync_key", key);
  } catch {
    // Private browsing may disable sessionStorage; the current run still works.
  }
}

function forgetSyncKey() {
  try {
    sessionStorage.removeItem("zhenshu_sync_key");
  } catch {
    // Ignore storage cleanup failures.
  }
}

function setSyncStatus(text, detail, kind = "running") {
  elements.syncStatus.hidden = false;
  elements.syncStatusText.textContent = text;
  elements.syncStatusDetail.textContent = detail;
  elements.syncStatusDot.className = `syncStatusDot ${kind}`;
}

function showSyncForm() {
  elements.syncForm.hidden = false;
  elements.syncStatus.hidden = true;
  elements.syncRetry.hidden = true;
  elements.syncKey.value = "";
  requestAnimationFrame(() => elements.syncKey.focus());
}

function showSyncError(message, canRetry = true) {
  state.syncing = false;
  elements.syncForm.hidden = true;
  setSyncStatus("同步没有完成", message, "error");
  elements.syncRetry.hidden = !canRetry;
}

async function responseJson(response) {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.message ?? "同步服务暂时不可用。");
  return body;
}

function wait(milliseconds) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

async function runManualSync(key) {
  if (state.syncing) return;
  if (!SYNC_TRIGGER_URL) {
    showSyncError("同步入口尚未配置，请稍后再试。", false);
    return;
  }

  state.syncing = true;
  elements.syncForm.hidden = true;
  elements.syncRetry.hidden = true;
  setSyncStatus("正在连接 GitHub", "正在提交同步任务…");
  try {
    const startResponse = await fetch(`${SYNC_TRIGGER_URL}/sync/start`, {
      method: "POST",
      headers: { "X-Sync-Key": key },
    });
    const start = await responseJson(startResponse);
    saveSyncKey(key);
    setSyncStatus("GitHub 已接收", "正在等待同步任务启动…");

    const deadline = Date.now() + 10 * 60 * 1000;
    while (Date.now() < deadline) {
      await wait(2000);
      const statusResponse = await fetch(`${SYNC_TRIGGER_URL}/sync/status?after=${encodeURIComponent(start.acceptedAt)}`, {
        headers: { "X-Sync-Key": key },
      });
      const status = await responseJson(statusResponse);
      if (status.status === "waiting") {
        setSyncStatus("GitHub 已接收", "正在等待同步任务启动…");
        continue;
      }
      if (status.status === "running") {
        setSyncStatus("正在同步微信读书", "书架、进度、批注和统计正在更新…");
        continue;
      }
      if (status.status === "failure" || status.status === "timeout") {
        showSyncError(status.message ?? "同步没有完成，原有数据仍然保留。", true);
        return;
      }
      if (status.status === "success") {
        state.shelfPage = 1;
        state.notesPage = 1;
        await loadData(true);
        state.syncing = false;
        elements.syncForm.hidden = true;
        setSyncStatus("同步完成", "最新数据已经更新到当前页面。", "success");
        elements.syncRetry.hidden = false;
        return;
      }
    }
    showSyncError("等待时间较长，任务可能仍在后台运行；原有数据仍然保留。", true);
  } catch (error) {
    if (/口令|权限/.test(error?.message ?? "")) forgetSyncKey();
    showSyncError(error?.message ?? "同步服务暂时不可用。", true);
  }
}

function openSyncModal() {
  elements.syncModal.hidden = false;
  elements.syncMessage.textContent = "输入同步口令后，页面会留在这里等待同步完成。";
  if (state.syncing) return;
  const key = storedSyncKey();
  if (key) {
    void runManualSync(key);
  } else {
    showSyncForm();
  }
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

async function loadData(cacheBust = false) {
  const dataUrl = cacheBust ? `./data/reading-room.json?sync=${Date.now()}` : "./data/reading-room.json";
  const response = await fetch(dataUrl, { cache: "no-store" });
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
elements.actionsLink.addEventListener("click", openSyncModal);
elements.syncClose.addEventListener("click", () => {
  elements.syncModal.hidden = true;
});
elements.syncModal.addEventListener("mousedown", (event) => {
  if (event.target === event.currentTarget && !state.syncing) elements.syncModal.hidden = true;
});
elements.syncForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const key = elements.syncKey.value.trim();
  if (key) void runManualSync(key);
});
elements.syncRetry.addEventListener("click", () => {
  const key = storedSyncKey();
  if (key) void runManualSync(key);
  else showSyncForm();
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

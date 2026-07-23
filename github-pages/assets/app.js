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

const coverColors = ["#5d7779", "#a96754", "#5b718a", "#9a896c", "#6f806c", "#88706a"];
const SHELF_PAGE_SIZE = 8;
const NOTES_PAGE_SIZE = 20;
const DATA_UNAVAILABLE_MESSAGE = "阅读数据暂时无法读取，可能正在同步更新。请稍后刷新。";
const state = {
  data: null,
  journey: null,
  journeyHistory: null,
  tab: "overview",
  query: "",
  shelfPage: 1,
  notesPage: 1,
  calendarMonth: null,
  selectedDate: null,
};

const elements = {
  overviewPanel: document.querySelector("#overviewPanel"),
  journeyPanel: document.querySelector("#journeyPanel"),
  shelfPanel: document.querySelector("#shelfPanel"),
  notesPanel: document.querySelector("#notesPanel"),
  shelfCount: document.querySelector("#shelfCount"),
  noteCount: document.querySelector("#noteCount"),
  overallTime: document.querySelector("#overallTime"),
  readingDays: document.querySelector("#readingDays"),
  syncTime: document.querySelector("#syncTime"),
  weekTime: document.querySelector("#weekTime"),
  weekCopy: document.querySelector("#weekCopy"),
  monthTime: document.querySelector("#monthTime"),
  overallCopy: document.querySelector("#overallCopy"),
  journeyTeaserTitle: document.querySelector("#journeyTeaserTitle"),
  journeyTeaserText: document.querySelector("#journeyTeaserText"),
  journeyTeaserMeta: document.querySelector("#journeyTeaserMeta"),
  overviewTimeline: document.querySelector("#overviewTimeline"),
  overviewEmpty: document.querySelector("#overviewEmpty"),
  overviewCalendarTitle: document.querySelector("#overviewCalendarTitle"),
  overviewCalendarGrid: document.querySelector("#overviewCalendarGrid"),
  overviewCalendarFoot: document.querySelector("#overviewCalendarFoot"),
  currentBook: document.querySelector("#currentBook"),
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
  journeyUnavailable: document.querySelector("#journeyUnavailable"),
  journeyHero: document.querySelector("#journeyHero"),
  journeyTitle: document.querySelector("#journeyTitle"),
  journeyThesis: document.querySelector("#journeyThesis"),
  journeyUpdated: document.querySelector("#journeyUpdated"),
  journeyFocusCategory: document.querySelector("#journeyFocusCategory"),
  journeyArc: document.querySelector("#journeyArc"),
  journeyFocusName: document.querySelector("#journeyFocusName"),
  journeyFocusBody: document.querySelector("#journeyFocusBody"),
  journeyFocusShifts: document.querySelector("#journeyFocusShifts"),
  journeyThemes: document.querySelector("#journeyThemes"),
  journeyTurningPoints: document.querySelector("#journeyTurningPoints"),
  journeyQuestions: document.querySelector("#journeyQuestions"),
  journeyArchiveList: document.querySelector("#journeyArchiveList"),
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

function formatDuration(totalSeconds) {
  const seconds = Math.max(0, Number.parseInt(totalSeconds ?? 0, 10) || 0);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) return `${hours}小时${minutes > 0 ? `${minutes}分钟` : ""}`;
  return `${minutes}分钟`;
}

function dateParts(unixSeconds) {
  const value = Number.parseInt(unixSeconds ?? 0, 10);
  if (!value) return { day: "—", short: "日期未知", full: "日期未知" };
  const parts = new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  }).formatToParts(new Date(value * 1000));
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    day: values.day,
    short: `${values.month}.${values.day}`,
    full: `${values.year}.${values.month}.${values.day} · ${values.weekday}`,
  };
}

function formatSyncTime(value) {
  if (!value) return "尚未同步";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "尚未同步";
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function periodCopy(period = {}) {
  const compare = period.compare;
  const comparison = compare === null || compare === undefined || !Number.isFinite(Number(compare))
    ? ""
    : compare >= 0
      ? `，较上一周期增长 ${Math.round(compare * 100)}%`
      : `，较上一周期减少 ${Math.abs(Math.round(compare * 100))}%`;
  return `阅读 ${period.readDays ?? 0} 天，自然日均 ${formatDuration(period.dayAverageSeconds)}${comparison}`;
}

function setTab(tab) {
  state.tab = tab;
  document.querySelectorAll(".mainNav [data-tab]").forEach((button) => {
    button.classList.toggle("active", button.dataset.tab === tab);
  });
  elements.overviewPanel.hidden = tab !== "overview";
  elements.journeyPanel.hidden = tab !== "journey";
  elements.shelfPanel.hidden = tab !== "shelf";
  elements.notesPanel.hidden = tab !== "notes";
  if (tab === "overview") renderOverview();
  if (tab === "journey") renderJourney();
  if (tab === "shelf" || tab === "notes") renderLists();
  requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: "smooth" }));
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

function searchedNotes() {
  const keyword = state.query.trim().toLowerCase();
  const notes = state.data?.notes ?? [];
  return keyword
    ? notes.filter((note) => `${note.book}${note.quote}${note.note}${note.chapter}`.toLowerCase().includes(keyword))
    : notes;
}

function renderBook(book, index) {
  const href = book.link ? `href="${escapeHtml(book.link)}"` : "";
  const progress = Math.max(0, Math.min(100, Number(book.progress) || 0));
  const coverImage = book.cover
    ? `<img class="coverImage" src="${escapeHtml(book.cover)}" alt="${escapeHtml(book.title)}封面" loading="lazy" decoding="async" onerror="this.remove(); this.parentElement.classList.remove('hasCover')">`
    : "";
  return `<article class="bookCard">
    <a class="cover${book.cover ? " hasCover" : ""}" ${href} aria-label="打开《${escapeHtml(book.title)}》" style="background-color:${coverColors[index % coverColors.length]};">
      ${coverImage}
      <small class="coverFallback">枕书藏本 · ${String(index + 1).padStart(2, "0")}</small>
      <strong class="coverFallback">${escapeHtml(book.title)}</strong>
      <span class="coverFallback">${escapeHtml(book.author || book.category || "微信读书")}</span>
    </a>
    <div class="bookMeta"><span>${escapeHtml(book.status)}</span><b>${escapeHtml(book.title)}</b><small>${escapeHtml(book.author || book.category || "微信读书")}</small><div class="progress"><i style="width:${progress}%"></i></div><em>${progress}%</em></div>
  </article>`;
}

function renderTimelineNote(note, index, compact = false) {
  const date = dateParts(note.createTime);
  const quote = note.quote ? `<blockquote>“${escapeHtml(note.quote)}”</blockquote>` : "";
  const body = note.note ? `<p>${escapeHtml(note.note)}</p>` : "";
  const link = note.link ? `<a href="${escapeHtml(note.link)}">在微信读书中打开 →</a>` : "";
  const chapter = note.chapter ? ` · ${escapeHtml(note.chapter)}` : "";
  const kind = note.kind === "highlight" ? "划线" : note.kind === "review" ? "评论" : note.kind === "bookmark" ? "书签" : "想法";
  return `<article class="timelineItem${compact ? " compactItem" : ""}">
    <div class="timelineRail"><time>${date.short}</time><i></i></div>
    <div class="timelineCard"><div class="timelineMeta"><span>${escapeHtml(note.book)}${chapter}</span><small>${date.full}</small></div>${quote}${body}<div class="noteFooter"><small>#${kind}</small>${link}</div></div>
  </article>`;
}

function journeyEvidenceHint(ids = []) {
  return Array.isArray(ids) && ids.length ? '<small class="journeyEvidence">基于你的批注与阅读记录</small>' : "";
}

function renderJourney() {
  const payload = state.journey;
  const analysis = payload?.status === "ready" ? payload.analysis : null;
  const history = Array.isArray(state.journeyHistory?.entries) ? state.journeyHistory.entries : [];
  const archivedHistory = analysis ? history.filter((entry) => entry.id !== payload.id) : history;
  const focus = analysis?.focusCategory || {};
  elements.journeyTeaserTitle.textContent = analysis?.title || "全程阅读心路";
  elements.journeyTeaserText.textContent = analysis?.thesis || "第一次全程分析完成后，这里会出现一段关于阅读变化的长期观察。";
  elements.journeyTeaserMeta.textContent = analysis ? `当前重点 · ${focus.name || payload.focusCategory || "长期阅读变化"}` : "等待首次分析";
  elements.journeyUnavailable.hidden = Boolean(analysis);
  elements.journeyHero.hidden = !analysis;
  if (!analysis) {
    elements.journeyArchiveList.innerHTML = history.length
      ? history.map((entry) => `<details class="journeyArchiveItem"><summary><time>${escapeHtml(entry.date)}</time><strong>${escapeHtml(entry.analysis?.title || "全程阅读心路")}</strong></summary><p>${escapeHtml(entry.analysis?.thesis || "")}</p></details>`).join("")
      : '<p class="journeyEmpty">首次周度分析完成后，这里会出现历史归档。</p>';
    return;
  }
  elements.journeyTitle.textContent = analysis.title || "全程阅读心路";
  elements.journeyThesis.textContent = analysis.thesis || "";
  elements.journeyUpdated.textContent = formatSyncTime(analysis.generatedAt);
  elements.journeyFocusCategory.textContent = focus.name || payload.focusCategory || "—";
  elements.journeyArc.innerHTML = (analysis.arc || []).map((phase) => `<article class="journeyPhase"><div class="journeyPhaseRail"><span>${escapeHtml(phase.period)}</span><i></i></div><div><h3>${escapeHtml(phase.title)}</h3><p>${escapeHtml(phase.body)}</p>${journeyEvidenceHint(phase.evidenceIds)}</div></article>`).join("") || '<p class="journeyEmpty">目前还没有足够的历史证据形成阶段划分。</p>';
  elements.journeyFocusName.textContent = focus.name || "—";
  elements.journeyFocusBody.textContent = focus.body || "目前还没有足够证据分析这个类别的长期变化。";
  elements.journeyFocusShifts.innerHTML = (focus.shifts || []).map((shift, index) => `<article><span class="journeyShiftIndex">0${index + 1}</span><h3>${escapeHtml(shift.title)}</h3><p>${escapeHtml(shift.body)}</p>${journeyEvidenceHint(shift.evidenceIds)}</article>`).join("");
  elements.journeyThemes.innerHTML = (analysis.enduringThemes || []).map((theme) => `<article><h3>${escapeHtml(theme.title)}</h3><p>${escapeHtml(theme.body)}</p>${journeyEvidenceHint(theme.evidenceIds)}</article>`).join("") || '<p class="journeyEmpty">长期主题还在形成中。</p>';
  elements.journeyTurningPoints.innerHTML = (analysis.turningPoints || []).map((point) => `<article><h3>${escapeHtml(point.title)}</h3><p>${escapeHtml(point.body)}</p>${journeyEvidenceHint(point.evidenceIds)}</article>`).join("") || '<p class="journeyEmpty">目前还没有明确的转向记录。</p>';
  elements.journeyQuestions.innerHTML = (analysis.openQuestions || []).map((question) => `<li>${escapeHtml(question)}</li>`).join("") || "<li>新的问题会随着阅读继续出现。</li>";
  elements.journeyArchiveList.innerHTML = archivedHistory.length
    ? archivedHistory.map((entry) => `<details class="journeyArchiveItem"><summary><time>${escapeHtml(entry.date)}</time><strong>${escapeHtml(entry.analysis?.title || "全程阅读心路")}</strong></summary><p>${escapeHtml(entry.analysis?.thesis || "")}</p><div class="journeyArchiveArc">${(entry.analysis?.arc || []).slice(0, 4).map((phase) => `<div><b>${escapeHtml(phase.period)}</b><span>${escapeHtml(phase.title)}</span></div>`).join("")}</div></details>`).join("")
    : '<p class="journeyEmpty">当前分析已展示在上方，下一次分析后这里会出现上一期归档。</p>';
}

function renderCurrentBook() {
  const books = state.data?.books ?? [];
  const book = books.find((item) => item.sourceType === "book" && item.progress > 0 && item.progress < 100)
    ?? books.find((item) => item.sourceType === "book")
    ?? books[0];
  if (!book) {
    elements.currentBook.innerHTML = '<p class="empty compact">同步后，这里会出现正在阅读的书。</p>';
    return;
  }
  const progress = Math.max(0, Math.min(100, Number(book.progress) || 0));
  const coverImage = book.cover
    ? `<img class="currentBookImage" src="${escapeHtml(book.cover)}" alt="${escapeHtml(book.title)}封面" loading="lazy" decoding="async" onerror="this.remove()">`
    : "";
  const href = book.link ? `href="${escapeHtml(book.link)}"` : "";
  elements.currentBook.innerHTML = `<a class="currentBookLink" ${href}><span class="currentBookCover" style="background-color:${coverColors[0]};">${coverImage}<b>${escapeHtml(book.title?.slice(0, 2) ?? "书")}</b></span><span class="currentBookInfo"><strong>${escapeHtml(book.title)}</strong><small>${escapeHtml(book.author || book.category || "微信读书")}</small><span class="currentProgress"><i style="width:${progress}%"></i></span><em>阅读至 ${progress}%</em></span></a>`;
}

function renderMiniCalendar() {
  if (!state.calendarMonth) return;
  const counts = noteCountsByDate(state.data?.notes ?? []);
  const cells = calendarMonth(state.calendarMonth, counts, state.selectedDate);
  elements.overviewCalendarTitle.textContent = formatMonthLabel(state.calendarMonth);
  elements.overviewCalendarGrid.innerHTML = cells.map((cell) => {
    if (!cell) return '<span class="miniCalendarBlank" aria-hidden="true"></span>';
    const label = `${formatDateKeyLabel(cell.dateKey)}，${cell.count ? `${cell.count} 条批注` : "没有批注"}`;
    return `<button class="miniCalendarDay${cell.count ? " hasNotes" : ""}${cell.selected ? " selected" : ""}" type="button" data-date="${cell.dateKey}" aria-label="${label}" ${cell.count ? "" : "disabled"}><span>${cell.day}</span>${cell.count ? `<i>${cell.count}</i>` : ""}</button>`;
  }).join("");
  elements.overviewCalendarFoot.textContent = `${[...counts.values()].filter(Boolean).length} 天有批注 · 点击日期查看时间轴`;
}

function renderOverview() {
  const notes = searchedNotes().slice(0, 4);
  elements.overviewTimeline.innerHTML = notes.map((note, index) => renderTimelineNote(note, index, true)).join("");
  elements.overviewEmpty.hidden = notes.length > 0;
  renderMiniCalendar();
  renderCurrentBook();
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
  element.innerHTML = `<p>共 ${page.totalItems} ${itemLabel} · 第 ${page.page}/${page.totalPages} 页</p><div class="pageControls"><button type="button" data-page="${page.page - 1}" ${page.page === 1 ? "disabled" : ""} aria-label="上一页">←</button>${pageButtons}<button type="button" data-page="${page.page + 1}" ${page.page === page.totalPages ? "disabled" : ""} aria-label="下一页">→</button></div>`;
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
  elements.notesList.innerHTML = notes.items.map((note, index) => renderTimelineNote(note, notes.start + index)).join("");
  elements.shelfEmpty.hidden = books.totalItems > 0;
  elements.notesEmpty.hidden = notes.totalItems > 0;
  if (!books.totalItems) elements.shelfEmpty.textContent = (state.data?.books ?? []).length ? "没有找到这本书，换个关键词试试。" : "还没有同步到书架内容。";
  if (!notes.totalItems) elements.notesEmpty.textContent = emptyNotesMessage();
  renderPagination(elements.shelfPagination, books, "本");
  renderPagination(elements.notesPagination, notes, "条");
  const filterLabel = state.selectedDate ? formatDateKeyLabel(state.selectedDate) : (state.query.trim() ? "搜索结果" : "全部批注");
  elements.notesFilterSummary.textContent = `${filterLabel} · ${notes.totalItems} 条`;
  renderCalendar();
}

function renderCalendar() {
  if (!state.calendarMonth) return;
  const counts = noteCountsByDate(state.data?.notes ?? []);
  const cells = calendarMonth(state.calendarMonth, counts, state.selectedDate);
  elements.calendarTitle.textContent = formatMonthLabel(state.calendarMonth);
  elements.calendarAll.classList.toggle("active", !state.selectedDate);
  elements.calendarAll.setAttribute("aria-pressed", String(!state.selectedDate));
  elements.calendarGrid.innerHTML = cells.map((cell) => {
    if (!cell) return '<span class="calendarBlank" aria-hidden="true"></span>';
    const label = `${formatDateKeyLabel(cell.dateKey)}，${cell.count ? `${cell.count} 条批注` : "没有批注"}`;
    return `<button type="button" class="calendarDay${cell.selected ? " selected" : ""}${cell.count ? " hasNotes" : ""}" data-date="${cell.dateKey}" aria-label="${label}" aria-pressed="${cell.selected}" ${cell.count ? "" : "disabled"}><span>${cell.day}</span>${cell.count ? `<small>${cell.count}</small>` : ""}</button>`;
  }).join("");
}

function renderSummary() {
  const summary = state.data?.summary ?? {};
  const stats = state.data?.stats ?? {};
  elements.shelfCount.textContent = summary.shelfCount ?? 0;
  elements.noteCount.textContent = summary.noteCount ?? 0;
  elements.overallTime.textContent = formatDuration(summary.overallSeconds ?? stats.overall?.totalSeconds);
  elements.readingDays.textContent = stats.overall?.readDays ?? stats.monthly?.readDays ?? stats.weekly?.readDays ?? 0;
  elements.syncTime.textContent = formatSyncTime(state.data?.generatedAtMs);
  elements.weekTime.textContent = formatDuration(stats.weekly?.totalSeconds);
  elements.monthTime.textContent = formatDuration(stats.monthly?.totalSeconds);
  elements.overallCopy.textContent = formatDuration(stats.overall?.totalSeconds ?? summary.overallSeconds);
  elements.weekCopy.textContent = `${periodCopy(stats.weekly)}。${stats.weekly?.topTitle ? `本周读得最多的是《${stats.weekly.topTitle}》。` : "同步后，这里会显示本周阅读足迹。"}`;
}

function changePage(kind, requestedPage) {
  const key = kind === "shelf" ? "shelfPage" : "notesPage";
  state[key] = Number(requestedPage);
  renderLists();
  const heading = kind === "shelf" ? elements.shelfHeading : elements.notesHeading;
  const pagination = kind === "shelf" ? elements.shelfPagination : elements.notesPagination;
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
  if (!response.ok) throw new Error(DATA_UNAVAILABLE_MESSAGE);
  try {
    state.data = await response.json();
  } catch {
    throw new Error(DATA_UNAVAILABLE_MESSAGE);
  }
  if (!state.data || !Array.isArray(state.data.books) || !Array.isArray(state.data.notes)) {
    throw new Error(DATA_UNAVAILABLE_MESSAGE);
  }
  const [journeyResponse, historyResponse] = await Promise.all([
    fetch("./data/reading-journey.json", { cache: "no-store" }),
    fetch("./data/reading-journey-history.json", { cache: "no-store" }),
  ]);
  try {
    state.journey = journeyResponse.ok ? await journeyResponse.json() : null;
  } catch {
    state.journey = null;
  }
  try {
    state.journeyHistory = historyResponse.ok ? await historyResponse.json() : { entries: [] };
  } catch {
    state.journeyHistory = { entries: [] };
  }
  state.calendarMonth = latestNoteMonth(state.data.notes);
  renderSummary();
  renderOverview();
  renderLists();
  renderJourney();
}

document.querySelectorAll("[data-tab]").forEach((button) => button.addEventListener("click", () => setTab(button.dataset.tab)));
elements.searchInput.addEventListener("input", (event) => {
  state.query = event.target.value;
  state.shelfPage = 1;
  state.notesPage = 1;
  renderOverview();
  renderLists();
});
elements.shelfPagination.addEventListener("click", (event) => handlePagination(event, "shelf"));
elements.notesPagination.addEventListener("click", (event) => handlePagination(event, "notes"));
function changeCalendarMonth(delta) {
  state.calendarMonth = shiftMonthKey(state.calendarMonth, delta);
  state.selectedDate = null;
  state.notesPage = 1;
  renderOverview();
  renderLists();
}
elements.calendarPrev.addEventListener("click", () => changeCalendarMonth(-1));
elements.calendarNext.addEventListener("click", () => changeCalendarMonth(1));
elements.calendarAll.addEventListener("click", () => { state.selectedDate = null; state.notesPage = 1; renderCalendar(); renderOverview(); renderLists(); });
elements.calendarGrid.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-date]");
  if (!button || button.disabled) return;
  state.selectedDate = state.selectedDate === button.dataset.date ? null : button.dataset.date;
  state.notesPage = 1;
  renderCalendar();
  renderOverview();
  renderLists();
});
elements.overviewCalendarGrid.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-date]");
  if (!button || button.disabled) return;
  state.selectedDate = button.dataset.date;
  state.notesPage = 1;
  setTab("notes");
  renderCalendar();
  renderLists();
});

loadData().catch((error) => {
  const message = error?.message === DATA_UNAVAILABLE_MESSAGE ? error.message : DATA_UNAVAILABLE_MESSAGE;
  elements.overviewEmpty.hidden = false;
  elements.overviewEmpty.textContent = message;
  elements.shelfEmpty.hidden = false;
  elements.shelfEmpty.textContent = message;
  elements.notesEmpty.hidden = false;
  elements.notesEmpty.textContent = message;
});

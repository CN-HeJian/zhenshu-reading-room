const coverColors = ["#8f4038", "#315c4b", "#334867", "#b27332", "#6c4b3f", "#4f5e69"];
const state = { data: null, tab: "shelf", query: "" };

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
  shelfList: document.querySelector("#shelfList"),
  notesList: document.querySelector("#notesList"),
  shelfEmpty: document.querySelector("#shelfEmpty"),
  notesEmpty: document.querySelector("#notesEmpty"),
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
  if (!keyword) return notes;
  return notes.filter((note) => `${note.book}${note.quote}${note.note}${note.chapter}`.toLowerCase().includes(keyword));
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

function renderLists() {
  const books = filteredBooks();
  const notes = filteredNotes();
  elements.shelfList.innerHTML = books.map(renderBook).join("");
  elements.notesList.innerHTML = notes.map(renderNote).join("");
  elements.shelfEmpty.hidden = books.length > 0;
  elements.notesEmpty.hidden = notes.length > 0;
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
  if (latestBook?.link) {
    elements.continueReading.href = latestBook.link;
    elements.continueReading.hidden = false;
  }
}

async function loadData() {
  const response = await fetch("./data/reading-room.json", { cache: "no-store" });
  if (!response.ok) throw new Error("无法读取阅读数据。");
  state.data = await response.json();
  renderSummary();
  renderLists();
}

document.querySelectorAll("[data-tab]").forEach((button) => {
  button.addEventListener("click", () => setTab(button.dataset.tab));
});
elements.searchInput.addEventListener("input", (event) => {
  state.query = event.target.value;
  renderLists();
});

loadData().catch((error) => {
  elements.shelfEmpty.hidden = false;
  elements.shelfEmpty.textContent = error.message;
});

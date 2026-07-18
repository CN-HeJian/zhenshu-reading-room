import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  asInt,
  buildGatewayBody,
  buildWeReadLink,
  clampProgress,
  totalNotebookNotes,
  visibleShelfCount,
  WEREAD_GATEWAY_URL,
} from "../lib/weread/core.mjs";

const DEFAULT_OUTPUT = new URL("../github-pages/data/reading-room.json", import.meta.url);
const STAT_MODES = ["weekly", "monthly", "annually", "overall"];
const RETRY_STATUSES = new Set([429, 502, 503, 504]);

export class ExportError extends Error {
  constructor(message, code = "export_error", retryable = false) {
    super(message);
    this.name = "ExportError";
    this.code = code;
    this.retryable = retryable;
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withRetry(operation) {
  let lastError;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (!error?.retryable || attempt === 2) throw error;
      await sleep(350 * (2 ** attempt));
    }
  }
  throw lastError;
}

function readTopTitle(payload) {
  const list = Array.isArray(payload?.readLongest) ? payload.readLongest : [];
  return list[0]?.book?.title ?? list[0]?.albumInfo?.name ?? null;
}

function parsePeriod(mode, payload = {}) {
  return {
    mode,
    baseTime: payload.baseTime ?? null,
    totalSeconds: asInt(payload.totalReadTime),
    readDays: asInt(payload.readDays),
    dayAverageSeconds: asInt(payload.dayAverageReadTime),
    compare: payload.compare === undefined || payload.compare === null ? null : Number(payload.compare),
    topTitle: readTopTitle(payload),
    readTimes: payload.readTimes ?? {},
    dailyReadTimes: payload.dailyReadTimes ?? {},
    readLongest: payload.readLongest ?? [],
    readStat: payload.readStat ?? [],
    preferCategory: payload.preferCategory ?? [],
    preferTime: payload.preferTime ?? [],
    preferAuthor: payload.preferAuthor ?? [],
  };
}

function buildBookRecords(shelf, progressByBookId) {
  const books = [];

  for (const book of shelf.books ?? []) {
    const sourceId = String(book.bookId ?? "");
    if (!sourceId || !book.title) continue;
    const progressPayload = progressByBookId.get(sourceId)?.book ?? {};
    const progress = clampProgress(progressPayload.progress);
    books.push({
      id: `book:${sourceId}`,
      sourceType: "book",
      sourceId,
      title: book.title,
      author: book.author ?? "",
      cover: book.cover ?? null,
      category: book.category ?? null,
      progress,
      status: progress === 100 || asInt(book.finishReading) ? "读完了" : progress > 0 ? "正在读" : "未开始",
      readUpdateTime: book.readUpdateTime ?? null,
      updateTime: book.updateTime ?? null,
      readingTimeSeconds: asInt(progressPayload.recordReadingTime),
      chapterUid: progressPayload.chapterUid === undefined ? null : String(progressPayload.chapterUid),
      chapterOffset: progressPayload.chapterOffset ?? null,
      finishTime: progress === 100 ? (progressPayload.finishTime ?? null) : null,
      link: buildWeReadLink({ bookId: sourceId }),
    });
  }

  for (const album of shelf.albums ?? []) {
    const info = album.albumInfo ?? {};
    const extra = album.albumInfoExtra ?? {};
    const sourceId = String(info.albumId ?? "");
    if (!sourceId || !info.name) continue;
    books.push({
      id: `album:${sourceId}`,
      sourceType: "album",
      sourceId,
      title: info.name,
      author: info.authorName ?? "",
      cover: info.cover ?? null,
      category: "有声书",
      progress: asInt(info.finish) ? 100 : 0,
      status: "有声书",
      readUpdateTime: extra.lectureReadUpdateTime ?? null,
      updateTime: info.updateTime ?? null,
      readingTimeSeconds: 0,
      chapterUid: null,
      chapterOffset: null,
      finishTime: null,
      link: null,
      trackCount: info.trackCount ?? null,
    });
  }

  if (shelf.mp) {
    books.push({
      id: "mp:articles",
      sourceType: "mp",
      sourceId: "articles",
      title: "文章收藏",
      author: "",
      cover: null,
      category: "文章收藏",
      progress: 0,
      status: "收藏",
      readUpdateTime: null,
      updateTime: null,
      readingTimeSeconds: 0,
      chapterUid: null,
      chapterOffset: null,
      finishTime: null,
      link: null,
    });
  }

  return books.sort((left, right) =>
    (right.readUpdateTime ?? right.updateTime ?? 0) - (left.readUpdateTime ?? left.updateTime ?? 0) ||
    left.title.localeCompare(right.title, "zh-CN")
  );
}

function chapterTitleMap(highlightList) {
  const map = new Map();
  for (const chapter of highlightList.chapters ?? []) {
    if (chapter.chapterUid !== undefined) map.set(String(chapter.chapterUid), chapter.title ?? null);
  }
  return map;
}

function normalizeHighlights(bookId, bookTitle, highlightList) {
  const chapters = chapterTitleMap(highlightList);
  return (highlightList.updated ?? [])
    .filter((item) => item.bookmarkId !== undefined && item.markText)
    .map((item) => ({
      id: String(item.bookmarkId),
      kind: "highlight",
      book: bookTitle,
      bookId,
      chapter: item.chapterUid === undefined ? null : (chapters.get(String(item.chapterUid)) ?? null),
      chapterUid: item.chapterUid === undefined ? null : String(item.chapterUid),
      quote: item.markText ?? "",
      note: "",
      createTime: item.createTime ?? null,
      range: item.range ?? null,
      colorStyle: item.colorStyle ?? null,
      link: buildWeReadLink({ bookId, chapterUid: item.chapterUid, range: item.range }),
    }));
}

function normalizeReviews(bookId, bookTitle, reviews) {
  return reviews
    .filter((item) => item.reviewId !== undefined && item.content)
    .map((item) => ({
      id: String(item.reviewId),
      kind: "review",
      book: bookTitle,
      bookId,
      chapter: item.chapterName ?? null,
      chapterUid: item.chapterUid === undefined ? null : String(item.chapterUid),
      quote: "",
      note: item.content ?? "",
      createTime: item.createTime ?? null,
      range: item.range ?? null,
      star: item.star ?? null,
      isFinish: asInt(item.isFinish),
      link: buildWeReadLink({ bookId, chapterUid: item.chapterUid, range: item.range }),
    }));
}

export class WeReadExporter {
  constructor(apiKey, fetchImpl = fetch) {
    if (!apiKey) throw new ExportError("WEREAD_API_KEY 未配置。", "missing_api_key");
    this.apiKey = apiKey;
    this.fetchImpl = fetchImpl;
  }

  async call(apiName, params = {}) {
    return withRetry(async () => {
      const response = await this.fetchImpl(WEREAD_GATEWAY_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(buildGatewayBody(apiName, params)),
      });

      if (!response.ok) {
        throw new ExportError(
          response.status === 429 ? "微信读书请求过于频繁。" : `微信读书 HTTP ${response.status}`,
          `http_${response.status}`,
          RETRY_STATUSES.has(response.status),
        );
      }

      const payload = await response.json();
      if (payload?.upgrade_info) {
        const message = typeof payload.upgrade_info === "string"
          ? payload.upgrade_info
          : payload.upgrade_info.message;
        throw new ExportError(message || "微信读书 skill 需要升级。", "upgrade_required");
      }
      if (payload?.errcode && payload.errcode !== 0) {
        throw new ExportError(payload.errmsg || "微信读书返回错误。", `weread_${payload.errcode}`);
      }
      return payload;
    });
  }

  fetchShelf() {
    return this.call("/shelf/sync");
  }

  fetchProgress(bookId) {
    return this.call("/book/getprogress", { bookId });
  }

  async fetchAllNotebooks() {
    const results = [];
    let lastSort;
    for (let page = 0; page < 100; page += 1) {
      const payload = await this.call("/user/notebooks", {
        count: 100,
        ...(lastSort === undefined ? {} : { lastSort }),
      });
      const books = payload.books ?? [];
      results.push(...books);
      if (!payload.hasMore) return results;
      const nextSort = books.at(-1)?.sort;
      if (nextSort === undefined || nextSort === lastSort) {
        throw new ExportError("笔记分页游标没有前进。", "stalled_notebooks_cursor");
      }
      lastSort = nextSort;
    }
    throw new ExportError("笔记分页超过安全上限。", "notebooks_page_limit");
  }

  fetchHighlights(bookId) {
    return this.call("/book/bookmarklist", { bookId });
  }

  async fetchAllReviews(bookId) {
    const results = [];
    let synckey = 0;
    for (let page = 0; page < 100; page += 1) {
      const payload = await this.call("/review/list/mine", { bookid: bookId, synckey, count: 100 });
      for (const item of payload.reviews ?? []) results.push(item.review ?? item);
      if (!payload.hasMore) return results;
      const nextSynckey = Number(payload.synckey ?? 0);
      if (!nextSynckey || nextSynckey === synckey) {
        throw new ExportError("想法分页游标没有前进。", "stalled_reviews_cursor");
      }
      synckey = nextSynckey;
    }
    throw new ExportError("想法分页超过安全上限。", "reviews_page_limit");
  }

  fetchReadData(mode) {
    return this.call("/readdata/detail", { mode, baseTime: 0 });
  }

  async exportData(now = new Date()) {
    const shelf = await this.fetchShelf();
    const progressByBookId = new Map();
    for (const book of shelf.books ?? []) {
      const bookId = String(book.bookId ?? "");
      if (bookId) progressByBookId.set(bookId, await this.fetchProgress(bookId));
    }

    const notebooks = await this.fetchAllNotebooks();
    const notebookByBookId = new Map();
    for (const item of notebooks) {
      const bookId = String(item.bookId ?? item.book?.bookId ?? "");
      if (bookId) notebookByBookId.set(bookId, item);
    }

    const notes = [];
    for (const [bookId, notebook] of notebookByBookId.entries()) {
      const title = notebook.book?.title ?? shelf.books?.find((book) => String(book.bookId ?? "") === bookId)?.title ?? "未命名书籍";
      const [highlights, reviews] = await Promise.all([
        this.fetchHighlights(bookId),
        this.fetchAllReviews(bookId),
      ]);
      notes.push(...normalizeHighlights(bookId, title, highlights));
      notes.push(...normalizeReviews(bookId, title, reviews));
    }
    notes.sort((left, right) => (right.createTime ?? 0) - (left.createTime ?? 0));

    const statPairs = await Promise.all(STAT_MODES.map(async (mode) => [mode, parsePeriod(mode, await this.fetchReadData(mode))]));
    const stats = Object.fromEntries(statPairs);
    const books = buildBookRecords(shelf, progressByBookId);
    const bookmarkCount = [...notebookByBookId.values()].reduce((sum, item) => sum + asInt(item.bookmarkCount), 0);
    const notebookNoteCount = [...notebookByBookId.values()].reduce((sum, item) => sum + totalNotebookNotes(item), 0);

    return {
      schemaVersion: 1,
      generatedAt: now.toISOString(),
      generatedAtMs: now.getTime(),
      status: "success",
      summary: {
        shelfCount: visibleShelfCount(shelf),
        bookCount: shelf.books?.length ?? 0,
        albumCount: shelf.albums?.length ?? 0,
        hasArticleCollection: Boolean(shelf.mp),
        progressCount: progressByBookId.size,
        notebookCount: notebookByBookId.size,
        highlightCount: notes.filter((note) => note.kind === "highlight").length,
        reviewCount: notes.filter((note) => note.kind === "review").length,
        bookmarkCount,
        noteCount: notebookNoteCount,
        overallSeconds: stats.overall?.totalSeconds ?? 0,
      },
      books,
      notebooks: [...notebookByBookId.values()].map((item) => ({
        bookId: String(item.bookId ?? item.book?.bookId ?? ""),
        title: item.book?.title ?? "",
        author: item.book?.author ?? "",
        cover: item.book?.cover ?? null,
        reviewCount: asInt(item.reviewCount),
        highlightCount: asInt(item.noteCount),
        bookmarkCount: asInt(item.bookmarkCount),
        noteCount: totalNotebookNotes(item),
        readingProgress: clampProgress(item.readingProgress),
        sort: item.sort ?? null,
      })),
      notes,
      stats,
    };
  }
}

export async function writeExportedData(data, output = DEFAULT_OUTPUT) {
  const url = output instanceof URL ? output : pathToFileURL(output);
  const path = fileURLToPath(url);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

export async function exportWeReadData({ apiKey = process.env.WEREAD_API_KEY, output = DEFAULT_OUTPUT, fetchImpl = fetch } = {}) {
  const exporter = new WeReadExporter(apiKey, fetchImpl);
  const data = await exporter.exportData();
  await writeExportedData(data, output);
  return data;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  exportWeReadData().then((data) => {
    console.log(`Exported ${data.summary.shelfCount} shelf items and ${data.summary.noteCount} notes.`);
  }).catch((error) => {
    console.error(error?.message ?? error);
    process.exitCode = 1;
  });
}

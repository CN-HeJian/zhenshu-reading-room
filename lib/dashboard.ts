import { getD1 } from "@/db";
import { buildWeReadLink } from "@/lib/weread/core.mjs";
import { getLastSuccessfulRun, getLatestRun } from "@/lib/sync/repository";
import { publicSyncRun } from "@/lib/sync/orchestrator";

export type DashboardBook = {
  id: string;
  sourceType: "book" | "album" | "mp";
  sourceId: string;
  title: string;
  author: string;
  cover: string | null;
  category: string | null;
  progress: number;
  status: string;
  readUpdateTime: number | null;
  link: string | null;
};

export type DashboardNote = {
  id: string;
  kind: "highlight" | "review";
  book: string;
  bookId: string;
  chapter: string | null;
  quote: string;
  note: string;
  createTime: number | null;
  link: string | null;
};

export type DashboardPeriod = {
  mode: "weekly" | "monthly" | "overall";
  totalSeconds: number;
  readDays: number;
  dayAverageSeconds: number;
  compare: number | null;
  topTitle: string | null;
};

export type DashboardData = {
  databaseReady: boolean;
  books: DashboardBook[];
  notes: DashboardNote[];
  shelfCount: number;
  noteCount: number;
  overallSeconds: number;
  week: DashboardPeriod;
  month: DashboardPeriod;
  overall: DashboardPeriod;
  latestSync: ReturnType<typeof publicSyncRun> | null;
  lastSuccessAt: number | null;
  needsCatchUp: boolean;
};

type BookRow = {
  id: string;
  source_type: DashboardBook["sourceType"];
  source_id: string;
  title: string;
  author: string;
  cover: string | null;
  category: string | null;
  finish_reading: number;
  read_update_time: number | null;
  progress: number | null;
};

type NoteRow = {
  id: string;
  kind: DashboardNote["kind"];
  book: string;
  book_id: string;
  chapter: string | null;
  quote: string | null;
  note: string | null;
  create_time: number | null;
  chapter_uid: string | null;
  range_value: string | null;
};

type StatRow = {
  mode: DashboardPeriod["mode"];
  total_read_time: number;
  read_days: number;
  day_average_read_time: number;
  compare_value: number | null;
  read_longest_json: string;
};

function emptyPeriod(mode: DashboardPeriod["mode"]): DashboardPeriod {
  return { mode, totalSeconds: 0, readDays: 0, dayAverageSeconds: 0, compare: null, topTitle: null };
}

function parsePeriod(row: StatRow | null, mode: DashboardPeriod["mode"]): DashboardPeriod {
  if (!row) return emptyPeriod(mode);
  let topTitle: string | null = null;
  try {
    const list = JSON.parse(row.read_longest_json) as Array<{
      book?: { title?: string };
      albumInfo?: { name?: string };
    }>;
    topTitle = list[0]?.book?.title ?? list[0]?.albumInfo?.name ?? null;
  } catch {
    topTitle = null;
  }
  return {
    mode,
    totalSeconds: row.total_read_time ?? 0,
    readDays: row.read_days ?? 0,
    dayAverageSeconds: row.day_average_read_time ?? 0,
    compare: row.compare_value === null ? null : row.compare_value / 10_000,
    topTitle,
  };
}

function emptyDashboard(): DashboardData {
  return {
    databaseReady: false,
    books: [],
    notes: [],
    shelfCount: 0,
    noteCount: 0,
    overallSeconds: 0,
    week: emptyPeriod("weekly"),
    month: emptyPeriod("monthly"),
    overall: emptyPeriod("overall"),
    latestSync: null,
    lastSuccessAt: null,
    needsCatchUp: false,
  };
}

export async function getDashboardData(): Promise<DashboardData> {
  try {
    const db = getD1();
    const [
      bookResult,
      noteResult,
      shelfTotal,
      noteTotal,
      weekRow,
      monthRow,
      overallRow,
      latestRun,
      lastSuccess,
    ] = await Promise.all([
      db.prepare(
        `SELECT s.id, s.source_type, s.source_id, s.title, s.author, s.cover, s.category,
          s.finish_reading, s.read_update_time, p.progress
         FROM shelf_items s
         LEFT JOIN reading_progress_current p ON s.source_type = 'book' AND p.book_id = s.source_id
         WHERE s.removed_at IS NULL
         ORDER BY s.is_top DESC, COALESCE(s.read_update_time, s.source_update_time, 0) DESC, s.title
         LIMIT 300`,
      ).all<BookRow>(),
      db.prepare(
        `SELECT h.bookmark_id AS id, 'highlight' AS kind,
          COALESCE(s.title, n.title, '未命名书籍') AS book, h.book_id,
          h.chapter_title AS chapter, h.mark_text AS quote, '' AS note,
          h.create_time, h.chapter_uid, h.range_value
         FROM highlights h
         LEFT JOIN shelf_items s ON s.source_type = 'book' AND s.source_id = h.book_id
         LEFT JOIN notebook_summaries n ON n.book_id = h.book_id
         WHERE h.removed_at IS NULL
         UNION ALL
         SELECT r.review_id AS id, 'review' AS kind,
          COALESCE(s.title, n.title, '未命名书籍') AS book, r.book_id,
          r.chapter_name AS chapter, '' AS quote, r.content AS note,
          r.create_time, r.chapter_uid, r.range_value
         FROM personal_reviews r
         LEFT JOIN shelf_items s ON s.source_type = 'book' AND s.source_id = r.book_id
         LEFT JOIN notebook_summaries n ON n.book_id = r.book_id
         WHERE r.removed_at IS NULL
         ORDER BY create_time DESC
         LIMIT 500`,
      ).all<NoteRow>(),
      db.prepare("SELECT COUNT(*) AS value FROM shelf_items WHERE removed_at IS NULL").first<{ value: number }>(),
      db.prepare(
        `SELECT COALESCE(SUM(review_count + highlight_count + bookmark_count), 0) AS value
         FROM notebook_summaries WHERE removed_at IS NULL`,
      ).first<{ value: number }>(),
      db.prepare(
        "SELECT * FROM reading_stat_snapshots WHERE mode = 'weekly' ORDER BY captured_at DESC LIMIT 1",
      ).first<StatRow>(),
      db.prepare(
        "SELECT * FROM reading_stat_snapshots WHERE mode = 'monthly' ORDER BY captured_at DESC LIMIT 1",
      ).first<StatRow>(),
      db.prepare(
        "SELECT * FROM reading_stat_snapshots WHERE mode = 'overall' ORDER BY captured_at DESC LIMIT 1",
      ).first<StatRow>(),
      getLatestRun(),
      getLastSuccessfulRun(),
    ]);

    const books = (bookResult.results ?? []).map((row) => ({
      id: row.id,
      sourceType: row.source_type,
      sourceId: row.source_id,
      title: row.title,
      author: row.author,
      cover: row.cover,
      category: row.category,
      progress: row.source_type === "book" ? (row.progress ?? 0) : (row.finish_reading ? 100 : 0),
      status: row.source_type === "album"
        ? "有声书"
        : row.source_type === "mp"
          ? "收藏"
          : (row.progress ?? 0) === 100 || row.finish_reading
            ? "读完了"
            : (row.progress ?? 0) > 0
              ? "正在读"
              : "未开始",
      readUpdateTime: row.read_update_time,
      link: row.source_type === "book" ? buildWeReadLink({ bookId: row.source_id }) : null,
    }));
    const notes = (noteResult.results ?? []).map((row) => ({
      id: row.id,
      kind: row.kind,
      book: row.book,
      bookId: row.book_id,
      chapter: row.chapter,
      quote: row.quote ?? "",
      note: row.note ?? "",
      createTime: row.create_time,
      link: buildWeReadLink({ bookId: row.book_id, chapterUid: row.chapter_uid, range: row.range_value }),
    }));
    const week = parsePeriod(weekRow, "weekly");
    const month = parsePeriod(monthRow, "monthly");
    const overall = parsePeriod(overallRow, "overall");
    const lastSuccessAt = lastSuccess?.finishedAt ?? null;
    const cutoffMs = (() => {
      const now = new Date();
      const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Shanghai",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).formatToParts(now);
      const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
      const today = Date.UTC(Number(values.year), Number(values.month) - 1, Number(values.day), 15, 30);
      return today <= Date.now() ? today : today - 86_400_000;
    })();

    return {
      databaseReady: true,
      books,
      notes,
      shelfCount: shelfTotal?.value ?? books.length,
      noteCount: noteTotal?.value ?? notes.length,
      overallSeconds: overall.totalSeconds,
      week,
      month,
      overall,
      latestSync: latestRun ? publicSyncRun(latestRun) : null,
      lastSuccessAt,
      needsCatchUp: !latestRun || latestRun.status !== "running" ? (lastSuccessAt ?? 0) < cutoffMs : false,
    };
  } catch {
    return emptyDashboard();
  }
}

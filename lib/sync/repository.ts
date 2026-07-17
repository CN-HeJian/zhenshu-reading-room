import { getD1 } from "@/db";
import { asInt, clampProgress, visibleShelfCount } from "@/lib/weread/core.mjs";
import type {
  HighlightList,
  NotebookBook,
  ReadData,
  ReadDataMode,
  WeReadAlbum,
  WeReadBook,
  WeReadProgress,
  WeReadReview,
  WeReadShelf,
} from "@/lib/weread/types";
import type { SyncCursor, SyncRun, SyncSource, SyncStage, SyncStatus } from "./types";

type RunRow = {
  id: string;
  source: SyncSource;
  status: SyncStatus;
  stage: SyncStage;
  cursor_json: string;
  started_at: number;
  updated_at: number;
  finished_at: number | null;
  shelf_count: number;
  progress_updated: number;
  notes_updated: number;
  stats_updated: number;
  error_code: string | null;
  error_message: string | null;
};

const LOCK_KEY = "weread";
const LOCK_TTL_MS = 5 * 60 * 1000;

function toRun(row: RunRow): SyncRun {
  let cursor: SyncCursor = {};
  try {
    cursor = JSON.parse(row.cursor_json) as SyncCursor;
  } catch {
    cursor = {};
  }
  return {
    id: row.id,
    source: row.source,
    status: row.status,
    stage: row.stage,
    cursor,
    startedAt: row.started_at,
    updatedAt: row.updated_at,
    finishedAt: row.finished_at,
    shelfCount: row.shelf_count,
    progressUpdated: row.progress_updated,
    notesUpdated: row.notes_updated,
    statsUpdated: row.stats_updated,
    errorCode: row.error_code,
    errorMessage: row.error_message,
  };
}

async function runBatches(statements: D1PreparedStatement[], size = 50): Promise<void> {
  const db = getD1();
  for (let index = 0; index < statements.length; index += size) {
    await db.batch(statements.slice(index, index + size));
  }
}

export async function getRun(runId: string): Promise<SyncRun | null> {
  const row = await getD1().prepare("SELECT * FROM sync_runs WHERE id = ?").bind(runId).first<RunRow>();
  return row ? toRun(row) : null;
}

export async function getLatestRun(): Promise<SyncRun | null> {
  const row = await getD1().prepare("SELECT * FROM sync_runs ORDER BY started_at DESC LIMIT 1").first<RunRow>();
  return row ? toRun(row) : null;
}

export async function getLastSuccessfulRun(): Promise<SyncRun | null> {
  const row = await getD1().prepare(
    "SELECT * FROM sync_runs WHERE status IN ('success', 'partial_success') ORDER BY finished_at DESC LIMIT 1",
  ).first<RunRow>();
  return row ? toRun(row) : null;
}

export async function createOrGetRun(source: SyncSource): Promise<SyncRun> {
  const db = getD1();
  const now = Date.now();
  const existing = await db.prepare(
    `SELECT r.* FROM sync_lock l
     JOIN sync_runs r ON r.id = l.run_id
     WHERE l.lock_key = ? AND l.expires_at > ? AND r.status = 'running'
     LIMIT 1`,
  ).bind(LOCK_KEY, now).first<RunRow>();
  if (existing) return toRun(existing);

  const runId = crypto.randomUUID();
  const lockResult = await db.prepare(
    `INSERT INTO sync_lock (lock_key, run_id, expires_at) VALUES (?, ?, ?)
     ON CONFLICT(lock_key) DO UPDATE SET run_id = excluded.run_id, expires_at = excluded.expires_at
     WHERE sync_lock.expires_at <= ?`,
  ).bind(LOCK_KEY, runId, now + LOCK_TTL_MS, now).run();

  if ((lockResult.meta.changes ?? 0) === 0) {
    const locked = await db.prepare(
      `SELECT r.* FROM sync_lock l
       JOIN sync_runs r ON r.id = l.run_id
       WHERE l.lock_key = ? LIMIT 1`,
    ).bind(LOCK_KEY).first<RunRow>();
    if (locked) return toRun(locked);
    throw new Error("同步锁暂时不可用，请稍后重试。");
  }

  await db.prepare(
    `INSERT INTO sync_runs
     (id, source, status, stage, cursor_json, started_at, updated_at)
     VALUES (?, ?, 'running', 'shelf', '{}', ?, ?)`,
  ).bind(runId, source, now, now).run();
  const created = await getRun(runId);
  if (!created) throw new Error("无法创建同步任务。");
  return created;
}

export async function renewLock(runId: string): Promise<boolean> {
  const now = Date.now();
  const result = await getD1().prepare(
    "UPDATE sync_lock SET expires_at = ? WHERE lock_key = ? AND run_id = ?",
  ).bind(now + LOCK_TTL_MS, LOCK_KEY, runId).run();
  return (result.meta.changes ?? 0) > 0;
}

export async function saveRun(run: SyncRun): Promise<void> {
  await getD1().prepare(
    `UPDATE sync_runs SET status = ?, stage = ?, cursor_json = ?, updated_at = ?, finished_at = ?,
       shelf_count = ?, progress_updated = ?, notes_updated = ?, stats_updated = ?,
       error_code = ?, error_message = ? WHERE id = ?`,
  ).bind(
    run.status,
    run.stage,
    JSON.stringify(run.cursor),
    run.updatedAt,
    run.finishedAt,
    run.shelfCount,
    run.progressUpdated,
    run.notesUpdated,
    run.statsUpdated,
    run.errorCode,
    run.errorMessage,
    run.id,
  ).run();
}

export async function finishRun(
  run: SyncRun,
  status: Exclude<SyncStatus, "running">,
  errorCode: string | null = null,
  errorMessage: string | null = null,
): Promise<SyncRun> {
  const finished = {
    ...run,
    status,
    stage: "complete" as const,
    updatedAt: Date.now(),
    finishedAt: Date.now(),
    errorCode,
    errorMessage,
  };
  await saveRun(finished);
  await getD1().prepare("DELETE FROM sync_lock WHERE lock_key = ? AND run_id = ?").bind(LOCK_KEY, run.id).run();
  return finished;
}

function shelfBookStatement(book: WeReadBook, marker: number): D1PreparedStatement | null {
  const sourceId = String(book.bookId ?? "");
  if (!sourceId || !book.title) return null;
  return getD1().prepare(
    `INSERT INTO shelf_items
     (id, source_type, source_id, title, author, cover, category, finish_reading, is_top, is_secret,
      read_update_time, source_update_time, metadata_json, first_seen_at, last_seen_at, removed_at)
     VALUES (?, 'book', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '{}', ?, ?, NULL)
     ON CONFLICT(id) DO UPDATE SET title = excluded.title, author = excluded.author, cover = excluded.cover,
      category = excluded.category, finish_reading = excluded.finish_reading, is_top = excluded.is_top,
      is_secret = excluded.is_secret, read_update_time = excluded.read_update_time,
      source_update_time = excluded.source_update_time, last_seen_at = excluded.last_seen_at, removed_at = NULL`,
  ).bind(
    `book:${sourceId}`,
    sourceId,
    book.title,
    book.author ?? "",
    book.cover ?? null,
    book.category ?? null,
    asInt(book.finishReading),
    asInt(book.isTop),
    asInt(book.secret),
    book.readUpdateTime ?? null,
    book.updateTime ?? null,
    marker,
    marker,
  );
}

function shelfAlbumStatement(album: WeReadAlbum, marker: number): D1PreparedStatement | null {
  const info = album.albumInfo;
  const extra = album.albumInfoExtra;
  const sourceId = String(info?.albumId ?? "");
  if (!sourceId || !info?.name) return null;
  return getD1().prepare(
    `INSERT INTO shelf_items
     (id, source_type, source_id, title, author, cover, category, finish_reading, is_top, is_secret,
      read_update_time, source_update_time, metadata_json, first_seen_at, last_seen_at, removed_at)
     VALUES (?, 'album', ?, ?, ?, ?, '有声书', ?, ?, ?, ?, ?, ?, ?, ?, NULL)
     ON CONFLICT(id) DO UPDATE SET title = excluded.title, author = excluded.author, cover = excluded.cover,
      category = excluded.category, finish_reading = excluded.finish_reading, is_top = excluded.is_top,
      is_secret = excluded.is_secret, read_update_time = excluded.read_update_time,
      source_update_time = excluded.source_update_time, metadata_json = excluded.metadata_json,
      last_seen_at = excluded.last_seen_at, removed_at = NULL`,
  ).bind(
    `album:${sourceId}`,
    sourceId,
    info.name,
    info.authorName ?? "",
    info.cover ?? null,
    asInt(info.finish),
    asInt(extra?.isTop),
    asInt(extra?.secret),
    extra?.lectureReadUpdateTime ?? null,
    info.updateTime ?? null,
    JSON.stringify({ trackCount: info.trackCount, finishStatus: info.finishStatus, intro: info.intro }),
    marker,
    marker,
  );
}

export async function saveShelf(shelf: WeReadShelf): Promise<{ count: number; bookIds: string[] }> {
  const db = getD1();
  const marker = Date.now();
  const statements: D1PreparedStatement[] = [];
  const bookIds: string[] = [];

  for (const book of shelf.books ?? []) {
    const statement = shelfBookStatement(book, marker);
    if (statement) statements.push(statement);
    if (book.bookId !== undefined) bookIds.push(String(book.bookId));
  }
  for (const album of shelf.albums ?? []) {
    const statement = shelfAlbumStatement(album, marker);
    if (statement) statements.push(statement);
  }
  if (shelf.mp) {
    statements.push(db.prepare(
      `INSERT INTO shelf_items
       (id, source_type, source_id, title, author, category, finish_reading, is_top, is_secret,
        metadata_json, first_seen_at, last_seen_at, removed_at)
       VALUES ('mp:articles', 'mp', 'articles', '文章收藏', '', '文章收藏', 0, 0, 1, '{}', ?, ?, NULL)
       ON CONFLICT(id) DO UPDATE SET last_seen_at = excluded.last_seen_at, removed_at = NULL`,
    ).bind(marker, marker));
  }

  await runBatches(statements);
  await db.prepare("UPDATE shelf_items SET removed_at = ? WHERE removed_at IS NULL AND last_seen_at < ?")
    .bind(marker, marker).run();
  return { count: visibleShelfCount(shelf), bookIds };
}

export async function saveProgress(bookId: string, payload: WeReadProgress): Promise<boolean> {
  const db = getD1();
  const book = payload.book ?? {};
  const progress = clampProgress(book.progress);
  const readingTime = Math.max(0, asInt(book.recordReadingTime));
  const existing = await db.prepare(
    `SELECT chapter_uid, chapter_offset, progress, record_reading_time, is_start_reading,
      source_update_time, finish_time FROM reading_progress_current WHERE book_id = ?`,
  ).bind(bookId).first<Record<string, number | string | null>>();
  const changed = !existing ||
    String(existing.chapter_uid ?? "") !== String(book.chapterUid ?? "") ||
    asInt(existing.chapter_offset) !== asInt(book.chapterOffset) ||
    asInt(existing.progress) !== progress ||
    asInt(existing.record_reading_time) !== readingTime ||
    asInt(existing.is_start_reading) !== asInt(book.isStartReading) ||
    asInt(existing.finish_time) !== asInt(book.finishTime);
  const now = Date.now();

  const statements = [db.prepare(
    `INSERT INTO reading_progress_current
     (book_id, chapter_uid, chapter_offset, progress, record_reading_time, is_start_reading,
      source_update_time, finish_time, synced_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(book_id) DO UPDATE SET chapter_uid = excluded.chapter_uid,
      chapter_offset = excluded.chapter_offset, progress = excluded.progress,
      record_reading_time = excluded.record_reading_time, is_start_reading = excluded.is_start_reading,
      source_update_time = excluded.source_update_time, finish_time = excluded.finish_time,
      synced_at = excluded.synced_at`,
  ).bind(
    bookId,
    book.chapterUid === undefined ? null : String(book.chapterUid),
    book.chapterOffset ?? null,
    progress,
    readingTime,
    asInt(book.isStartReading),
    book.updateTime ?? null,
    progress === 100 ? (book.finishTime ?? null) : null,
    now,
  )];

  if (changed) {
    statements.push(db.prepare(
      `INSERT OR IGNORE INTO reading_progress_history
       (id, book_id, chapter_uid, chapter_offset, progress, record_reading_time, is_start_reading,
        source_update_time, finish_time, observed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      crypto.randomUUID(),
      bookId,
      book.chapterUid === undefined ? null : String(book.chapterUid),
      book.chapterOffset ?? null,
      progress,
      readingTime,
      asInt(book.isStartReading),
      book.updateTime ?? null,
      progress === 100 ? (book.finishTime ?? null) : null,
      now,
    ));
  }
  await db.batch(statements);
  return changed;
}

export async function saveNotebooks(books: NotebookBook[]): Promise<string[]> {
  const db = getD1();
  const marker = Date.now();
  const statements: D1PreparedStatement[] = [];
  const bookIds: string[] = [];

  for (const item of books) {
    const book = item.book ?? {};
    const bookId = String(item.bookId ?? book.bookId ?? "");
    if (!bookId || !book.title) continue;
    bookIds.push(bookId);
    statements.push(db.prepare(
      `INSERT INTO notebook_summaries
       (book_id, title, author, cover, review_count, highlight_count, bookmark_count,
        reading_progress, marked_status, sort_value, last_seen_at, removed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
       ON CONFLICT(book_id) DO UPDATE SET title = excluded.title, author = excluded.author,
        cover = excluded.cover, review_count = excluded.review_count,
        highlight_count = excluded.highlight_count, bookmark_count = excluded.bookmark_count,
        reading_progress = excluded.reading_progress, marked_status = excluded.marked_status,
        sort_value = excluded.sort_value, last_seen_at = excluded.last_seen_at, removed_at = NULL`,
    ).bind(
      bookId,
      book.title,
      book.author ?? "",
      book.cover ?? null,
      asInt(item.reviewCount),
      asInt(item.noteCount),
      asInt(item.bookmarkCount),
      clampProgress(item.readingProgress),
      asInt(item.markedStatus),
      item.sort ?? null,
      marker,
    ));
  }
  await runBatches(statements);
  await db.prepare("UPDATE notebook_summaries SET removed_at = ? WHERE removed_at IS NULL AND last_seen_at < ?")
    .bind(marker, marker).run();
  return bookIds;
}

export async function saveHighlights(bookId: string, payload: HighlightList): Promise<number> {
  const db = getD1();
  const marker = Date.now();
  const chapterTitles = new Map(
    (payload.chapters ?? []).map((chapter) => [String(chapter.chapterUid ?? ""), chapter.title ?? ""]),
  );
  const statements: D1PreparedStatement[] = [];
  let saved = 0;
  for (const item of payload.updated ?? []) {
    const bookmarkId = String(item.bookmarkId ?? "");
    if (!bookmarkId || !item.markText) continue;
    const chapterUid = item.chapterUid === undefined ? null : String(item.chapterUid);
    statements.push(db.prepare(
      `INSERT INTO highlights
       (bookmark_id, book_id, chapter_uid, chapter_title, mark_text, range_value, color_style,
        create_time, last_seen_at, removed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
       ON CONFLICT(bookmark_id) DO UPDATE SET chapter_uid = excluded.chapter_uid,
        chapter_title = excluded.chapter_title, mark_text = excluded.mark_text,
        range_value = excluded.range_value, color_style = excluded.color_style,
        create_time = excluded.create_time, last_seen_at = excluded.last_seen_at, removed_at = NULL`,
    ).bind(
      bookmarkId,
      bookId,
      chapterUid,
      chapterUid ? (chapterTitles.get(chapterUid) || null) : null,
      item.markText,
      item.range ?? null,
      item.colorStyle ?? null,
      item.createTime ?? null,
      marker,
    ));
    saved += 1;
  }
  await runBatches(statements);
  await db.prepare(
    "UPDATE highlights SET removed_at = ? WHERE book_id = ? AND removed_at IS NULL AND last_seen_at < ?",
  ).bind(marker, bookId, marker).run();
  return saved;
}

export async function saveReviews(bookId: string, reviews: WeReadReview[]): Promise<number> {
  const db = getD1();
  const marker = Date.now();
  const statements: D1PreparedStatement[] = [];
  let saved = 0;
  for (const item of reviews) {
    const reviewId = String(item.reviewId ?? "");
    if (!reviewId || !item.content) continue;
    statements.push(db.prepare(
      `INSERT INTO personal_reviews
       (review_id, book_id, chapter_uid, range_value, content, chapter_name, star, is_finish,
        create_time, last_seen_at, removed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
       ON CONFLICT(review_id) DO UPDATE SET chapter_uid = excluded.chapter_uid,
        range_value = excluded.range_value, content = excluded.content,
        chapter_name = excluded.chapter_name, star = excluded.star, is_finish = excluded.is_finish,
        create_time = excluded.create_time, last_seen_at = excluded.last_seen_at, removed_at = NULL`,
    ).bind(
      reviewId,
      bookId,
      item.chapterUid === undefined ? null : String(item.chapterUid),
      item.range ?? null,
      item.content,
      item.chapterName ?? null,
      item.star ?? null,
      item.isFinish ?? null,
      item.createTime ?? null,
      marker,
    ));
    saved += 1;
  }
  await runBatches(statements);
  await db.prepare(
    "UPDATE personal_reviews SET removed_at = ? WHERE book_id = ? AND removed_at IS NULL AND last_seen_at < ?",
  ).bind(marker, bookId, marker).run();
  return saved;
}

export async function saveReadData(mode: ReadDataMode, data: ReadData): Promise<void> {
  const db = getD1();
  const capturedAt = Date.now();
  const baseTime = asInt(data.baseTime);
  const snapshot = db.prepare(
    `INSERT INTO reading_stat_snapshots
     (id, mode, base_time, total_read_time, read_days, day_average_read_time, compare_value,
      read_longest_json, read_stat_json, prefer_category_json, prefer_time_json,
      prefer_author_json, captured_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    crypto.randomUUID(),
    mode,
    baseTime,
    Math.max(0, asInt(data.totalReadTime)),
    Math.max(0, asInt(data.readDays)),
    Math.max(0, asInt(data.dayAverageReadTime)),
    typeof data.compare === "number" ? Math.round(data.compare * 10_000) : null,
    JSON.stringify(data.readLongest ?? []),
    JSON.stringify(data.readStat ?? []),
    JSON.stringify(data.preferCategory ?? []),
    JSON.stringify(data.preferTime ?? []),
    JSON.stringify(data.preferAuthor ?? []),
    capturedAt,
  );
  const bucketValues = { ...(data.readTimes ?? {}), ...(data.dailyReadTimes ?? {}) };
  const bucketStatements = Object.entries(bucketValues).map(([bucketStart, seconds]) => {
    const start = asInt(bucketStart);
    return db.prepare(
      `INSERT INTO reading_time_buckets
       (id, mode, period_base_time, bucket_start, seconds, captured_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(mode, period_base_time, bucket_start) DO UPDATE SET
        seconds = excluded.seconds, captured_at = excluded.captured_at`,
    ).bind(`${mode}:${baseTime}:${start}`, mode, baseTime, start, Math.max(0, asInt(seconds)), capturedAt);
  });
  await runBatches([snapshot, ...bucketStatements]);
}

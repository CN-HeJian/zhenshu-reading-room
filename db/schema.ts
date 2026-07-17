import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const shelfItems = sqliteTable(
  "shelf_items",
  {
    id: text("id").primaryKey(),
    sourceType: text("source_type").notNull(),
    sourceId: text("source_id").notNull(),
    title: text("title").notNull(),
    author: text("author").notNull().default(""),
    cover: text("cover"),
    category: text("category"),
    finishReading: integer("finish_reading").notNull().default(0),
    isTop: integer("is_top").notNull().default(0),
    isSecret: integer("is_secret").notNull().default(0),
    readUpdateTime: integer("read_update_time"),
    sourceUpdateTime: integer("source_update_time"),
    metadataJson: text("metadata_json").notNull().default("{}"),
    firstSeenAt: integer("first_seen_at").notNull(),
    lastSeenAt: integer("last_seen_at").notNull(),
    removedAt: integer("removed_at"),
  },
  (table) => [
    uniqueIndex("shelf_items_source_idx").on(table.sourceType, table.sourceId),
    index("shelf_items_active_idx").on(table.removedAt, table.readUpdateTime),
  ],
);

export const readingProgressCurrent = sqliteTable("reading_progress_current", {
  bookId: text("book_id").primaryKey(),
  chapterUid: text("chapter_uid"),
  chapterOffset: integer("chapter_offset"),
  progress: integer("progress").notNull().default(0),
  recordReadingTime: integer("record_reading_time").notNull().default(0),
  isStartReading: integer("is_start_reading").notNull().default(0),
  sourceUpdateTime: integer("source_update_time"),
  finishTime: integer("finish_time"),
  syncedAt: integer("synced_at").notNull(),
});

export const readingProgressHistory = sqliteTable(
  "reading_progress_history",
  {
    id: text("id").primaryKey(),
    bookId: text("book_id").notNull(),
    chapterUid: text("chapter_uid"),
    chapterOffset: integer("chapter_offset"),
    progress: integer("progress").notNull().default(0),
    recordReadingTime: integer("record_reading_time").notNull().default(0),
    isStartReading: integer("is_start_reading").notNull().default(0),
    sourceUpdateTime: integer("source_update_time"),
    finishTime: integer("finish_time"),
    observedAt: integer("observed_at").notNull(),
  },
  (table) => [
    uniqueIndex("reading_progress_history_change_idx").on(
      table.bookId,
      table.progress,
      table.recordReadingTime,
      table.sourceUpdateTime,
    ),
    index("reading_progress_history_book_idx").on(table.bookId, table.observedAt),
  ],
);

export const notebookSummaries = sqliteTable("notebook_summaries", {
  bookId: text("book_id").primaryKey(),
  title: text("title").notNull(),
  author: text("author").notNull().default(""),
  cover: text("cover"),
  reviewCount: integer("review_count").notNull().default(0),
  highlightCount: integer("highlight_count").notNull().default(0),
  bookmarkCount: integer("bookmark_count").notNull().default(0),
  readingProgress: integer("reading_progress").notNull().default(0),
  markedStatus: integer("marked_status").notNull().default(0),
  sortValue: integer("sort_value"),
  lastSeenAt: integer("last_seen_at").notNull(),
  removedAt: integer("removed_at"),
});

export const highlights = sqliteTable(
  "highlights",
  {
    bookmarkId: text("bookmark_id").primaryKey(),
    bookId: text("book_id").notNull(),
    chapterUid: text("chapter_uid"),
    chapterTitle: text("chapter_title"),
    markText: text("mark_text").notNull(),
    range: text("range_value"),
    colorStyle: integer("color_style"),
    createTime: integer("create_time"),
    lastSeenAt: integer("last_seen_at").notNull(),
    removedAt: integer("removed_at"),
  },
  (table) => [
    index("highlights_book_idx").on(table.bookId, table.createTime),
    index("highlights_active_idx").on(table.removedAt, table.createTime),
  ],
);

export const personalReviews = sqliteTable(
  "personal_reviews",
  {
    reviewId: text("review_id").primaryKey(),
    bookId: text("book_id").notNull(),
    chapterUid: text("chapter_uid"),
    range: text("range_value"),
    content: text("content").notNull(),
    chapterName: text("chapter_name"),
    star: integer("star"),
    isFinish: integer("is_finish"),
    createTime: integer("create_time"),
    lastSeenAt: integer("last_seen_at").notNull(),
    removedAt: integer("removed_at"),
  },
  (table) => [
    index("personal_reviews_book_idx").on(table.bookId, table.createTime),
    index("personal_reviews_active_idx").on(table.removedAt, table.createTime),
  ],
);

export const readingStatSnapshots = sqliteTable(
  "reading_stat_snapshots",
  {
    id: text("id").primaryKey(),
    mode: text("mode").notNull(),
    baseTime: integer("base_time").notNull().default(0),
    totalReadTime: integer("total_read_time").notNull().default(0),
    readDays: integer("read_days").notNull().default(0),
    dayAverageReadTime: integer("day_average_read_time").notNull().default(0),
    compareValue: integer("compare_value"),
    readLongestJson: text("read_longest_json").notNull().default("[]"),
    readStatJson: text("read_stat_json").notNull().default("[]"),
    preferCategoryJson: text("prefer_category_json").notNull().default("[]"),
    preferTimeJson: text("prefer_time_json").notNull().default("[]"),
    preferAuthorJson: text("prefer_author_json").notNull().default("[]"),
    capturedAt: integer("captured_at").notNull(),
  },
  (table) => [index("reading_stat_mode_idx").on(table.mode, table.capturedAt)],
);

export const readingTimeBuckets = sqliteTable(
  "reading_time_buckets",
  {
    id: text("id").primaryKey(),
    mode: text("mode").notNull(),
    periodBaseTime: integer("period_base_time").notNull().default(0),
    bucketStart: integer("bucket_start").notNull(),
    seconds: integer("seconds").notNull().default(0),
    capturedAt: integer("captured_at").notNull(),
  },
  (table) => [
    uniqueIndex("reading_time_bucket_source_idx").on(table.mode, table.periodBaseTime, table.bucketStart),
    index("reading_time_bucket_start_idx").on(table.bucketStart),
  ],
);

export const syncRuns = sqliteTable(
  "sync_runs",
  {
    id: text("id").primaryKey(),
    source: text("source").notNull(),
    status: text("status").notNull(),
    stage: text("stage").notNull(),
    cursorJson: text("cursor_json").notNull().default("{}"),
    startedAt: integer("started_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
    finishedAt: integer("finished_at"),
    shelfCount: integer("shelf_count").notNull().default(0),
    progressUpdated: integer("progress_updated").notNull().default(0),
    notesUpdated: integer("notes_updated").notNull().default(0),
    statsUpdated: integer("stats_updated").notNull().default(0),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
  },
  (table) => [index("sync_runs_status_idx").on(table.status, table.startedAt)],
);

export const syncLock = sqliteTable("sync_lock", {
  lockKey: text("lock_key").primaryKey(),
  runId: text("run_id").notNull(),
  expiresAt: integer("expires_at").notNull(),
});

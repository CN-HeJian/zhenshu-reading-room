export type WeReadBook = {
  bookId?: string | number;
  title?: string;
  author?: string;
  cover?: string;
  category?: string;
  readUpdateTime?: number;
  finishReading?: number;
  updateTime?: number;
  isTop?: number;
  secret?: number;
};

export type WeReadAlbum = {
  albumInfo?: {
    albumId?: string | number;
    name?: string;
    authorName?: string;
    cover?: string;
    trackCount?: number;
    finishStatus?: string;
    finish?: number;
    intro?: string;
    updateTime?: number;
  };
  albumInfoExtra?: {
    secret?: number;
    lectureReadUpdateTime?: number;
    isTop?: number;
  };
};

export type WeReadShelf = {
  books?: WeReadBook[];
  albums?: WeReadAlbum[];
  mp?: Record<string, unknown> | null;
};

export type WeReadProgress = {
  bookId?: string | number;
  book?: {
    chapterUid?: string | number;
    chapterOffset?: number;
    progress?: number;
    updateTime?: number;
    recordReadingTime?: number;
    finishTime?: number;
    isStartReading?: number;
  };
};

export type NotebookBook = {
  bookId?: string | number;
  book?: WeReadBook;
  reviewCount?: number;
  noteCount?: number;
  bookmarkCount?: number;
  readingProgress?: number;
  markedStatus?: number;
  sort?: number;
};

export type NotebookPage = {
  totalBookCount?: number;
  totalNoteCount?: number;
  hasMore?: number;
  books?: NotebookBook[];
};

export type WeReadHighlight = {
  bookmarkId?: string | number;
  bookId?: string | number;
  chapterUid?: string | number;
  markText?: string;
  createTime?: number;
  range?: string;
  colorStyle?: number;
};

export type HighlightList = {
  updated?: WeReadHighlight[];
  chapters?: Array<{ chapterUid?: string | number; title?: string }>;
};

export type WeReadReview = {
  reviewId?: string | number;
  bookId?: string | number;
  chapterUid?: string | number;
  range?: string;
  content?: string;
  createTime?: number;
  star?: number;
  chapterName?: string;
  isFinish?: number;
};

export type ReviewPage = {
  reviews?: Array<{ review?: WeReadReview } | WeReadReview>;
  totalCount?: number;
  hasMore?: number;
  synckey?: number;
};

export type ReadData = {
  baseTime?: number;
  readTimes?: Record<string, number>;
  dailyReadTimes?: Record<string, number>;
  readDays?: number;
  totalReadTime?: number;
  dayAverageReadTime?: number;
  compare?: number;
  readLongest?: unknown[];
  readStat?: unknown[];
  preferCategory?: unknown[];
  preferTime?: number[];
  preferAuthor?: unknown[];
};

export type ReadDataMode = "weekly" | "monthly" | "annually" | "overall";

export type SyncSource = "manual" | "scheduled" | "catch_up";
export type SyncStatus = "running" | "success" | "partial_success" | "failed";
export type SyncStage = "shelf" | "progress" | "notebooks" | "notes" | "stats" | "complete";

export type SyncWarning = { code: string; message: string };

export type SyncCursor = {
  bookIds?: string[];
  progressIndex?: number;
  notebookBookIds?: string[];
  notesIndex?: number;
  statsIndex?: number;
  warnings?: SyncWarning[];
};

export type SyncRun = {
  id: string;
  source: SyncSource;
  status: SyncStatus;
  stage: SyncStage;
  cursor: SyncCursor;
  startedAt: number;
  updatedAt: number;
  finishedAt: number | null;
  shelfCount: number;
  progressUpdated: number;
  notesUpdated: number;
  statsUpdated: number;
  errorCode: string | null;
  errorMessage: string | null;
};

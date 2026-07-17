import { getRuntimeEnv } from "@/lib/runtime-env";
import { WeReadClient, WeReadError, WeReadUpgradeRequired } from "@/lib/weread/client";
import type { ReadDataMode } from "@/lib/weread/types";
import {
  createOrGetRun,
  finishRun,
  getRun,
  renewLock,
  saveHighlights,
  saveNotebooks,
  saveProgress,
  saveReadData,
  saveReviews,
  saveRun,
  saveShelf,
} from "./repository";
import type { SyncRun, SyncSource, SyncWarning } from "./types";

const PROGRESS_BATCH_SIZE = 8;
const NOTES_BATCH_SIZE = 2;
const STAT_MODES: ReadDataMode[] = ["weekly", "monthly", "annually", "overall"];

function toWarning(error: unknown): SyncWarning {
  if (error instanceof WeReadError) return { code: error.code, message: error.message };
  return { code: "unexpected_error", message: "同步过程中发生未知错误。" };
}

function appendWarning(run: SyncRun, warning: SyncWarning): void {
  run.cursor.warnings = [...(run.cursor.warnings ?? []), warning].slice(-50);
}

async function withRetry<T>(operation: () => Promise<T>): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (!(error instanceof WeReadError) || !error.retryable || attempt === 2) throw error;
      await new Promise((resolve) => setTimeout(resolve, 250 * (2 ** attempt)));
    }
  }
  throw lastError;
}

function createClient(): WeReadClient {
  return new WeReadClient(getRuntimeEnv().WEREAD_API_KEY ?? "");
}

export function startSync(source: SyncSource): Promise<SyncRun> {
  return createOrGetRun(source);
}

export async function continueSync(runId: string): Promise<SyncRun> {
  const run = await getRun(runId);
  if (!run) throw new Error("同步任务不存在。");
  if (run.status !== "running") return run;
  if (!(await renewLock(run.id))) {
    return finishRun(run, "failed", "lost_lock", "同步任务已失去执行锁，请重新开始同步。");
  }

  try {
    const client = createClient();
    run.updatedAt = Date.now();

    if (run.stage === "shelf") {
      const shelf = await withRetry(() => client.fetchShelf());
      const saved = await saveShelf(shelf);
      run.shelfCount = saved.count;
      run.cursor = { bookIds: saved.bookIds, progressIndex: 0, warnings: run.cursor.warnings ?? [] };
      run.stage = "progress";
      await saveRun(run);
      return run;
    }

    if (run.stage === "progress") {
      const bookIds = run.cursor.bookIds ?? [];
      const start = run.cursor.progressIndex ?? 0;
      const chunk = bookIds.slice(start, start + PROGRESS_BATCH_SIZE);
      for (const bookId of chunk) {
        try {
          const progress = await withRetry(() => client.fetchProgress(bookId));
          if (await saveProgress(bookId, progress)) run.progressUpdated += 1;
        } catch (error) {
          if (error instanceof WeReadUpgradeRequired) throw error;
          appendWarning(run, toWarning(error));
        }
      }
      run.cursor.progressIndex = start + chunk.length;
      if (run.cursor.progressIndex >= bookIds.length) run.stage = "notebooks";
      await saveRun(run);
      return run;
    }

    if (run.stage === "notebooks") {
      try {
        const notebooks = await withRetry(() => client.fetchAllNotebooks());
        run.cursor.notebookBookIds = await saveNotebooks(notebooks);
        run.cursor.notesIndex = 0;
        run.stage = "notes";
      } catch (error) {
        if (error instanceof WeReadUpgradeRequired) throw error;
        appendWarning(run, toWarning(error));
        run.cursor.notebookBookIds = [];
        run.cursor.notesIndex = 0;
        run.stage = "stats";
      }
      await saveRun(run);
      return run;
    }

    if (run.stage === "notes") {
      const bookIds = run.cursor.notebookBookIds ?? [];
      const start = run.cursor.notesIndex ?? 0;
      const chunk = bookIds.slice(start, start + NOTES_BATCH_SIZE);
      for (const bookId of chunk) {
        const [highlightResult, reviewResult] = await Promise.allSettled([
          withRetry(() => client.fetchHighlights(bookId)),
          withRetry(() => client.fetchAllReviews(bookId)),
        ]);
        if (highlightResult.status === "fulfilled") {
          run.notesUpdated += await saveHighlights(bookId, highlightResult.value);
        } else {
          if (highlightResult.reason instanceof WeReadUpgradeRequired) throw highlightResult.reason;
          appendWarning(run, toWarning(highlightResult.reason));
        }
        if (reviewResult.status === "fulfilled") {
          run.notesUpdated += await saveReviews(bookId, reviewResult.value);
        } else {
          if (reviewResult.reason instanceof WeReadUpgradeRequired) throw reviewResult.reason;
          appendWarning(run, toWarning(reviewResult.reason));
        }
      }
      run.cursor.notesIndex = start + chunk.length;
      if (run.cursor.notesIndex >= bookIds.length) {
        run.cursor.statsIndex = 0;
        run.stage = "stats";
      }
      await saveRun(run);
      return run;
    }

    if (run.stage === "stats") {
      const index = run.cursor.statsIndex ?? 0;
      const mode = STAT_MODES[index];
      if (mode) {
        try {
          const data = await withRetry(() => client.fetchReadData(mode));
          await saveReadData(mode, data);
          run.statsUpdated += 1;
        } catch (error) {
          if (error instanceof WeReadUpgradeRequired) throw error;
          appendWarning(run, toWarning(error));
        }
        run.cursor.statsIndex = index + 1;
        await saveRun(run);
        return run;
      }

      const warnings = run.cursor.warnings ?? [];
      return finishRun(
        run,
        warnings.length ? "partial_success" : "success",
        warnings.length ? "partial_sync" : null,
        warnings.length ? `${warnings.length} 项内容暂未同步，旧数据已保留。` : null,
      );
    }

    return finishRun(run, "success");
  } catch (error) {
    const warning = toWarning(error);
    return finishRun(run, "failed", warning.code, warning.message);
  }
}

export function publicSyncRun(run: SyncRun) {
  const totalProgress = run.cursor.bookIds?.length ?? 0;
  const completedProgress = Math.min(run.cursor.progressIndex ?? 0, totalProgress);
  const totalNotes = run.cursor.notebookBookIds?.length ?? 0;
  const completedNotes = Math.min(run.cursor.notesIndex ?? 0, totalNotes);
  return {
    id: run.id,
    source: run.source,
    status: run.status,
    stage: run.stage,
    startedAt: run.startedAt,
    updatedAt: run.updatedAt,
    finishedAt: run.finishedAt,
    shelfCount: run.shelfCount,
    progressUpdated: run.progressUpdated,
    notesUpdated: run.notesUpdated,
    statsUpdated: run.statsUpdated,
    errorCode: run.errorCode,
    errorMessage: run.errorMessage,
    progress: {
      books: { completed: completedProgress, total: totalProgress },
      notebooks: { completed: completedNotes, total: totalNotes },
      stats: { completed: Math.min(run.cursor.statsIndex ?? 0, STAT_MODES.length), total: STAT_MODES.length },
    },
  };
}

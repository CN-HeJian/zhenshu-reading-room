import { buildGatewayBody, WEREAD_GATEWAY_URL } from "./core.mjs";
import type {
  HighlightList,
  NotebookBook,
  NotebookPage,
  ReadData,
  ReadDataMode,
  ReviewPage,
  WeReadProgress,
  WeReadReview,
  WeReadShelf,
} from "./types";

type Fetcher = typeof fetch;
type GatewayResponse<T> = T & {
  errcode?: number;
  errmsg?: string;
  upgrade_info?: { message?: string } | string;
};

export class WeReadError extends Error {
  public readonly code: string;
  public readonly retryable: boolean;

  constructor(
    message: string,
    code: string,
    retryable = false,
  ) {
    super(message);
    this.name = "WeReadError";
    this.code = code;
    this.retryable = retryable;
  }
}

export class WeReadUpgradeRequired extends WeReadError {
  constructor(message: string) {
    super(message, "upgrade_required", false);
    this.name = "WeReadUpgradeRequired";
  }
}

export class WeReadClient {
  private readonly apiKey: string;
  private readonly fetcher: Fetcher;

  constructor(
    apiKey: string,
    fetcher: Fetcher = fetch,
  ) {
    if (!apiKey) throw new WeReadError("微信读书 API Key 尚未配置。", "missing_api_key");
    this.apiKey = apiKey;
    this.fetcher = fetcher;
  }

  private async call<T>(apiName: string, params: Record<string, unknown> = {}): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20_000);

    try {
      const response = await this.fetcher(WEREAD_GATEWAY_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(buildGatewayBody(apiName, params)),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new WeReadError(
          response.status === 429 ? "微信读书请求过于频繁，请稍后重试。" : "微信读书服务暂时不可用。",
          `http_${response.status}`,
          response.status === 429 || response.status >= 500,
        );
      }

      const payload = (await response.json()) as GatewayResponse<T>;
      if (payload.upgrade_info) {
        const message = typeof payload.upgrade_info === "string"
          ? payload.upgrade_info
          : payload.upgrade_info.message;
        throw new WeReadUpgradeRequired(message || "微信读书 skill 需要升级后才能继续同步。");
      }
      if (payload.errcode && payload.errcode !== 0) {
        throw new WeReadError(payload.errmsg || "微信读书返回了错误。", `weread_${payload.errcode}`);
      }
      return payload;
    } catch (error) {
      if (error instanceof WeReadError) throw error;
      if (error instanceof DOMException && error.name === "AbortError") {
        throw new WeReadError("微信读书请求超时，请稍后重试。", "timeout", true);
      }
      throw new WeReadError("无法连接微信读书服务。", "network_error", true);
    } finally {
      clearTimeout(timer);
    }
  }

  fetchShelf(): Promise<WeReadShelf> {
    return this.call<WeReadShelf>("/shelf/sync");
  }

  fetchProgress(bookId: string): Promise<WeReadProgress> {
    return this.call<WeReadProgress>("/book/getprogress", { bookId });
  }

  async fetchAllNotebooks(): Promise<NotebookBook[]> {
    const results: NotebookBook[] = [];
    let lastSort: number | undefined;

    for (let pageNumber = 0; pageNumber < 100; pageNumber += 1) {
      const page = await this.call<NotebookPage>("/user/notebooks", {
        count: 100,
        ...(lastSort === undefined ? {} : { lastSort }),
      });
      const books = page.books ?? [];
      results.push(...books);
      if (!page.hasMore) return results;
      const nextSort = books.at(-1)?.sort;
      if (nextSort === undefined || nextSort === lastSort) {
        throw new WeReadError("笔记分页游标没有前进，已停止同步以避免重复。", "stalled_notebooks_cursor");
      }
      lastSort = nextSort;
    }

    throw new WeReadError("笔记分页超过安全上限。", "notebooks_page_limit");
  }

  fetchHighlights(bookId: string): Promise<HighlightList> {
    return this.call<HighlightList>("/book/bookmarklist", { bookId });
  }

  async fetchAllReviews(bookId: string): Promise<WeReadReview[]> {
    const results: WeReadReview[] = [];
    let synckey = 0;

    for (let pageNumber = 0; pageNumber < 100; pageNumber += 1) {
      const page = await this.call<ReviewPage>("/review/list/mine", { bookid: bookId, synckey, count: 100 });
      for (const item of page.reviews ?? []) {
        const nestedReview = (item as { review?: WeReadReview }).review;
        results.push(nestedReview ?? (item as WeReadReview));
      }
      if (!page.hasMore) return results;
      const nextSynckey = Number(page.synckey ?? 0);
      if (!nextSynckey || nextSynckey === synckey) {
        throw new WeReadError("想法分页游标没有前进，已停止同步以避免重复。", "stalled_reviews_cursor");
      }
      synckey = nextSynckey;
    }

    throw new WeReadError("想法分页超过安全上限。", "reviews_page_limit");
  }

  fetchReadData(mode: ReadDataMode): Promise<ReadData> {
    return this.call<ReadData>("/readdata/detail", { mode, baseTime: 0 });
  }
}

const REPOSITORY = "CN-HeJian/zhenshu-reading-room";
const WORKFLOW = "weread-sync.yml";
const REF = "main";
const COOLDOWN_MS = 5 * 60 * 1000;
const STATUS_LOOKBACK_MS = 5 * 1000;

class SyncError extends Error {
  constructor(code, message, status = 502) {
    super(message);
    this.name = "SyncError";
    this.code = code;
    this.status = status;
  }
}

function headersFor(origin, env) {
  const headers = {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    Vary: "Origin",
  };
  if (origin && origin === env.ALLOWED_ORIGIN) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Access-Control-Allow-Headers"] = "Content-Type, X-Sync-Key";
    headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS";
    headers["Access-Control-Max-Age"] = "600";
  }
  return headers;
}

function jsonResponse(body, status, origin, env) {
  return new Response(JSON.stringify(body), {
    status,
    headers: headersFor(origin, env),
  });
}

function safeEqual(left, right) {
  const first = new TextEncoder().encode(String(left ?? ""));
  const second = new TextEncoder().encode(String(right ?? ""));
  const length = Math.max(first.length, second.length);
  let difference = first.length ^ second.length;
  for (let index = 0; index < length; index += 1) {
    difference |= (first[index] ?? 0) ^ (second[index] ?? 0);
  }
  return difference === 0;
}

function assertOrigin(request, env) {
  const origin = request.headers.get("Origin");
  if (!origin || !env.ALLOWED_ORIGIN || origin !== env.ALLOWED_ORIGIN) {
    throw new SyncError("origin_not_allowed", "当前页面来源未被允许。", 403);
  }
  return origin;
}

function assertKey(request, env) {
  if (!env.SYNC_TRIGGER_KEY || !safeEqual(request.headers.get("X-Sync-Key"), env.SYNC_TRIGGER_KEY)) {
    throw new SyncError("invalid_sync_key", "同步口令不正确。", 403);
  }
}

async function githubRequest(path, env, init = {}) {
  if (!env.GITHUB_ACTIONS_TOKEN) throw new SyncError("github_token_missing", "同步服务尚未配置。", 503);
  const response = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${env.GITHUB_ACTIONS_TOKEN}`,
      "X-GitHub-Api-Version": "2022-11-28",
      ...(init.headers ?? {}),
    },
  });
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new SyncError("github_auth_failed", "同步服务暂时无法连接 GitHub。", 502);
    }
    if (response.status === 429) {
      throw new SyncError("github_rate_limited", "GitHub 请求过于频繁，请稍后再试。", 429);
    }
    throw new SyncError("github_api_error", "GitHub 暂时无法接受同步请求。", 502);
  }
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    throw new SyncError("github_invalid_response", "同步服务收到无效响应。", 502);
  }
}

async function listRuns(env) {
  const payload = await githubRequest(
    `/repos/${REPOSITORY}/actions/workflows/${WORKFLOW}/runs?per_page=20`,
    env,
  );
  return Array.isArray(payload?.workflow_runs) ? payload.workflow_runs : [];
}

function activeRun(runs) {
  return runs
    .filter((run) => run.status !== "completed")
    .sort((left, right) => Date.parse(right.created_at ?? 0) - Date.parse(left.created_at ?? 0))[0] ?? null;
}

function recentSuccessfulRun(runs, now = Date.now()) {
  return runs.find((run) => run.status === "completed" && run.conclusion === "success"
    && now - Date.parse(run.updated_at ?? 0) < COOLDOWN_MS) ?? null;
}

function runAfter(runs, after) {
  const afterMs = Date.parse(after) - STATUS_LOOKBACK_MS;
  return runs
    .filter((run) => Date.parse(run.created_at ?? 0) >= afterMs)
    .sort((left, right) => Date.parse(right.created_at ?? 0) - Date.parse(left.created_at ?? 0))[0] ?? null;
}

function publicRunStatus(run) {
  if (!run) return { status: "waiting" };
  if (run.status !== "completed") {
    return { status: "running", runId: run.id, updatedAt: run.updated_at ?? run.created_at };
  }
  if (run.conclusion === "success") {
    return { status: "success", runId: run.id, updatedAt: run.updated_at ?? run.created_at };
  }
  return {
    status: "failure",
    runId: run.id,
    updatedAt: run.updated_at ?? run.created_at,
    errorCode: `workflow_${run.conclusion ?? "failed"}`,
    message: "同步没有完成，原有数据仍然保留。",
  };
}

function errorResponse(error, origin, env) {
  const syncError = error instanceof SyncError
    ? error
    : new SyncError("sync_service_error", "同步服务暂时不可用。", 502);
  return jsonResponse({ status: "failure", errorCode: syncError.code, message: syncError.message }, syncError.status, origin, env);
}

async function startSync(request, origin, env) {
  assertKey(request, env);
  const runs = await listRuns(env);
  const running = activeRun(runs);
  if (running) {
    return jsonResponse({ status: "accepted", acceptedAt: running.created_at, runId: running.id, reused: true }, 200, origin, env);
  }
  if (recentSuccessfulRun(runs)) {
    throw new SyncError("cooldown", "刚刚已经同步过，请稍后再试。", 429);
  }

  const acceptedAt = new Date().toISOString();
  await githubRequest(`/repos/${REPOSITORY}/actions/workflows/${WORKFLOW}/dispatches`, env, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ref: REF }),
  });
  return jsonResponse({ status: "accepted", acceptedAt, reused: false }, 202, origin, env);
}

async function statusSync(request, origin, env, url) {
  assertKey(request, env);
  const after = url.searchParams.get("after");
  if (!after || !Number.isFinite(Date.parse(after))) {
    throw new SyncError("invalid_after", "同步状态参数无效。", 400);
  }
  return jsonResponse(publicRunStatus(runAfter(await listRuns(env), after)), 200, origin, env);
}

const worker = {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin");

    if (request.method === "OPTIONS") {
      try {
        assertOrigin(request, env);
        return new Response(null, { status: 204, headers: headersFor(origin, env) });
      } catch (error) {
        return errorResponse(error, origin, env);
      }
    }

    try {
      const allowedOrigin = assertOrigin(request, env);
      if (url.pathname === "/sync/start" && request.method === "POST") return await startSync(request, allowedOrigin, env);
      if (url.pathname === "/sync/status" && request.method === "GET") return await statusSync(request, allowedOrigin, env, url);
      return jsonResponse({ status: "failure", errorCode: "not_found", message: "同步服务地址不存在。" }, 404, allowedOrigin, env);
    } catch (error) {
      return errorResponse(error, origin, env);
    }
  },
};

export default worker;
export { safeEqual };

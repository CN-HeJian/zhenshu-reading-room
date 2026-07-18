const TERMINAL_STATUSES = new Set(["success", "partial_success", "failed"]);
const RETRY_STATUSES = new Set([429, 502, 503, 504]);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function redact(message) {
  return String(message ?? "").replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [redacted]");
}

async function readJson(response) {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { error: `非 JSON 响应：${text.slice(0, 120)}` };
  }
}

async function requestJson({ fetchImpl, url, token, body, maxAttempts }) {
  let lastPayload = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const response = await fetchImpl(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(body ?? {}),
    });
    const payload = await readJson(response);
    if (response.ok) return payload;

    lastPayload = payload;
    if (!RETRY_STATUSES.has(response.status) || attempt === maxAttempts) {
      const safeError = redact(payload.error ?? payload.message ?? response.statusText);
      throw new Error(`HTTP ${response.status}: ${safeError}`);
    }
    await sleep(500 * (2 ** (attempt - 1)));
  }
  throw new Error(redact(lastPayload?.error ?? "请求失败。"));
}

function summarize(run) {
  return [
    `run=${run.id ?? "unknown"}`,
    `status=${run.status ?? "unknown"}`,
    `stage=${run.stage ?? "unknown"}`,
    `shelf=${run.shelfCount ?? 0}`,
    `progress=${run.progressUpdated ?? 0}`,
    `notes=${run.notesUpdated ?? 0}`,
    `stats=${run.statsUpdated ?? 0}`,
    run.errorCode ? `error=${run.errorCode}` : null,
  ].filter(Boolean).join(" ");
}

export async function runScheduledSync({
  baseUrl,
  token,
  fetchImpl = fetch,
  maxSteps = 80,
  maxAttempts = 3,
  log = console.log,
} = {}) {
  if (!baseUrl) throw new Error("SITES_BASE_URL 未配置。");
  if (!token) throw new Error("SYNC_AUTOMATION_TOKEN 未配置。");

  const normalizedBaseUrl = baseUrl.replace(/\/+$/, "");
  let run = await requestJson({
    fetchImpl,
    url: `${normalizedBaseUrl}/api/sync`,
    token,
    body: { source: "scheduled" },
    maxAttempts,
  });
  log(`started ${summarize(run)}`);

  for (let step = 0; step < maxSteps && !TERMINAL_STATUSES.has(run.status); step += 1) {
    run = await requestJson({
      fetchImpl,
      url: `${normalizedBaseUrl}/api/sync/${encodeURIComponent(run.id)}/continue`,
      token,
      maxAttempts,
    });
    log(`continued ${summarize(run)}`);
  }

  if (!TERMINAL_STATUSES.has(run.status)) {
    throw new Error(`同步超过执行上限仍未完成：${summarize(run)}`);
  }
  if (run.status === "failed") {
    throw new Error(`同步失败：${summarize(run)}`);
  }

  log(`finished ${summarize(run)}`);
  return run;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runScheduledSync({
    baseUrl: process.env.SITES_BASE_URL,
    token: process.env.SYNC_AUTOMATION_TOKEN,
  }).catch((error) => {
    console.error(redact(error?.message ?? error));
    process.exitCode = 1;
  });
}

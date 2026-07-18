import assert from "node:assert/strict";
import test from "node:test";
import worker from "../sync-worker/src/index.mjs";

const env = {
  GITHUB_ACTIONS_TOKEN: "github-token",
  SYNC_TRIGGER_KEY: "sync-secret",
  ALLOWED_ORIGIN: "https://cn-hejian.github.io",
};

function request(path, { method = "GET", key = "sync-secret", origin = env.ALLOWED_ORIGIN } = {}) {
  const headers = new Headers({ Origin: origin });
  if (key !== null) headers.set("X-Sync-Key", key);
  return new Request(`https://trigger.example${path}`, { method, headers });
}

async function withGithubFetch(handler, operation) {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    return handler(String(url), init);
  };
  try {
    return await operation(calls);
  } finally {
    globalThis.fetch = originalFetch;
  }
}

function jsonResponse(value, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json" } });
}

test("accepts a correct page origin and key and dispatches only the fixed workflow", async () => {
  const result = await withGithubFetch(async (url, init) => {
    if (url.includes("/runs?")) return jsonResponse({ workflow_runs: [] });
    assert.match(url, /repos\/CN-HeJian\/zhenshu-reading-room\/actions\/workflows\/weread-sync\.yml\/dispatches$/);
    assert.equal(init.method, "POST");
    assert.deepEqual(JSON.parse(init.body), { ref: "main" });
    return new Response(null, { status: 204 });
  }, async (calls) => {
    const response = await worker.fetch(request("/sync/start", { method: "POST" }), env);
    assert.equal(response.status, 202);
    assert.equal((await response.json()).status, "accepted");
    assert.equal(calls.length, 2);
    return response;
  });
  assert.equal(result.status, 202);
});

test("rejects a wrong origin or key before calling GitHub", async () => {
  await withGithubFetch(async () => {
    throw new Error("GitHub should not be called");
  }, async () => {
    const wrongOrigin = await worker.fetch(request("/sync/start", { method: "POST", origin: "https://evil.example" }), env);
    assert.equal(wrongOrigin.status, 403);
    const wrongKey = await worker.fetch(request("/sync/start", { method: "POST", key: "wrong" }), env);
    assert.equal(wrongKey.status, 403);
  });
});

test("maps running and successful workflow states without exposing logs", async () => {
  const acceptedAt = "2026-07-18T12:00:00.000Z";
  const runs = {
    workflow_runs: [{ id: 42, created_at: acceptedAt, updated_at: acceptedAt, status: "in_progress", conclusion: null }],
  };
  await withGithubFetch(async () => jsonResponse(runs), async () => {
    const response = await worker.fetch(request(`/sync/status?after=${encodeURIComponent(acceptedAt)}`), env);
    assert.deepEqual(await response.json(), { status: "running", runId: 42, updatedAt: acceptedAt });
  });

  runs.workflow_runs[0].status = "completed";
  runs.workflow_runs[0].conclusion = "success";
  await withGithubFetch(async () => jsonResponse(runs), async () => {
    const response = await worker.fetch(request(`/sync/status?after=${encodeURIComponent(acceptedAt)}`), env);
    assert.deepEqual(await response.json(), { status: "success", runId: 42, updatedAt: acceptedAt });
  });
});

test("reuses an active run and enforces the short success cooldown", async () => {
  const now = new Date().toISOString();
  const active = { id: 7, created_at: now, updated_at: now, status: "queued", conclusion: null };
  await withGithubFetch(async () => jsonResponse({ workflow_runs: [active] }), async () => {
    const response = await worker.fetch(request("/sync/start", { method: "POST" }), env);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).reused, true);
  });

  const recentSuccess = { id: 8, created_at: now, updated_at: now, status: "completed", conclusion: "success" };
  await withGithubFetch(async () => jsonResponse({ workflow_runs: [recentSuccess] }), async () => {
    const response = await worker.fetch(request("/sync/start", { method: "POST" }), env);
    assert.equal(response.status, 429);
    assert.equal((await response.json()).errorCode, "cooldown");
  });
});

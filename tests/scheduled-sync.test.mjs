import assert from "node:assert/strict";
import test from "node:test";
import { runScheduledSync } from "../scripts/run-weread-sync.mjs";

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

test("runs the scheduled sync to a successful terminal state", async () => {
  const calls = [];
  const responses = [
    { id: "run-1", status: "running", stage: "shelf" },
    { id: "run-1", status: "running", stage: "progress", shelfCount: 2 },
    { id: "run-1", status: "success", stage: "complete", shelfCount: 2, progressUpdated: 1 },
  ];
  const result = await runScheduledSync({
    baseUrl: "https://site.test/",
    token: "scheduled-secret",
    fetchImpl: async (url, init) => {
      calls.push({ url, init, body: init.body ? JSON.parse(String(init.body)) : null });
      return jsonResponse(responses.shift());
    },
    log: () => {},
  });

  assert.equal(result.status, "success");
  assert.equal(calls[0].url, "https://site.test/api/sync");
  assert.deepEqual(calls[0].body, { source: "scheduled" });
  assert.equal(calls[0].init.headers.Authorization, "Bearer scheduled-secret");
  assert.equal(calls[1].url, "https://site.test/api/sync/run-1/continue");
});

test("treats partial success as a completed run", async () => {
  const result = await runScheduledSync({
    baseUrl: "https://site.test",
    token: "scheduled-secret",
    fetchImpl: async () => jsonResponse({ id: "run-1", status: "partial_success", stage: "complete" }),
    log: () => {},
  });
  assert.equal(result.status, "partial_success");
});

test("retries retryable HTTP failures before continuing", async () => {
  let attempts = 0;
  const result = await runScheduledSync({
    baseUrl: "https://site.test",
    token: "scheduled-secret",
    fetchImpl: async () => {
      attempts += 1;
      if (attempts === 1) return jsonResponse({ error: "temporary" }, 503);
      return jsonResponse({ id: "run-1", status: "success", stage: "complete" });
    },
    log: () => {},
    maxAttempts: 2,
  });
  assert.equal(result.status, "success");
  assert.equal(attempts, 2);
});

test("fails when the terminal sync status is failed", async () => {
  await assert.rejects(() => runScheduledSync({
    baseUrl: "https://site.test",
    token: "scheduled-secret",
    fetchImpl: async () => jsonResponse({
      id: "run-1",
      status: "failed",
      stage: "complete",
      errorCode: "upgrade_required",
    }),
    log: () => {},
  }), /同步失败/);
});

test("fails when the run does not reach a terminal state", async () => {
  await assert.rejects(() => runScheduledSync({
    baseUrl: "https://site.test",
    token: "scheduled-secret",
    fetchImpl: async () => jsonResponse({ id: "run-1", status: "running", stage: "progress" }),
    log: () => {},
    maxSteps: 1,
  }), /超过执行上限/);
});

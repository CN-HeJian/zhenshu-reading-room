import assert from "node:assert/strict";
import test from "node:test";
import {
  bearerTokenFromRequest,
  isAutomationRequest,
  isOwnerEmail,
  timingSafeEqualString,
} from "../lib/sync/auth-core.ts";

test("matches owner email case-insensitively after trimming", () => {
  assert.equal(isOwnerEmail(" 2277075501@QQ.COM ", "2277075501@qq.com"), true);
  assert.equal(isOwnerEmail("reader@example.com", "2277075501@qq.com"), false);
  assert.equal(isOwnerEmail("", "2277075501@qq.com"), false);
});

test("extracts bearer tokens and rejects non-bearer authorization", () => {
  assert.equal(bearerTokenFromRequest(new Request("https://site.test", {
    headers: { Authorization: "Bearer secret-token" },
  })), "secret-token");
  assert.equal(bearerTokenFromRequest(new Request("https://site.test", {
    headers: { Authorization: "Basic secret-token" },
  })), "");
});

test("compares automation tokens without accepting missing or wrong values", () => {
  const request = new Request("https://site.test", {
    headers: { Authorization: "Bearer scheduled-secret" },
  });
  assert.equal(isAutomationRequest(request, "scheduled-secret"), true);
  assert.equal(isAutomationRequest(request, "wrong-secret"), false);
  assert.equal(isAutomationRequest(request, ""), false);
  assert.equal(timingSafeEqualString("abc", "abc"), true);
  assert.equal(timingSafeEqualString("abc", "abcd"), false);
});

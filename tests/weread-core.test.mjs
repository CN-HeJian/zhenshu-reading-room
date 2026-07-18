import assert from "node:assert/strict";
import test from "node:test";
import {
  asDeepLink,
  buildGatewayBody,
  clampProgress,
  formatDate,
  formatDuration,
  latestScheduledAt,
  needsCatchUp,
  totalNotebookNotes,
  visibleShelfCount,
} from "../lib/weread/core.mjs";

test("builds gateway payloads with flat parameters and the installed skill version", () => {
  assert.deepEqual(buildGatewayBody("/user/notebooks", { count: 100, lastSort: 123 }), {
    api_name: "/user/notebooks",
    count: 100,
    lastSort: 123,
    skill_version: "1.0.4",
  });
});

test("counts every visible shelf entry", () => {
  assert.equal(visibleShelfCount({ books: [{}, {}], albums: [{}], mp: {} }), 4);
  assert.equal(visibleShelfCount({ books: [], albums: [], mp: null }), 0);
});

test("uses the documented note count and progress rules", () => {
  assert.equal(totalNotebookNotes({ reviewCount: 4, noteCount: 7, bookmarkCount: 2 }), 13);
  assert.equal(clampProgress(1), 1);
  assert.equal(clampProgress(101), 100);
});

test("formats seconds and timestamps for the Chinese UI", () => {
  assert.equal(formatDuration(3_660), "1小时1分钟");
  assert.equal(formatDuration(59), "0分钟");
  assert.equal(formatDate(1_748_563_200), "2025-05-30");
});

test("uses only deep links returned by the API", () => {
  assert.equal(asDeepLink("weread://official-link"), "weread://official-link");
  assert.equal(asDeepLink(""), null);
  assert.equal(asDeepLink(undefined), null);
});

test("calculates the latest 23:30 Asia/Shanghai schedule and catch-up state", () => {
  const before = Date.parse("2026-07-17T14:00:00.000Z");
  const after = Date.parse("2026-07-17T16:00:00.000Z");
  assert.equal(latestScheduledAt(before), Date.parse("2026-07-16T15:30:00.000Z"));
  assert.equal(latestScheduledAt(after), Date.parse("2026-07-17T15:30:00.000Z"));
  assert.equal(needsCatchUp(Date.parse("2026-07-17T15:00:00.000Z") / 1000, after), true);
  assert.equal(needsCatchUp(Date.parse("2026-07-17T15:45:00.000Z") / 1000, after), false);
});

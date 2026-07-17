import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

test("the validated build contains the real reading room without demo content", async () => {
  const [room, layout, worker] = await Promise.all([
    readFile(new URL("../app/reading-room.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../dist/server/index.js", import.meta.url), "utf8"),
    access(new URL("../public/og.png", import.meta.url)),
  ]);
  assert.match(layout, /枕书｜我的阅读札记/);
  assert.match(room, /书页之间/);
  assert.match(room, /立即同步/);
  assert.match(room, /READING FOOTPRINT/);
  assert.doesNotMatch(room, /我与地坛|悉达多|暂无可直接连接微信读书/);
  assert.doesNotMatch(room + layout, /codex-preview|react-loading-skeleton/);
  assert.match(worker, /api\/sync/);
});

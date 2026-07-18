import assert from "node:assert/strict";
import test from "node:test";
import { buildGatewayBody } from "../lib/weread/core.mjs";
import { WeReadExporter } from "../scripts/export-weread-data.mjs";

function jsonResponse(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

test("exports complete current WeRead data for GitHub Pages", async () => {
  const bodies = [];
  const responses = new Map([
    ["/shelf/sync", {
      books: [{ bookId: "b1", title: "山月记", author: "中岛敦", cover: "https://img.test/cover.jpg", readUpdateTime: 10 }],
      albums: [{ albumInfo: { albumId: "a1", name: "文学声音", authorName: "主播", finish: 0 }, albumInfoExtra: { lectureReadUpdateTime: 8 } }],
      mp: {},
    }],
    ["/book/getprogress", { book: { progress: 37, recordReadingTime: 3660, chapterUid: 7, chapterOffset: 42 } }],
    ["/user/notebooks", {
      hasMore: 0,
      books: [{ bookId: "b1", book: { bookId: "b1", title: "山月记", author: "中岛敦" }, reviewCount: 1, noteCount: 1, bookmarkCount: 2, readingProgress: 37 }],
    }],
    ["/book/bookmarklist", {
      chapters: [{ chapterUid: 7, title: "文字祈祷" }],
      updated: [{ bookmarkId: "h1", bookId: "b1", chapterUid: 7, markText: "人生是一场误读。", createTime: 1_700_000_000, range: "1-9" }],
    }],
    ["/review/list/mine", {
      hasMore: 0,
      reviews: [{ review: { reviewId: "r1", bookId: "b1", content: "这一段留住。", createTime: 1_700_000_100, chapterName: "文字祈祷" } }],
    }],
  ]);
  for (const mode of ["weekly", "monthly", "annually", "overall"]) {
    responses.set(`/readdata/detail:${mode}`, {
      totalReadTime: mode === "overall" ? 7200 : 600,
      readDays: 2,
      dayAverageReadTime: 300,
      compare: 1000,
      readLongest: [{ book: { title: "山月记" } }],
    });
  }

  const exporter = new WeReadExporter("wrk-test", async (_url, init) => {
    const body = JSON.parse(String(init.body));
    bodies.push(body);
    if (body.api_name === "/readdata/detail") return jsonResponse(responses.get(`${body.api_name}:${body.mode}`));
    return jsonResponse(responses.get(body.api_name));
  });

  const data = await exporter.exportData(new Date("2026-07-18T15:30:00.000Z"));
  assert.equal(data.summary.shelfCount, 3);
  assert.equal(data.summary.progressCount, 1);
  assert.equal(data.summary.noteCount, 4);
  assert.equal(data.summary.highlightCount, 1);
  assert.equal(data.summary.reviewCount, 1);
  assert.equal(data.summary.bookmarkCount, 2);
  assert.equal(data.summary.overallSeconds, 7200);
  assert.equal(data.books.length, 3);
  assert.equal(data.books[0].progress, 37);
  assert.equal(data.notes.length, 2);
  assert.equal(data.stats.weekly.topTitle, "山月记");
  assert.deepEqual(bodies[0], buildGatewayBody("/shelf/sync"));
  assert.equal(bodies.every((body) => body.skill_version === "1.0.3"), true);
  assert.equal(bodies.find((body) => body.api_name === "/user/notebooks").count, 100);
  assert.equal(bodies.find((body) => body.api_name === "/review/list/mine").synckey, 0);
});

test("stops on WeRead skill upgrade before exporting partial data", async () => {
  const exporter = new WeReadExporter("wrk-test", async () => jsonResponse({
    upgrade_info: { message: "请升级微信读书 skill" },
  }));
  await assert.rejects(() => exporter.exportData(), /升级/);
});

import assert from "node:assert/strict";
import test from "node:test";
import { WeReadClient, WeReadUpgradeRequired } from "../lib/weread/client.ts";

function jsonResponse(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

test("sends authorization and flat gateway parameters", async () => {
  let captured;
  const client = new WeReadClient("wrk-test", async (url, init) => {
    captured = { url, init, body: JSON.parse(String(init?.body)) };
    return jsonResponse({ bookId: "1", book: { progress: 1 } });
  });
  const result = await client.fetchProgress("1");
  assert.equal(result.book?.progress, 1);
  assert.equal(captured.url, "https://i.weread.qq.com/api/agent/gateway");
  assert.equal(captured.init.headers.Authorization, "Bearer wrk-test");
  assert.deepEqual(captured.body, {
    api_name: "/book/getprogress",
    bookId: "1",
    skill_version: "1.0.4",
  });
  assert.equal("params" in captured.body, false);
});

test("follows notebook lastSort pagination without offset parameters", async () => {
  const bodies = [];
  const responses = [
    { hasMore: 1, books: [{ bookId: "1", sort: 99 }] },
    { hasMore: 0, books: [{ bookId: "2", sort: 88 }] },
  ];
  const client = new WeReadClient("wrk-test", async (_url, init) => {
    bodies.push(JSON.parse(String(init?.body)));
    return jsonResponse(responses.shift());
  });
  const books = await client.fetchAllNotebooks();
  assert.deepEqual(books.map((book) => book.bookId), ["1", "2"]);
  assert.equal(bodies[0].count, 100);
  assert.equal(bodies[0].lastSort, undefined);
  assert.equal(bodies[1].lastSort, 99);
  assert.equal("offset" in bodies[1], false);
});

test("follows review synckey pagination", async () => {
  const bodies = [];
  const responses = [
    { hasMore: 1, synckey: 42, reviews: [{ review: { reviewId: "r1", content: "一" } }] },
    { hasMore: 0, synckey: 43, reviews: [{ review: { reviewId: "r2", content: "二" } }] },
  ];
  const client = new WeReadClient("wrk-test", async (_url, init) => {
    bodies.push(JSON.parse(String(init?.body)));
    return jsonResponse(responses.shift());
  });
  const reviews = await client.fetchAllReviews("book-1");
  assert.deepEqual(reviews.map((review) => review.reviewId), ["r1", "r2"]);
  assert.equal(bodies[0].bookid, "book-1");
  assert.equal(bodies[0].synckey, 0);
  assert.equal(bodies[1].synckey, 42);
});

test("stops immediately when the gateway requires a skill upgrade", async () => {
  const client = new WeReadClient("wrk-test", async () => jsonResponse({
    upgrade_info: { message: "请升级微信读书 skill" },
  }));
  await assert.rejects(() => client.fetchShelf(), (error) => {
    assert.ok(error instanceof WeReadUpgradeRequired);
    assert.equal(error.code, "upgrade_required");
    assert.match(error.message, /升级/);
    return true;
  });
});

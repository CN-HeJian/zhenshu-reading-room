import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("ships the durable sync schema", async () => {
  const sql = await readFile(new URL("../drizzle/0000_useful_maginty.sql", import.meta.url), "utf8");
  for (const table of [
    "shelf_items",
    "reading_progress_current",
    "reading_progress_history",
    "notebook_summaries",
    "highlights",
    "personal_reviews",
    "reading_stat_snapshots",
    "reading_time_buckets",
    "sync_runs",
    "sync_lock",
  ]) {
    assert.match(sql, new RegExp("CREATE TABLE `" + table + "`"));
  }
});

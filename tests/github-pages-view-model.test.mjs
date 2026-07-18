import assert from "node:assert/strict";
import test from "node:test";
import {
  calendarMonth,
  filterNotesByDate,
  latestNoteMonth,
  noteCountsByDate,
  paginate,
  paginationItems,
  shiftMonthKey,
  toShanghaiDateKey,
} from "../github-pages/assets/view-model.js";

test("paginates the current 273-item shelf into 6-item pages", () => {
  const items = Array.from({ length: 273 }, (_, index) => index + 1);
  const first = paginate(items, 1, 6);
  const last = paginate(items, 99, 6);
  assert.equal(first.totalPages, 46);
  assert.equal(first.items.length, 6);
  assert.equal(last.page, 46);
  assert.equal(last.items.length, 3);
  assert.equal(last.items[0], 271);
});

test("builds compact page number sequences", () => {
  assert.deepEqual(paginationItems(1, 12), [1, 2, 3, 4, "ellipsis", 12]);
  assert.deepEqual(paginationItems(6, 12), [1, "ellipsis", 5, 6, 7, "ellipsis", 12]);
  assert.deepEqual(paginationItems(12, 12), [1, "ellipsis", 9, 10, 11, 12]);
  assert.deepEqual(paginationItems(1, 3), [1, 2, 3]);
});

test("uses Asia/Shanghai dates for notes near UTC midnight", () => {
  const timestamp = Date.parse("2026-07-16T16:30:00.000Z") / 1000;
  assert.equal(toShanghaiDateKey(timestamp), "2026-07-17");
  assert.equal(toShanghaiDateKey(null), null);
});

test("counts and filters both highlights and reviews by date", () => {
  const notes = [
    { kind: "highlight", createTime: Date.parse("2026-07-16T01:00:00.000Z") / 1000 },
    { kind: "review", createTime: Date.parse("2026-07-16T08:00:00.000Z") / 1000 },
    { kind: "review", createTime: Date.parse("2026-07-17T01:00:00.000Z") / 1000 },
    { kind: "review", createTime: null },
  ];
  const counts = noteCountsByDate(notes);
  assert.equal(counts.get("2026-07-16"), 2);
  assert.equal(counts.get("2026-07-17"), 1);
  assert.equal(filterNotesByDate(notes, "2026-07-16").length, 2);
  assert.equal(filterNotesByDate(notes, null).length, 4);
});

test("builds Monday-first calendar grids across leap years and year boundaries", () => {
  const leapMonth = calendarMonth("2024-02");
  assert.equal(leapMonth.filter(Boolean).length, 29);
  assert.equal(leapMonth.findIndex((cell) => cell?.day === 1), 3);

  const mondayMonth = calendarMonth("2025-09");
  assert.equal(mondayMonth[0].day, 1);
  assert.equal(shiftMonthKey("2026-12", 1), "2027-01");
  assert.equal(shiftMonthKey("2026-01", -1), "2025-12");
});

test("opens the calendar on the newest dated note", () => {
  const notes = [
    { createTime: Date.parse("2025-09-11T10:00:00.000Z") / 1000 },
    { createTime: Date.parse("2026-07-16T10:00:00.000Z") / 1000 },
  ];
  assert.equal(latestNoteMonth(notes), "2026-07");
});

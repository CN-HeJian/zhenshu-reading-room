const shanghaiDateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Shanghai",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function dateParts(date) {
  const parts = shanghaiDateFormatter.formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function paginate(items, requestedPage, pageSize) {
  const values = Array.isArray(items) ? items : [];
  const size = Math.max(1, Math.trunc(Number(pageSize)) || 1);
  const totalItems = values.length;
  const totalPages = Math.ceil(totalItems / size);
  const page = totalPages === 0
    ? 1
    : Math.min(totalPages, Math.max(1, Math.trunc(Number(requestedPage)) || 1));
  const start = (page - 1) * size;
  return {
    items: values.slice(start, start + size),
    page,
    pageSize: size,
    totalItems,
    totalPages,
    start,
  };
}

export function paginationItems(requestedPage, requestedTotalPages) {
  const totalPages = Math.max(0, Math.trunc(Number(requestedTotalPages)) || 0);
  if (totalPages <= 1) return totalPages === 1 ? [1] : [];
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, index) => index + 1);

  const page = Math.min(totalPages, Math.max(1, Math.trunc(Number(requestedPage)) || 1));
  const pages = new Set([1, totalPages, page - 1, page, page + 1]);
  if (page <= 3) [2, 3, 4].forEach((value) => pages.add(value));
  if (page >= totalPages - 2) {
    [totalPages - 3, totalPages - 2, totalPages - 1].forEach((value) => pages.add(value));
  }

  const ordered = [...pages].filter((value) => value >= 1 && value <= totalPages).sort((left, right) => left - right);
  const result = [];
  ordered.forEach((value, index) => {
    if (index > 0 && value - ordered[index - 1] > 1) result.push("ellipsis");
    result.push(value);
  });
  return result;
}

export function toShanghaiDateKey(unixSeconds) {
  const value = Number(unixSeconds);
  if (!Number.isFinite(value) || value <= 0) return null;
  return dateParts(new Date(value * 1000));
}

export function noteCountsByDate(notes) {
  const counts = new Map();
  for (const note of notes ?? []) {
    const dateKey = toShanghaiDateKey(note?.createTime);
    if (dateKey) counts.set(dateKey, (counts.get(dateKey) ?? 0) + 1);
  }
  return counts;
}

export function filterNotesByDate(notes, dateKey) {
  if (!dateKey) return [...(notes ?? [])];
  return (notes ?? []).filter((note) => toShanghaiDateKey(note?.createTime) === dateKey);
}

export function latestNoteMonth(notes, nowMs = Date.now()) {
  const dateKeys = (notes ?? []).map((note) => toShanghaiDateKey(note?.createTime)).filter(Boolean);
  const latest = dateKeys.sort().at(-1);
  return (latest ?? dateParts(new Date(nowMs))).slice(0, 7);
}

export function shiftMonthKey(monthKey, delta) {
  const match = /^(\d{4})-(\d{2})$/.exec(String(monthKey));
  if (!match) throw new TypeError("monthKey must use YYYY-MM format");
  const shifted = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1 + Number(delta), 1));
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function calendarMonth(monthKey, counts = new Map(), selectedDate = null) {
  const match = /^(\d{4})-(\d{2})$/.exec(String(monthKey));
  if (!match) throw new TypeError("monthKey must use YYYY-MM format");
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) throw new RangeError("monthKey month must be between 01 and 12");

  const firstWeekday = (new Date(Date.UTC(year, month - 1, 1)).getUTCDay() + 6) % 7;
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const slotCount = Math.ceil((firstWeekday + daysInMonth) / 7) * 7;
  return Array.from({ length: slotCount }, (_, index) => {
    const day = index - firstWeekday + 1;
    if (day < 1 || day > daysInMonth) return null;
    const dateKey = `${monthKey}-${String(day).padStart(2, "0")}`;
    return {
      day,
      dateKey,
      count: counts.get(dateKey) ?? 0,
      selected: selectedDate === dateKey,
    };
  });
}

export function formatMonthLabel(monthKey) {
  const match = /^(\d{4})-(\d{2})$/.exec(String(monthKey));
  if (!match) return "批注日历";
  return `${match[1]}年${Number(match[2])}月`;
}

export function formatDateKeyLabel(dateKey) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateKey));
  if (!match) return "全部批注";
  return `${match[1]}年${Number(match[2])}月${Number(match[3])}日`;
}

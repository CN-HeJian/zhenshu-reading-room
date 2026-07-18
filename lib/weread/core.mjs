export const WEREAD_GATEWAY_URL = "https://i.weread.qq.com/api/agent/gateway";
export const WEREAD_SKILL_VERSION = "1.0.4";

export function buildGatewayBody(apiName, params = {}) {
  return { api_name: apiName, ...params, skill_version: WEREAD_SKILL_VERSION };
}

export function asInt(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : fallback;
}

export function clampProgress(value) {
  return Math.max(0, Math.min(100, asInt(value)));
}

export function visibleShelfCount(shelf) {
  return (shelf?.books?.length ?? 0) +
    (shelf?.albums?.length ?? 0) +
    (shelf?.mp ? 1 : 0);
}

export function totalNotebookNotes(book) {
  return asInt(book?.reviewCount) + asInt(book?.noteCount) + asInt(book?.bookmarkCount);
}

export function formatDuration(totalSeconds) {
  const seconds = Math.max(0, asInt(totalSeconds));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) return `${hours}小时${minutes > 0 ? `${minutes}分钟` : ""}`;
  return `${minutes}分钟`;
}

export function formatDate(unixSeconds) {
  const value = asInt(unixSeconds);
  if (!value) return "日期未知";
  const parts = new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(value * 1000));
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function asDeepLink(value) {
  return typeof value === "string" && value.length > 0 ? value : null;
}

export function latestScheduledAt(nowMs = Date.now()) {
  const now = new Date(nowMs);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const todayAt2330 = Date.UTC(Number(values.year), Number(values.month) - 1, Number(values.day), 15, 30, 0);
  return todayAt2330 <= nowMs ? todayAt2330 : todayAt2330 - 24 * 60 * 60 * 1000;
}

export function needsCatchUp(lastSuccessUnixSeconds, nowMs = Date.now()) {
  return asInt(lastSuccessUnixSeconds) * 1000 < latestScheduledAt(nowMs);
}

import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

const ROOT = resolve(new URL("..", import.meta.url).pathname);
const DEFAULT_DATA_PATH = join(ROOT, "github-pages/data/reading-room.json");
const DEFAULT_OUTPUT_PATH = join(ROOT, "github-pages/data/reading-journey.json");
const DEFAULT_HISTORY_OUTPUT_PATH = join(ROOT, "github-pages/data/reading-journey-history.json");
const DEFAULT_MEMORY_PATH = join(ROOT, "analysis-history/reading-memory.json");
const DEFAULT_ARCHIVE_DIR = join(ROOT, "analysis-history");
const DEFAULT_API_URL = "https://api.deepseek.com";
const DEFAULT_MODEL = "deepseek-v4-pro";
const MAX_EVIDENCE = 150;
const MAX_HISTORY = 120;

const dateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Shanghai",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function text(value, fallback = "") {
  const valueText = String(value ?? "").replace(/\s+/g, " ").trim();
  return valueText || fallback;
}

function dateKey(unixSeconds) {
  const value = Number(unixSeconds);
  return Number.isFinite(value) && value > 0 ? dateFormatter.format(new Date(value * 1000)) : null;
}

function monthKey(unixSeconds) {
  return dateKey(unixSeconds)?.slice(0, 7) ?? "未知时间";
}

function clampString(value, maxLength = 900) {
  const valueText = text(value);
  return valueText.length > maxLength ? `${valueText.slice(0, maxLength - 1)}…` : valueText;
}

function readJsonIfExists(path, fallback) {
  return readFile(path, "utf8")
    .then((value) => JSON.parse(value))
    .catch(() => fallback);
}

function pickNotes(notes, booksById) {
  const normalized = notes
    .filter((note) => note?.createTime && (note.quote || note.note))
    .map((note) => {
      const book = booksById.get(String(note.bookId));
      return {
        id: String(note.id ?? `${note.bookId}:${note.createTime}:${note.quote}`),
        date: dateKey(note.createTime),
        month: monthKey(note.createTime),
        kind: note.kind === "highlight" ? "划线" : "想法",
        book: text(note.book, "未命名书籍"),
        category: text(book?.category, "未分类"),
        author: text(book?.author),
        chapter: text(note.chapter),
        quote: clampString(note.quote, 520),
        note: clampString(note.note, 760),
        weight: Math.min(1200, text(note.quote).length + text(note.note).length * 1.25 + (note.kind === "review" ? 120 : 0)),
        createTime: Number(note.createTime) || 0,
      };
    })
    .sort((left, right) => left.createTime - right.createTime);

  const selected = new Map();
  const add = (note) => selected.set(note.id, note);
  normalized.slice(0, 24).forEach(add);
  normalized.slice(-48).forEach(add);

  const byMonth = new Map();
  const byCategory = new Map();
  normalized.forEach((note) => {
    if (!byMonth.has(note.month)) byMonth.set(note.month, []);
    if (!byCategory.has(note.category)) byCategory.set(note.category, []);
    byMonth.get(note.month).push(note);
    byCategory.get(note.category).push(note);
  });
  [...byMonth.values()].forEach((items) => items.sort((left, right) => right.weight - left.weight).slice(0, 4).forEach(add));
  [...byCategory.values()].forEach((items) => items.sort((left, right) => right.weight - left.weight).slice(0, 8).forEach(add));

  return [...selected.values()]
    .sort((left, right) => left.createTime - right.createTime)
    .slice(-MAX_EVIDENCE)
    .map((note) => Object.fromEntries(Object.entries(note).filter(([key]) => key !== "weight" && key !== "createTime")));
}

function buildEvidencePacket(data) {
  const books = Array.isArray(data?.books) ? data.books : [];
  const notes = Array.isArray(data?.notes) ? data.notes : [];
  const booksById = new Map(books.map((book) => [String(book.id ?? book.sourceId), book]));
  const evidence = pickNotes(notes, booksById);
  const categoryBooks = new Map();
  books.forEach((book) => {
    const category = text(book.category, "未分类");
    if (!categoryBooks.has(category)) categoryBooks.set(category, []);
    categoryBooks.get(category).push({
      title: text(book.title, "未命名书籍"),
      author: text(book.author),
      progress: Number(book.progress) || 0,
      status: text(book.status),
    });
  });
  const categorySummaries = [...categoryBooks.entries()]
    .map(([category, items]) => ({
      category,
      books: items.length,
      titles: items.slice(0, 12).map((item) => item.title),
      progress: Math.round(items.reduce((sum, item) => sum + item.progress, 0) / Math.max(1, items.length)),
    }))
    .sort((left, right) => right.books - left.books)
    .slice(0, 24);
  const preferredCategory = data?.stats?.overall?.preferCategory?.[0]?.categoryTitle
    ?? categorySummaries[0]?.category
    ?? "未分类";
  return {
    generatedAt: data?.generatedAt ?? null,
    preferredCategory,
    categorySummaries,
    periods: [...new Set(evidence.map((note) => note.month))].map((month) => ({
      month,
      noteIds: evidence.filter((note) => note.month === month).map((note) => note.id).slice(0, 12),
      categories: [...new Set(evidence.filter((note) => note.month === month).map((note) => note.category))].slice(0, 8),
    })),
    evidence,
  };
}

async function readArchives(archiveDir) {
  const names = await readdir(archiveDir).catch(() => []);
  const files = names.filter((name) => /^\d{4}-\d{2}-\d{2}\.json$/.test(name)).sort();
  const archives = [];
  for (const name of files) {
    const archive = await readJsonIfExists(join(archiveDir, name), null);
    if (archive?.analysis) archives.push(archive);
  }
  return archives.sort((left, right) => String(left.id).localeCompare(String(right.id)));
}

function buildPromptPayload(packet, memory, archives) {
  return {
    task: "全程阅读心路",
    instruction: "请从最早的阅读记录到现在，重建读者关注点、问题意识和判断方式的变化。不要只总结最近一周，不要把统计数据当成结论。",
    preferredCategory: packet.preferredCategory,
    longTermMemory: memory,
    archiveSummaries: archives.slice(-MAX_HISTORY).map((archive) => ({
      id: archive.id,
      date: archive.date,
      title: archive.analysis.title,
      thesis: archive.analysis.thesis,
      arc: archive.analysis.arc?.map((phase) => ({ period: phase.period, title: phase.title, body: phase.body })) ?? [],
      focusCategory: archive.analysis.focusCategory?.name ?? archive.focusCategory,
    })),
    currentEvidence: packet,
  };
}

const SYSTEM_PROMPT = `你是一位克制、细腻、长期主义的阅读观察者。你的工作不是制作数据报告，而是依据读者在不同时间留下的批注、想法和阅读轨迹，重建一条可信的“阅读心路”。

规则：
1. 必须从全程视角写作，不能只总结最近一周；如果历史证据不足，要明确说明。
2. 只使用输入里的证据，不替读者臆测动机，不做心理诊断，不把阅读偏好等同于人格结论。
3. 重点分析关注点、问题意识、判断方式和思想张力如何变化，而不是复述书目或数字。
4. 针对最爱类别做深入分析：它经历了什么主题迁移，读者如何从摘录走向评论，哪些问题仍然悬而未决。
5. 语言要像一篇有证据的私人阅读随笔，具体、克制、有时间顺序；避免空泛鸡汤。
6. 每个重要判断尽量附上 evidenceIds；证据不足时使用空数组。
7. 严格只返回 JSON，不要 Markdown 代码块。JSON 字段必须符合下方结构：
{
  "title": "一句能概括长期变化的标题",
  "thesis": "一段 100-220 字的全程判断",
  "arc": [{"period":"阶段或年份","title":"阶段名","body":"阶段叙述","evidenceIds":[]}],
  "turningPoints": [{"title":"转折点","body":"发生了什么变化","evidenceIds":[]}],
  "enduringThemes": [{"title":"长期主题","body":"它如何贯穿不同阶段","evidenceIds":[]}],
  "focusCategory": {"name":"最爱类别","body":"该类别的长期变化","shifts":[{"title":"主题迁移","body":"迁移叙述","evidenceIds":[]}],"evidenceIds":[]},
  "openQuestions": ["仍然没有解决的问题"],
  "caveat": "证据边界或需要谨慎理解的地方"
}`;

export function normalizeAnalysis(value, packet, generatedAt = new Date().toISOString()) {
  const source = value && typeof value === "object" ? value : {};
  const evidenceIds = new Set(packet.evidence.map((note) => note.id));
  const cleanEvidence = (ids) => Array.isArray(ids) ? ids.map(String).filter((id) => evidenceIds.has(id)).slice(0, 12) : [];
  const cleanList = (items, fallback = []) => (Array.isArray(items) ? items : fallback).filter(Boolean).slice(0, 8);
  const cleanArc = cleanList(source.arc ?? source.phases).map((item, index) => ({
    period: clampString(item?.period ?? `阶段 ${index + 1}`, 80),
    title: clampString(item?.title ?? "未命名阶段", 120),
    body: clampString(item?.body ?? item?.narrative, 900),
    evidenceIds: cleanEvidence(item?.evidenceIds),
  })).filter((item) => item.body);
  const cleanThemes = cleanList(source.enduringThemes ?? source.themes).map((item) => ({
    title: clampString(item?.title, 120),
    body: clampString(item?.body ?? item?.description, 700),
    evidenceIds: cleanEvidence(item?.evidenceIds),
  })).filter((item) => item.title && item.body);
  const focus = source.focusCategory && typeof source.focusCategory === "object" ? source.focusCategory : {};
  return {
    generatedAt,
    title: clampString(source.title, 180) || "全程阅读心路",
    thesis: clampString(source.thesis ?? source.summary, 1100) || "目前的阅读证据还不足以形成完整的长期判断。",
    arc: cleanArc,
    turningPoints: cleanList(source.turningPoints).map((item) => ({
      title: clampString(item?.title, 120),
      body: clampString(item?.body, 700),
      evidenceIds: cleanEvidence(item?.evidenceIds),
    })).filter((item) => item.title && item.body),
    enduringThemes: cleanThemes,
    focusCategory: {
      name: clampString(focus.name, 120) || packet.preferredCategory,
      body: clampString(focus.body, 1000) || "目前还没有足够证据分析这个类别的长期变化。",
      shifts: cleanList(focus.shifts).map((item) => ({
        title: clampString(item?.title, 120),
        body: clampString(item?.body, 700),
        evidenceIds: cleanEvidence(item?.evidenceIds),
      })).filter((item) => item.title && item.body),
      evidenceIds: cleanEvidence(focus.evidenceIds),
    },
    openQuestions: cleanList(source.openQuestions ?? source.questions, []).map((item) => clampString(item, 260)).filter(Boolean),
    caveat: clampString(source.caveat, 600),
  };
}

export function buildAnalysisPrompt(data, memory = {}, archives = []) {
  const packet = buildEvidencePacket(data);
  const payload = buildPromptPayload(packet, memory, archives);
  return { packet, messages: [{ role: "system", content: SYSTEM_PROMPT }, { role: "user", content: JSON.stringify(payload) }] };
}

async function callDeepSeek(apiKey, messages, fetchImpl = fetch, apiUrl = DEFAULT_API_URL, model = DEFAULT_MODEL) {
  const response = await fetchImpl(`${apiUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      model,
      messages,
      thinking: { type: "enabled" },
      reasoning_effort: "high",
      response_format: { type: "json_object" },
      temperature: 0.35,
      max_tokens: 5000,
      stream: false,
    }),
  });
  if (!response.ok) throw new Error(`DeepSeek HTTP ${response.status}`);
  const payload = await response.json();
  const content = payload?.choices?.[0]?.message?.content;
  if (!content) throw new Error("DeepSeek 返回内容为空。");
  const cleaned = String(content).replace(/^```json\s*/i, "").replace(/\s*```$/, "").trim();
  return JSON.parse(cleaned);
}

function buildMemory(analysis, generatedAt) {
  return {
    schemaVersion: 1,
    updatedAt: generatedAt,
    arc: analysis.arc.slice(-6),
    turningPoints: analysis.turningPoints.slice(-10),
    enduringThemes: analysis.enduringThemes.slice(0, 10),
    focusCategory: analysis.focusCategory,
    openQuestions: analysis.openQuestions.slice(0, 10),
  };
}

function archiveDate(data) {
  return data?.generatedAtMs ? dateKey(Number(data.generatedAtMs) / 1000) : dateKey(Date.now() / 1000);
}

async function writeJourneyOutputs({ data, analysis, memory, archives, date, outputPath, historyOutputPath, memoryPath, archiveDir }) {
  await mkdir(archiveDir, { recursive: true });
  await mkdir(join(ROOT, "github-pages/data"), { recursive: true });
  const archive = {
    schemaVersion: 1,
    id: date,
    date,
    generatedAt: data.generatedAt ?? new Date().toISOString(),
    focusCategory: analysis.focusCategory.name,
    analysis,
  };
  const remaining = archives.filter((item) => item.id !== date);
  const allArchives = [...remaining, archive].sort((left, right) => String(left.id).localeCompare(String(right.id)));
  await writeFile(join(archiveDir, `${date}.json`), `${JSON.stringify(archive, null, 2)}\n`);
  await writeFile(memoryPath, `${JSON.stringify(memory, null, 2)}\n`);
  await writeFile(outputPath, `${JSON.stringify({ ...archive, status: "ready" }, null, 2)}\n`);
  await writeFile(historyOutputPath, `${JSON.stringify({ schemaVersion: 1, updatedAt: archive.generatedAt, entries: allArchives.slice(-MAX_HISTORY).reverse() }, null, 2)}\n`);
  return archive;
}

export async function generateJourney({ data, memory = {}, archives = [], apiKey, fetchImpl = fetch, apiUrl = DEFAULT_API_URL, model = DEFAULT_MODEL }) {
  if (!apiKey) throw new Error("DEEPSEEK_API_KEY 未配置。");
  const { packet, messages } = buildAnalysisPrompt(data, memory, archives);
  const rawAnalysis = await callDeepSeek(apiKey, messages, fetchImpl, apiUrl, model);
  const generatedAt = new Date().toISOString();
  return {
    packet,
    analysis: normalizeAnalysis(rawAnalysis, packet, generatedAt),
    memory: null,
  };
}

async function main() {
  const dataPath = process.env.READING_DATA_PATH || DEFAULT_DATA_PATH;
  const outputPath = process.env.READING_JOURNEY_OUTPUT || DEFAULT_OUTPUT_PATH;
  const historyOutputPath = process.env.READING_JOURNEY_HISTORY_OUTPUT || DEFAULT_HISTORY_OUTPUT_PATH;
  const memoryPath = process.env.READING_MEMORY_PATH || DEFAULT_MEMORY_PATH;
  const archiveDir = process.env.READING_ARCHIVE_DIR || DEFAULT_ARCHIVE_DIR;
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    console.log("DEEPSEEK_API_KEY 未配置，本次跳过阅读心路生成，保留上一版归档。");
    return;
  }
  const data = await readJsonIfExists(dataPath, null);
  if (!data) throw new Error(`无法读取阅读数据：${dataPath}`);
  const memory = await readJsonIfExists(memoryPath, {});
  const archives = await readArchives(archiveDir);
  const result = await generateJourney({ data, memory, archives, apiKey, apiUrl: process.env.DEEPSEEK_API_URL || DEFAULT_API_URL, model: process.env.DEEPSEEK_MODEL || DEFAULT_MODEL });
  const date = archiveDate(data);
  const nextMemory = buildMemory(result.analysis, result.analysis.generatedAt);
  await writeJourneyOutputs({ data, analysis: result.analysis, memory: nextMemory, archives, date, outputPath, historyOutputPath, memoryPath, archiveDir });
  console.log(`已生成全程阅读心路：${date}，历史归档 ${Math.min(MAX_HISTORY, archives.length + 1)} 份，重点类别：${result.analysis.focusCategory.name}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

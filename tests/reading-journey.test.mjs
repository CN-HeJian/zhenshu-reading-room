import assert from "node:assert/strict";
import test from "node:test";
import { buildAnalysisPrompt, generateJourney, normalizeAnalysis } from "../scripts/analyze-reading-journey.mjs";

const fixture = {
  generatedAt: "2026-07-21T15:30:00.000Z",
  generatedAtMs: Date.parse("2026-07-21T15:30:00.000Z"),
  books: [
    { id: "book:b1", sourceId: "b1", title: "投资的本质", author: "作者甲", category: "经济理财", progress: 100 },
    { id: "book:b2", sourceId: "b2", title: "慢慢生活", author: "作者乙", category: "个人成长", progress: 42 },
  ],
  notes: [
    { id: "n1", bookId: "b1", book: "投资的本质", kind: "review", quote: "长期不是等待，而是选择。", note: "我开始关注选择背后的代价。", createTime: 1_700_000_000, chapter: "第一章" },
    { id: "n2", bookId: "b2", book: "慢慢生活", kind: "highlight", quote: "把注意力放回当下。", note: "", createTime: 1_710_000_000, chapter: "第二章" },
    { id: "n3", bookId: "b1", book: "投资的本质", kind: "review", quote: "风险不是波动，而是永久损失。", note: "这句话改变了我看待亏损的方式。", createTime: 1_720_000_000, chapter: "第三章" },
  ],
  stats: { overall: { preferCategory: [{ categoryTitle: "经济理财" }] } },
};

test("builds a bounded full-history evidence prompt", () => {
  const result = buildAnalysisPrompt(fixture, { enduringThemes: [{ title: "长期主义" }] }, [{ id: "2026-07-14", analysis: { title: "旧分析", thesis: "旧判断", arc: [], focusCategory: { name: "经济理财" } } }]);
  assert.equal(result.packet.preferredCategory, "经济理财");
  assert.equal(result.packet.evidence.length, 3);
  assert.match(result.messages[0].content, /不能只总结最近一周/);
  assert.match(result.messages[1].content, /长期主义/);
});

test("normalizes model output and filters unsupported evidence", () => {
  const normalized = normalizeAnalysis({
    title: "从技巧到判断",
    thesis: "长期变化",
    arc: [{ period: "早期", title: "寻找方法", body: "开始记录方法。", evidenceIds: ["n1", "missing"] }],
    focusCategory: { name: "经济理财", body: "从技巧转向风险。", shifts: [] },
    openQuestions: ["如何面对不确定性？"],
  }, { preferredCategory: "经济理财", evidence: [{ id: "n1" }] }, "2026-07-21T16:00:00.000Z");
  assert.deepEqual(normalized.arc[0].evidenceIds, ["n1"]);
  assert.equal(normalized.focusCategory.name, "经济理财");
  assert.equal(normalized.openQuestions[0], "如何面对不确定性？");
});

test("calls DeepSeek with JSON output and returns a lifelong analysis", async () => {
  let request;
  const result = await generateJourney({
    data: fixture,
    memory: {},
    archives: [],
    apiKey: "ds-test",
    apiUrl: "https://deepseek.test",
    fetchImpl: async (url, init) => {
      request = { url, init };
      return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ title: "全程变化", thesis: "从方法走向判断。", arc: [], turningPoints: [], enduringThemes: [], focusCategory: { name: "经济理财", body: "持续深化。", shifts: [] }, openQuestions: [], caveat: "" }) } }] }), { status: 200 });
    },
  });
  const body = JSON.parse(request.init.body);
  assert.equal(request.url, "https://deepseek.test/chat/completions");
  assert.equal(body.response_format.type, "json_object");
  assert.equal(body.model, "deepseek-v4-pro");
  assert.equal(result.analysis.title, "全程变化");
  assert.equal(result.analysis.focusCategory.name, "经济理财");
});

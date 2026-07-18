import { requireSyncAccess } from "@/lib/server-auth";
import { continueSync, publicSyncRun, startSync } from "@/lib/sync/orchestrator";
import type { SyncSource } from "@/lib/sync/types";

const SOURCES = new Set<SyncSource>(["manual", "scheduled", "catch_up"]);

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({})) as { source?: SyncSource };
    const source = body.source ?? "manual";
    if (!SOURCES.has(source)) return Response.json({ error: "同步来源无效。" }, { status: 400 });
    requireSyncAccess(request, source);
    const run = await startSync(source);
    const advanced = run.status === "running" ? await continueSync(run.id) : run;
    return Response.json(publicSyncRun(advanced));
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: "无法开始同步，请稍后重试。" }, { status: 500 });
  }
}

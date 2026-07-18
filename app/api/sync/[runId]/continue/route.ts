import { requireSyncAccess } from "@/lib/server-auth";
import { continueSync, publicSyncRun } from "@/lib/sync/orchestrator";
import { getRun } from "@/lib/sync/repository";

export async function POST(
  request: Request,
  context: { params: Promise<{ runId: string }> },
) {
  try {
    const { runId } = await context.params;
    const run = await getRun(runId);
    if (!run) return Response.json({ error: "同步任务不存在。" }, { status: 404 });
    requireSyncAccess(request, run.source);
    return Response.json(publicSyncRun(await continueSync(runId)));
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: "无法继续同步，请稍后重试。" }, { status: 500 });
  }
}

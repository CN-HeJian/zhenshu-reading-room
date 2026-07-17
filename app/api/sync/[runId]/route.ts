import { requireSyncOwner } from "@/lib/server-auth";
import { publicSyncRun } from "@/lib/sync/orchestrator";
import { getRun } from "@/lib/sync/repository";

export async function GET(
  request: Request,
  context: { params: Promise<{ runId: string }> },
) {
  try {
    requireSyncOwner(request);
    const { runId } = await context.params;
    const run = await getRun(runId);
    if (!run) return Response.json({ error: "同步任务不存在。" }, { status: 404 });
    return Response.json(publicSyncRun(run));
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: "无法读取同步状态。" }, { status: 500 });
  }
}

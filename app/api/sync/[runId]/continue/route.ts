import { requireSyncOwner } from "@/lib/server-auth";
import { continueSync, publicSyncRun } from "@/lib/sync/orchestrator";

export async function POST(
  request: Request,
  context: { params: Promise<{ runId: string }> },
) {
  try {
    requireSyncOwner(request);
    const { runId } = await context.params;
    return Response.json(publicSyncRun(await continueSync(runId)));
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: "无法继续同步，请稍后重试。" }, { status: 500 });
  }
}

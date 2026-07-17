import { needsCatchUp } from "@/lib/weread/core.mjs";
import { requireSyncOwner } from "@/lib/server-auth";
import { publicSyncRun } from "@/lib/sync/orchestrator";
import { getLastSuccessfulRun, getLatestRun } from "@/lib/sync/repository";

export async function GET(request: Request) {
  try {
    requireSyncOwner(request);
    const [latest, lastSuccess] = await Promise.all([getLatestRun(), getLastSuccessfulRun()]);
    return Response.json({
      latest: latest ? publicSyncRun(latest) : null,
      lastSuccessAt: lastSuccess?.finishedAt ?? null,
      needsCatchUp: needsCatchUp(lastSuccess?.finishedAt ? Math.floor(lastSuccess.finishedAt / 1000) : 0),
    });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: "无法读取同步状态。" }, { status: 500 });
  }
}

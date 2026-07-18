import { getRuntimeEnv } from "./runtime-env";
import { isAutomationRequest, isOwnerEmail } from "./sync/auth-core";
import type { SyncSource } from "./sync/types";

function forbidden(message = "无权执行同步。"): Response {
  return Response.json({ error: message }, { status: 403 });
}

export function requireSyncOwner(request: Request): void {
  const ownerEmail = getRuntimeEnv().SYNC_OWNER_EMAIL;
  const requestEmail = request.headers.get("oai-authenticated-user-email");

  if (!isOwnerEmail(requestEmail, ownerEmail)) {
    throw forbidden();
  }
}

export function requireScheduledSyncAutomation(request: Request): void {
  if (!isAutomationRequest(request, getRuntimeEnv().SYNC_AUTOMATION_TOKEN)) {
    throw forbidden("无权执行定时同步。");
  }
}

export function requireSyncAccess(request: Request, source: SyncSource): void {
  if (source === "scheduled") {
    requireScheduledSyncAutomation(request);
    return;
  }
  requireSyncOwner(request);
}

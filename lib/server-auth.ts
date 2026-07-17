import { getRuntimeEnv } from "./runtime-env";

export function requireSyncOwner(request: Request): void {
  const ownerEmail = getRuntimeEnv().SYNC_OWNER_EMAIL?.trim().toLowerCase();
  const requestEmail = request.headers.get("oai-authenticated-user-email")?.trim().toLowerCase();

  if (!ownerEmail || !requestEmail || ownerEmail !== requestEmail) {
    throw new Response("无权执行同步。", { status: 403 });
  }
}

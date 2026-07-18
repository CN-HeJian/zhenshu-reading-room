import { env } from "cloudflare:workers";

type RuntimeEnv = {
  WEREAD_API_KEY?: string;
  SYNC_OWNER_EMAIL?: string;
  SYNC_AUTOMATION_TOKEN?: string;
};

export function getRuntimeEnv(): RuntimeEnv {
  return env as unknown as RuntimeEnv;
}

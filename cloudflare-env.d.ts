declare namespace Cloudflare {
  interface Env {
    DB: D1Database;
    WEREAD_API_KEY?: string;
    SYNC_OWNER_EMAIL?: string;
  }
}

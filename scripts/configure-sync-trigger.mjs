import { writeFile } from "node:fs/promises";

const value = (process.env.SYNC_TRIGGER_URL ?? "").trim().replace(/\/$/, "");
await writeFile(
  new URL("../github-pages/assets/sync-config.js", import.meta.url),
  `// Generated during the GitHub Pages build; keep the source default empty.\nexport const SYNC_TRIGGER_URL = ${JSON.stringify(value)};\n`,
);

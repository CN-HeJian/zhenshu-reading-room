import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("GitHub Pages site reads static data and does not call Sites sync APIs", async () => {
  const html = await readFile(new URL("../github-pages/index.html", import.meta.url), "utf8");
  const app = await readFile(new URL("../github-pages/assets/app.js", import.meta.url), "utf8");
  const workflow = await readFile(new URL("../.github/workflows/weread-sync.yml", import.meta.url), "utf8");

  assert.match(html, /assets\/app\.js/);
  assert.match(app, /data\/reading-room\.json/);
  assert.doesNotMatch(html + app + workflow, /\/api\/sync/);
  assert.doesNotMatch(workflow, /SITES_BASE_URL|SYNC_AUTOMATION_TOKEN|run-weread-sync/);
  assert.match(workflow, /actions\/deploy-pages@v4/);
  assert.match(workflow, /WEREAD_API_KEY/);
});

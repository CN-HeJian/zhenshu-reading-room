import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("GitHub Pages site reads static data and does not call Sites sync APIs", async () => {
  const html = await readFile(new URL("../github-pages/index.html", import.meta.url), "utf8");
  const app = await readFile(new URL("../github-pages/assets/app.js", import.meta.url), "utf8");
  const syncConfig = await readFile(new URL("../github-pages/assets/sync-config.js", import.meta.url), "utf8");
  const viewModel = await readFile(new URL("../github-pages/assets/view-model.js", import.meta.url), "utf8");
  const workflow = await readFile(new URL("../.github/workflows/weread-sync.yml", import.meta.url), "utf8");
  const workerWorkflow = await readFile(new URL("../.github/workflows/sync-trigger-deploy.yml", import.meta.url), "utf8");

  assert.match(html, /assets\/app\.js/);
  assert.match(html, /id="shelfPagination"/);
  assert.match(html, /id="notesPagination"/);
  assert.match(html, /id="calendarGrid"/);
  assert.match(html, /id="syncModal"/);
  assert.match(html, /id="syncForm"/);
  assert.match(html, /<button class="import" id="actionsLink"/);
  assert.doesNotMatch(html, /id="actionsLink"[^>]+href="\.\/data\/reading-room\.json"/);
  assert.match(app, /\.\/view-model\.js/);
  assert.match(app, /\.\/sync-config\.js/);
  assert.match(app, /data\/reading-room\.json/);
  assert.match(app, /\/sync\/start/);
  assert.match(app, /\/sync\/status/);
  assert.match(app, /loadData\(true\)/);
  assert.match(syncConfig, /SYNC_TRIGGER_URL/);
  assert.match(viewModel, /Asia\/Shanghai/);
  assert.doesNotMatch(html + app + viewModel + workflow + syncConfig, /\/api\/sync/);
  assert.doesNotMatch(workflow, /SITES_BASE_URL|SYNC_AUTOMATION_TOKEN|run-weread-sync/);
  assert.match(workflow, /actions\/deploy-pages@v4/);
  assert.match(workflow, /WEREAD_API_KEY/);
  assert.match(workflow, /tests\/sync-worker\.test\.mjs/);
  assert.match(workflow, /SYNC_TRIGGER_URL/);
  assert.match(workerWorkflow, /wrangler deploy/);
  assert.match(workerWorkflow, /GITHUB_ACTIONS_TOKEN/);
  assert.match(workerWorkflow, /SYNC_TRIGGER_KEY/);
});

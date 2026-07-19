import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("GitHub Pages site reads static data and leaves sync controls in GitHub Actions", async () => {
  const html = await readFile(new URL("../github-pages/index.html", import.meta.url), "utf8");
  const app = await readFile(new URL("../github-pages/assets/app.js", import.meta.url), "utf8");
  const viewModel = await readFile(new URL("../github-pages/assets/view-model.js", import.meta.url), "utf8");
  const workflow = await readFile(new URL("../.github/workflows/weread-sync.yml", import.meta.url), "utf8");

  assert.match(html, /assets\/app\.js/);
  assert.match(html, /id="shelfPagination"/);
  assert.match(html, /id="notesPagination"/);
  assert.match(html, /id="calendarGrid"/);
  assert.doesNotMatch(html, /手动同步|syncModal|syncForm|actionsLink/);
  assert.match(app, /\.\/view-model\.js/);
  assert.match(app, /data\/reading-room\.json/);
  assert.match(viewModel, /Asia\/Shanghai/);
  assert.doesNotMatch(html + app + viewModel + workflow, /\/api\/sync/);
  assert.doesNotMatch(workflow, /SITES_BASE_URL|SYNC_AUTOMATION_TOKEN|run-weread-sync/);
  assert.match(workflow, /actions\/deploy-pages@v4/);
  assert.match(workflow, /WEREAD_API_KEY/);
  assert.match(workflow, /workflow_dispatch/);
  assert.match(workflow, /30 15 \* \* \*/);
});

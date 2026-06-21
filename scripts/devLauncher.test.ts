import assert from "node:assert/strict";
import { test } from "node:test";
import { createDevLaunchPlan, resolveCommandForSpawn } from "./devLauncher";

test("createDevLaunchPlan starts the connection service before Vite", () => {
  const plan = createDevLaunchPlan({ viteArgs: ["--port", "5174"] });

  assert.equal(plan.helper.healthUrl, "http://127.0.0.1:8787/health");
  assert.deepEqual(plan.helper.command, { file: "tsx", args: ["scripts/local-helper.ts"] });
  assert.deepEqual(plan.vite.command, { file: "vite", args: ["--host", "127.0.0.1", "--port", "5174"] });
});

test("createDevLaunchPlan respects a custom connection service port", () => {
  const plan = createDevLaunchPlan({ helperPort: 8799, viteArgs: [] });

  assert.equal(plan.helper.healthUrl, "http://127.0.0.1:8799/health");
  assert.deepEqual(plan.vite.command.args, ["--host", "127.0.0.1"]);
});

test("resolveCommandForSpawn runs local package CLIs through node", () => {
  const vite = resolveCommandForSpawn({ file: "vite", args: ["--host", "127.0.0.1"] });
  const tsx = resolveCommandForSpawn({ file: "tsx", args: ["scripts/local-helper.ts"] });

  assert.equal(vite.file, process.execPath);
  assert.match(vite.args[0], /node_modules[\\/]vite[\\/]bin[\\/]vite\.js$/);
  assert.deepEqual(vite.args.slice(1), ["--host", "127.0.0.1"]);
  assert.equal(tsx.file, process.execPath);
  assert.match(tsx.args[0], /node_modules[\\/]tsx[\\/]dist[\\/]cli\.mjs$/);
  assert.deepEqual(tsx.args.slice(1), ["scripts/local-helper.ts"]);
});

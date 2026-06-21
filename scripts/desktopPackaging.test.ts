import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import viteConfig from "../vite.config";

test("desktop builds use relative asset URLs for file:// Electron loading", () => {
  assert.equal(viteConfig.base, "./");
});

test("desktop packer refreshes copied Electron runtime timestamps", async () => {
  const source = await readFile(new URL("./pack-desktop-folder.mjs", import.meta.url), "utf8");
  assert.match(source, /touchPackagedFiles/);
  assert.match(source, /utimes/);
});

test("desktop packer stamps the app icon and product label into the Windows executable", async () => {
  const source = await readFile(new URL("./pack-desktop-folder.mjs", import.meta.url), "utf8");
  assert.match(source, /stampWindowsExecutable/);
  assert.match(source, /aigc-credit-radar-icon\.ico/);
  assert.match(source, /FileDescription/);
  assert.match(source, /ProductName/);
});

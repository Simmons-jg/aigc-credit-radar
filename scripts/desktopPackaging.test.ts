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

test("desktop packer keeps OCR assets only in the built renderer output", async () => {
  const source = await readFile(new URL("./pack-desktop-folder.mjs", import.meta.url), "utf8");
  assert.match(source, /public", "ocr"/);
});

test("desktop build copies the preload script for durable storage", async () => {
  const source = await readFile(new URL("./build-desktop.mjs", import.meta.url), "utf8");
  assert.match(source, /preload\.cjs/);
});

test("desktop shell includes tray, mini window, and native notification bridge", async () => {
  const mainSource = await readFile(new URL("../desktop/main.cjs", import.meta.url), "utf8");
  const preloadSource = await readFile(new URL("../desktop/preload.cjs", import.meta.url), "utf8");

  assert.match(mainSource, /Tray/);
  assert.match(mainSource, /createMiniWindow/);
  assert.match(mainSource, /Notification/);
  assert.match(mainSource, /aigc-credit-radar:show-notification/);
  assert.match(preloadSource, /aigcCreditRadarDesktop/);
});

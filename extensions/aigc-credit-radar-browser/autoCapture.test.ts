import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const extensionDir = new URL("./", import.meta.url);

test("manifest injects auto-capture content script on Lovart and TapNow pages", async () => {
  const manifest = JSON.parse(await readFile(new URL("manifest.json", extensionDir), "utf8"));

  assert.deepEqual(manifest.content_scripts?.[0]?.matches, [
    "https://www.lovart.ai/*",
    "https://lovart.ai/*",
    "https://app.tapnow.ai/*",
  ]);
  assert.deepEqual(manifest.content_scripts?.[0]?.js, ["content.js"]);
  assert.equal(manifest.content_scripts?.[0]?.run_at, "document_idle");
});

test("content script auto-sends visible page text to the local snapshot endpoint", async () => {
  const source = await readFile(new URL("content.js", extensionDir), "utf8");

  assert.match(source, /MutationObserver/);
  assert.match(source, /visibilitychange/);
  assert.match(source, /document\.body\?\.innerText/);
  assert.match(source, /\/api\/browser-extension\/snapshot/);
  assert.match(source, /lastSignature/);
});

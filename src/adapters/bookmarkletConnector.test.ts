import assert from "node:assert/strict";
import { test } from "node:test";
import { applyBookmarkletHref, createBrowserSnapshotBookmarklet } from "./bookmarkletConnector";

test("createBrowserSnapshotBookmarklet posts visible Lovart and TapNow page text to the local snapshot endpoint", () => {
  const href = createBrowserSnapshotBookmarklet({ helperBaseUrl: "http://127.0.0.1:8787" });
  const script = decodeURIComponent(href.replace(/^javascript:/, ""));

  assert.ok(href.startsWith("javascript:"));
  assert.match(script, /lovart/);
  assert.match(script, /tapnow/);
  assert.match(script, /document\.body\.innerText/);
  assert.match(script, /fetch\("http:\/\/127\.0\.0\.1:8787\/api\/browser-extension\/snapshot"/);
});

test("createBrowserSnapshotBookmarklet caps page text before sending it to the local service", () => {
  const href = createBrowserSnapshotBookmarklet({ maxTextLength: 12345 });
  const script = decodeURIComponent(href.replace(/^javascript:/, ""));

  assert.match(script, /\.slice\(0,12345\)/);
});

test("applyBookmarkletHref writes the generated JavaScript URL after React renders a safe placeholder", () => {
  const attributes = new Map<string, string>();
  const anchor = {
    setAttribute(name: string, value: string) {
      attributes.set(name, value);
    },
  };

  applyBookmarkletHref(anchor, "javascript:alert(1)");

  assert.equal(attributes.get("href"), "javascript:alert(1)");
});

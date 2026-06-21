import assert from "node:assert/strict";
import { test } from "node:test";

import { imageFileFromClipboardItems, type ClipboardImageItem } from "./clipboardImage";

test("imageFileFromClipboardItems returns the first pasted image file", () => {
  const image = { name: "screenshot.png" } as File;
  const items = [
    { type: "text/plain", getAsFile: () => null },
    { type: "image/png", getAsFile: () => image },
  ] satisfies ClipboardImageItem[];

  assert.equal(imageFileFromClipboardItems(items), image);
});

test("imageFileFromClipboardItems ignores clipboards without images", () => {
  const items = [{ type: "text/plain", getAsFile: () => null }] satisfies ClipboardImageItem[];

  assert.equal(imageFileFromClipboardItems(items), undefined);
});

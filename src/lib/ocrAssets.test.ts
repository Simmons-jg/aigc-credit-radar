import assert from "node:assert/strict";
import { test } from "node:test";

import { createTesseractOcrOptions, ocrErrorMessage } from "./ocrAssets";

test("createTesseractOcrOptions resolves dev server OCR asset URLs", () => {
  const options = createTesseractOcrOptions("http://127.0.0.1:5173/#connect");

  assert.equal(options.workerPath, "http://127.0.0.1:5173/ocr/worker/worker.min.js");
  assert.equal(options.corePath, "http://127.0.0.1:5173/ocr/core");
  assert.equal(options.langPath, "http://127.0.0.1:5173/ocr/lang");
  assert.equal(options.workerBlobURL, false);
  assert.equal(options.gzip, true);
});

test("createTesseractOcrOptions resolves packaged file OCR asset URLs", () => {
  const options = createTesseractOcrOptions("file:///C:/Program%20Files/AIGC%20Credit%20Radar/resources/app/dist/index.html");

  assert.equal(
    options.workerPath,
    "file:///C:/Program%20Files/AIGC%20Credit%20Radar/resources/app/dist/ocr/worker/worker.min.js",
  );
  assert.equal(options.corePath, "file:///C:/Program%20Files/AIGC%20Credit%20Radar/resources/app/dist/ocr/core");
  assert.equal(options.langPath, "file:///C:/Program%20Files/AIGC%20Credit%20Radar/resources/app/dist/ocr/lang");
});

test("ocrErrorMessage keeps useful diagnostics", () => {
  assert.equal(ocrErrorMessage(new Error("worker failed")), "worker failed");
  assert.equal(ocrErrorMessage("network blocked"), "network blocked");
  assert.equal(ocrErrorMessage(null), "unknown OCR loading error");
});

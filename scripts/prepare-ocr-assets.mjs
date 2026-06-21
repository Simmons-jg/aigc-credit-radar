import { copyFile, mkdir, stat, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { setDefaultResultOrder } from "node:dns";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

setDefaultResultOrder("ipv4first");

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const publicOcrDir = resolve(root, "public", "ocr");
const workerDir = resolve(publicOcrDir, "worker");
const coreDir = resolve(publicOcrDir, "core");
const langDir = resolve(publicOcrDir, "lang");
const englishLangPath = resolve(langDir, "eng.traineddata.gz");
const englishLangUrls = [
  "https://tessdata.projectnaptha.com/4.0.0_fast/eng.traineddata.gz",
  "https://raw.githubusercontent.com/naptha/tessdata_fast/gh-pages/eng.traineddata.gz",
  "https://raw.githubusercontent.com/naptha/tessdata/gh-pages/4.0.0/eng.traineddata.gz",
];
const downloadTimeoutMs = 180_000;
const minimumEnglishLangBytes = 1_800_000;
let englishLangSourceUrl = englishLangUrls[0];

const coreFiles = [
  "tesseract-core.wasm.js",
  "tesseract-core.wasm",
  "tesseract-core-simd.wasm.js",
  "tesseract-core-simd.wasm",
  "tesseract-core-lstm.wasm.js",
  "tesseract-core-lstm.wasm",
  "tesseract-core-simd-lstm.wasm.js",
  "tesseract-core-simd-lstm.wasm",
  "tesseract-core-relaxedsimd.wasm.js",
  "tesseract-core-relaxedsimd.wasm",
  "tesseract-core-relaxedsimd-lstm.wasm.js",
  "tesseract-core-relaxedsimd-lstm.wasm",
];

await Promise.all([mkdir(workerDir, { recursive: true }), mkdir(coreDir, { recursive: true }), mkdir(langDir, { recursive: true })]);

await copyFile(
  resolve(root, "node_modules", "tesseract.js", "dist", "worker.min.js"),
  resolve(workerDir, "worker.min.js"),
);
await copyFile(
  resolve(root, "node_modules", "tesseract.js", "dist", "worker.min.js.LICENSE.txt"),
  resolve(workerDir, "worker.min.js.LICENSE.txt"),
);

await Promise.all(
  coreFiles.map((fileName) =>
    copyFile(resolve(root, "node_modules", "tesseract.js-core", fileName), resolve(coreDir, fileName)),
  ),
);
await copyFile(resolve(root, "node_modules", "tesseract.js-core", "LICENSE"), resolve(coreDir, "LICENSE"));

englishLangSourceUrl = await ensureEnglishLanguageData();
await writeManifest();

console.log("OCR assets are ready in public/ocr");

async function ensureEnglishLanguageData() {
  if (await hasUsableFile(englishLangPath, minimumEnglishLangBytes)) return englishLangSourceUrl;

  let lastError;
  for (const url of englishLangUrls) {
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      try {
        console.log(`Downloading OCR language data from ${url} (attempt ${attempt})`);
        const bytes = await downloadBytes(url);
        if (bytes.byteLength < minimumEnglishLangBytes) {
          throw new Error(`download was unexpectedly small: ${bytes.byteLength} bytes`);
        }

        await writeFile(englishLangPath, bytes);
        return url;
      } catch (error) {
        lastError = error;
        console.warn(`OCR language download failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Failed to download OCR language data");
}

async function downloadBytes(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(downloadTimeoutMs) });
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }

  return Buffer.from(await response.arrayBuffer());
}

async function hasUsableFile(filePath, minimumBytes) {
  try {
    const fileStat = await stat(filePath);
    return fileStat.isFile() && fileStat.size >= minimumBytes;
  } catch {
    return false;
  }
}

async function writeManifest() {
  const langHash = await hashFile(englishLangPath);
  await writeFile(
    resolve(publicOcrDir, "manifest.json"),
    `${JSON.stringify(
      {
        engine: "tesseract.js",
        engineLicense: "Apache-2.0",
        source: "https://github.com/naptha/tesseract.js",
        languageData: {
          eng: {
            url: englishLangSourceUrl,
            sha256: langHash,
          },
        },
      },
      null,
      2,
    )}\n`,
  );
}

async function hashFile(filePath) {
  const file = await import("node:fs/promises").then((fs) => fs.readFile(filePath));
  return createHash("sha256").update(file).digest("hex");
}

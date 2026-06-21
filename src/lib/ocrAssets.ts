export type TesseractOcrOptions = {
  workerPath: string;
  corePath: string;
  langPath: string;
  workerBlobURL: boolean;
  gzip: boolean;
};

export function createTesseractOcrOptions(baseHref = globalThis.location?.href ?? "http://127.0.0.1/"): TesseractOcrOptions {
  return {
    workerPath: new URL("./ocr/worker/worker.min.js", baseHref).href,
    corePath: withoutTrailingSlash(new URL("./ocr/core/", baseHref).href),
    langPath: withoutTrailingSlash(new URL("./ocr/lang/", baseHref).href),
    workerBlobURL: false,
    gzip: true,
  };
}

export function ocrErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  if (typeof error === "string" && error.trim()) return error;
  return "unknown OCR loading error";
}

function withoutTrailingSlash(value: string) {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

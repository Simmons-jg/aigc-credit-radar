import assert from "node:assert/strict";
import { test } from "node:test";
import { parseBrowserCreditText } from "./browserSession";

test("parseBrowserCreditText extracts a Lovart-style credit balance", () => {
  const result = parseBrowserCreditText("Dashboard\nCurrent balance\n8,420 credits\nBilling");

  assert.equal(result?.creditsRemaining, 8420);
  assert.equal(result?.currencyLabel, "credits");
});

test("parseBrowserCreditText extracts a TapNow-style token balance", () => {
  const result = parseBrowserCreditText("Account\nTokens remaining: 312.5\nSettings");

  assert.equal(result?.creditsRemaining, 312.5);
  assert.equal(result?.currencyLabel, "tokens");
});

test("parseBrowserCreditText extracts a short OCR-only balance", () => {
  const result = parseBrowserCreditText("Credits 5717");

  assert.equal(result?.creditsRemaining, 5717);
  assert.equal(result?.currencyLabel, "credits");
});

test("parseBrowserCreditText extracts the final balance from noisy Lovart OCR", () => {
  const result = parseBrowserCreditText("43600 FAR &\n0 BS 3500");

  assert.equal(result?.creditsRemaining, 3500);
  assert.equal(result?.currencyLabel, "credits");
});

test("parseBrowserCreditText rejects text without a balance-like label", () => {
  const result = parseBrowserCreditText("Starter plan includes 2,000 monthly credits");

  assert.equal(result, undefined);
});

test("parseBrowserCreditText rejects ambiguous OCR text with multiple numbers", () => {
  const result = parseBrowserCreditText("Credits 5717 / 10000");

  assert.equal(result, undefined);
});

import assert from "node:assert/strict";
import { test } from "node:test";
import { missingBrowserExtensionSnapshot, normalizeBrowserExtensionSnapshot } from "./browserExtension";

test("normalizeBrowserExtensionSnapshot turns visible Lovart text into a verified snapshot", () => {
  const result = normalizeBrowserExtensionSnapshot(
    {
      platform: "lovart",
      url: "https://www.lovart.ai/workspace",
      title: "Lovart Workspace",
      text: "Account\nCurrent balance\n8,420 credits\nBilling",
    },
    "2026-06-19T12:00:00.000Z",
  );

  assert.equal(result.ok, true);
  assert.equal(result.snapshot?.accountId, "lovart-main");
  assert.equal(result.snapshot?.creditsRemaining, 8420);
  assert.equal(result.snapshot?.confidence, "verified");
  assert.equal(result.snapshot?.sourceUpdatedAt, "2026-06-19T12:00:00.000Z");
});

test("normalizeBrowserExtensionSnapshot asks for auth when the current tab looks logged out", () => {
  const result = normalizeBrowserExtensionSnapshot({
    platform: "tapnow",
    url: "https://app.tapnow.ai/login",
    title: "Log in",
    text: "Sign in with Google",
  });

  assert.equal(result.ok, false);
  assert.equal(result.authState, "needs_auth");
  assert.equal(result.errorCode, "LOGIN_REQUIRED");
});

test("missingBrowserExtensionSnapshot keeps browser platforms unconfigured until the extension sends a page", () => {
  const result = missingBrowserExtensionSnapshot("tapnow");

  assert.equal(result.ok, false);
  assert.equal(result.platform, "tapnow");
  assert.equal(result.authState, "needs_auth");
  assert.equal(result.errorCode, "EXTENSION_SNAPSHOT_MISSING");
});

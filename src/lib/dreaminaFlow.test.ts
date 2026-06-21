import assert from "node:assert/strict";
import { test } from "node:test";
import { shouldFetchDreaminaStatusAfterAuth } from "./dreaminaFlow";

test("shouldFetchDreaminaStatusAfterAuth fetches a balance when auth is already ready", () => {
  assert.equal(shouldFetchDreaminaStatusAfterAuth({ ok: true, authState: "ready" }), true);
});

test("shouldFetchDreaminaStatusAfterAuth waits when auth still needs browser approval", () => {
  assert.equal(shouldFetchDreaminaStatusAfterAuth({ ok: true, authState: "needs_auth" }), false);
});

test("shouldFetchDreaminaStatusAfterAuth does not fetch after failed login start", () => {
  assert.equal(shouldFetchDreaminaStatusAfterAuth({ ok: false, authState: "missing_config" }), false);
});

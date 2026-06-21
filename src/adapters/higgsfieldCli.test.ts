import assert from "node:assert/strict";
import test from "node:test";

import { normalizeHiggsfieldCliError, parseHiggsfieldStatus, parseHiggsfieldTransactions } from "./higgsfieldCli";

test("parseHiggsfieldStatus extracts available credits from common CLI JSON", () => {
  const result = parseHiggsfieldStatus(
    JSON.stringify({
      email: "maker@example.com",
      plan: "Pro",
      availableCredits: 640,
      creditsTotal: 780,
    }),
    { accountId: "higgsfield-main", capturedAt: "2026-06-17T08:00:00+08:00" },
  );

  assert.equal(result.authState, "ready");
  assert.equal(result.snapshot.accountId, "higgsfield-main");
  assert.equal(result.snapshot.creditsRemaining, 640);
  assert.equal(result.snapshot.creditsTotal, 780);
  assert.equal(result.snapshot.currencyLabel, "credits");
  assert.equal(result.snapshot.capturedAt, "2026-06-17T08:00:00+08:00");
  assert.equal(result.snapshot.sourceUpdatedAt, "2026-06-17T08:00:00+08:00");
  assert.equal(result.snapshot.confidence, "verified");
  assert.equal(result.accountEmail, "maker@example.com");
  assert.equal(result.planLabel, "Pro");
});

test("parseHiggsfieldStatus accepts CLI JSON with a UTF-8 BOM", () => {
  const result = parseHiggsfieldStatus(
    `\uFEFF${JSON.stringify({
      email: "maker@example.com",
      credits: 5963.88,
      subscription_plan_type: "creator",
    })}`,
    { accountId: "higgsfield-main", capturedAt: "2026-06-19T12:00:00+08:00" },
  );

  assert.equal(result.snapshot.creditsRemaining, 5963.88);
  assert.equal(result.planLabel, "creator");
});

test("parseHiggsfieldStatus extracts credits from nested CLI JSON", () => {
  const result = parseHiggsfieldStatus(
    JSON.stringify({
      data: {
        account: { email: "studio@example.com" },
        subscription: { name: "Creator" },
        balance: { available_credits: 128 },
      },
    }),
    { accountId: "higgsfield-main", capturedAt: "2026-06-17T08:00:00+08:00" },
  );

  assert.equal(result.snapshot.creditsRemaining, 128);
  assert.equal(result.accountEmail, "studio@example.com");
  assert.equal(result.planLabel, "Creator");
});

test("parseHiggsfieldStatus rejects JSON without a numeric credit field", () => {
  assert.throws(
    () => parseHiggsfieldStatus(JSON.stringify({ email: "maker@example.com" }), {
      accountId: "higgsfield-main",
      capturedAt: "2026-06-17T08:00:00+08:00",
    }),
    /NO_CREDITS_FIELD/,
  );
});

test("parseHiggsfieldTransactions derives source update and next reset from grants", () => {
  const evidence = parseHiggsfieldTransactions(
    JSON.stringify([
      {
        display_name: "Seedance 2.0",
        credits: -45,
        action: "spend",
        created_at: "2026-06-13T12:57:54.667792Z",
      },
      {
        display_name: "Monthly credits",
        credits: 6000,
        action: "grant",
        created_at: "2026-06-06T14:00:24.083505Z",
      },
      {
        display_name: "Trial credits",
        credits: 500,
        action: "grant",
        created_at: "2026-06-03T16:42:37.687378Z",
      },
    ]),
  );

  assert.equal(evidence.sourceUpdatedAt, "2026-06-13T12:57:54.667792Z");
  assert.equal(evidence.creditsTotal, 6000);
  assert.equal(evidence.lastGrantAt, "2026-06-06T14:00:24.083505Z");
  assert.equal(evidence.nextResetAt, "2026-07-06T14:00:24.083Z");
  assert.equal(evidence.resetSource, "transaction_inferred");
  assert.equal(evidence.resetConfidence, "inferred");
});

test("parseHiggsfieldStatus merges transaction evidence into the snapshot", () => {
  const result = parseHiggsfieldStatus(JSON.stringify({ credits: 5963.88 }), {
    accountId: "higgsfield-main",
    capturedAt: "2026-06-19T12:00:00+08:00",
    transactionEvidence: {
      creditsTotal: 6000,
      sourceUpdatedAt: "2026-06-13T12:57:54.667792Z",
      lastGrantAt: "2026-06-06T14:00:24.083505Z",
      nextResetAt: "2026-07-06T14:00:24.083Z",
      resetSource: "transaction_inferred",
      resetConfidence: "inferred",
      resetBasis: "Latest Higgsfield grant plus one monthly cycle.",
    },
  });

  assert.equal(result.snapshot.creditsTotal, 6000);
  assert.equal(result.snapshot.sourceUpdatedAt, "2026-06-13T12:57:54.667792Z");
  assert.equal(result.snapshot.lastGrantAt, "2026-06-06T14:00:24.083505Z");
  assert.equal(result.snapshot.nextResetAt, "2026-07-06T14:00:24.083Z");
  assert.equal(result.snapshot.resetConfidence, "inferred");
});

test("normalizeHiggsfieldCliError maps expired sessions to reauth", () => {
  assert.deepEqual(normalizeHiggsfieldCliError("Error: Session expired.\nHint: Run: hf auth login"), {
    authState: "needs_auth",
    errorCode: "SESSION_EXPIRED",
    errorMessage: "Higgsfield session expired. Start the guided login flow, then retry status.",
  });
});

test("normalizeHiggsfieldCliError maps missing CLI to missing config", () => {
  assert.deepEqual(normalizeHiggsfieldCliError("higgsfield: command not found"), {
    authState: "missing_config",
    errorCode: "CLI_NOT_FOUND",
    errorMessage: "Higgsfield CLI is not available on PATH. Install it before connecting this account.",
  });
});

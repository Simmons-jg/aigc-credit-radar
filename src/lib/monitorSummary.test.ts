import assert from "node:assert/strict";
import { test } from "node:test";
import { createMonitorSummary } from "./monitorSummary";
import type { FetchSummary, PlatformRecord } from "../types";

function record(overrides: Partial<PlatformRecord> & { platform: string }): PlatformRecord {
  return {
    account: {
      id: `${overrides.platform}-main`,
      platform: overrides.platform,
      label: overrides.platform,
      adapterKind: "browser",
      adapterLabel: "Browser",
      authState: "missing_config",
      resetRule: { type: "monthly_day", dayOfMonth: 7, timezone: "Asia/Shanghai" },
      enabled: true,
    },
    nextRunAt: "2026-06-21T10:00:00.000Z",
    cadence: "daily",
    ...overrides,
  };
}

const fetchSummary: FetchSummary = {
  startedAt: "2026-06-20T08:00:00.000Z",
  finishedAt: "2026-06-20T08:01:00.000Z",
  total: 2,
  success: 1,
  failed: 1,
  nextRunAt: "2026-06-21T08:00:00.000Z",
};

test("createMonitorSummary counts connected, missing snapshot, and blocked records", () => {
  const summary = createMonitorSummary(
    [
      record({
        platform: "higgsfield",
        account: {
          id: "higgsfield-main",
          platform: "higgsfield",
          label: "Higgsfield",
          adapterKind: "cli",
          adapterLabel: "CLI",
          authState: "ready",
          resetRule: { type: "monthly_day", dayOfMonth: 7, timezone: "Asia/Shanghai" },
          enabled: true,
        },
        snapshot: {
          id: "snap-higgsfield",
          accountId: "higgsfield-main",
          creditsRemaining: 20,
          creditsTotal: 100,
          currencyLabel: "credits",
          capturedAt: "2026-06-20T08:01:00.000Z",
          confidence: "verified",
        },
      }),
      record({
        platform: "lovart",
        lastRun: {
          id: "run-lovart",
          accountId: "lovart-main",
          startedAt: "2026-06-20T08:00:00.000Z",
          finishedAt: "2026-06-20T08:01:00.000Z",
          status: "failed",
        },
      }),
    ],
    fetchSummary,
  );

  assert.equal(summary.totalAccounts, 2);
  assert.equal(summary.connectedAccounts, 1);
  assert.equal(summary.missingSnapshots, 1);
  assert.equal(summary.blockedAdapters, 1);
  assert.equal(summary.successfulRuns, 1);
  assert.equal(summary.failedRuns, 1);
});

test("createMonitorSummary treats a captured snapshot as connected even before auth is restored", () => {
  const summary = createMonitorSummary(
    [
      record({
        platform: "tapnow",
        snapshot: {
          id: "snap-tapnow",
          accountId: "tapnow-main",
          creditsRemaining: 12,
          currencyLabel: "tokens",
          capturedAt: "2026-06-20T08:01:00.000Z",
          confidence: "estimated",
        },
      }),
    ],
    fetchSummary,
  );

  assert.equal(summary.connectedAccounts, 1);
  assert.equal(summary.missingSnapshots, 0);
});

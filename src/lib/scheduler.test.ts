import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createRiskReminderCandidates,
  isScheduledSyncDue,
  mergeReminderKeys,
  nextScheduledRunAt,
  type SchedulerState,
} from "./scheduler";
import type { PlatformRecord } from "../types";

function record(overrides: Partial<PlatformRecord> = {}): PlatformRecord {
  return {
    account: {
      id: "higgsfield-main",
      platform: "higgsfield",
      label: "Higgsfield",
      adapterKind: "cli",
      adapterLabel: "Official CLI adapter",
      authState: "ready",
      resetRule: { type: "monthly_day", dayOfMonth: 7, timezone: "Asia/Shanghai" },
      enabled: true,
      tracked: true,
    },
    snapshot: {
      id: "snap-higgsfield",
      accountId: "higgsfield-main",
      creditsRemaining: 5963.88,
      creditsTotal: 6000,
      currencyLabel: "credits",
      capturedAt: "2026-06-21T10:00:00+08:00",
      confidence: "verified",
    },
    nextRunAt: "2026-06-22T10:00:00+08:00",
    cadence: "daily",
    ...overrides,
  };
}

test("isScheduledSyncDue waits until a supported account reaches nextRunAt", () => {
  const scheduler: SchedulerState = { enabled: true, lastReminderKeys: [] };

  assert.equal(isScheduledSyncDue([record()], scheduler, new Date("2026-06-22T09:59:00+08:00")), false);
  assert.equal(isScheduledSyncDue([record()], scheduler, new Date("2026-06-22T10:00:00+08:00")), true);
});

test("isScheduledSyncDue does not run unsupported manual-only accounts", () => {
  const scheduler: SchedulerState = { enabled: true, lastReminderKeys: [] };
  const manual = record({
    account: {
      ...record().account,
      id: "lovart-main",
      platform: "lovart",
      label: "Lovart",
      adapterKind: "manual",
    },
  });

  assert.equal(isScheduledSyncDue([manual], scheduler, new Date("2026-06-23T10:00:00+08:00")), false);
});

test("nextScheduledRunAt falls back to one day after the last automatic run", () => {
  const scheduler: SchedulerState = {
    enabled: true,
    lastAutoRunAt: "2026-06-21T10:00:00.000Z",
    lastReminderKeys: [],
  };

  assert.equal(
    nextScheduledRunAt([record({ nextRunAt: "" })], scheduler, new Date("2026-06-21T11:00:00.000Z")),
    "2026-06-22T10:00:00.000Z",
  );
});

test("createRiskReminderCandidates creates one reminder per risk window", () => {
  const candidates = createRiskReminderCandidates(
    [
      {
        record: record(),
        risk: {
          accountId: "higgsfield-main",
          level: "high",
          daysToReset: 7,
          resetDate: new Date("2026-06-28T00:00:00+08:00"),
          amountAtRisk: 5963.88,
          reasonKey: "threeDayUnused",
          actionKey: "spendFirst",
        },
      },
    ],
    "en",
    new Date("2026-06-21T10:00:00+08:00"),
  );

  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].level, "high");
  assert.match(candidates[0].title, /Higgsfield/);
  assert.match(candidates[0].body, /7d left/);
});

test("mergeReminderKeys deduplicates and caps stored reminder keys", () => {
  assert.deepEqual(mergeReminderKeys(["a", "b"], ["b", "c"]), ["a", "b", "c"]);
  assert.deepEqual(mergeReminderKeys(["a", "b", "c"], ["d"], 2), ["c", "d"]);
});

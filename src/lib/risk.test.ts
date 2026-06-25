import assert from "node:assert/strict";
import { test } from "node:test";
import { assessRisk, effectiveCreditsTotal, resolveRecordResetDate, resolveResetDate } from "./risk";
import type { PlatformRecord } from "../types";

test("resolveRecordResetDate prefers user fixed date over inferred snapshot reset", () => {
  const record: PlatformRecord = {
    account: {
      id: "higgsfield-main",
      platform: "higgsfield",
      label: "Higgsfield",
      adapterKind: "cli",
      adapterLabel: "Official CLI adapter",
      authState: "ready",
      resetRule: { type: "fixed_date", fixedDate: "2026-06-25T00:00:00+08:00", timezone: "Asia/Shanghai" },
      enabled: true,
    },
    snapshot: {
      id: "snap-higgsfield",
      accountId: "higgsfield-main",
      creditsRemaining: 5963.88,
      currencyLabel: "credits",
      capturedAt: "2026-06-19T12:24:45.981Z",
      nextResetAt: "2026-07-06T14:00:24.083Z",
      resetSource: "transaction_inferred",
      resetConfidence: "inferred",
      confidence: "verified",
    },
    nextRunAt: "",
    cadence: "daily",
  };

  assert.equal(resolveRecordResetDate(record, new Date("2026-06-20T10:00:00+08:00")).toISOString(), "2026-06-24T16:00:00.000Z");
});

test("resolveRecordResetDate rolls legacy past fixed dates as monthly reset days", () => {
  const record: PlatformRecord = {
    account: {
      id: "lovart-main",
      platform: "lovart",
      label: "Lovart",
      adapterKind: "browser",
      adapterLabel: "Browser session adapter",
      authState: "ready",
      resetRule: { type: "fixed_date", fixedDate: "2026-06-07T00:00:00+08:00", timezone: "Asia/Shanghai" },
      enabled: true,
      tracked: true,
    },
    snapshot: {
      id: "snap-lovart",
      accountId: "lovart-main",
      creditsRemaining: 3600,
      currencyLabel: "credits",
      capturedAt: "2026-06-21T16:59:00+08:00",
      confidence: "estimated",
    },
    nextRunAt: "",
    cadence: "paused",
  };

  assert.equal(resolveRecordResetDate(record, new Date("2026-06-21T16:59:00+08:00")).toISOString(), "2026-07-06T16:00:00.000Z");
});

test("resolveResetDate rolls monthly reset days to the next available month", () => {
  const resetDate = resolveResetDate(
    { type: "monthly_day", dayOfMonth: 7, timezone: "Asia/Shanghai" },
    new Date("2026-06-20T10:00:00+08:00"),
  );

  assert.equal(resetDate.getFullYear(), 2026);
  assert.equal(resetDate.getMonth(), 6);
  assert.equal(resetDate.getDate(), 7);
  assert.equal(resetDate.getHours(), 0);
});

test("resolveResetDate supports yearly reset dates", () => {
  const resetDate = resolveResetDate(
    { type: "yearly_date", month: 6, dayOfMonth: 7, timezone: "Asia/Shanghai" },
    new Date("2026-06-20T10:00:00+08:00"),
  );

  assert.equal(resetDate.getFullYear(), 2027);
  assert.equal(resetDate.getMonth(), 5);
  assert.equal(resetDate.getDate(), 7);
  assert.equal(resetDate.getHours(), 0);
});

test("assessRisk uses the configured 1/3/7/10 day windows", () => {
  const now = new Date("2026-06-21T10:00:00+08:00");
  const makeRecord = (days: number): PlatformRecord => ({
    account: {
      id: `manual-${days}`,
      platform: "lovart",
      label: "Lovart",
      adapterKind: "manual",
      adapterLabel: "Manual import",
      authState: "ready",
      resetRule: {
        type: "fixed_date",
        fixedDate: new Date(now.getTime() + days * 86_400_000).toISOString(),
        timezone: "Asia/Shanghai",
      },
      enabled: true,
      tracked: true,
    },
    snapshot: {
      id: `snap-${days}`,
      accountId: `manual-${days}`,
      creditsRemaining: 3600,
      creditsTotal: 10000,
      currencyLabel: "credits",
      capturedAt: now.toISOString(),
      confidence: "estimated",
    },
    nextRunAt: "",
    cadence: "paused",
  });

  assert.equal(assessRisk(makeRecord(1), now).level, "veryCritical");
  assert.equal(assessRisk(makeRecord(3), now).level, "critical");
  assert.equal(assessRisk(makeRecord(7), now).level, "high");
  assert.equal(assessRisk(makeRecord(10), now).level, "medium");
  assert.equal(assessRisk(makeRecord(11), now).level, "low");
});

test("assessRisk does not infer a remaining ratio when total credits are unknown", () => {
  const now = new Date("2026-06-21T10:00:00+08:00");
  const record: PlatformRecord = {
    account: {
      id: "manual-lovart",
      platform: "lovart",
      label: "Lovart",
      adapterKind: "manual",
      adapterLabel: "Manual import",
      authState: "ready",
      resetRule: { type: "monthly_day", dayOfMonth: 7, timezone: "Asia/Shanghai" },
      enabled: true,
      tracked: true,
    },
    snapshot: {
      id: "snap-lovart",
      accountId: "manual-lovart",
      creditsRemaining: 3600,
      currencyLabel: "credits",
      capturedAt: now.toISOString(),
      confidence: "estimated",
    },
    nextRunAt: "",
    cadence: "paused",
  };

  assert.equal(assessRisk(record, now).unusedRatio, undefined);
});

test("assessRisk uses the account configured total when snapshot total is missing", () => {
  const now = new Date("2026-06-21T10:00:00+08:00");
  const record: PlatformRecord = {
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
      configuredCreditsTotal: 1000,
    },
    snapshot: {
      id: "snap-higgsfield",
      accountId: "higgsfield-main",
      creditsRemaining: 816.54,
      currencyLabel: "credits",
      capturedAt: now.toISOString(),
      confidence: "verified",
    },
    nextRunAt: "",
    cadence: "daily",
  };

  assert.equal(effectiveCreditsTotal(record), 1000);
  assert.equal(Math.round((assessRisk(record, now).unusedRatio ?? 0) * 100), 82);
});

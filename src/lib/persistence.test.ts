import assert from "node:assert/strict";
import { test } from "node:test";
import { mergeStoredRecords } from "./persistence";
import { realModeRecords } from "../data/realMode";
import type { PlatformRecord } from "../types";

test("mergeStoredRecords preserves snapshots and user reset dates without inventing new accounts", () => {
  const stored: PlatformRecord[] = [
    {
      ...realModeRecords[0],
      account: {
        ...realModeRecords[0].account,
        authState: "ready",
        tracked: true,
        resetRule: { type: "fixed_date", fixedDate: "2026-06-25T00:00:00+08:00", timezone: "Asia/Shanghai" },
      },
      snapshot: {
        id: "snap-higgsfield",
        accountId: "higgsfield-main",
        creditsRemaining: 5963.88,
        currencyLabel: "credits",
        capturedAt: "2026-06-19T12:24:45.981Z",
        confidence: "verified",
      },
      nextRunAt: "2026-06-20T12:24:45.981Z",
    },
    {
      ...realModeRecords[0],
      account: { ...realModeRecords[0].account, id: "unknown-account", platform: "unknown" },
    },
  ];

  const merged = mergeStoredRecords(realModeRecords, stored);
  const higgsfield = merged.find((record) => record.account.id === "higgsfield-main");

  assert.equal(merged.length, realModeRecords.length);
  assert.equal(higgsfield?.account.authState, "ready");
  assert.equal(higgsfield?.account.tracked, true);
  assert.equal(higgsfield?.account.resetRule.type, "fixed_date");
  assert.equal(higgsfield?.snapshot?.creditsRemaining, 5963.88);
  assert.ok(!merged.some((record) => record.account.id === "unknown-account"));
});

test("mergeStoredRecords preserves manually hidden default accounts", () => {
  const stored: PlatformRecord[] = [
    {
      ...realModeRecords[0],
      account: {
        ...realModeRecords[0].account,
        authState: "missing_config",
        enabled: false,
        tracked: false,
      },
      snapshot: undefined,
      nextRunAt: "",
      cadence: "paused",
    },
  ];

  const merged = mergeStoredRecords(realModeRecords, stored);
  const higgsfield = merged.find((record) => record.account.id === "higgsfield-main");

  assert.equal(higgsfield?.account.enabled, false);
  assert.equal(higgsfield?.account.tracked, false);
  assert.equal(higgsfield?.snapshot, undefined);
});

test("mergeStoredRecords preserves user-added accounts for known platforms", () => {
  const jimeng = realModeRecords.find((record) => record.account.platform === "jimeng");
  assert.ok(jimeng);

  const storedExtra: PlatformRecord = {
    ...jimeng,
    account: {
      ...jimeng.account,
      id: "jimeng-2",
      label: "即梦 / Jimeng #2",
      authState: "ready",
    },
    snapshot: {
      id: "snap-jimeng-2",
      accountId: "jimeng-2",
      creditsRemaining: 9504,
      creditsTotal: 12000,
      currencyLabel: "credits",
      capturedAt: "2026-06-20T12:24:45.981Z",
      confidence: "verified",
    },
    nextRunAt: "2026-06-21T12:24:45.981Z",
    cadence: "daily",
  };

  const merged = mergeStoredRecords(realModeRecords, [storedExtra]);

  assert.equal(merged.length, realModeRecords.length + 1);
  assert.equal(merged.at(-1)?.account.id, "jimeng-2");
  assert.equal(merged.at(-1)?.snapshot?.creditsRemaining, 9504);
});

test("mergeStoredRecords preserves custom manual import accounts with snapshots", () => {
  const customRecord: PlatformRecord = {
    account: {
      id: "custom-seko-main",
      platform: "custom-seko",
      label: "Seko",
      adapterKind: "manual",
      adapterLabel: "Manual import",
      authState: "ready",
      resetRule: { type: "manual", timezone: "Asia/Shanghai" },
      enabled: true,
      tracked: true,
      docsUrl: "https://seko.example",
    },
    snapshot: {
      id: "snap-custom-seko",
      accountId: "custom-seko-main",
      creditsRemaining: 3600,
      currencyLabel: "credits",
      capturedAt: "2026-06-20T12:24:45.981Z",
      confidence: "estimated",
    },
    nextRunAt: "",
    cadence: "paused",
  };

  const merged = mergeStoredRecords(realModeRecords, [customRecord]);

  assert.equal(merged.at(-1)?.account.label, "Seko");
  assert.equal(merged.at(-1)?.snapshot?.creditsRemaining, 3600);
});

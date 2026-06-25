import assert from "node:assert/strict";
import { test } from "node:test";
import { loadPlatformRecords, mergeStoredRecords, savePlatformRecords, type StorageLike } from "./persistence";
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

test("mergeStoredRecords preserves default manual imports after app restart", () => {
  const lovart = realModeRecords.find((record) => record.account.platform === "lovart");
  assert.ok(lovart);

  const storedLovart: PlatformRecord = {
    ...lovart,
    account: {
      ...lovart.account,
      authState: "ready",
      tracked: true,
      resetRule: { type: "monthly_day", dayOfMonth: 7, timezone: "Asia/Shanghai" },
    },
    snapshot: {
      id: "snap-lovart-main",
      accountId: "lovart-main",
      creditsRemaining: 5717,
      currencyLabel: "credits",
      capturedAt: "2026-06-25T09:00:00+08:00",
      confidence: "estimated",
    },
    nextRunAt: "",
    cadence: "paused",
  };

  const merged = mergeStoredRecords(realModeRecords, [storedLovart]);
  const mergedLovart = merged.find((record) => record.account.id === "lovart-main");

  assert.equal(mergedLovart?.account.authState, "ready");
  assert.equal(mergedLovart?.account.resetRule.type, "monthly_day");
  assert.equal(mergedLovart?.account.resetRule.dayOfMonth, 7);
  assert.equal(mergedLovart?.snapshot?.creditsRemaining, 5717);
});

test("loadPlatformRecords migrates existing localStorage records into desktop storage", () => {
  const jimeng = realModeRecords.find((record) => record.account.platform === "jimeng");
  assert.ok(jimeng);
  const storedJimeng: PlatformRecord = {
    ...jimeng,
    account: {
      ...jimeng.account,
      authState: "ready",
      tracked: true,
      resetRule: { type: "monthly_day", dayOfMonth: 19, timezone: "Asia/Shanghai" },
    },
  };
  const localStorage = memoryStorage({ "aigc-credit-radar-records": JSON.stringify([storedJimeng]) });
  const desktopStorage = memoryStorage();
  const previousWindow = globalThis.window;
  globalThis.window = { localStorage, aigcCreditRadarStorage: desktopStorage } as unknown as Window & typeof globalThis;

  try {
    const loaded = loadPlatformRecords(realModeRecords);
    const loadedJimeng = loaded.find((record) => record.account.id === "jimeng-main");

    assert.equal(loadedJimeng?.account.resetRule.type, "monthly_day");
    assert.equal(loadedJimeng?.account.resetRule.dayOfMonth, 19);
    assert.equal(desktopStorage.getItem("aigc-credit-radar-records"), JSON.stringify([storedJimeng]));
  } finally {
    globalThis.window = previousWindow;
  }
});

test("savePlatformRecords writes to desktop storage when available", () => {
  const localStorage = memoryStorage();
  const desktopStorage = memoryStorage();
  const previousWindow = globalThis.window;
  globalThis.window = { localStorage, aigcCreditRadarStorage: desktopStorage } as unknown as Window & typeof globalThis;

  try {
    savePlatformRecords(realModeRecords);

    assert.equal(localStorage.getItem("aigc-credit-radar-records"), null);
    assert.ok(desktopStorage.getItem("aigc-credit-radar-records")?.includes("higgsfield-main"));
  } finally {
    globalThis.window = previousWindow;
  }
});

function memoryStorage(initial: Record<string, string> = {}): StorageLike {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
}

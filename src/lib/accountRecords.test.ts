import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createAdditionalAccountRecord,
  removeAccountRecord,
  shouldShowAccountRecord,
  trackAccountPlatform,
  visibleAccountRecords,
} from "./accountRecords";
import { realModeRecords } from "../data/realMode";
import type { PlatformRecord } from "../types";

test("createAdditionalAccountRecord creates a second account row for the same platform", () => {
  const extra = createAdditionalAccountRecord(realModeRecords, "jimeng");

  assert.equal(extra?.account.platform, "jimeng");
  assert.equal(extra?.account.id, "jimeng-2");
  assert.equal(extra?.account.label, `${realModeRecords.find((record) => record.account.platform === "jimeng")?.account.label} #2`);
  assert.equal(extra?.account.authState, "missing_config");
  assert.equal(extra?.account.tracked, true);
  assert.equal(extra?.snapshot, undefined);
  assert.equal(extra?.cadence, "paused");
});

test("createAdditionalAccountRecord skips unknown platforms", () => {
  assert.equal(createAdditionalAccountRecord(realModeRecords, "unknown"), undefined);
});

test("shouldShowAccountRecord hides untouched default templates", () => {
  const lovart = realModeRecords.find((record) => record.account.platform === "lovart");
  assert.ok(lovart);
  assert.equal(shouldShowAccountRecord(lovart), false);
});

test("shouldShowAccountRecord shows user-added and connected accounts", () => {
  const higgsfield = realModeRecords.find((record) => record.account.platform === "higgsfield");
  assert.ok(higgsfield);
  const connected: PlatformRecord = {
    ...higgsfield,
    account: { ...higgsfield.account, authState: "ready" },
  };
  const extra = createAdditionalAccountRecord(realModeRecords, "jimeng");
  assert.ok(extra);

  assert.equal(shouldShowAccountRecord(connected), true);
  assert.equal(shouldShowAccountRecord(extra), true);
});

test("visibleAccountRecords keeps the ledger empty until the user adds or connects an account", () => {
  assert.deepEqual(visibleAccountRecords(realModeRecords), []);
});

test("import-only accounts stay hidden until a real snapshot exists", () => {
  const lovart = realModeRecords.find((record) => record.account.platform === "lovart");
  assert.ok(lovart);

  const pendingImportRecord: PlatformRecord = {
    ...lovart,
    account: { ...lovart.account, tracked: true },
  };
  const capturedImportRecord: PlatformRecord = {
    ...pendingImportRecord,
    snapshot: {
      id: "snap-lovart-main",
      accountId: "lovart-main",
      creditsRemaining: 5717,
      currencyLabel: "credits",
      capturedAt: "2026-06-21T08:00:00+08:00",
      confidence: "verified",
    },
  };

  assert.equal(shouldShowAccountRecord(pendingImportRecord), false);
  assert.equal(shouldShowAccountRecord(capturedImportRecord), true);
});

test("trackAccountPlatform enables the primary account without creating fake extra rows", () => {
  const tracked = trackAccountPlatform(realModeRecords, "higgsfield");
  const visible = visibleAccountRecords(tracked);

  assert.equal(visible.length, 1);
  assert.equal(visible[0].account.id, "higgsfield-main");
  assert.equal(visible[0].account.tracked, true);

  const secondPass = trackAccountPlatform(tracked, "higgsfield");
  assert.equal(secondPass.some((record) => record.account.id === "higgsfield-2"), false);
  assert.equal(visibleAccountRecords(secondPass).filter((record) => record.account.platform === "higgsfield").length, 1);
});

test("removeAccountRecord hides default accounts and removes user-added accounts", () => {
  const tracked = trackAccountPlatform(realModeRecords, "higgsfield");
  const extra = createAdditionalAccountRecord(tracked, "higgsfield");
  assert.ok(extra);
  const withExtra = [...tracked, extra];
  const withoutExtra = removeAccountRecord(withExtra, "higgsfield-2");
  const removedPrimary = removeAccountRecord(withoutExtra, "higgsfield-main");

  assert.ok(!withoutExtra.some((record) => record.account.id === "higgsfield-2"));
  assert.equal(visibleAccountRecords(removedPrimary).some((record) => record.account.id === "higgsfield-main"), false);
});

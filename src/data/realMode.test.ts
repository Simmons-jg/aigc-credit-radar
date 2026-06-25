import assert from "node:assert/strict";
import { test } from "node:test";
import { realModeRecords } from "./realMode";

test("initial platform records never ship simulated third-party balances", () => {
  const platforms = realModeRecords.map((record) => record.account.platform);
  assert.deepEqual(platforms, [
    "higgsfield",
    "openart",
    "lovart",
    "tapnow",
    "updream",
    "libtv",
    "keling",
    "shotlab",
    "jimeng",
  ]);

  assert.ok(realModeRecords.every((record) => record.account.authState !== "demo"));
  assert.ok(realModeRecords.every((record) => record.account.adapterKind !== "demo"));

  for (const record of realModeRecords) {
    assert.equal(record.snapshot, undefined, `${record.account.label} should wait for a real connector snapshot`);
  }
});

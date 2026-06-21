import assert from "node:assert/strict";
import { test } from "node:test";
import { connectionStateFromRecord, browserConnectionStatesFromRecords } from "./connectionInitialState";
import type { PlatformRecord } from "../types";

function record(platform: string, authState: PlatformRecord["account"]["authState"]): PlatformRecord {
  return {
    account: {
      id: `${platform}-main`,
      platform,
      label: platform,
      adapterKind: platform === "lovart" ? "browser" : "cli",
      adapterLabel: "adapter",
      authState,
      resetRule: { type: "monthly_day", dayOfMonth: 7, timezone: "Asia/Shanghai" },
      enabled: true,
    },
    nextRunAt: "",
    cadence: "daily",
  };
}

test("connectionStateFromRecord restores ready sessions after app reload", () => {
  assert.deepEqual(connectionStateFromRecord(record("higgsfield", "ready")), {
    phase: "ready",
    authState: "ready",
  });
});

test("browserConnectionStatesFromRecords restores browser platforms by platform id", () => {
  assert.deepEqual(browserConnectionStatesFromRecords([record("lovart", "ready")]), {
    lovart: {
      phase: "ready",
      authState: "ready",
    },
  });
});

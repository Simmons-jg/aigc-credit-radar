import type { PlatformRecord } from "../types";
import type { ConnectorConnectionState } from "./connectionServiceHealth";

export function connectionStateFromRecord(record: PlatformRecord | undefined): ConnectorConnectionState {
  if (!record) return { phase: "idle" };

  if (record.account.authState === "ready") {
    return { phase: "ready", authState: "ready" };
  }

  if (record.account.authState === "needs_auth") {
    return { phase: "needs_auth", authState: "needs_auth" };
  }

  return { phase: "missing_config", authState: "missing_config" };
}

export function browserConnectionStatesFromRecords(records: PlatformRecord[]): Record<string, ConnectorConnectionState> {
  return Object.fromEntries(
    records
      .filter((record) => record.account.adapterKind === "browser")
      .map((record) => [record.account.platform, connectionStateFromRecord(record)]),
  );
}

import { rankRecords } from "./risk";
import type { FetchSummary, PlatformRecord, RiskAssessment } from "../types";

export interface MonitorSummary {
  totalAccounts: number;
  connectedAccounts: number;
  missingSnapshots: number;
  blockedAdapters: number;
  successfulRuns: number;
  failedRuns: number;
  nextRunAt: string;
  lastFinishedAt?: string;
  highestRisk?: {
    record: PlatformRecord;
    risk: RiskAssessment;
  };
}

export function createMonitorSummary(records: PlatformRecord[], fetchSummary: FetchSummary): MonitorSummary {
  const ranked = rankRecords(records);

  return {
    totalAccounts: records.length,
    connectedAccounts: records.filter((record) => record.account.authState === "ready" || record.snapshot).length,
    missingSnapshots: records.filter((record) => !record.snapshot).length,
    blockedAdapters: records.filter(
      (record) =>
        record.lastRun?.status === "failed" ||
        record.account.authState === "missing_config" ||
        record.account.authState === "needs_auth",
    ).length,
    successfulRuns: fetchSummary.success,
    failedRuns: fetchSummary.failed,
    nextRunAt: fetchSummary.nextRunAt,
    lastFinishedAt: fetchSummary.finishedAt,
    highestRisk: ranked[0],
  };
}

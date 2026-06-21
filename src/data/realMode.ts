import type { FetchSummary, PipelineStep, PlatformRecord } from "../types";
import { manualPlatformOptions } from "./manualPlatforms";

const bootTime = new Date().toISOString();

function notConfiguredRun(accountId: string, errorMessage: string) {
  return {
    id: `run-${accountId}-not-configured`,
    accountId,
    startedAt: bootTime,
    finishedAt: bootTime,
    status: "not_configured" as const,
    errorCode: "ADAPTER_NOT_CONFIGURED",
    errorMessage,
  };
}

function manualImportRecord(platform: string, label: string, docsUrl?: string): PlatformRecord {
  return {
    account: {
      id: `${platform}-main`,
      platform,
      label,
      adapterKind: "manual",
      adapterLabel: "Manual import",
      authState: "missing_config",
      resetRule: { type: "manual", timezone: "Asia/Shanghai" },
      enabled: true,
      docsUrl,
    },
    lastRun: notConfiguredRun(`${platform}-main`, `Import a real ${label} balance before tracking this account.`),
    nextRunAt: "",
    cadence: "paused",
  };
}

const manualImportRecords = manualPlatformOptions.map((option) =>
  manualImportRecord(option.id, option.labels.zh, option.websiteUrl),
);

export const realModeRecords: PlatformRecord[] = [
  {
    account: {
      id: "higgsfield-main",
      platform: "higgsfield",
      label: "Higgsfield",
      adapterKind: "cli",
      adapterLabel: "Official CLI adapter",
      authState: "needs_auth",
      resetRule: { type: "monthly_day", dayOfMonth: 7, timezone: "Asia/Shanghai" },
      enabled: true,
      docsUrl: "https://github.com/higgsfield-ai/cli",
    },
    nextRunAt: "",
    cadence: "daily",
  },
  ...manualImportRecords,
  {
    account: {
      id: "jimeng-main",
      platform: "jimeng",
      label: "即梦 / Jimeng",
      adapterKind: "cli",
      adapterLabel: "Dreamina CLI adapter",
      authState: "missing_config",
      resetRule: { type: "manual", timezone: "Asia/Shanghai" },
      enabled: true,
    },
    lastRun: notConfiguredRun("jimeng-main", "Points endpoint adapter is not configured yet."),
    nextRunAt: "",
    cadence: "paused",
  },
];

export const initialFetchSummary: FetchSummary = {
  startedAt: "",
  total: realModeRecords.length,
  success: 0,
  failed: 0,
  nextRunAt: "",
};

export const pipelineSteps: PipelineStep[] = [
  { id: "schedule", labelKey: "stepSchedule", status: "queued", detailKey: "stepScheduleDetail" },
  { id: "auth", labelKey: "stepAuth", status: "blocked", detailKey: "stepAuthDetail" },
  { id: "fetch", labelKey: "stepFetch", status: "queued", detailKey: "stepFetchDetail" },
  { id: "persist", labelKey: "stepPersist", status: "queued", detailKey: "stepPersistDetail" },
];

import type { Language, PlatformRecord, RiskAssessment } from "../types";

export const schedulerStorageKey = "aigc-credit-radar.scheduler.v1";
export const dailyIntervalMs = 86_400_000;

export interface SchedulerState {
  enabled: boolean;
  lastAutoRunAt?: string;
  lastReminderKeys: string[];
}

export interface ReminderCandidate {
  key: string;
  title: string;
  body: string;
  tag: string;
}

export type RankedRiskItem = { record: PlatformRecord; risk: RiskAssessment };

const supportedScheduledPlatforms = new Set(["higgsfield", "jimeng"]);

function validTime(iso: string | undefined) {
  if (!iso) return undefined;
  const time = Date.parse(iso);
  return Number.isFinite(time) ? time : undefined;
}

export function canScheduleRecord(record: PlatformRecord) {
  return (
    supportedScheduledPlatforms.has(record.account.platform) &&
    record.account.enabled &&
    (record.account.authState === "ready" || Boolean(record.snapshot) || record.lastRun?.status === "failed")
  );
}

export function nextScheduledRunAt(records: PlatformRecord[], scheduler: SchedulerState, now = new Date()) {
  const recordNextRuns = records
    .filter(canScheduleRecord)
    .map((record) => validTime(record.nextRunAt))
    .filter((time): time is number => time !== undefined);

  if (recordNextRuns.length > 0) {
    return new Date(Math.min(...recordNextRuns)).toISOString();
  }

  const lastRun = validTime(scheduler.lastAutoRunAt);
  if (lastRun !== undefined) {
    return new Date(lastRun + dailyIntervalMs).toISOString();
  }

  return now.toISOString();
}

export function isScheduledSyncDue(records: PlatformRecord[], scheduler: SchedulerState, now = new Date()) {
  if (!scheduler.enabled) return false;
  if (!records.some(canScheduleRecord)) return false;

  return Date.parse(nextScheduledRunAt(records, scheduler, now)) <= now.getTime();
}

function reminderWindow(daysToReset: number) {
  if (daysToReset <= 1) return "1d";
  if (daysToReset <= 3) return "3d";
  if (daysToReset <= 7) return "7d";
  if (daysToReset <= 10) return "10d";
  return undefined;
}

function dateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function formatResetDate(date: Date, language: Language) {
  return new Intl.DateTimeFormat(language === "zh" ? "zh-CN" : "en-US", {
    month: "short",
    day: "2-digit",
  }).format(date);
}

export function createRiskReminderCandidates(items: RankedRiskItem[], language: Language, now = new Date()) {
  const today = dateKey(now);

  return items
    .map(({ record, risk }) => {
      const windowKey = reminderWindow(risk.daysToReset);
      if (!windowKey) return undefined;
      if (risk.amountAtRisk <= 0) return undefined;

      const amount = record.snapshot
        ? `${record.snapshot.creditsRemaining} ${record.snapshot.currencyLabel}`
        : language === "zh"
          ? "仍有余额"
          : "balance remains";
      const resetDate = formatResetDate(risk.resetDate, language);
      const key = `${today}:${record.account.id}:${windowKey}:${dateKey(risk.resetDate)}`;

      return {
        key,
        tag: `aigc-credit-radar:${record.account.id}:${windowKey}`,
        title:
          language === "zh"
            ? `${record.account.label} 积分即将重置`
            : `${record.account.label} credits reset soon`,
        body:
          language === "zh"
            ? `剩余 ${risk.daysToReset} 天，${amount} 可能浪费。重置日：${resetDate}。`
            : `${risk.daysToReset}d left, ${amount} may be wasted. Reset: ${resetDate}.`,
      };
    })
    .filter((candidate): candidate is ReminderCandidate => Boolean(candidate));
}

export function mergeReminderKeys(current: string[], next: string[], maxKeys = 80) {
  return [...new Set([...current, ...next])].slice(-maxKeys);
}

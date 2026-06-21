import type { PlatformRecord, ResetRule, RiskAssessment, RiskLevel } from "../types";

function currentTime() {
  return new Date();
}

function clampDayOfMonth(dayOfMonth: number, year: number, monthIndex: number) {
  const lastDay = new Date(year, monthIndex + 1, 0).getDate();
  return Math.min(Math.max(1, dayOfMonth), lastDay);
}

export function resolveResetDate(rule: ResetRule, now = currentTime()): Date {
  if (rule.type === "fixed_date" && rule.fixedDate) {
    return new Date(rule.fixedDate);
  }

  if (rule.type === "monthly_day" && rule.dayOfMonth) {
    const candidate = new Date(now);
    candidate.setDate(clampDayOfMonth(rule.dayOfMonth, candidate.getFullYear(), candidate.getMonth()));
    candidate.setHours(0, 0, 0, 0);
    if (candidate.getTime() <= now.getTime()) {
      candidate.setMonth(candidate.getMonth() + 1);
      candidate.setDate(clampDayOfMonth(rule.dayOfMonth, candidate.getFullYear(), candidate.getMonth()));
    }
    return candidate;
  }

  if (rule.type === "yearly_date" && rule.month && rule.dayOfMonth) {
    const candidate = new Date(now);
    const monthIndex = Math.min(Math.max(1, rule.month), 12) - 1;
    candidate.setMonth(monthIndex);
    candidate.setDate(clampDayOfMonth(rule.dayOfMonth, candidate.getFullYear(), monthIndex));
    candidate.setHours(0, 0, 0, 0);
    if (candidate.getTime() <= now.getTime()) {
      candidate.setFullYear(candidate.getFullYear() + 1);
      candidate.setDate(clampDayOfMonth(rule.dayOfMonth, candidate.getFullYear(), monthIndex));
    }
    return candidate;
  }

  const fallback = new Date(now);
  fallback.setDate(fallback.getDate() + 30);
  return fallback;
}

export function resolveRecordResetDate(record: PlatformRecord, now = currentTime()): Date {
  if (record.account.resetRule.type === "fixed_date" && record.account.resetRule.fixedDate) {
    const fixedDate = new Date(record.account.resetRule.fixedDate);
    if (Number.isFinite(fixedDate.getTime()) && fixedDate.getTime() > now.getTime()) {
      return fixedDate;
    }

    if (Number.isFinite(fixedDate.getTime())) {
      return resolveResetDate(
        {
          type: "monthly_day",
          dayOfMonth: fixedDate.getDate(),
          timezone: record.account.resetRule.timezone,
        },
        now,
      );
    }
  }

  if (record.snapshot?.nextResetAt) {
    const inferred = new Date(record.snapshot.nextResetAt);
    if (Number.isFinite(inferred.getTime())) return inferred;
  }

  return resolveResetDate(record.account.resetRule, now);
}

export function daysUntil(date: Date, now = currentTime()): number {
  const ms = date.getTime() - now.getTime();
  return Math.max(0, Math.ceil(ms / 86_400_000));
}

function riskLevelForDays(daysToReset: number): Exclude<RiskLevel, "unknown"> {
  if (daysToReset <= 1) return "veryCritical";
  if (daysToReset <= 3) return "critical";
  if (daysToReset <= 7) return "high";
  if (daysToReset <= 10) return "medium";
  return "low";
}

export function assessRisk(record: PlatformRecord, now = currentTime()): RiskAssessment {
  const resetDate = resolveRecordResetDate(record, now);
  const daysToReset = daysUntil(resetDate, now);
  const remaining = record.snapshot?.creditsRemaining ?? 0;
  const total = record.snapshot?.creditsTotal;
  const unusedRatio = total ? remaining / total : undefined;
  const hasCredits = remaining > 0;
  const authBlocked = record.account.authState === "needs_auth";
  const missingConfig = record.account.authState === "missing_config" || record.lastRun?.status === "not_configured";
  const failedNearReset = record.lastRun?.status === "failed" && daysToReset <= 10;
  const staleSnapshot = record.snapshot?.confidence === "stale";
  const unknownNearReset = !record.snapshot && daysToReset <= 10;

  if (!record.snapshot) {
    return {
      accountId: record.account.id,
      level: unknownNearReset ? (daysToReset <= 7 ? "high" : "medium") : "unknown",
      daysToReset,
      resetDate,
      amountAtRisk: 0,
      reasonKey: missingConfig ? "notConfigured" : "unknownNearReset",
      actionKey: missingConfig ? "configureAdapter" : "runFetch",
    };
  }

  if (failedNearReset || authBlocked) {
    return {
      accountId: record.account.id,
      level: daysToReset <= 10 ? riskLevelForDays(daysToReset) : "high",
      daysToReset,
      resetDate,
      unusedRatio,
      amountAtRisk: remaining,
      reasonKey: authBlocked ? "authExpired" : "failedNearReset",
      actionKey: "reauth",
    };
  }

  if (daysToReset <= 1 && hasCredits) {
    return {
      accountId: record.account.id,
      level: "veryCritical",
      daysToReset,
      resetDate,
      unusedRatio,
      amountAtRisk: remaining,
      reasonKey: "oneDayCredits",
      actionKey: "spendNow",
    };
  }

  if (daysToReset <= 3 && hasCredits) {
    return {
      accountId: record.account.id,
      level: "critical",
      daysToReset,
      resetDate,
      unusedRatio,
      amountAtRisk: remaining,
      reasonKey: "threeDayUnused",
      actionKey: "spendFirst",
    };
  }

  if ((daysToReset <= 7 && hasCredits) || (staleSnapshot && daysToReset <= 7)) {
    return {
      accountId: record.account.id,
      level: "high",
      daysToReset,
      resetDate,
      unusedRatio,
      amountAtRisk: remaining,
      reasonKey: staleSnapshot ? "staleNearReset" : "threeDayUnused",
      actionKey: staleSnapshot ? "runFetch" : "spendFirst",
    };
  }

  if ((daysToReset <= 10 && hasCredits) || (staleSnapshot && daysToReset <= 10)) {
    return {
      accountId: record.account.id,
      level: "medium",
      daysToReset,
      resetDate,
      unusedRatio,
      amountAtRisk: remaining,
      reasonKey: staleSnapshot ? "staleNearReset" : "sevenDayCredits",
      actionKey: staleSnapshot ? "runFetch" : "planThisWeek",
    };
  }

  return {
    accountId: record.account.id,
    level: "low",
    daysToReset,
    resetDate,
    unusedRatio,
    amountAtRisk: remaining,
    reasonKey: "safeCycle",
    actionKey: "noAction",
  };
}

const riskOrder = {
  veryCritical: 0,
  critical: 1,
  high: 2,
  medium: 3,
  unknown: 4,
  low: 5,
};

export function rankRecords(records: PlatformRecord[]) {
  return records
    .map((record) => ({ record, risk: assessRisk(record) }))
    .sort((a, b) => {
      const riskDelta = riskOrder[a.risk.level] - riskOrder[b.risk.level];
      if (riskDelta !== 0) return riskDelta;
      return b.risk.amountAtRisk - a.risk.amountAtRisk;
    });
}

export function formatDate(date: Date, locale: string) {
  return new Intl.DateTimeFormat(locale, {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function formatRelative(iso: string | undefined, locale: string) {
  if (!iso) return locale.startsWith("zh") ? "从未" : "never";
  const now = currentTime();
  const date = new Date(iso);
  const diffMinutes = Math.max(1, Math.round((now.getTime() - date.getTime()) / 60_000));
  if (diffMinutes < 60) return locale.startsWith("zh") ? `${diffMinutes} 分钟前` : `${diffMinutes} min ago`;
  const hours = Math.round(diffMinutes / 60);
  if (hours < 24) return locale.startsWith("zh") ? `${hours} 小时前` : `${hours} hr ago`;
  const days = Math.round(hours / 24);
  return locale.startsWith("zh") ? `${days} 天前` : `${days} days ago`;
}

export function formatShortTime(iso: string | undefined, locale: string) {
  if (!iso) return locale.startsWith("zh") ? "未开启" : "not set";
  return new Intl.DateTimeFormat(locale, {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

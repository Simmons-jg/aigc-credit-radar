import type { ResetRule } from "../types";

export interface ResetRuleFormState {
  type: "monthly_day" | "yearly_date";
  dayOfMonth: number;
  month: number;
}

export function clampResetDay(day: number | undefined) {
  if (!day || !Number.isFinite(day)) return 1;
  return Math.min(Math.max(1, Math.round(day)), 31);
}

export function clampResetMonth(month: number | undefined) {
  if (!month || !Number.isFinite(month)) return 1;
  return Math.min(Math.max(1, Math.round(month)), 12);
}

export function resetRuleFormState(rule: ResetRule): ResetRuleFormState {
  const fixedDate = rule.type === "fixed_date" && rule.fixedDate ? new Date(rule.fixedDate) : undefined;
  const fixedDateIsValid = fixedDate ? Number.isFinite(fixedDate.getTime()) : false;
  const fixedDay = fixedDate && fixedDateIsValid ? fixedDate.getDate() : undefined;
  const fixedMonth = fixedDate && fixedDateIsValid ? fixedDate.getMonth() + 1 : undefined;

  return {
    type: rule.type === "yearly_date" ? "yearly_date" : "monthly_day",
    dayOfMonth: clampResetDay(rule.dayOfMonth ?? fixedDay),
    month: clampResetMonth(rule.month ?? fixedMonth),
  };
}

import type { AuthState, BalanceSnapshot, ResetConfidence, ResetSource } from "../types";

export interface HiggsfieldStatusResult {
  authState: Extract<AuthState, "ready">;
  snapshot: BalanceSnapshot;
  accountEmail?: string;
  planLabel?: string;
}

export interface HiggsfieldCliError {
  authState: Extract<AuthState, "needs_auth" | "missing_config">;
  errorCode: "SESSION_EXPIRED" | "CLI_NOT_FOUND" | "CLI_ERROR";
  errorMessage: string;
}

interface ParseOptions {
  accountId: string;
  capturedAt: string;
  transactionEvidence?: HiggsfieldTransactionEvidence;
}

export interface HiggsfieldTransactionEvidence {
  creditsTotal?: number;
  sourceUpdatedAt?: string;
  lastGrantAt?: string;
  nextResetAt?: string;
  resetSource?: ResetSource;
  resetConfidence?: ResetConfidence;
  resetBasis?: string;
}

interface HiggsfieldTransaction {
  credits?: number;
  action?: string;
  created_at?: string;
}

const creditKeys = [
  "availableCredits",
  "available_credits",
  "creditsAvailable",
  "credits_available",
  "creditBalance",
  "credit_balance",
  "creditsRemaining",
  "credits_remaining",
  "credits",
  "balance",
];

const totalKeys = ["creditsTotal", "credits_total", "totalCredits", "total_credits", "monthlyCredits", "monthly_credits"];
const emailKeys = ["email", "accountEmail", "account_email"];
const planKeys = [
  "plan",
  "planName",
  "plan_name",
  "subscription",
  "subscriptionName",
  "subscription_name",
  "subscriptionPlanType",
  "subscription_plan_type",
  "name",
];

export function parseHiggsfieldStatus(raw: string, options: ParseOptions): HiggsfieldStatusResult {
  const parsed = parseJsonObject(raw);
  const creditsRemaining = findNumber(parsed, creditKeys);
  if (creditsRemaining === undefined) {
    throw new Error("NO_CREDITS_FIELD: Higgsfield CLI JSON did not include a numeric credit balance.");
  }

  const creditsTotal = findNumber(parsed, totalKeys) ?? options.transactionEvidence?.creditsTotal;
  const snapshot: BalanceSnapshot = {
    id: `snap-higgsfield-${Date.parse(options.capturedAt) || Date.now()}`,
    accountId: options.accountId,
    creditsRemaining,
    creditsTotal,
    currencyLabel: "credits",
    capturedAt: options.capturedAt,
    sourceUpdatedAt: options.transactionEvidence?.sourceUpdatedAt ?? options.capturedAt,
    lastGrantAt: options.transactionEvidence?.lastGrantAt,
    nextResetAt: options.transactionEvidence?.nextResetAt,
    resetSource: options.transactionEvidence?.resetSource,
    resetConfidence: options.transactionEvidence?.resetConfidence,
    resetBasis: options.transactionEvidence?.resetBasis,
    confidence: "verified",
  };

  return {
    authState: "ready",
    snapshot,
    accountEmail: findString(parsed, emailKeys),
    planLabel: findPlanLabel(parsed),
  };
}

export function parseHiggsfieldTransactions(raw: string): HiggsfieldTransactionEvidence {
  const parsed = parseJsonObject(raw);
  if (!Array.isArray(parsed)) {
    throw new Error("INVALID_TRANSACTIONS: Higgsfield transactions JSON must be an array.");
  }

  const transactions = parsed.filter(isHiggsfieldTransaction);
  const latestTransaction = newestIso(transactions.map((item) => item.created_at).filter(isNonEmptyString));
  const grantTransactions = transactions.filter((item) => item.action === "grant" && Number(item.credits) > 0);
  const lastGrantAt = newestIso(grantTransactions.map((item) => item.created_at).filter(isNonEmptyString));
  const latestGrant = newestTransaction(grantTransactions);
  const nextResetAt = lastGrantAt ? addOneMonth(lastGrantAt).toISOString() : undefined;

  return {
    creditsTotal: latestGrant?.credits,
    sourceUpdatedAt: latestTransaction,
    lastGrantAt,
    nextResetAt,
    resetSource: nextResetAt ? "transaction_inferred" : undefined,
    resetConfidence: nextResetAt ? "inferred" : undefined,
    resetBasis: nextResetAt ? "Latest Higgsfield grant plus one monthly cycle." : undefined,
  };
}

export function normalizeHiggsfieldCliError(error: string): HiggsfieldCliError {
  const message = error.toLowerCase();

  if (message.includes("session expired") || message.includes("auth login") || message.includes("not authenticated")) {
    return {
      authState: "needs_auth",
      errorCode: "SESSION_EXPIRED",
      errorMessage: "Higgsfield session expired. Start the guided login flow, then retry status.",
    };
  }

  if (message.includes("command not found") || message.includes("not recognized") || message.includes("enoent")) {
    return {
      authState: "missing_config",
      errorCode: "CLI_NOT_FOUND",
      errorMessage: "Higgsfield CLI is not available on PATH. Install it before connecting this account.",
    };
  }

  return {
    authState: "missing_config",
    errorCode: "CLI_ERROR",
    errorMessage: "Higgsfield CLI returned an error. Check the local connection service logs and retry.",
  };
}

function parseJsonObject(raw: string): unknown {
  try {
    return JSON.parse(raw.replace(/^\uFEFF/, ""));
  } catch (error) {
    throw new Error(`INVALID_JSON: ${(error as Error).message}`);
  }
}

function isHiggsfieldTransaction(value: unknown): value is HiggsfieldTransaction {
  return Boolean(value && typeof value === "object" && "created_at" in value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function newestIso(values: string[]): string | undefined {
  return values
    .map((value) => ({ value, date: new Date(value) }))
    .filter((item) => Number.isFinite(item.date.getTime()))
    .sort((a, b) => b.date.getTime() - a.date.getTime())[0]?.value;
}

function newestTransaction(transactions: HiggsfieldTransaction[]): HiggsfieldTransaction | undefined {
  return transactions
    .map((item) => ({ item, date: new Date(item.created_at ?? "") }))
    .filter(({ date }) => Number.isFinite(date.getTime()))
    .sort((a, b) => b.date.getTime() - a.date.getTime())[0]?.item;
}

function addOneMonth(iso: string): Date {
  const date = new Date(iso);
  date.setUTCMonth(date.getUTCMonth() + 1);
  return date;
}

function findPlanLabel(value: unknown): string | undefined {
  const direct = findString(value, planKeys);
  if (direct) return direct;

  const plan = findObjectByKey(value, ["plan", "subscription"]);
  return plan ? findString(plan, planKeys) : undefined;
}

function findNumber(value: unknown, keys: string[]): number | undefined {
  if (!value || typeof value !== "object") return undefined;

  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findNumber(item, keys);
      if (found !== undefined) return found;
    }
    return undefined;
  }

  for (const [key, nested] of Object.entries(value)) {
    if (keys.includes(key) && typeof nested === "number" && Number.isFinite(nested)) {
      return nested;
    }

    if (keys.includes(key) && typeof nested === "string") {
      const parsed = Number(nested.replace(/,/g, ""));
      if (Number.isFinite(parsed)) return parsed;
    }
  }

  for (const nested of Object.values(value)) {
    const found = findNumber(nested, keys);
    if (found !== undefined) return found;
  }

  return undefined;
}

function findString(value: unknown, keys: string[]): string | undefined {
  if (!value || typeof value !== "object") return undefined;

  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findString(item, keys);
      if (found) return found;
    }
    return undefined;
  }

  for (const [key, nested] of Object.entries(value)) {
    if (keys.includes(key) && typeof nested === "string" && nested.trim()) {
      return nested.trim();
    }
  }

  for (const nested of Object.values(value)) {
    const found = findString(nested, keys);
    if (found) return found;
  }

  return undefined;
}

function findObjectByKey(value: unknown, keys: string[]): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object") return undefined;

  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findObjectByKey(item, keys);
      if (found) return found;
    }
    return undefined;
  }

  for (const [key, nested] of Object.entries(value)) {
    if (keys.includes(key) && nested && typeof nested === "object" && !Array.isArray(nested)) {
      return nested as Record<string, unknown>;
    }
  }

  for (const nested of Object.values(value)) {
    const found = findObjectByKey(nested, keys);
    if (found) return found;
  }

  return undefined;
}

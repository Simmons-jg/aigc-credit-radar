import type { AuthState, BalanceSnapshot } from "../types";

export interface DreaminaStatusResult {
  authState: Extract<AuthState, "ready">;
  snapshot: BalanceSnapshot;
  accountEmail?: string;
}

export interface DreaminaCliError {
  authState: Extract<AuthState, "needs_auth" | "missing_config">;
  errorCode: "SESSION_EXPIRED" | "CLI_NOT_FOUND" | "CLI_ERROR";
  errorMessage: string;
}

export interface DreaminaHeadlessLogin {
  verificationUri?: string;
  userCode?: string;
  deviceCode?: string;
  pollInterval?: string;
  expiresAt?: string;
  reusedExistingSession?: boolean;
}

interface ParseOptions {
  accountId: string;
  capturedAt: string;
}

const creditKeys = [
  "credit",
  "credits",
  "totalCredit",
  "total_credit",
  "totalCredits",
  "total_credits",
  "userCredit",
  "user_credit",
  "availableCredit",
  "available_credit",
  "balance",
  "points",
];

const totalKeys = ["totalCredit", "total_credit", "totalCredits", "total_credits", "total", "quota"];
const emailKeys = ["email", "accountEmail", "account_email"];

export function parseDreaminaCredit(raw: string, options: ParseOptions): DreaminaStatusResult {
  const parsed = parseJson(raw);
  const creditsRemaining = parsed ? findNumber(parsed, creditKeys) : findTextNumber(raw, ["剩余积分", "可用积分", "积分余额", "credits", "credit"]);

  if (creditsRemaining === undefined) {
    throw new Error("NO_CREDITS_FIELD: Dreamina user_credit output did not include a numeric credit balance.");
  }

  const creditsTotal = parsed ? findNumber(parsed, totalKeys) : findTextNumber(raw, ["总积分", "总额度", "total"]);
  const snapshot: BalanceSnapshot = {
    id: `snap-dreamina-${Date.parse(options.capturedAt) || Date.now()}`,
    accountId: options.accountId,
    creditsRemaining,
    creditsTotal,
    currencyLabel: "credits",
    capturedAt: options.capturedAt,
    sourceUpdatedAt: options.capturedAt,
    confidence: "verified",
  };

  return {
    authState: "ready",
    snapshot,
    accountEmail: parsed ? findString(parsed, emailKeys) : undefined,
  };
}

export function normalizeDreaminaCliError(error: string): DreaminaCliError {
  const message = error.toLowerCase();

  if (
    message.includes("command not found") ||
    message.includes("not recognized") ||
    message.includes("enoent") ||
    (message.includes("dreamina") && message.includes("cmd.exe") && message.includes("����"))
  ) {
    return {
      authState: "missing_config",
      errorCode: "CLI_NOT_FOUND",
      errorMessage: "Dreamina connector is not ready yet. Start login in the app and wait for local setup.",
    };
  }

  if (message.includes("login") || message.includes("unauthorized") || message.includes("not authenticated")) {
    return {
      authState: "needs_auth",
      errorCode: "SESSION_EXPIRED",
      errorMessage:
        "Dreamina authorization is missing or expired. Start login in the app, complete browser authorization, then check status again.",
    };
  }

  return {
    authState: "missing_config",
    errorCode: "CLI_ERROR",
    errorMessage: "Dreamina CLI returned an error. Check the local connection service logs and retry.",
  };
}

export function parseDreaminaHeadlessLogin(raw: string): DreaminaHeadlessLogin {
  const verificationUri = findLineValue(raw, "verification_uri");
  const userCode = findLineValue(raw, "user_code");
  const deviceCode = findLineValue(raw, "device_code");

  if (!verificationUri || !userCode || !deviceCode) {
    if (isReusedLoginState(raw)) {
      return { reusedExistingSession: true };
    }
    throw new Error("INVALID_LOGIN_OUTPUT: Dreamina headless login output did not include OAuth device flow fields.");
  }

  return {
    verificationUri,
    userCode,
    deviceCode,
    pollInterval: findLineValue(raw, "poll_interval"),
    expiresAt: findLineValue(raw, "expires_at"),
  };
}

function isReusedLoginState(raw: string) {
  const normalized = raw.toLowerCase();
  return (
    raw.includes("已复用") ||
    normalized.includes("reuse") ||
    normalized.includes("already") ||
    normalized.includes("oauth login state")
  );
}

function findLineValue(raw: string, key: string) {
  const pattern = new RegExp(`^${escapeRegExp(key)}:\\s*(.+)$`, "im");
  return raw.match(pattern)?.[1]?.trim();
}

function parseJson(raw: string): unknown | undefined {
  try {
    return JSON.parse(raw.replace(/^\uFEFF/, ""));
  } catch {
    return undefined;
  }
}

function findTextNumber(raw: string, labels: string[]): number | undefined {
  for (const label of labels) {
    const pattern = new RegExp(`${escapeRegExp(label)}[^0-9-]*([0-9][0-9,]*(?:\\.\\d+)?)`, "i");
    const match = raw.match(pattern);
    if (match) {
      const parsed = Number(match[1].replace(/,/g, ""));
      if (Number.isFinite(parsed)) return parsed;
    }
  }

  return undefined;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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
    if (keys.includes(key) && typeof nested === "number" && Number.isFinite(nested)) return nested;
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
    if (keys.includes(key) && typeof nested === "string" && nested.trim()) return nested.trim();
  }

  for (const nested of Object.values(value)) {
    const found = findString(nested, keys);
    if (found) return found;
  }

  return undefined;
}

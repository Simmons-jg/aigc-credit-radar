export type AdapterKind = "api" | "cli" | "mcp" | "browser" | "demo" | "manual";
export type FetchStatus = "success" | "failed" | "stale" | "not_configured" | "running";
export type RiskLevel = "low" | "medium" | "high" | "critical" | "veryCritical" | "unknown";
export type Confidence = "verified" | "stale" | "estimated";
export type Language = "en" | "zh";
export type AuthState = "ready" | "needs_auth" | "missing_config" | "demo";
export type ConnectorMaturity = "recommended" | "available" | "developer";
export type ResetSource = "platform" | "transaction_inferred" | "user_configured" | "demo";
export type ResetConfidence = "verified" | "inferred" | "user_configured" | "demo";

export interface ResetRule {
  type: "monthly_day" | "yearly_date" | "fixed_date" | "rolling_days" | "manual";
  dayOfMonth?: number;
  month?: number;
  fixedDate?: string;
  timezone: string;
}

export interface PlatformAccount {
  id: string;
  platform: string;
  label: string;
  adapterKind: AdapterKind;
  adapterLabel: string;
  authState: AuthState;
  resetRule: ResetRule;
  enabled: boolean;
  tracked?: boolean;
  docsUrl?: string;
}

export interface BalanceSnapshot {
  id: string;
  accountId: string;
  creditsRemaining: number;
  creditsTotal?: number;
  currencyLabel: string;
  capturedAt: string;
  sourceUpdatedAt?: string;
  lastGrantAt?: string;
  nextResetAt?: string;
  resetSource?: ResetSource;
  resetConfidence?: ResetConfidence;
  resetBasis?: string;
  confidence: Confidence;
}

export interface AdapterRun {
  id: string;
  accountId: string;
  startedAt: string;
  finishedAt?: string;
  status: FetchStatus;
  durationMs?: number;
  errorCode?: string;
  errorMessage?: string;
}

export interface PlatformRecord {
  account: PlatformAccount;
  snapshot?: BalanceSnapshot;
  lastRun?: AdapterRun;
  nextRunAt: string;
  cadence: "daily" | "near_reset" | "paused";
}

export interface RiskAssessment {
  accountId: string;
  level: RiskLevel;
  daysToReset: number;
  resetDate: Date;
  unusedRatio?: number;
  amountAtRisk: number;
  reasonKey: string;
  actionKey: string;
}

export interface PipelineStep {
  id: string;
  labelKey: string;
  status: "done" | "running" | "blocked" | "queued";
  detailKey: string;
}

export interface FetchSummary {
  startedAt: string;
  finishedAt?: string;
  total: number;
  success: number;
  failed: number;
  nextRunAt: string;
}

export interface ConnectorDefinition {
  id: string;
  platform: string;
  adapterKind: AdapterKind;
  maturity: ConnectorMaturity;
  titleKey: string;
  subtitleKey: string;
  primaryActionKey: string;
  secondaryActionKey?: string;
  loginUrl?: string;
  installUrl?: string;
  installCommand?: string;
  statusCommand?: string;
}

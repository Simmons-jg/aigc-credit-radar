import { StrictMode, useEffect, useMemo, useRef, useState, type ClipboardEvent } from "react";
import { createRoot, type Root } from "react-dom/client";
import { gsap } from "gsap";
import { useGSAP } from "@gsap/react";
import {
  AlertTriangle,
  Bell,
  Bookmark,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  Code2,
  Copy,
  Clock3,
  Globe2,
  Languages,
  LockKeyhole,
  Monitor,
  Plus,
  Puzzle,
  RefreshCw,
  Route,
  ServerCog,
  Settings,
  ShieldCheck,
  Sparkles,
  Terminal,
  Trash2,
  WifiOff,
  Zap,
} from "lucide-react";
import "./styles.css";
import { applyBookmarkletHref, createBrowserSnapshotBookmarklet } from "./adapters/bookmarkletConnector";
import { parseBrowserCreditText } from "./adapters/browserSession";
import { connectorDefinitions } from "./data/connectors";
import {
  customManualPlatformId,
  customPlatformIdFromName,
  manualPlatformDefaultUnit,
  manualPlatformLabel,
  manualPlatformOptions,
  manualPlatformWebsiteUrl,
  normalizeWebsiteUrl,
} from "./data/manualPlatforms";
import { initialFetchSummary, pipelineSteps, realModeRecords } from "./data/realMode";
import { shouldFetchDreaminaStatusAfterAuth } from "./lib/dreaminaFlow";
import {
  browserConnectionAfterServiceHealth,
  type ConnectorConnectionState,
} from "./lib/connectionServiceHealth";
import { browserConnectionFromStatus } from "./lib/browserConnectionStatus";
import { browserConnectionStatesFromRecords, connectionStateFromRecord } from "./lib/connectionInitialState";
import { createMonitorSummary, type MonitorSummary } from "./lib/monitorSummary";
import { imageFileFromClipboardItems } from "./lib/clipboardImage";
import { createTesseractOcrOptions, ocrErrorMessage } from "./lib/ocrAssets";
import { createOpenArtCreditBadgeOcrFile } from "./lib/openArtOcrCrop";
import {
  primaryAccountId,
  removeAccountRecord,
  shouldShowAccountRecord,
  trackAccountPlatform,
  visibleAccountRecords,
} from "./lib/accountRecords";
import { loadPlatformRecords, savePlatformRecords } from "./lib/persistence";
import { effectiveCreditsTotal, formatDate, formatRelative, formatShortTime, rankRecords } from "./lib/risk";
import { clampResetDay, clampResetMonth, resetRuleFormState } from "./lib/resetRuleForm";
import {
  createRiskReminderCandidates,
  isScheduledSyncDue,
  mergeReminderKeys,
  nextScheduledRunAt,
  schedulerStorageKey,
  type SchedulerState,
} from "./lib/scheduler";
import { t } from "./i18n";
import type {
  AuthState,
  BalanceSnapshot,
  ConnectorDefinition,
  FetchStatus,
  FetchSummary,
  Language,
  PipelineStep,
  PlatformRecord,
  ResetRule,
  RiskAssessment,
  RiskLevel,
} from "./types";

const languageKey = "aigc-credit-radar-language";
const helperBaseUrl = "http://127.0.0.1:8787";

gsap.registerPlugin(useGSAP);

type OcrProgress = {
  status?: string;
  progress?: number;
};

type OcrWorker = {
  recognize: (image: File) => Promise<{ data: { text: string } }>;
  setParameters?: (parameters: Record<string, string>) => Promise<unknown>;
  terminate: () => Promise<unknown>;
};

type HiggsfieldConnectionState = ConnectorConnectionState;

interface HiggsfieldHelperResponse {
  ok: boolean;
  connector: "higgsfield";
  authState?: AuthState;
  snapshot?: BalanceSnapshot;
  accountEmail?: string;
  planLabel?: string;
  errorCode?: string;
  errorMessage?: string;
  message?: string;
}

interface DreaminaHelperResponse {
  ok: boolean;
  connector: "dreamina";
  authState?: AuthState;
  snapshot?: BalanceSnapshot;
  accountEmail?: string;
  errorCode?: string;
  errorMessage?: string;
}

interface DreaminaInstallResponse {
  ok: boolean;
  connector: "dreamina";
  installedPath?: string;
  verificationUri?: string;
  userCode?: string;
  deviceCode?: string;
  expiresAt?: string;
  authState?: AuthState;
  errorCode?: string;
  errorMessage?: string;
  message?: string;
}

interface BrowserSessionHelperResponse {
  ok: boolean;
  connector: "browser";
  platform: string;
  authState?: AuthState;
  snapshot?: BalanceSnapshot;
  matchedText?: string;
  errorCode?: string;
  errorMessage?: string;
  message?: string;
}

interface BrowserExtensionInstallResponse {
  ok: boolean;
  connector: "browser";
  extensionDir?: string;
  browserUrls?: string[];
  errorCode?: string;
  errorMessage?: string;
  message?: string;
}

interface BalanceImportInput {
  platform: string;
  platformLabel?: string;
  homepageUrl?: string;
  creditsRemaining: number;
  creditsTotal?: number;
  currencyLabel: string;
  source: "manual" | "pasted_text" | "ocr";
}

type DreaminaMessageBody = Pick<
  DreaminaInstallResponse,
  "ok" | "authState" | "errorCode" | "errorMessage" | "message"
>;

function initialLanguage(): Language {
  const stored = window.localStorage.getItem(languageKey);
  if (stored === "en" || stored === "zh") return stored;
  return "zh";
}

function setStoredLanguage(language: Language) {
  window.localStorage.setItem(languageKey, language);
}

function initialSchedulerState(): SchedulerState {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(schedulerStorageKey) ?? "null") as Partial<SchedulerState> | null;
    if (parsed && typeof parsed === "object") {
      return {
        enabled: parsed.enabled ?? true,
        lastAutoRunAt: typeof parsed.lastAutoRunAt === "string" ? parsed.lastAutoRunAt : undefined,
        lastReminderKeys: Array.isArray(parsed.lastReminderKeys) ? parsed.lastReminderKeys.filter(Boolean) : [],
      };
    }
  } catch {
    // Ignore corrupt local scheduler settings and fall back to the product default.
  }

  return { enabled: true, lastReminderKeys: [] };
}

function notificationPermissionState(): NotificationPermission | "unsupported" {
  if (!("Notification" in window)) return "unsupported";
  return Notification.permission;
}

function riskLabel(level: RiskLevel, strings: ReturnType<typeof t>) {
  return strings[level];
}

function labelText(strings: ReturnType<typeof t>, key: keyof ReturnType<typeof t>, fallback: string) {
  const value = strings[key];
  return typeof value === "string" ? value : fallback;
}

function resetConfidenceLabel(
  confidence: "verified" | "inferred" | "user_configured" | "demo",
  strings: ReturnType<typeof t>,
  language: Language,
) {
  const fallback =
    language === "zh"
      ? { verified: "平台验证", inferred: "推断", user_configured: "用户配置", demo: "演示" }
      : { verified: "platform verified", inferred: "inferred", user_configured: "user configured", demo: "demo" };
  return strings.resetConfidenceValue?.[confidence] ?? fallback[confidence];
}

function hasUserConfiguredReset(record: PlatformRecord) {
  return (
    record.account.resetRule.type === "fixed_date" ||
    record.account.resetRule.type === "monthly_day" ||
    record.account.resetRule.type === "yearly_date"
  );
}

function resetEvidenceText(record: PlatformRecord, strings: ReturnType<typeof t>, language: Language) {
  if (hasUserConfiguredReset(record)) {
    return resetConfidenceLabel("user_configured", strings, language);
  }

  if (record.snapshot?.resetConfidence) {
    return resetConfidenceLabel(record.snapshot.resetConfidence, strings, language);
  }

  return strings.statusValue.not_configured;
}

function monthlyResetRule(dayOfMonth: number, timezone: string): ResetRule {
  return {
    type: "monthly_day",
    dayOfMonth: clampResetDay(dayOfMonth),
    timezone,
  };
}

function yearlyResetRule(month: number, dayOfMonth: number, timezone: string): ResetRule {
  return {
    type: "yearly_date",
    month: clampResetMonth(month),
    dayOfMonth: clampResetDay(dayOfMonth),
    timezone,
  };
}

function platformDisplayName(platform: string, language: Language) {
  const manualLabel = manualPlatformLabel(platform, language);
  if (manualLabel) return manualLabel;

  const names: Record<string, { zh: string; en: string }> = {
    higgsfield: { zh: "Higgsfield", en: "Higgsfield" },
    jimeng: { zh: "即梦 / Jimeng", en: "Jimeng" },
  };
  return names[platform]?.[language] ?? platform;
}

function accountDisplayName(record: PlatformRecord, language: Language) {
  const suffix = record.account.label.match(/#\d+$/)?.[0];
  const displayName = platformDisplayName(record.account.platform, language);
  const baseName = displayName === record.account.platform ? record.account.label : displayName;
  return suffix ? `${baseName} ${suffix}` : baseName;
}

function adapterDisplayLabel(record: PlatformRecord, language: Language) {
  if (record.account.adapterKind === "manual") {
    return language === "zh" ? "手动导入" : "Manual import";
  }
  return record.account.adapterLabel;
}

function resetRuleShortText(rule: ResetRule, resetDate: Date, language: Language, locale: string) {
  if (rule.type === "monthly_day" && rule.dayOfMonth) {
    return language === "zh" ? `每月${rule.dayOfMonth}号` : `Monthly ${rule.dayOfMonth}`;
  }
  if (rule.type === "yearly_date" && rule.month && rule.dayOfMonth) {
    return language === "zh" ? `每年${rule.month}/${rule.dayOfMonth}` : `Yearly ${rule.month}/${rule.dayOfMonth}`;
  }
  if (rule.type === "manual") {
    return language === "zh" ? "手动填写" : "Manual";
  }
  return formatDate(resetDate, locale);
}

function connectedRecordCount(records: PlatformRecord[]) {
  return records.filter((record) => record.account.authState === "ready" || record.snapshot).length;
}

function wait(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function statusTargetId(platform: string, snapshot?: BalanceSnapshot) {
  return snapshot?.accountId ?? primaryAccountId(platform);
}

function shouldUpdateStatusRecord(record: PlatformRecord, platform: string, snapshot?: BalanceSnapshot) {
  return record.account.id === statusTargetId(platform, snapshot);
}

function shouldWriteFailedRun(record: PlatformRecord, platform: string) {
  return record.account.id === primaryAccountId(platform) && shouldShowAccountRecord(record);
}

function dreaminaStatusMessage(strings: ReturnType<typeof t>, body: DreaminaMessageBody) {
  if (body.ok && body.authState === "ready") return strings.dreaminaLoginComplete;

  switch (body.errorCode) {
    case "SESSION_EXPIRED":
      return strings.dreaminaLoginRequired;
    case "LOGIN_PENDING":
      return strings.dreaminaLoginPending;
    case "CLI_NOT_FOUND":
      return strings.dreaminaMissingConfig;
    case "CONNECT_FAILED":
      return strings.dreaminaConnectFailed;
    case "MISSING_DEVICE_CODE":
      return strings.missingLoginSession;
    default:
      return body.message ?? body.errorMessage;
  }
}

function App() {
  const appShellRef = useRef<HTMLDivElement | null>(null);
  const scheduledRunInFlightRef = useRef(false);
  const [language, setLanguage] = useState<Language>(initialLanguage);
  const [records, setRecords] = useState<PlatformRecord[]>(() => loadPlatformRecords(realModeRecords));
  const [summary, setSummary] = useState<FetchSummary>(initialFetchSummary);
  const [syncStatus, setSyncStatus] = useState<"idle" | "running" | "done">("idle");
  const [scheduler, setScheduler] = useState<SchedulerState>(initialSchedulerState);
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission | "unsupported">(
    notificationPermissionState,
  );
  const [higgsfieldConnection, setHiggsfieldConnection] = useState<HiggsfieldConnectionState>(() =>
    connectionStateFromRecord(records.find((record) => record.account.platform === "higgsfield")),
  );
  const [dreaminaConnection, setDreaminaConnection] = useState<HiggsfieldConnectionState>(() =>
    connectionStateFromRecord(records.find((record) => record.account.platform === "jimeng")),
  );
  const [browserConnections, setBrowserConnections] = useState<Record<string, HiggsfieldConnectionState>>(() =>
    browserConnectionStatesFromRecords(records),
  );
  const [connectExpanded, setConnectExpanded] = useState(() => connectedRecordCount(records) === 0);
  const strings = t(language);
  const locale = language === "zh" ? "zh-CN" : "en-US";
  const visibleRecords = useMemo(() => visibleAccountRecords(records), [records]);
  const ranked = useMemo(() => rankRecords(visibleRecords), [visibleRecords]);
  const urgent = ranked
    .filter(({ risk }) => risk.level === "veryCritical" || risk.level === "critical" || risk.level === "high")
    .slice(0, 3);
  const topRisk = ranked[0];
  const monitorSummary = useMemo(() => createMonitorSummary(visibleRecords, summary), [visibleRecords, summary]);
  const connectedCount = monitorSummary.connectedAccounts;
  const scheduledNextRunAt = useMemo(
    () => (scheduler.enabled ? nextScheduledRunAt(visibleRecords, scheduler) : ""),
    [scheduler, visibleRecords],
  );

  useGSAP(
    () => {
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      const timeline = gsap
        .timeline({ defaults: { duration: 0.42, ease: "power2.out" } })
        .from(".js-app-enter", { autoAlpha: 0, y: 12, stagger: 0.05 });

      if (appShellRef.current?.querySelector(".js-risk-row")) {
        timeline.from(".js-risk-row", { autoAlpha: 0, y: 8, stagger: 0.025 }, "<0.08");
      }
    },
    { scope: appShellRef },
  );

  useEffect(() => {
    savePlatformRecords(records);
  }, [records]);

  useEffect(() => {
    window.localStorage.setItem(schedulerStorageKey, JSON.stringify(scheduler));
  }, [scheduler]);

  useEffect(() => {
    const browserPlatforms = connectorDefinitions
      .filter((connector) => connector.adapterKind === "browser")
      .map((connector) => connector.platform);
    let cancelled = false;

    const checkConnectionServiceHealth = async () => {
      let isServiceOnline = false;

      try {
        const response = await fetch(`${helperBaseUrl}/health`, { cache: "no-store" });
        isServiceOnline = response.ok;
      } catch {
        isServiceOnline = false;
      }

      if (cancelled) return;

      setBrowserConnections((current) => {
        const next = { ...current };
        for (const platform of browserPlatforms) {
          next[platform] = browserConnectionAfterServiceHealth(current[platform], isServiceOnline, {
            online: strings.helperOnline,
            offline: strings.helperOffline,
          });
        }
        return next;
      });
    };

    void checkConnectionServiceHealth();
    const intervalId = window.setInterval(checkConnectionServiceHealth, 5_000);
    window.addEventListener("focus", checkConnectionServiceHealth);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      window.removeEventListener("focus", checkConnectionServiceHealth);
    };
  }, [strings.helperOffline, strings.helperOnline]);

  const switchLanguage = (nextLanguage: Language) => {
    setLanguage(nextLanguage);
    setStoredLanguage(nextLanguage);
    document.documentElement.lang = nextLanguage === "zh" ? "zh-CN" : "en";
  };

  const markSyncSummary = (success: boolean, startedAt: string, nextRunAt?: string) => {
    setSummary((current) => ({
      startedAt,
      finishedAt: new Date().toISOString(),
      total: current.total,
      success: success ? 1 : 0,
      failed: success ? 0 : 1,
      nextRunAt: nextRunAt ?? current.nextRunAt,
    }));
  };

  const runRealSync = async (options: { scheduled?: boolean } = {}) => {
    setSyncStatus("running");
    const trackedPlatforms = new Set(visibleRecords.map((record) => record.account.platform));
    const syncTasks: Array<() => Promise<void>> = [];

    if (trackedPlatforms.has("higgsfield")) syncTasks.push(checkHiggsfieldStatus);
    if (trackedPlatforms.has("jimeng")) syncTasks.push(checkDreaminaStatus);

    if (syncTasks.length === 0 && !options.scheduled) {
      syncTasks.push(checkHiggsfieldStatus);
    }

    if (syncTasks.length === 0) {
      setSyncStatus("done");
      return false;
    }

    try {
      await Promise.allSettled(syncTasks.map((task) => task()));
      return true;
    } finally {
      setSyncStatus("done");
    }
  };

  const handleSchedulerButton = async () => {
    if (scheduler.enabled && notificationPermission === "granted") {
      setScheduler((current) => ({ ...current, enabled: false }));
      return;
    }

    setScheduler((current) => ({ ...current, enabled: true }));

    if (!("Notification" in window)) {
      setNotificationPermission("unsupported");
      return;
    }

    if (Notification.permission === "default") {
      const permission = await Notification.requestPermission();
      setNotificationPermission(permission);
      return;
    }

    setNotificationPermission(Notification.permission);
  };

  useEffect(() => {
    const syncPermissionState = () => setNotificationPermission(notificationPermissionState());
    window.addEventListener("focus", syncPermissionState);
    return () => window.removeEventListener("focus", syncPermissionState);
  }, []);

  useEffect(() => {
    let cancelled = false;

    const tick = async () => {
      if (cancelled || scheduledRunInFlightRef.current || syncStatus === "running") return;
      if (!isScheduledSyncDue(visibleRecords, scheduler, new Date())) return;

      scheduledRunInFlightRef.current = true;
      setScheduler((current) => ({ ...current, lastAutoRunAt: new Date().toISOString() }));

      try {
        await runRealSync({ scheduled: true });
      } finally {
        scheduledRunInFlightRef.current = false;
      }
    };

    void tick();
    const intervalId = window.setInterval(tick, 60_000);
    window.addEventListener("focus", tick);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      window.removeEventListener("focus", tick);
    };
  }, [scheduler.enabled, scheduler.lastAutoRunAt, syncStatus, visibleRecords]);

  useEffect(() => {
    if (!scheduler.enabled || notificationPermission !== "granted") return;

    const candidates = createRiskReminderCandidates(ranked, language).filter(
      (candidate) => !scheduler.lastReminderKeys.includes(candidate.key),
    );
    if (candidates.length === 0) return;

    for (const candidate of candidates.slice(0, 3)) {
      try {
        new Notification(candidate.title, {
          body: candidate.body,
          tag: candidate.tag,
        });
      } catch {
        break;
      }
    }

    setScheduler((current) => ({
      ...current,
      lastReminderKeys: mergeReminderKeys(
        current.lastReminderKeys,
        candidates.map((candidate) => candidate.key),
      ),
    }));
  }, [language, notificationPermission, ranked, scheduler.enabled, scheduler.lastReminderKeys]);

  const setResetRule = (accountId: string, resetRule: ResetRule) => {
    setRecords((current) =>
      current.map((record) => {
        if (record.account.id !== accountId) return record;

        return {
          ...record,
          account: {
            ...record.account,
            resetRule,
          },
        };
      }),
    );
  };

  const setConfiguredCreditsTotal = (accountId: string, configuredCreditsTotal?: number) => {
    setRecords((current) =>
      current.map((record) =>
        record.account.id === accountId
          ? {
              ...record,
              account: {
                ...record.account,
                configuredCreditsTotal,
              },
            }
          : record,
      ),
    );
  };

  const addAccount = (platform: string) => {
    setRecords((current) => trackAccountPlatform(current, platform));
    void connectPlatform(platform, "connect");
  };

  const removeAccount = (accountId: string) => {
    setRecords((current) => removeAccountRecord(current, accountId));
  };

  const importBrowserBalance = (input: BalanceImportInput) => {
    const capturedAt = new Date().toISOString();
    const accountId = primaryAccountId(input.platform);
    const importedLabel = input.platformLabel?.trim() || platformDisplayName(input.platform, language);

    setRecords((current) => {
      const existing = current.find((record) => record.account.id === accountId);
      const importedRecord = (record?: PlatformRecord): PlatformRecord => ({
        account: {
          ...(record?.account ?? {
            id: accountId,
            platform: input.platform,
            label: importedLabel,
            adapterKind: "manual" as const,
            adapterLabel: language === "zh" ? "手动导入" : "Manual import",
            authState: "ready" as const,
            resetRule: { type: "manual" as const, timezone: "Asia/Shanghai" },
            enabled: true,
          }),
          label: importedLabel,
          adapterKind: "manual",
          adapterLabel: language === "zh" ? "手动导入" : "Manual import",
          authState: "ready",
          enabled: true,
          tracked: true,
          configuredCreditsTotal: input.creditsTotal ?? record?.account.configuredCreditsTotal,
          docsUrl: input.homepageUrl || record?.account.docsUrl,
        },
        snapshot: {
          id: `snap-${accountId}-manual-${Date.parse(capturedAt) || Date.now()}`,
          accountId,
          creditsRemaining: input.creditsRemaining,
          creditsTotal: input.creditsTotal,
          currencyLabel: input.currencyLabel,
          capturedAt,
          sourceUpdatedAt: capturedAt,
          confidence: input.source === "pasted_text" ? "verified" : "estimated",
        },
        lastRun: {
          id: `run-${accountId}-manual-${Date.now()}`,
          accountId,
          startedAt: capturedAt,
          finishedAt: capturedAt,
          status: "success",
        },
        nextRunAt: "",
        cadence: "paused",
      });

      if (existing) {
        return current.map((record) => (record.account.id === accountId ? importedRecord(record) : record));
      }

      return [...current, importedRecord()];
    });

    setBrowserConnections((current) => ({
      ...current,
      [input.platform]: {
        phase: "ready",
        authState: "ready",
        message: language === "zh" ? "已手动导入一条余额快照。" : "Imported a manual balance snapshot.",
      },
    }));
  };

  const connectPlatform = async (platform: string, mode: "connect" | "refresh" = "connect") => {
    if (platform === "higgsfield") {
      if (mode === "refresh") {
        await checkHiggsfieldStatus();
      } else {
        await startHiggsfieldLogin();
      }
      return;
    }

    if (platform === "jimeng") {
      if (mode === "refresh") {
        await checkDreaminaStatus();
      } else {
        await startDreaminaLogin();
      }
      return;
    }

    if (platform === "lovart" || platform === "tapnow") {
      if (mode === "refresh") {
        await checkBrowserSession(platform);
      } else {
        await openBrowserSession(platform);
      }
    }
  };

  const checkHiggsfieldStatus = async () => {
    const startedAt = new Date().toISOString();
    setHiggsfieldConnection({ phase: "checking" });

    try {
      const response = await fetch(`${helperBaseUrl}/api/higgsfield/status`, { cache: "no-store" });
      const body = (await response.json()) as HiggsfieldHelperResponse;
      applyHiggsfieldStatus(body, startedAt);
    } catch {
      markSyncSummary(false, startedAt);
      setHiggsfieldConnection({
        phase: "helper_offline",
        errorCode: "HELPER_OFFLINE",
        message: strings.helperOffline,
      });
    }
  };

  const checkDreaminaStatus = async () => {
    const startedAt = new Date().toISOString();
    setDreaminaConnection({ phase: "checking" });

    try {
      const response = await fetch(`${helperBaseUrl}/api/dreamina/status`, { cache: "no-store" });
      const body = (await response.json()) as DreaminaHelperResponse;
      applyDreaminaStatus(body, startedAt);
    } catch {
      markSyncSummary(false, startedAt);
      setDreaminaConnection({
        phase: "helper_offline",
        errorCode: "HELPER_OFFLINE",
        message: strings.helperOffline,
      });
    }
  };

  const openBrowserSession = async (platform: string) => {
    setRecords((current) => trackAccountPlatform(current, platform));
    setBrowserConnections((current) => ({
      ...current,
      [platform]: { phase: "installing" },
    }));

    try {
      const response = await fetch(`${helperBaseUrl}/api/browser-extension/${platform}/open`, { method: "POST" });
      const body = (await response.json()) as BrowserSessionHelperResponse;
      setBrowserConnections((current) => ({
        ...current,
        [platform]: {
          phase: body.ok ? "extension_pending" : "error",
          authState: body.authState,
          errorCode: body.errorCode,
          message: body.ok
            ? strings.extensionPlatformOpened
            : browserConnectionFromStatus(body, strings).message,
        },
      }));
    } catch {
      setBrowserConnections((current) => ({
        ...current,
        [platform]: {
          phase: "helper_offline",
          errorCode: "HELPER_OFFLINE",
          message: strings.helperOffline,
        },
      }));
    }
  };

  const installBrowserExtension = async (platform: string) => {
    setBrowserConnections((current) => ({
      ...current,
      [platform]: {
        ...(current[platform] ?? { phase: "idle" }),
        phase: "installing",
        message: strings.browserExtensionInstallStarting,
      },
    }));

    try {
      const response = await fetch(`${helperBaseUrl}/api/browser-extension/install/open`, { method: "POST" });
      const body = (await response.json()) as BrowserExtensionInstallResponse;
      setBrowserConnections((current) => ({
        ...current,
        [platform]: {
          ...(current[platform] ?? { phase: "idle" }),
          phase: body.ok ? "extension_pending" : "missing_config",
          authState: "missing_config",
          errorCode: body.errorCode,
          message: body.ok
            ? `${strings.browserExtensionInstallOpened} ${body.extensionDir ?? ""}`.trim()
            : body.errorMessage ?? strings.browserExtensionInstallFailed,
        },
      }));
    } catch {
      setBrowserConnections((current) => ({
        ...current,
        [platform]: {
          phase: "helper_offline",
          errorCode: "HELPER_OFFLINE",
          message: strings.helperOffline,
        },
      }));
    }
  };

  const checkBrowserSession = async (platform: string) => {
    const startedAt = new Date().toISOString();
    setBrowserConnections((current) => ({
      ...current,
      [platform]: { ...(current[platform] ?? { phase: "idle" }), phase: "checking" },
    }));

    try {
      const response = await fetch(`${helperBaseUrl}/api/browser-extension/${platform}/status`, { cache: "no-store" });
      const body = (await response.json()) as BrowserSessionHelperResponse;
      applyBrowserSessionStatus(platform, body, startedAt);
    } catch {
      markSyncSummary(false, startedAt);
      setBrowserConnections((current) => ({
        ...current,
        [platform]: {
          phase: "helper_offline",
          errorCode: "HELPER_OFFLINE",
          message: strings.helperOffline,
        },
      }));
    }
  };

  const startDreaminaLogin = async () => {
    setRecords((current) => trackAccountPlatform(current, "jimeng"));
    setDreaminaConnection({ phase: "installing" });

    try {
      const response = await fetch(`${helperBaseUrl}/api/dreamina/login`, { method: "POST" });
      const body = (await response.json()) as DreaminaInstallResponse;
      const phase = body.ok && body.authState === "ready" ? "ready" : body.ok ? "login_started" : "error";
      if (shouldFetchDreaminaStatusAfterAuth(body)) {
        setDreaminaConnection({
          phase: "checking",
          authState: "ready",
          message: strings.dreaminaLoginComplete,
        });
        await checkDreaminaStatus();
        return;
      }

      setDreaminaConnection({
        phase,
        authState: body.authState ?? "needs_auth",
        verificationUri: body.verificationUri,
        userCode: body.userCode,
        deviceCode: body.deviceCode,
        expiresAt: body.expiresAt,
        errorCode: body.errorCode,
        message: phase === "ready" ? dreaminaStatusMessage(strings, body) : body.ok ? strings.dreaminaLoginStarted : dreaminaStatusMessage(strings, body),
      });
    } catch {
      setDreaminaConnection({
        phase: "helper_offline",
        errorCode: "HELPER_OFFLINE",
        message: strings.helperOffline,
      });
    }
  };

  const finishDreaminaLogin = async () => {
    if (!dreaminaConnection.deviceCode) {
      setDreaminaConnection((current) => ({
        ...current,
        phase: "needs_auth",
        message: strings.missingLoginSession,
      }));
      return;
    }

    setDreaminaConnection((current) => ({ ...current, phase: "checking" }));

    try {
      const params = new URLSearchParams({ device_code: dreaminaConnection.deviceCode });
      const response = await fetch(`${helperBaseUrl}/api/dreamina/login/check?${params.toString()}`, { method: "POST" });
      const body = (await response.json()) as DreaminaInstallResponse;
      if (shouldFetchDreaminaStatusAfterAuth(body)) {
        setDreaminaConnection((current) => ({
          ...current,
          phase: "checking",
          authState: "ready",
          errorCode: body.errorCode,
          message: strings.dreaminaLoginComplete,
        }));
        await checkDreaminaStatus();
        return;
      }

      setDreaminaConnection((current) => ({
        ...current,
        phase: body.ok ? "ready" : "needs_auth",
        authState: body.authState ?? (body.ok ? "ready" : "needs_auth"),
        errorCode: body.errorCode,
        message: dreaminaStatusMessage(strings, body),
      }));
    } catch {
      setDreaminaConnection((current) => ({
        ...current,
        phase: "helper_offline",
        errorCode: "HELPER_OFFLINE",
        message: strings.helperOffline,
      }));
    }
  };

  const startHiggsfieldLogin = async () => {
    setRecords((current) => trackAccountPlatform(current, "higgsfield"));
    setHiggsfieldConnection({ phase: "checking" });

    try {
      const response = await fetch(`${helperBaseUrl}/api/higgsfield/login`, { method: "POST" });
      const body = (await response.json()) as HiggsfieldHelperResponse;
      setHiggsfieldConnection({
        phase: body.ok ? "login_started" : body.authState === "missing_config" ? "missing_config" : "error",
        authState: body.authState,
        errorCode: body.errorCode,
        message: body.message ?? body.errorMessage,
      });
      if (body.ok) {
        void pollHiggsfieldStatusAfterLogin();
      }
    } catch {
      setHiggsfieldConnection({
        phase: "helper_offline",
        errorCode: "HELPER_OFFLINE",
        message: strings.helperOffline,
      });
    }
  };

  const pollHiggsfieldStatusAfterLogin = async () => {
    const startedAt = new Date().toISOString();

    for (let attempt = 0; attempt < 24; attempt += 1) {
      await wait(3_500);

      try {
        const response = await fetch(`${helperBaseUrl}/api/higgsfield/status`, { cache: "no-store" });
        const body = (await response.json()) as HiggsfieldHelperResponse;
        if (body.ok && body.snapshot) {
          applyHiggsfieldStatus(body, startedAt);
          return;
        }
      } catch {
        setHiggsfieldConnection({
          phase: "helper_offline",
          errorCode: "HELPER_OFFLINE",
          message: strings.helperOffline,
        });
        return;
      }
    }

    setHiggsfieldConnection((current) =>
      current.phase === "ready"
        ? current
        : {
            ...current,
            phase: "needs_auth",
            authState: "needs_auth",
            message: strings.retryStatus,
          },
    );
  };

  const applyHiggsfieldStatus = (body: HiggsfieldHelperResponse, startedAt: string) => {
    const now = new Date().toISOString();

    if (body.ok && body.snapshot) {
      const snapshot = body.snapshot;
      const nextRunAt = new Date(Date.now() + 86_400_000).toISOString();
      setHiggsfieldConnection({
        phase: "ready",
        authState: "ready",
        accountEmail: body.accountEmail,
        planLabel: body.planLabel,
      });
      setRecords((current) =>
        current.map((record) =>
          shouldUpdateStatusRecord(record, "higgsfield", snapshot)
            ? {
                ...record,
                account: { ...record.account, authState: "ready", enabled: true, tracked: true },
                snapshot: { ...snapshot, accountId: record.account.id },
                lastRun: {
                  id: `run-higgsfield-helper-${Date.now()}`,
                  accountId: record.account.id,
                  startedAt: now,
                  finishedAt: now,
                  status: "success",
                  durationMs: 0,
                },
                nextRunAt,
              }
            : record,
        ),
      );
      markSyncSummary(true, startedAt, nextRunAt);
      return;
    }

    const authState = body.authState === "needs_auth" ? "needs_auth" : "missing_config";
    setHiggsfieldConnection({
      phase: authState,
      authState,
      errorCode: body.errorCode,
      message: body.errorMessage,
    });
    setRecords((current) =>
      current.map((record) =>
        shouldWriteFailedRun(record, "higgsfield")
          ? {
              ...record,
              account: { ...record.account, authState },
              lastRun: {
                id: `run-higgsfield-helper-${Date.now()}`,
                accountId: record.account.id,
                startedAt: now,
                finishedAt: now,
                status: "failed",
                durationMs: 0,
                errorCode: body.errorCode,
                errorMessage: body.errorMessage,
              },
            }
          : record,
      ),
    );
    markSyncSummary(false, startedAt);
  };

  const applyDreaminaStatus = (body: DreaminaHelperResponse, startedAt: string) => {
    const now = new Date().toISOString();

    if (body.ok && body.snapshot) {
      const snapshot = body.snapshot;
      const nextRunAt = new Date(Date.now() + 86_400_000).toISOString();
      setDreaminaConnection({
        phase: "ready",
        authState: "ready",
        accountEmail: body.accountEmail,
      });
      setRecords((current) =>
        current.map((record) =>
          shouldUpdateStatusRecord(record, "jimeng", snapshot)
            ? {
                ...record,
                account: { ...record.account, authState: "ready", enabled: true, tracked: true },
                snapshot: { ...snapshot, accountId: record.account.id },
                lastRun: {
                  id: `run-dreamina-helper-${Date.now()}`,
                  accountId: record.account.id,
                  startedAt: now,
                  finishedAt: now,
                  status: "success",
                  durationMs: 0,
                },
                nextRunAt,
              }
            : record,
        ),
      );
      markSyncSummary(true, startedAt, nextRunAt);
      return;
    }

    const authState = body.authState === "needs_auth" ? "needs_auth" : "missing_config";
    const message = dreaminaStatusMessage(strings, body);
    setDreaminaConnection({
      phase: authState,
      authState,
      errorCode: body.errorCode,
      message,
    });
    setRecords((current) =>
      current.map((record) =>
        shouldWriteFailedRun(record, "jimeng")
          ? {
              ...record,
              account: { ...record.account, authState },
              lastRun: {
                id: `run-dreamina-helper-${Date.now()}`,
                accountId: record.account.id,
                startedAt: now,
                finishedAt: now,
                status: "failed",
                durationMs: 0,
                errorCode: body.errorCode,
                errorMessage: message,
              },
            }
          : record,
      ),
    );
    markSyncSummary(false, startedAt);
  };

  const applyBrowserSessionStatus = (platform: string, body: BrowserSessionHelperResponse, startedAt: string) => {
    const now = new Date().toISOString();

    if (body.ok && body.snapshot) {
      const snapshot = body.snapshot;
      const nextRunAt = new Date(Date.now() + 86_400_000).toISOString();
      setBrowserConnections((current) => ({
        ...current,
        [platform]: {
          phase: "ready",
          authState: "ready",
          message: body.matchedText ? `${strings.sourceUpdatedAt}: ${body.matchedText}` : strings.statusReady,
        },
      }));
      setRecords((current) =>
        current.map((record) =>
          shouldUpdateStatusRecord(record, platform, snapshot)
            ? {
                ...record,
                account: { ...record.account, authState: "ready", enabled: true, tracked: true },
                snapshot: { ...snapshot, accountId: record.account.id },
                lastRun: {
                  id: `run-${platform}-browser-${Date.now()}`,
                  accountId: record.account.id,
                  startedAt: now,
                  finishedAt: now,
                  status: "success",
                  durationMs: 0,
                },
                nextRunAt,
                cadence: "daily",
              }
            : record,
        ),
      );
      markSyncSummary(true, startedAt, nextRunAt);
      return;
    }

    const connectionState = browserConnectionFromStatus(body, strings);
    const authState = connectionState.authState ?? "missing_config";
    const message = connectionState.message;
    setBrowserConnections((current) => ({
      ...current,
      [platform]: {
        phase: connectionState.phase,
        authState,
        errorCode: connectionState.errorCode,
        message,
      },
    }));
    setRecords((current) =>
      current.map((record) =>
        shouldWriteFailedRun(record, platform)
          ? {
              ...record,
              account: { ...record.account, authState },
              lastRun: {
                id: `run-${platform}-browser-${Date.now()}`,
                accountId: record.account.id,
                startedAt: now,
                finishedAt: now,
                status: "failed",
                durationMs: 0,
                errorCode: body.errorCode,
                errorMessage: message,
              },
            }
          : record,
      ),
    );
    markSyncSummary(false, startedAt);
  };

  const openManualImportPanel = () => {
    setConnectExpanded(true);
    window.location.hash = "connect";
    window.requestAnimationFrame(() => {
      document.getElementById("connect")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };
  const schedulerButtonLabel = !scheduler.enabled
    ? strings.enableSchedule
    : notificationPermission === "granted"
      ? strings.schedulerOn
      : notificationPermission === "denied"
        ? strings.notificationsBlocked
        : strings.enableAlerts;

  return (
    <div className="app-shell monitor-app" ref={appShellRef}>
      <main className="main monitor-main">
        <header className="command-bar js-app-enter">
          <div className="headline-block">
            <div className="brand-row">
              <span className="brand-icon">
                <Zap size={17} />
              </span>
              <span>{strings.appName}</span>
              <span className="safe-mode">
                <ShieldCheck size={14} />
                {strings.realMode}
              </span>
            </div>
            <h1>{strings.headline}</h1>
            <p>{strings.subtitle}</p>
          </div>

          <div className="command-actions">
            <LanguageToggle language={language} strings={strings} onSwitch={switchLanguage} />
            <button
              className={`secondary-button ${scheduler.enabled ? "active-schedule" : ""}`}
              onClick={() => void handleSchedulerButton()}
              type="button"
            >
              <Clock3 size={15} />
              {schedulerButtonLabel}
            </button>
            <a className="secondary-button" href="#connect">
              <LockKeyhole size={15} />
              {strings.connectRealAccount}
            </a>
            <button className="primary-button" disabled={syncStatus === "running"} onClick={() => void runRealSync()}>
              <RefreshCw className={syncStatus === "running" ? "spin" : ""} size={15} />
              {syncStatus === "running" ? strings.runningFetch : strings.runFetch}
            </button>
          </div>
        </header>

        <section className="overview-grid js-app-enter" aria-label={strings.autoFetch}>
          <PrimaryRiskCard item={topRisk} language={language} />
          <AutoFetchPanel
            monitor={monitorSummary}
            nextSyncAt={scheduledNextRunAt || summary.nextRunAt}
            summary={summary}
            language={language}
            syncStatus={syncStatus}
          />
          <ActionQueue items={urgent} language={language} />
        </section>

        <section className="content-grid monitor-content js-app-enter">
          <section className="panel risk-panel monitor-ledger" id="radar">
            <PanelHeading
              icon={<AlertTriangle size={17} />}
              title={strings.riskRadar}
              subtitle={strings.riskSubtitle}
            />
            <LedgerToolbar
              language={language}
            />
            {ranked.length > 0 ? (
            <div className="risk-list ledger-table" role="table" aria-label={language === "zh" ? "积分账号表" : "Credit accounts"}>
              <div className="ledger-row ledger-head" role="row">
                <span>{language === "zh" ? "Name" : "Name"}</span>
                <span>{language === "zh" ? "Points" : "Points"}</span>
                <span>{language === "zh" ? "剩余额度比例" : "Remaining Ratio"}</span>
                <span>{language === "zh" ? "重置日" : "Reset"}</span>
                <span>{language === "zh" ? "数据更新时间" : "Data Updated"}</span>
                <span>{language === "zh" ? "下一步" : "Next Action"}</span>
              </div>
              {ranked.map(({ record, risk }) => (
                <RiskCard
                  key={record.account.id}
                  record={record}
                  risk={risk}
                  language={language}
                  onConnectPlatform={connectPlatform}
                  onManualUpdate={openManualImportPanel}
                  onRemoveAccount={removeAccount}
                  onSetConfiguredCreditsTotal={setConfiguredCreditsTotal}
                  onSetResetRule={setResetRule}
                />
              ))}
            </div>
            ) : (
              <LedgerEmptyState language={language} />
            )}
          </section>
        </section>

        <ConnectAccountPanel
          browserConnections={browserConnections}
          connectedCount={connectedCount}
          connection={higgsfieldConnection}
          dreaminaConnection={dreaminaConnection}
          expanded={connectExpanded}
          language={language}
          onCheckBrowserSession={checkBrowserSession}
          onCheckDreamina={checkDreaminaStatus}
          onFinishDreaminaLogin={finishDreaminaLogin}
          onInstallBrowserExtension={installBrowserExtension}
          onOpenBrowserSession={openBrowserSession}
          onStartDreaminaLogin={startDreaminaLogin}
          onCheckHiggsfield={checkHiggsfieldStatus}
          onImportBalance={importBrowserBalance}
          onStartHiggsfieldLogin={startHiggsfieldLogin}
          onToggleExpanded={() => setConnectExpanded((current) => !current)}
        />

        <details className="engineering-drawer js-app-enter" id="pipeline">
          <summary>
            <span>
              <Route size={16} />
              {language === "zh" ? "工程视图" : "Engineering view"}
            </span>
            <small>{language === "zh" ? "二级页面：抓取流水线和适配器状态" : "Secondary view: pipeline and adapter status"}</small>
          </summary>
          <div className="engineering-grid">
            <section className="panel pipeline-panel">
              <PanelHeading icon={<Route size={17} />} title={strings.pipelineTitle} subtitle={strings.pipelineSubtitle} />
              <Pipeline steps={pipelineSteps} language={language} />
              <div className="fallback-note">
                <CircleAlert size={15} />
                <span>{strings.fallbackNote}</span>
              </div>
            </section>

            <section className="panel adapter-panel" id="adapters">
              <PanelHeading icon={<ServerCog size={17} />} title={strings.adapterWall} subtitle={strings.adapterSubtitle} />
              <div className="adapter-grid">
                {ranked.map(({ record, risk }) => (
                  <AdapterTile key={record.account.id} record={record} risk={risk} language={language} />
                ))}
              </div>
            </section>
          </div>
        </details>
      </main>
    </div>
  );
}

function Sidebar({ strings }: { strings: ReturnType<typeof t> }) {
  return (
    <aside className="sidebar">
      <div className="brand-mark">
        <span className="brand-icon">
          <Zap size={18} />
        </span>
        <span>{strings.appName}</span>
      </div>
      <nav className="nav-list" aria-label="Primary">
        <a className="nav-item active" href="#radar">
          <AlertTriangle size={16} />
          <span>{strings.navRadar}</span>
        </a>
        <a className="nav-item" href="#connect">
          <LockKeyhole size={16} />
          <span>{strings.navConnect}</span>
        </a>
        <a className="nav-item" href="#pipeline">
          <RefreshCw size={16} />
          <span>{strings.navPipeline}</span>
        </a>
        <a className="nav-item" href="#adapters">
          <ServerCog size={16} />
          <span>{strings.navAdapters}</span>
        </a>
        <a className="nav-item muted" href="#settings">
          <Settings size={16} />
          <span>{strings.navSettings}</span>
        </a>
      </nav>
    </aside>
  );
}

function LanguageToggle({
  language,
  strings,
  onSwitch,
}: {
  language: Language;
  strings: ReturnType<typeof t>;
  onSwitch: (language: Language) => void;
}) {
  return (
    <div className="language-toggle" aria-label={strings.languageLabel}>
      <Languages size={15} />
      <button className={language === "zh" ? "selected" : ""} onClick={() => onSwitch("zh")}>
        中文
      </button>
      <button className={language === "en" ? "selected" : ""} onClick={() => onSwitch("en")}>
        EN
      </button>
    </div>
  );
}

function ConnectAccountPanel({
  browserConnections,
  connectedCount,
  connection,
  dreaminaConnection,
  expanded,
  language,
  onCheckBrowserSession,
  onCheckDreamina,
  onFinishDreaminaLogin,
  onInstallBrowserExtension,
  onOpenBrowserSession,
  onStartDreaminaLogin,
  onCheckHiggsfield,
  onImportBalance,
  onStartHiggsfieldLogin,
  onToggleExpanded,
}: {
  browserConnections: Record<string, HiggsfieldConnectionState>;
  connectedCount: number;
  connection: HiggsfieldConnectionState;
  dreaminaConnection: HiggsfieldConnectionState;
  expanded: boolean;
  language: Language;
  onCheckBrowserSession: (platform: string) => void;
  onCheckDreamina: () => void;
  onFinishDreaminaLogin: () => void;
  onInstallBrowserExtension: (platform: string) => void;
  onOpenBrowserSession: (platform: string) => void;
  onStartDreaminaLogin: () => void;
  onCheckHiggsfield: () => void;
  onImportBalance: (input: BalanceImportInput) => void;
  onStartHiggsfieldLogin: () => void;
  onToggleExpanded: () => void;
}) {
  const strings = t(language);

  return (
    <section className={`connect-panel ${expanded ? "expanded" : "collapsed"} js-app-enter`} id="connect" aria-label={strings.connectPanelTitle}>
      <div className="connect-heading">
        <div className="panel-title">
          <LockKeyhole size={17} />
          <h2>{strings.connectPanelTitle}</h2>
        </div>
        <div className="connect-summary">
          <span>
            {connectedCount} {strings.connectedAccounts}
          </span>
          <button className="secondary-button compact-button" onClick={onToggleExpanded}>
            <ChevronRight className={expanded ? "expanded" : ""} size={15} />
            {expanded ? strings.hideConnectors : strings.showConnectors}
          </button>
        </div>
      </div>
      {expanded && (
        <>
          <p className="connect-panel-note">{strings.connectPanelSubtitle}</p>
          <BrowserBalanceImport language={language} onImportBalance={onImportBalance} />
          <div className="connector-section-title">
            <span>{language === "zh" ? "自动连接" : "Automatic connectors"}</span>
            <p>{language === "zh" ? "目前只保留已经能在本 App 里跑通的真实连接。" : "Only connectors that currently run inside this app stay here."}</p>
          </div>
          <div className="connector-grid">
            {connectorDefinitions.map((connector) => (
              <ConnectorCard
                browserConnection={browserConnections[connector.platform]}
                connector={connector}
                connection={connection}
                dreaminaConnection={dreaminaConnection}
                key={connector.id}
                language={language}
                onCheckBrowserSession={onCheckBrowserSession}
                onCheckDreamina={onCheckDreamina}
                onFinishDreaminaLogin={onFinishDreaminaLogin}
                onInstallBrowserExtension={onInstallBrowserExtension}
                onOpenBrowserSession={onOpenBrowserSession}
                onStartDreaminaLogin={onStartDreaminaLogin}
                onCheckHiggsfield={onCheckHiggsfield}
                onStartHiggsfieldLogin={onStartHiggsfieldLogin}
              />
            ))}
          </div>
        </>
      )}
    </section>
  );
}

function ConnectorCard({
  browserConnection,
  connector,
  connection,
  dreaminaConnection,
  language,
  onCheckBrowserSession,
  onCheckDreamina,
  onFinishDreaminaLogin,
  onInstallBrowserExtension,
  onOpenBrowserSession,
  onStartDreaminaLogin,
  onCheckHiggsfield,
  onStartHiggsfieldLogin,
}: {
  browserConnection?: HiggsfieldConnectionState;
  connector: ConnectorDefinition;
  connection: HiggsfieldConnectionState;
  dreaminaConnection: HiggsfieldConnectionState;
  language: Language;
  onCheckBrowserSession: (platform: string) => void;
  onCheckDreamina: () => void;
  onFinishDreaminaLogin: () => void;
  onInstallBrowserExtension: (platform: string) => void;
  onOpenBrowserSession: (platform: string) => void;
  onStartDreaminaLogin: () => void;
  onCheckHiggsfield: () => void;
  onStartHiggsfieldLogin: () => void;
}) {
  const strings = t(language);
  const [bookmarkletCopied, setBookmarkletCopied] = useState(false);
  const [mcpCopied, setMcpCopied] = useState(false);
  const bookmarkletAnchorRef = useRef<HTMLAnchorElement | null>(null);
  const isHiggsfield = connector.id === "higgsfield-cli";
  const isDreamina = connector.platform === "jimeng" && connector.adapterKind === "cli";
  const isMcp = connector.adapterKind === "mcp";
  const isBrowserSession = connector.adapterKind === "browser";
  const bookmarkletHref = useMemo(
    () => (isBrowserSession ? createBrowserSnapshotBookmarklet({ helperBaseUrl }) : ""),
    [isBrowserSession],
  );
  const activeConnection = isHiggsfield ? connection : isDreamina ? dreaminaConnection : isBrowserSession ? browserConnection : undefined;
  const phase = activeConnection?.phase ?? "idle";
  const busy = phase === "checking" || phase === "installing";
  const statusLabel = activeConnection ? connectionStatusLabel(activeConnection, strings) : strings.adapterPending;
  const statusTone = activeConnection ? connectionStatusTone(activeConnection) : "warning";

  const icon =
    connector.adapterKind === "cli" ? (
      <Terminal size={18} />
    ) : connector.adapterKind === "mcp" ? (
      <ServerCog size={18} />
    ) : connector.adapterKind === "browser" ? (
      <Monitor size={18} />
    ) : (
      <Code2 size={18} />
    );

  const copyBookmarklet = async () => {
    if (!bookmarkletHref) return;
    try {
      await navigator.clipboard.writeText(bookmarkletHref);
      setBookmarkletCopied(true);
    } catch {
      window.prompt(strings.copyBookmarklet, bookmarkletHref);
    }
  };

  const copyMcpServer = async () => {
    if (connector.statusCommand) {
      try {
        await navigator.clipboard.writeText(connector.statusCommand);
        setMcpCopied(true);
      } catch {
        window.prompt(strings.mcpServer, connector.statusCommand);
      }
    }
  };

  useEffect(() => {
    applyBookmarkletHref(bookmarkletAnchorRef.current, bookmarkletHref);
  }, [bookmarkletHref]);

  return (
    <article className={`connector-card ${connector.maturity}`}>
      <div className="connector-card-head">
        <div className="connector-icon">{icon}</div>
        <span className={`connector-badge ${connector.maturity}`}>{strings[connector.maturity]}</span>
      </div>
      <div className="connector-copy">
        <h3>{strings[connector.titleKey as keyof typeof strings] as string}</h3>
        <p>{strings[connector.subtitleKey as keyof typeof strings] as string}</p>
      </div>
      <div className={`connector-status ${statusTone}`}>
        {statusTone === "offline" ? <WifiOff size={14} /> : <CheckCircle2 size={14} />}
        <span>{busy ? strings.checkingStatus : statusLabel}</span>
      </div>
      {activeConnection && (activeConnection.accountEmail || activeConnection.planLabel || activeConnection.message) && (
        <dl className="connector-meta">
          {activeConnection.accountEmail && (
            <div>
              <dt>{strings.accountEmail}</dt>
              <dd>{activeConnection.accountEmail}</dd>
            </div>
          )}
          {activeConnection.planLabel && (
            <div>
              <dt>{strings.planLabel}</dt>
              <dd>{activeConnection.planLabel}</dd>
            </div>
          )}
          {activeConnection.message && (
            <div>
              <dt>{strings.status}</dt>
              <dd>{activeConnection.message}</dd>
            </div>
          )}
        </dl>
      )}
      {!isHiggsfield && !isMcp && (connector.installCommand || connector.statusCommand) && (
        <dl className="connector-meta command-meta">
          {isDreamina && (
            <div>
              <dt>{strings.localInstall}</dt>
              <dd>{strings.managedInstallNote}</dd>
            </div>
          )}
          {!isDreamina && connector.installCommand && (
            <div>
              <dt>{strings.installCommand}</dt>
              <dd>
                <code>{connector.installCommand}</code>
              </dd>
            </div>
          )}
          {!isDreamina && connector.statusCommand && (
            <div>
              <dt>{strings.statusCommand}</dt>
              <dd>
                <code>{connector.statusCommand}</code>
              </dd>
            </div>
          )}
        </dl>
      )}
      {isBrowserSession && (
        <dl className="connector-meta command-meta">
          <div>
            <dt>{strings.browserConnector}</dt>
            <dd>{strings.browserConnectorNote}</dd>
          </div>
        </dl>
      )}
      {isBrowserSession && (
        <details className="bookmarklet-fallback">
          <summary>{strings.browserBookmarkletFallback}</summary>
          <div className="bookmarklet-box">
            <a
              className="bookmarklet-drag"
              draggable="true"
              href="#bookmarklet"
              onClick={(event) => {
                event.preventDefault();
                void copyBookmarklet();
              }}
              ref={bookmarkletAnchorRef}
              title={strings.browserConnectorNote}
            >
              <Bookmark size={15} />
              {strings.sendToCreditRadar}
            </a>
            <button className="secondary-button compact-button" onClick={() => void copyBookmarklet()}>
              <Copy size={15} />
              {bookmarkletCopied ? strings.bookmarkletCopied : strings.copyBookmarklet}
            </button>
          </div>
        </details>
      )}
      {isMcp && connector.statusCommand && (
        <dl className="connector-meta command-meta mcp-guide-meta">
          <div>
            <dt>{language === "zh" ? "外部授权" : "External auth"}</dt>
            <dd>{language === "zh" ? "OpenArt MCP 需要在 ChatGPT / Claude / Cursor 里完成 OAuth。当前不会自动写入本台账。" : "OpenArt MCP OAuth happens inside ChatGPT / Claude / Cursor. This does not write to this ledger yet."}</dd>
          </div>
          <div>
            <dt>{strings.mcpServer}</dt>
            <dd>
              <code>{connector.statusCommand}</code>
            </dd>
          </div>
        </dl>
      )}
      {isDreamina && (activeConnection?.verificationUri || activeConnection?.userCode) && (
        <dl className="connector-meta login-meta">
          {activeConnection.verificationUri && (
            <div>
              <dt>{strings.authorizationPage}</dt>
              <dd>
                <a href={activeConnection.verificationUri} target="_blank" rel="noreferrer">
                  {strings.openAuthorizationPage}
                </a>
              </dd>
            </div>
          )}
          {activeConnection.userCode && (
            <div>
              <dt>{strings.userCode}</dt>
              <dd>
                <code>{activeConnection.userCode}</code>
              </dd>
            </div>
          )}
          {activeConnection.expiresAt && (
            <div>
              <dt>{strings.expiresAt}</dt>
              <dd>{activeConnection.expiresAt}</dd>
            </div>
          )}
        </dl>
      )}
      <div className="connector-actions">
        {isHiggsfield ? (
          <>
            <button className="primary-button" disabled={busy} onClick={onCheckHiggsfield}>
              {busy ? <RefreshCw className="spin" size={15} /> : <CheckCircle2 size={15} />}
              {phase === "needs_auth" || phase === "login_started" ? strings.retryStatus : strings.checkStatus}
            </button>
            {phase !== "ready" && (
              <button className="secondary-button" disabled={busy} onClick={onStartHiggsfieldLogin}>
                <LockKeyhole size={15} />
                {strings.startLogin}
              </button>
            )}
          </>
        ) : isDreamina ? (
          <>
            <button className="primary-button" disabled={busy} onClick={onCheckDreamina}>
              {busy ? <RefreshCw className="spin" size={15} /> : <CheckCircle2 size={15} />}
              {strings.checkStatus}
            </button>
            {phase !== "ready" && (
              <button className="secondary-button" disabled={busy} onClick={onStartDreaminaLogin}>
                {phase === "installing" ? <RefreshCw className="spin" size={15} /> : <Terminal size={15} />}
                {phase === "installing" ? strings.preparingLogin : (strings[connector.secondaryActionKey as keyof typeof strings] as string)}
              </button>
            )}
            {dreaminaConnection.deviceCode && (
              <button className="secondary-button" disabled={busy} onClick={onFinishDreaminaLogin}>
                {phase === "checking" ? <RefreshCw className="spin" size={15} /> : <CheckCircle2 size={15} />}
                {strings.finishLogin}
              </button>
            )}
          </>
        ) : isBrowserSession ? (
          <>
            {phase !== "ready" && (
              <button className="primary-button" disabled={busy} onClick={() => onInstallBrowserExtension(connector.platform)}>
                {phase === "installing" ? <RefreshCw className="spin" size={15} /> : <Puzzle size={15} />}
                {strings.installBrowserExtension}
              </button>
            )}
            <button className="secondary-button" disabled={busy} onClick={() => onOpenBrowserSession(connector.platform)}>
              {phase === "installing" ? <RefreshCw className="spin" size={15} /> : <Monitor size={15} />}
              {strings[connector.primaryActionKey as keyof typeof strings] as string}
            </button>
            <button className="secondary-button" disabled={busy} onClick={() => onCheckBrowserSession(connector.platform)}>
              {phase === "checking" ? <RefreshCw className="spin" size={15} /> : <CheckCircle2 size={15} />}
              {strings[connector.secondaryActionKey as keyof typeof strings] as string}
            </button>
          </>
        ) : isMcp ? (
          <>
            <button
              className="primary-button"
              onClick={() => void copyMcpServer()}
              type="button"
            >
              <Copy size={15} />
              {strings[connector.primaryActionKey as keyof typeof strings] as string}
            </button>
            <a className="secondary-button" href="https://chatgpt.com/" target="_blank" rel="noreferrer">
              <Globe2 size={15} />
              ChatGPT
            </a>
            <a className="secondary-button" href="https://claude.ai/" target="_blank" rel="noreferrer">
              <Globe2 size={15} />
              Claude
            </a>
            <span className="connector-inline-note">
              {mcpCopied ? strings.mcpServerCopied : strings.openMcpGuide}
            </span>
          </>
        ) : (
          <>
            {(connector.loginUrl || connector.installUrl) && (
              <a
                className="primary-button"
                href={connector.loginUrl ?? connector.installUrl}
                target="_blank"
                rel="noreferrer"
              >
                {connector.installUrl ? <Terminal size={15} /> : <Globe2 size={15} />}
                {strings[connector.primaryActionKey as keyof typeof strings] as string}
              </a>
            )}
            <button className="secondary-button" disabled>
              <Plus size={15} />
              {strings[connector.secondaryActionKey as keyof typeof strings] as string}
            </button>
          </>
        )}
      </div>
    </article>
  );
}

function connectionStatusLabel(connection: HiggsfieldConnectionState, strings: ReturnType<typeof t>) {
  if (connection.phase === "ready") return strings.statusReady;
  if (connection.phase === "service_ready") return strings.helperOnline;
  if (connection.phase === "extension_pending") return strings.statusExtensionPending;
  if (connection.phase === "installing") return strings.preparingLogin;
  if (connection.phase === "installed") return strings.installedCli;
  if (connection.phase === "needs_auth") return strings.statusNeedsAuth;
  if (connection.phase === "missing_config") return strings.statusMissingConfig;
  if (connection.phase === "login_started") return strings.loginStarted;
  if (connection.phase === "helper_offline") return strings.helperOffline;
  if (connection.phase === "checking") return strings.checkingStatus;
  return strings.notConnected;
}

function connectionStatusTone(connection: HiggsfieldConnectionState) {
  if (connection.phase === "ready" || connection.phase === "service_ready") return "ready";
  if (connection.phase === "helper_offline" || connection.phase === "error") return "offline";
  if (
    connection.phase === "needs_auth" ||
    connection.phase === "missing_config" ||
    connection.phase === "login_started" ||
    connection.phase === "installing" ||
    connection.phase === "installed" ||
    connection.phase === "extension_pending"
  ) {
    return "warning";
  }
  return "neutral";
}

function PrimaryRiskCard({
  item,
  language,
}: {
  item?: { record: PlatformRecord; risk: RiskAssessment };
  language: Language;
}) {
  const strings = t(language);
  const locale = language === "zh" ? "zh-CN" : "en-US";
  if (!item) {
    return (
      <article className="primary-risk empty-risk">
        <div className="primary-risk-copy">
          <span>{language === "zh" ? "还没有账号" : "No accounts yet"}</span>
          <h2>{language === "zh" ? "先添加一个账号" : "Add an account first"}</h2>
          <p>
            {language === "zh"
              ? "添加或连接账号后，积分余额和过期风险会出现在下面的大表。"
              : "After you add or connect an account, balances and expiry risk appear in the ledger below."}
          </p>
        </div>
        <div className="primary-risk-number">
          <strong>0</strong>
          <span>{language === "zh" ? "accounts" : "accounts"}</span>
        </div>
      </article>
    );
  }
  const unused = item.risk.unusedRatio === undefined ? undefined : Math.round(item.risk.unusedRatio * 100);
  const hasSnapshot = Boolean(item.record.snapshot);
  const pendingLabel = language === "zh" ? "等待首次抓取" : "waiting for first fetch";

  return (
    <article className={`primary-risk ${item.risk.level}`}>
      <div className="primary-risk-copy">
        <span>
          {strings.primaryAlert}
          <b>{riskLabel(item.risk.level, strings)}</b>
        </span>
        <h2>{item.record.account.label}</h2>
        <p>{strings.reason[item.risk.reasonKey as keyof typeof strings.reason]}</p>
      </div>
      <div className="primary-risk-number">
        <strong>{item.record.snapshot?.creditsRemaining ?? "--"}</strong>
        <span>{item.record.snapshot?.currencyLabel ?? pendingLabel}</span>
      </div>
      <dl className="primary-risk-meta">
        <div className="primary-time-tile">
          <dt>{strings.reset}</dt>
          <dd>{formatDate(item.risk.resetDate, locale)}</dd>
        </div>
        <div className="primary-time-tile urgent">
          <dt>{strings.riskWindow}</dt>
          <dd>
            <span>{item.risk.daysToReset}</span>
            <small>d</small>
          </dd>
        </div>
        <div className="primary-time-tile">
          <dt>{strings.unused}</dt>
          <dd>{!hasSnapshot ? "--" : unused === undefined ? (language === "zh" ? "未填总额" : "n/a") : `${unused}%`}</dd>
        </div>
      </dl>
      <button className="risk-command">
        {item.risk.actionKey === "reauth" ? <LockKeyhole size={15} /> : <Sparkles size={15} />}
        {strings.action[item.risk.actionKey as keyof typeof strings.action]}
      </button>
    </article>
  );
}

function AutoFetchPanel({
  monitor,
  nextSyncAt,
  summary,
  language,
  syncStatus,
}: {
  monitor: MonitorSummary;
  nextSyncAt: string;
  summary: FetchSummary;
  language: Language;
  syncStatus: "idle" | "running" | "done";
}) {
  const strings = t(language);
  const locale = language === "zh" ? "zh-CN" : "en-US";
  const healthLabel = language === "zh" ? "监控健康" : "Monitor health";
  const healthCopy =
    language === "zh"
      ? "先看真实余额是否接入，再看哪些平台缺快照或授权阻塞。"
      : "Check real balance coverage first, then fix snapshot gaps or blocked adapters.";
  const connectedLabel = language === "zh" ? "已接入账号" : "Connected accounts";
  const missingLabel = language === "zh" ? "缺少快照" : "Missing snapshots";
  const blockedLabel = language === "zh" ? "需要处理" : "Needs attention";

  return (
    <article className="auto-panel">
      <div className="auto-panel-head">
        <div>
          <span>{healthLabel}</span>
          <h2>
            {syncStatus === "running" ? strings.runningFetch : `${monitor.connectedAccounts}/${monitor.totalAccounts}`}
          </h2>
        </div>
        <div className={`run-indicator ${syncStatus}`}>
          {syncStatus === "running" ? <RefreshCw className="spin" size={18} /> : <CheckCircle2 size={18} />}
        </div>
      </div>
      <p>{healthCopy}</p>
      <p className="real-disclosure">{strings.realDisclosure}</p>
      <div className="metric-grid">
        <Metric label={connectedLabel} value={`${monitor.connectedAccounts}/${monitor.totalAccounts}`} />
        <Metric label={missingLabel} value={`${monitor.missingSnapshots}`} />
        <Metric label={blockedLabel} value={`${monitor.blockedAdapters}`} />
        <Metric label={strings.nextSync} value={formatShortTime(nextSyncAt, locale)} />
      </div>
    </article>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function ActionQueue({
  items,
  language,
}: {
  items: Array<{ record: PlatformRecord; risk: RiskAssessment }>;
  language: Language;
}) {
  const strings = t(language);

  return (
    <aside className="action-panel">
      <div className="action-panel-head">
        <Bell size={17} />
        <div>
          <h2>{strings.actionQueue}</h2>
          <span>{strings.primaryAlertSubtitle}</span>
        </div>
      </div>
      <div className="action-list">
        {items.length > 0 ? (
          items.map(({ record, risk }) => (
            <article className="action-item" key={record.account.id}>
              <div className={`action-dot ${risk.level}`} />
              <div>
                <strong>{record.account.label}</strong>
                <p>{strings.action[risk.actionKey as keyof typeof strings.action]}</p>
              </div>
              <ChevronRight size={16} />
            </article>
          ))
        ) : (
          <p className="empty">{strings.noUrgentAction}</p>
        )}
      </div>
    </aside>
  );
}

function LedgerToolbar({
  language,
}: {
  language: Language;
}) {
  const ledgerNote =
    language === "zh"
      ? "主台账只显示已经连接或手动导入过的真实余额。添加账号、打开官网和手动录入都在下方「连接账号」里。"
      : "The ledger only shows connected or manually imported real balances. Add accounts, open platform sites, and enter balances in Connect accounts below.";

  return (
    <div className="ledger-toolbar">
      <p>{ledgerNote}</p>
      <details className="ledger-risk-rules">
        <summary>{language === "zh" ? "风险等级怎么算？" : "How risk is scored"}</summary>
        <p>
          {language === "zh"
            ? "非常严重：1天内重置且还有余额。严重：3天内。高：7天内。中：10天内。低：距离重置较远或无明显浪费风险。授权/抓取阻塞会按距离重置的窗口进入对应等级。"
            : "Very critical: reset is within 1 day and balance remains. Critical: within 3 days. High: within 7 days. Medium: within 10 days. Low: farther away or low waste risk. Auth/fetch blockers use the same reset windows."}
        </p>
      </details>
    </div>
  );
}

function BrowserBalanceImport({
  language,
  onImportBalance,
}: {
  language: Language;
  onImportBalance: (input: BalanceImportInput) => void;
}) {
  const [platform, setPlatform] = useState("lovart");
  const [customName, setCustomName] = useState("");
  const [customUrl, setCustomUrl] = useState("");
  const [balance, setBalance] = useState("");
  const [total, setTotal] = useState("");
  const [currencyLabel, setCurrencyLabel] = useState("credits");
  const [pageText, setPageText] = useState("");
  const [message, setMessage] = useState("");
  const [importSource, setImportSource] = useState<BalanceImportInput["source"]>("manual");
  const [ocrBusy, setOcrBusy] = useState(false);
  const title = language === "zh" ? "手动导入" : "Manual Import";
  const copy =
    language === "zh"
      ? "没有官方 CLI / MCP 的平台先手动录入。可以打开官网查看余额，也可以上传截图做 OCR，最后保存到台账。"
      : "For platforms without a working CLI or MCP connector, enter the balance manually. Open the official site, optionally OCR a screenshot, then save it to the ledger.";
  const parseLabel = language === "zh" ? "解析文字" : "Parse text";
  const importLabel = language === "zh" ? "导入到台账" : "Import to ledger";
  const selectedWebsiteUrl = manualPlatformWebsiteUrl(platform) ?? normalizeWebsiteUrl(customUrl) ?? "";
  const needsUrlInput = platform === customManualPlatformId || !manualPlatformWebsiteUrl(platform);
  const platformLabel =
    platform === customManualPlatformId ? customName.trim() : platformDisplayName(platform, language);

  const parseText = () => {
    const parsed = parseBrowserCreditText(pageText, { platform, source: "pasted_text" });
    if (!parsed) {
      setMessage(language === "zh" ? "没有识别到余额。可以直接手动填写余额。" : "No balance found. You can still enter the balance manually.");
      return;
    }

    setBalance(String(parsed.creditsRemaining));
    setCurrencyLabel(parsed.currencyLabel);
    setImportSource("pasted_text");
    setMessage(
      language === "zh"
        ? `已识别：${parsed.creditsRemaining} ${parsed.currencyLabel}`
        : `Detected: ${parsed.creditsRemaining} ${parsed.currencyLabel}`,
    );
  };

  const recognizeScreenshot = async (file?: File) => {
    if (!file) return;
    setOcrBusy(true);
    setMessage(language === "zh" ? "正在识别截图，第一次可能会慢一点..." : "Reading screenshot. The first OCR run may take a bit...");
    let worker: OcrWorker | undefined;

    try {
      const { createWorker } = await import("tesseract.js");
      if (platform === "openart") {
        setMessage(language === "zh" ? "正在优化 OpenArt 积分截图..." : "Optimizing the OpenArt credit badge...");
        const badgeFile = await createOpenArtCreditBadgeOcrFile(file).catch(() => undefined);
        if (badgeFile) {
          worker = (await createWorker("eng", 1, {
            ...createTesseractOcrOptions(),
          })) as OcrWorker;
          await worker.setParameters?.({
            tessedit_char_whitelist: "0123456789",
            tessedit_pageseg_mode: "10",
          });

          const badgeResult = await worker.recognize(badgeFile);
          const badgeText = badgeResult.data.text.trim();
          const badgeParsed = parseBrowserCreditText(badgeText, { platform, source: "ocr" });
          await worker.terminate().catch((error) => console.error("OCR worker terminate failed", error));
          worker = undefined;

          if (badgeParsed) {
            setPageText(badgeText);
            setBalance(String(badgeParsed.creditsRemaining));
            setCurrencyLabel(badgeParsed.currencyLabel);
            setImportSource("ocr");
            setMessage(
              language === "zh"
                ? `OpenArt 徽章已识别：${badgeParsed.creditsRemaining} ${badgeParsed.currencyLabel}`
                : `OpenArt badge detected: ${badgeParsed.creditsRemaining} ${badgeParsed.currencyLabel}`,
            );
            return;
          }
        }
      }

      worker = (await createWorker("eng", 1, {
        ...createTesseractOcrOptions(),
        logger: (progress: OcrProgress) => {
          if (!progress.status) return;
          if (progress.status === "loading language traineddata") {
            setMessage(language === "zh" ? "正在加载本地 OCR 模型..." : "Loading the local OCR model...");
            return;
          }

          if (progress.status === "recognizing text" && typeof progress.progress === "number") {
            const percent = Math.max(0, Math.min(100, Math.round(progress.progress * 100)));
            setMessage(language === "zh" ? `正在识别截图 ${percent}%...` : `Reading screenshot ${percent}%...`);
          }
        },
      })) as OcrWorker;
      const result = await worker.recognize(file);
      const text = result.data.text.trim();
      setPageText(text);

      const parsed = parseBrowserCreditText(text, { platform, source: "ocr" });
      if (!parsed) {
        setMessage(language === "zh" ? "OCR 完成，但没有识别到余额；请手动填写或换一张更清晰的截图。" : "OCR finished, but no balance was detected. Enter it manually or try a clearer screenshot.");
        return;
      }

      setBalance(String(parsed.creditsRemaining));
      setCurrencyLabel(parsed.currencyLabel);
      setImportSource("ocr");
      setMessage(
        language === "zh"
          ? `OCR 已识别：${parsed.creditsRemaining} ${parsed.currencyLabel}`
          : `OCR detected: ${parsed.creditsRemaining} ${parsed.currencyLabel}`,
      );
    } catch (error) {
      console.error("OCR failed", error);
      const detail = ocrErrorMessage(error);
      setMessage(
        language === "zh"
          ? `OCR 没有加载成功：${detail}。可以先手动填写余额。`
          : `OCR did not load: ${detail}. You can enter the balance manually for now.`,
      );
    } finally {
      await worker?.terminate().catch((error) => console.error("OCR worker terminate failed", error));
      setOcrBusy(false);
    }
  };

  const handleScreenshotPaste = (event: ClipboardEvent<HTMLDivElement>, showMissingMessage = false) => {
    const file = imageFileFromClipboardItems(event.clipboardData.items);
    if (!file) {
      if (showMissingMessage) {
        setMessage(
          language === "zh"
            ? "剪贴板里没有图片。请先截图，再点这里按 Ctrl+V。"
            : "No image found in the clipboard. Take a screenshot, focus here, then press Ctrl+V.",
        );
      }
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    void recognizeScreenshot(file);
  };

  const importBalance = () => {
    const creditsRemaining = parseImportNumber(balance);
    const creditsTotal = total.trim() ? parseImportNumber(total) : undefined;
    if (platform === customManualPlatformId && !customName.trim()) {
      setMessage(language === "zh" ? "请先填写自定义平台名称。" : "Enter a custom platform name first.");
      return;
    }

    if (creditsRemaining === undefined) {
      setMessage(language === "zh" ? "请先填写一个有效余额。" : "Enter a valid balance first.");
      return;
    }

    if (creditsTotal !== undefined && creditsTotal < creditsRemaining) {
      setMessage(language === "zh" ? "总额度不能小于当前余额。" : "Total cannot be lower than the current balance.");
      return;
    }

    const finalPlatform = platform === customManualPlatformId ? customPlatformIdFromName(customName) : platform;
    onImportBalance({
      platform: finalPlatform,
      platformLabel,
      homepageUrl: selectedWebsiteUrl || undefined,
      creditsRemaining,
      creditsTotal,
      currencyLabel,
      source: importSource,
    });
    setMessage(language === "zh" ? "已手动导入。你可以在台账里继续设置重置周期。" : "Manually imported. You can set the reset cycle in the ledger.");
  };

  return (
    <div className="ledger-import-panel" onPaste={(event) => handleScreenshotPaste(event)}>
      <div className="ledger-import-copy">
        <strong>{title}</strong>
        <span>{copy}</span>
      </div>
      <div className="manual-site-actions">
        {selectedWebsiteUrl ? (
          <a className="secondary-button" href={selectedWebsiteUrl} target="_blank" rel="noreferrer">
            <Globe2 size={14} />
            {language === "zh" ? "打开官网" : "Open site"}
          </a>
        ) : (
          <span>{language === "zh" ? "这个平台请先填写官网 URL。" : "Add a site URL for this platform."}</span>
        )}
      </div>
      <div className="ledger-import-fields">
        <label>
          <span>{language === "zh" ? "平台" : "Platform"}</span>
          <select
            value={platform}
            onChange={(event) => {
              const nextPlatform = event.currentTarget.value;
              setPlatform(nextPlatform);
              setCurrencyLabel(manualPlatformDefaultUnit(nextPlatform));
              setImportSource("manual");
            }}
          >
            {manualPlatformOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.labels[language]}
              </option>
            ))}
            <option value={customManualPlatformId}>{language === "zh" ? "自定义平台" : "Custom"}</option>
          </select>
        </label>
        {platform === customManualPlatformId && (
          <label>
            <span>{language === "zh" ? "平台名称" : "Platform name"}</span>
            <input
              placeholder={language === "zh" ? "例如 Seko" : "e.g. Seko"}
              value={customName}
              onChange={(event) => setCustomName(event.currentTarget.value)}
            />
          </label>
        )}
        {needsUrlInput && (
          <label>
            <span>{language === "zh" ? "官网 URL 可选" : "Site URL optional"}</span>
            <input
              placeholder="https://"
              value={customUrl}
              onChange={(event) => setCustomUrl(event.currentTarget.value)}
            />
          </label>
        )}
        <label>
          <span>{language === "zh" ? "余额" : "Balance"}</span>
          <input
            inputMode="decimal"
            placeholder="5717"
            value={balance}
            onChange={(event) => {
              setBalance(event.currentTarget.value);
              setImportSource("manual");
            }}
          />
        </label>
        <label>
          <span>{language === "zh" ? "总额度 可选" : "Total optional"}</span>
          <input inputMode="decimal" placeholder="10000" value={total} onChange={(event) => setTotal(event.currentTarget.value)} />
        </label>
        <label>
          <span>{language === "zh" ? "单位" : "Unit"}</span>
          <select
            value={currencyLabel}
            onChange={(event) => {
              setCurrencyLabel(event.currentTarget.value);
              setImportSource("manual");
            }}
          >
            <option value="credits">credits</option>
            <option value="tokens">tokens</option>
          </select>
        </label>
      </div>
      <label className="ledger-ocr-input">
        <span>{language === "zh" ? "截图 OCR 可选" : "Screenshot OCR optional"}</span>
        <input
          accept="image/*"
          disabled={ocrBusy}
          type="file"
          onChange={(event) => void recognizeScreenshot(event.currentTarget.files?.[0])}
        />
        <small>
          {language === "zh"
            ? "适合余额区域截图；当前先用英文/数字 OCR，识别失败也可以手动填。"
            : "Best for a cropped balance screenshot. Uses English/number OCR first; manual entry still works."}
        </small>
      </label>
      <div
        className="ledger-ocr-paste-zone"
        onPaste={(event) => handleScreenshotPaste(event, true)}
        role="button"
        tabIndex={0}
      >
        <Sparkles size={16} />
        <strong>{language === "zh" ? "也可以直接粘贴截图" : "Paste a screenshot directly"}</strong>
        <span>
          {language === "zh"
            ? "点击这里后按 Ctrl+V。适合微信、浏览器或系统截图工具复制出来的图片。"
            : "Click here, then press Ctrl+V. Works with screenshots copied from chat, browser, or system tools."}
        </span>
      </div>
      <label className="ledger-import-textarea">
        <span>{language === "zh" ? "粘贴页面文字 可选" : "Paste page text optional"}</span>
        <textarea
          placeholder={
            language === "zh"
              ? "如果页面复制出来有余额文字，可以粘贴到这里；没有也没关系。"
              : "Press Ctrl+A / Ctrl+C on the signed-in platform page, then paste here."
          }
          value={pageText}
          onChange={(event) => {
            setPageText(event.currentTarget.value);
            setImportSource("manual");
          }}
        />
      </label>
      <div className="ledger-import-actions">
        <button className="secondary-button" onClick={parseText} type="button">
          <Copy size={14} />
          {parseLabel}
        </button>
        <button className="primary-button" onClick={importBalance} type="button">
          <Plus size={14} />
          {importLabel}
        </button>
        {message && <span>{message}</span>}
      </div>
    </div>
  );
}

function parseImportNumber(value: string) {
  const parsed = Number(value.replace(/,/g, "").trim());
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

function LedgerEmptyState({ language }: { language: Language }) {
  return (
    <div className="ledger-empty">
      <strong>{language === "zh" ? "还没有添加账号" : "No accounts added yet"}</strong>
      <p>
        {language === "zh"
          ? "上方选择一个平台添加账号后，这里才会显示积分、剩余算力、重置日和更新时间。"
          : "Choose a platform above. The ledger appears after you add an account or connect a real balance."}
      </p>
    </div>
  );
}

function PanelHeading({ icon, title, subtitle }: { icon: React.ReactNode; title: string; subtitle: string }) {
  return (
    <div className="panel-heading">
      <div className="panel-title">
        {icon}
        <h2>{title}</h2>
      </div>
      <span>{subtitle}</span>
    </div>
  );
}

function RiskCard({
  record,
  risk,
  language,
  onConnectPlatform,
  onManualUpdate,
  onRemoveAccount,
  onSetConfiguredCreditsTotal,
  onSetResetRule,
}: {
  record: PlatformRecord;
  risk: RiskAssessment;
  language: Language;
  onConnectPlatform: (platform: string, mode?: "connect" | "refresh") => Promise<void>;
  onManualUpdate: () => void;
  onRemoveAccount: (accountId: string) => void;
  onSetConfiguredCreditsTotal: (accountId: string, configuredCreditsTotal?: number) => void;
  onSetResetRule: (accountId: string, resetRule: ResetRule) => void;
}) {
  const strings = t(language);
  const locale = language === "zh" ? "zh-CN" : "en-US";
  const confidence = record.snapshot?.confidence;
  const [rowBusy, setRowBusy] = useState(false);
  const isManualAdapter = record.account.adapterKind === "manual";
  const creditsTotal = effectiveCreditsTotal(record);
  const hasKnownTotal = typeof creditsTotal === "number" && creditsTotal > 0;
  const unusedPercent = hasKnownTotal && risk.unusedRatio !== undefined ? Math.round(risk.unusedRatio * 100) : undefined;
  const computeLabel = unusedPercent === undefined ? "--" : `${unusedPercent}%`;
  const computeWidth = `${Math.max(0, Math.min(100, unusedPercent ?? 0))}%`;
  const timezone = record.account.resetRule.timezone;
  const dataUpdatedAt = record.snapshot?.sourceUpdatedAt ?? record.snapshot?.capturedAt;
  const capturedAt = dataUpdatedAt ?? record.lastRun?.finishedAt ?? record.lastRun?.startedAt;
  const updatedLabel = capturedAt ? formatShortTime(capturedAt, locale) : language === "zh" ? "从未" : "never";
  const resetLabel = resetRuleShortText(record.account.resetRule, risk.resetDate, language, locale);
  const confidenceLabel = confidence ? strings.confidenceValue[confidence] : strings.statusValue.not_configured;
  const waitingSnapshot = !record.snapshot;
  const rowActionLabel = rowBusy
    ? language === "zh"
      ? "检查中"
      : "Checking"
    : isManualAdapter
      ? language === "zh"
        ? "手动更新余额"
        : "Update manually"
      : waitingSnapshot
    ? language === "zh"
      ? "开始连接"
      : "Connect"
    : language === "zh"
      ? "检查更新"
      : "Check";
  const waitingLabel = language === "zh" ? "等待首次抓取" : "waiting for first fetch";
  const connectLabel = language === "zh" ? "需要连接" : "needs connection";
  const computeStatusLabel = waitingSnapshot
    ? connectLabel
    : hasKnownTotal
      ? language === "zh"
        ? "剩余额度比例"
        : "remaining ratio"
      : language === "zh"
        ? "总额度未填"
        : "total missing";
  const removeLabel = language === "zh" ? "删除" : "Remove";
  const handleRowAction = async () => {
    if (isManualAdapter) {
      onManualUpdate();
      return;
    }

    setRowBusy(true);
    try {
      await onConnectPlatform(record.account.platform, waitingSnapshot ? "connect" : "refresh");
    } finally {
      setRowBusy(false);
    }
  };

  return (
    <article className={`risk-card ledger-row ${risk.level} js-risk-row`} role="row">
      <div className="ledger-name" role="cell">
        <div className="risk-title-row">
          <h3>{accountDisplayName(record, language)}</h3>
          <span className={`risk-pill ${risk.level}`}>{riskLabel(risk.level, strings)}</span>
        </div>
        <span className="ledger-adapter-label">{adapterDisplayLabel(record, language)}</span>
        <div className="risk-meta">
          <span>
            {labelText(strings, "nextResetAt", language === "zh" ? "下次重置" : "Next reset")}:{" "}
            {formatDate(risk.resetDate, locale)}
          </span>
          <span>
            {labelText(strings, "capturedAt", language === "zh" ? "抓取时间" : "Captured")}:{" "}
            {formatRelative(record.snapshot?.capturedAt ?? record.lastRun?.finishedAt ?? record.lastRun?.startedAt, locale)}
          </span>
          <span>
            {labelText(strings, "sourceUpdatedAt", language === "zh" ? "数据更新时间" : "Data updated")}:{" "}
            {formatRelative(dataUpdatedAt, locale)}
          </span>
          <span>
            {strings.confidence}:{" "}
            {confidence ? strings.confidenceValue[confidence] : strings.statusValue.not_configured}
          </span>
          <span>
            {labelText(strings, "resetEvidence", language === "zh" ? "重置证据" : "Reset evidence")}:{" "}
            {resetEvidenceText(record, strings, language)}
          </span>
        </div>
        <ResetRuleEditor
          label={record.account.label}
          language={language}
          resetRule={record.account.resetRule}
          onChange={(resetRule) => onSetResetRule(record.account.id, resetRule)}
          timezone={timezone}
        />
      </div>
      <div className="ledger-points risk-number" role="cell">
        <strong>{record.snapshot?.creditsRemaining ?? "--"}</strong>
        <span>{record.snapshot?.currencyLabel ?? waitingLabel}</span>
      </div>

      <div className="ledger-compute" role="cell">
        <div className="compute-line">
          <strong>{waitingSnapshot ? "--" : computeLabel}</strong>
          <span className="compute-status-label">{computeStatusLabel}</span>
          <span>{computeStatusLabel}</span>
        </div>
        <div className={`compute-bar ${hasKnownTotal ? "" : "unknown"}`} aria-hidden="true">
          <span style={{ width: waitingSnapshot ? "0%" : computeWidth }} />
        </div>
        <CreditsTotalEditor
          balance={record.snapshot?.creditsRemaining}
          detectedTotal={record.snapshot?.creditsTotal}
          language={language}
          value={record.account.configuredCreditsTotal}
          onChange={(value) => onSetConfiguredCreditsTotal(record.account.id, value)}
        />
      </div>

      <div className="ledger-reset" role="cell">
        <div className="ledger-time-chip">
          <span>{language === "zh" ? "重置日" : "Reset"}</span>
          <strong>{resetLabel}</strong>
          <em>
            {language === "zh" ? "剩余" : "left"} <b>{risk.daysToReset}d</b>
          </em>
        </div>
        <ResetRuleEditor
          label={accountDisplayName(record, language)}
          language={language}
          resetRule={record.account.resetRule}
          onChange={(resetRule) => onSetResetRule(record.account.id, resetRule)}
          timezone={timezone}
        />
      </div>

      <div className="ledger-update" role="cell">
        <div className="ledger-data-chip">
          <span className="ledger-update-caption">{language === "zh" ? "数据更新时间" : "Data updated"}</span>
          <strong>{updatedLabel}</strong>
          <em>{confidenceLabel}</em>
        </div>
        <span>{resetEvidenceText(record, strings, language)}</span>
      </div>

      <div className="risk-action ledger-action" role="cell">
        <strong>{strings.action[risk.actionKey as keyof typeof strings.action]}</strong>
        <span>{strings.reason[risk.reasonKey as keyof typeof strings.reason]}</span>
        <button
          className="ledger-connect-button"
          disabled={rowBusy}
          onClick={() => void handleRowAction()}
          type="button"
        >
          <RefreshCw className={rowBusy ? "spin" : ""} size={14} />
          {rowActionLabel}
        </button>
        <button className="ledger-delete-button" onClick={() => onRemoveAccount(record.account.id)} type="button">
          <Trash2 size={14} />
          {removeLabel}
        </button>
      </div>
    </article>
  );
}

function CreditsTotalEditor({
  balance,
  detectedTotal,
  language,
  onChange,
  value,
}: {
  balance?: number;
  detectedTotal?: number;
  language: Language;
  onChange: (configuredCreditsTotal?: number) => void;
  value?: number;
}) {
  const [draft, setDraft] = useState(value === undefined ? "" : String(value));

  useEffect(() => {
    setDraft(value === undefined ? "" : String(value));
  }, [value]);

  const parsed = draft.trim() ? parseImportNumber(draft) : undefined;
  const invalidNumber = draft.trim() !== "" && parsed === undefined;
  const belowBalance = parsed !== undefined && balance !== undefined && parsed < balance;
  const hasError = invalidNumber || belowBalance;
  const helperText = hasError
    ? belowBalance
      ? language === "zh"
        ? "不能低于当前余额"
        : "Must be at least the balance"
      : language === "zh"
        ? "请输入有效数字"
        : "Enter a valid number"
    : language === "zh"
      ? "填后自动重算"
      : "Recalculates automatically";
  const placeholder =
    detectedTotal && detectedTotal > 0
      ? language === "zh"
        ? `已识别 ${detectedTotal}`
        : `Detected ${detectedTotal}`
      : language === "zh"
        ? "例如 6000"
        : "e.g. 6000";

  return (
    <label className={`credits-total-editor ${hasError ? "error" : ""}`}>
      <span>{language === "zh" ? "总额度" : "Total quota"}</span>
      <input
        inputMode="decimal"
        placeholder={placeholder}
        value={draft}
        onChange={(event) => {
          const nextDraft = event.currentTarget.value;
          const nextParsed = nextDraft.trim() ? parseImportNumber(nextDraft) : undefined;
          setDraft(nextDraft);

          if (!nextDraft.trim()) {
            onChange(undefined);
            return;
          }

          if (nextParsed !== undefined && (balance === undefined || nextParsed >= balance)) {
            onChange(nextParsed);
          }
        }}
      />
      <small>{helperText}</small>
    </label>
  );
}

function ResetRuleEditor({
  label,
  language,
  onChange,
  resetRule,
  timezone,
}: {
  label: string;
  language: Language;
  onChange: (resetRule: ResetRule) => void;
  resetRule: ResetRule;
  timezone: string;
}) {
  const strings = t(language);
  const resetState = resetRuleFormState(resetRule);
  const type = resetState.type;
  const day = resetState.dayOfMonth;
  const month = resetState.month;

  return (
    <div className="reset-editor" aria-label={`${label} ${strings.resetFrequency}`}>
      <label>
        <span>{strings.resetFrequency}</span>
        <select
          value={type}
          onChange={(event) => {
            const nextType = event.currentTarget.value;
            onChange(nextType === "yearly_date" ? yearlyResetRule(month, day, timezone) : monthlyResetRule(day, timezone));
          }}
        >
          <option value="monthly_day">{strings.monthlyReset}</option>
          <option value="yearly_date">{strings.yearlyReset}</option>
        </select>
      </label>
      <label>
        <span>{strings.dayOfMonth}</span>
        <input
          type="number"
          min={1}
          max={31}
          value={day}
          onChange={(event) => {
            const nextDay = Number(event.currentTarget.value);
            onChange(type === "yearly_date" ? yearlyResetRule(month, nextDay, timezone) : monthlyResetRule(nextDay, timezone));
          }}
        />
      </label>
      {type === "yearly_date" && (
        <label>
          <span>{strings.monthOfYear}</span>
          <input
            type="number"
            min={1}
            max={12}
            value={month}
            onChange={(event) => onChange(yearlyResetRule(Number(event.currentTarget.value), day, timezone))}
          />
        </label>
      )}
      <small className="reset-save-note">{language === "zh" ? "自动保存" : "Auto-saved"}</small>
    </div>
  );
}

function Pipeline({ steps, language }: { steps: PipelineStep[]; language: Language }) {
  const strings = t(language);

  return (
    <div className="pipeline">
      {steps.map((step, index) => (
        <article className={`pipeline-step ${step.status}`} key={step.id}>
          <div className="step-index">{index + 1}</div>
          <div>
            <h3>{strings[step.labelKey as keyof typeof strings] as string}</h3>
            <p>{strings[step.detailKey as keyof typeof strings] as string}</p>
          </div>
        </article>
      ))}
    </div>
  );
}

function AdapterTile({ record, risk, language }: { record: PlatformRecord; risk: RiskAssessment; language: Language }) {
  const strings = t(language);
  const locale = language === "zh" ? "zh-CN" : "en-US";
  const run = record.lastRun;
  const status: FetchStatus = run?.status ?? "not_configured";
  const dataUpdatedAt = record.snapshot?.sourceUpdatedAt ?? record.snapshot?.capturedAt;

  return (
    <article className="adapter-tile">
      <div className="adapter-tile-head">
        <div>
          <h3>{record.account.label}</h3>
          <span>{adapterDisplayLabel(record, language)}</span>
        </div>
        {status === "success" ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
      </div>
      <dl>
        <div>
          <dt>{strings.kind}</dt>
          <dd>{record.account.adapterKind}</dd>
        </div>
        <div>
          <dt>{strings.auth}</dt>
          <dd>{strings.authValue[record.account.authState]}</dd>
        </div>
        <div>
          <dt>{strings.status}</dt>
          <dd>{strings.statusValue[status]}</dd>
        </div>
        <div>
          <dt>{strings.nextRun}</dt>
          <dd>{formatShortTime(record.nextRunAt, locale)}</dd>
        </div>
        <div>
          <dt>{labelText(strings, "sourceUpdatedAt", language === "zh" ? "数据更新时间" : "Data updated")}</dt>
          <dd>{formatRelative(dataUpdatedAt, locale)}</dd>
        </div>
        <div>
          <dt>{labelText(strings, "resetEvidence", language === "zh" ? "重置证据" : "Reset evidence")}</dt>
          <dd>{resetEvidenceText(record, strings, language)}</dd>
        </div>
      </dl>
      <div className={`adapter-risk ${risk.level}`}>
        <Globe2 size={14} />
        <span>{strings.reason[risk.reasonKey as keyof typeof strings.reason]}</span>
      </div>
    </article>
  );
}

declare global {
  interface Window {
    __aigcCreditRadarRoot?: Root;
  }
}

const rootElement = document.getElementById("root")!;
const root = window.__aigcCreditRadarRoot ?? createRoot(rootElement);
window.__aigcCreditRadarRoot = root;

root.render(
  <StrictMode>
    <App />
  </StrictMode>,
);

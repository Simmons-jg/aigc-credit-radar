import { parseBrowserCreditText } from "./browserSession";
import type { AuthState, BalanceSnapshot } from "../types";

export type BrowserExtensionPlatform = "lovart" | "tapnow";

export interface BrowserExtensionConfig {
  platform: BrowserExtensionPlatform;
  accountId: string;
  loginUrl: string;
}

export interface BrowserExtensionPayload {
  platform?: string;
  url?: string;
  title?: string;
  text?: string;
  visibleText?: string;
}

export interface BrowserExtensionResponse {
  ok: boolean;
  connector: "browser";
  platform: string;
  authState?: AuthState;
  snapshot?: BalanceSnapshot;
  matchedText?: string;
  pageTitle?: string;
  pageUrl?: string;
  errorCode?: string;
  errorMessage?: string;
  message?: string;
}

export const browserExtensionConfigs: Record<BrowserExtensionPlatform, BrowserExtensionConfig> = {
  lovart: {
    platform: "lovart",
    accountId: "lovart-main",
    loginUrl: "https://www.lovart.ai/login",
  },
  tapnow: {
    platform: "tapnow",
    accountId: "tapnow-main",
    loginUrl: "https://app.tapnow.ai/",
  },
};

export function normalizeBrowserExtensionSnapshot(
  payload: BrowserExtensionPayload,
  capturedAt = new Date().toISOString(),
): BrowserExtensionResponse {
  const platform = typeof payload.platform === "string" ? payload.platform : "";
  const config = browserExtensionConfigs[platform as BrowserExtensionPlatform];
  if (!config) return unknownPlatformResponse(platform || "unknown");

  const pageUrl = typeof payload.url === "string" ? payload.url : "";
  const pageTitle = typeof payload.title === "string" ? payload.title : "";
  const rawText = typeof payload.text === "string" ? payload.text : typeof payload.visibleText === "string" ? payload.visibleText : "";
  const text = rawText.slice(0, 30_000);

  if (looksLikeLoginPage({ url: pageUrl, title: pageTitle, text })) {
    return {
      ok: false,
      connector: "browser",
      platform: config.platform,
      authState: "needs_auth",
      pageTitle,
      pageUrl,
      errorCode: "LOGIN_REQUIRED",
      errorMessage: "The current browser tab still looks logged out. Open the account, billing, wallet, usage, credits, or token page after login, then send again.",
    };
  }

  const parsed = parseBrowserCreditText(text);
  if (!parsed) {
    return {
      ok: false,
      connector: "browser",
      platform: config.platform,
      authState: "needs_auth",
      pageTitle,
      pageUrl,
      errorCode: "BALANCE_NOT_FOUND",
      errorMessage: "No visible credit or token balance was found on the current browser tab.",
    };
  }

  return {
    ok: true,
    connector: "browser",
    platform: config.platform,
    authState: "ready",
    matchedText: parsed.matchedText,
    pageTitle,
    pageUrl,
    snapshot: {
      id: `snap-${config.platform}-${Date.parse(capturedAt) || Date.now()}`,
      accountId: config.accountId,
      creditsRemaining: parsed.creditsRemaining,
      creditsTotal: parsed.creditsTotal,
      currencyLabel: parsed.currencyLabel,
      capturedAt,
      sourceUpdatedAt: capturedAt,
      confidence: "verified",
    },
  };
}

export function missingBrowserExtensionSnapshot(platform: string): BrowserExtensionResponse {
  const config = browserExtensionConfigs[platform as BrowserExtensionPlatform];
  if (!config) return unknownPlatformResponse(platform);

  return {
    ok: false,
    connector: "browser",
    platform: config.platform,
    authState: "needs_auth",
    errorCode: "EXTENSION_SNAPSHOT_MISSING",
    errorMessage: "Open the platform in your already-signed-in Chrome or Edge, click the Send to Credit Radar bookmarklet, then check status here.",
  };
}

function unknownPlatformResponse(platform: string): BrowserExtensionResponse {
  return {
    ok: false,
    connector: "browser",
    platform,
    authState: "missing_config",
    errorCode: "UNKNOWN_PLATFORM",
    errorMessage: "Unknown browser extension platform.",
  };
}

function looksLikeLoginPage(page: { url: string; title: string; text: string }) {
  const haystack = `${page.url}\n${page.title}\n${page.text.slice(0, 4000)}`.toLowerCase();
  return (
    haystack.includes("/login") ||
    haystack.includes("signin") ||
    haystack.includes("sign in") ||
    haystack.includes("log in") ||
    haystack.includes("create account") ||
    haystack.includes("verify code") ||
    haystack.includes("verification code") ||
    haystack.includes("验证码")
  );
}

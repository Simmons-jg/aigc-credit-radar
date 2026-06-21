import { execFile, spawn } from "node:child_process";
import { createWriteStream, existsSync } from "node:fs";
import { access, chmod, mkdir, rename, rm } from "node:fs/promises";
import https from "node:https";
import http from "node:http";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

import {
  browserExtensionConfigs,
  missingBrowserExtensionSnapshot,
  normalizeBrowserExtensionSnapshot,
  type BrowserExtensionPlatform,
  type BrowserExtensionResponse,
} from "../src/adapters/browserExtension";
import {
  chooseBrowserInstallTarget,
  getBrowserExtensionInstallPlan,
  getWindowsChromiumCandidates,
} from "../src/adapters/browserExtensionInstall";
import { parseBrowserCreditText } from "../src/adapters/browserSession";
import { normalizeDreaminaCliError, parseDreaminaCredit, parseDreaminaHeadlessLogin } from "../src/adapters/dreaminaCli";
import { getDreaminaInstallPlan } from "../src/adapters/dreaminaInstaller";
import {
  normalizeHiggsfieldCliError,
  parseHiggsfieldStatus,
  parseHiggsfieldTransactions,
} from "../src/adapters/higgsfieldCli";
import { createLocalServiceCorsHeaders } from "../src/lib/localServiceCors";

const execFileAsync = promisify(execFile);
const port = Number(process.env.AIGC_CREDIT_RADAR_HELPER_PORT ?? 8787);
const host = "127.0.0.1";

interface JsonResponse {
  status?: number;
  body: unknown;
}

interface BrowserSessionConfig {
  platform: "lovart" | "tapnow";
  accountId: string;
  loginUrl: string;
  scanUrl: string;
  port: number;
}

interface ChromePageInfo {
  id: string;
  type: string;
  url: string;
  title?: string;
  webSocketDebuggerUrl?: string;
}

interface BrowserPageText {
  url: string;
  title: string;
  text: string;
}

type WebSocketLike = {
  onopen: (() => void) | null;
  onerror: ((error: unknown) => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  send: (message: string) => void;
  close: () => void;
};

const browserSessionConfigs: Record<string, BrowserSessionConfig> = {
  lovart: {
    platform: "lovart",
    accountId: "lovart-main",
    loginUrl: "https://www.lovart.ai/login",
    scanUrl: "https://www.lovart.ai/",
    port: 9231,
  },
  tapnow: {
    platform: "tapnow",
    accountId: "tapnow-main",
    loginUrl: "https://app.tapnow.ai/",
    scanUrl: "https://app.tapnow.ai/",
    port: 9232,
  },
};

const browserExtensionSnapshots = new Map<string, BrowserExtensionResponse>();

const server = http.createServer(async (request, response) => {
  const route = new URL(request.url ?? "/", `http://${host}:${port}`);
  const result = await routeRequest(request.method ?? "GET", route, request).catch((error) => ({
    status: 500,
    body: {
      ok: false,
      errorCode: "HELPER_ROUTE_FAILED",
      errorMessage: cliErrorText(error),
    },
  }));

  response.writeHead(result.status ?? 200, createLocalServiceCorsHeaders());
  response.end(JSON.stringify(result.body, null, 2));
});

async function routeRequest(method: string, route: URL, request: http.IncomingMessage): Promise<JsonResponse> {
  const pathname = route.pathname;
  if (method === "OPTIONS") {
    return { body: { ok: true } };
  }

  if (method === "GET" && pathname === "/health") {
    return { body: { ok: true, service: "aigc-credit-radar-helper" } };
  }

  if (method === "GET" && pathname === "/api/higgsfield/version") {
    return readHiggsfieldVersion();
  }

  if (method === "GET" && pathname === "/api/higgsfield/status") {
    return readHiggsfieldStatus();
  }

  if (method === "GET" && pathname === "/api/dreamina/status") {
    return readDreaminaStatus();
  }

  if (method === "POST" && pathname === "/api/dreamina/install") {
    return installDreamina();
  }

  if (method === "POST" && pathname === "/api/dreamina/login") {
    return startDreaminaLogin();
  }

  if (method === "POST" && pathname === "/api/dreamina/login/check") {
    return finishDreaminaLogin(route.searchParams.get("device_code") ?? "");
  }

  if (method === "POST" && pathname === "/api/higgsfield/login") {
    return startHiggsfieldLogin();
  }

  if (method === "POST" && pathname === "/api/browser-extension/snapshot") {
    return saveBrowserExtensionSnapshot(await readRequestJson(request));
  }

  if (method === "GET" && pathname === "/api/browser-extension/install") {
    return readBrowserExtensionInstall();
  }

  if (method === "POST" && pathname === "/api/browser-extension/install/open") {
    return openBrowserExtensionInstall();
  }

  const browserExtensionMatch = pathname.match(/^\/api\/browser-extension\/([^/]+)\/(open|status)$/);
  if (browserExtensionMatch && method === "POST" && browserExtensionMatch[2] === "open") {
    return openBrowserExtensionPlatform(browserExtensionMatch[1]);
  }

  if (browserExtensionMatch && method === "GET" && browserExtensionMatch[2] === "status") {
    return readBrowserExtensionSnapshotStatus(browserExtensionMatch[1]);
  }

  const browserSessionMatch = pathname.match(/^\/api\/browser-session\/([^/]+)\/(open|status)$/);
  if (browserSessionMatch && method === "POST" && browserSessionMatch[2] === "open") {
    return openBrowserSession(browserSessionMatch[1]);
  }

  if (browserSessionMatch && method === "GET" && browserSessionMatch[2] === "status") {
    return readBrowserSessionStatus(browserSessionMatch[1]);
  }

  return { status: 404, body: { ok: false, errorCode: "NOT_FOUND", errorMessage: "Unknown helper route." } };
}

async function readHiggsfieldVersion(): Promise<JsonResponse> {
  try {
    const { stdout } = await runHiggsfield(["version"]);
    return { body: { ok: true, version: stdout.trim() } };
  } catch (error) {
    const normalized = normalizeHiggsfieldCliError(cliErrorText(error));
    return { body: { ok: false, ...normalized } };
  }
}

async function readHiggsfieldStatus(): Promise<JsonResponse> {
  const capturedAt = new Date().toISOString();

  try {
    const { stdout } = await runHiggsfield(["account", "status", "--json"]);
    const transactionEvidence = await readHiggsfieldTransactionEvidence();
    const status = parseHiggsfieldStatus(stdout, { accountId: "higgsfield-main", capturedAt, transactionEvidence });
    return { body: { ok: true, connector: "higgsfield", ...status } };
  } catch (error) {
    const normalized = normalizeHiggsfieldCliError(cliErrorText(error));
    return { body: { ok: false, connector: "higgsfield", ...normalized } };
  }
}

async function readDreaminaStatus(): Promise<JsonResponse> {
  const capturedAt = new Date().toISOString();

  try {
    const { stdout } = await runDreamina(["user_credit"]);
    const status = parseDreaminaCredit(stdout, { accountId: "jimeng-main", capturedAt });
    return { body: { ok: true, connector: "dreamina", ...status } };
  } catch (error) {
    const normalized = normalizeDreaminaCliError(cliErrorText(error));
    return { body: { ok: false, connector: "dreamina", ...normalized } };
  }
}

async function installDreamina(): Promise<JsonResponse> {
  try {
    const plan = getDreaminaInstallPlan();
    await mkdir(plan.installDir, { recursive: true });
    const tempPath = `${plan.executablePath}.download`;
    await downloadFile(plan.downloadUrl, tempPath);
    if (process.platform !== "win32") {
      await chmod(tempPath, 0o755);
    }
    await rm(plan.executablePath, { force: true });
    await rename(tempPath, plan.executablePath);

    return {
      body: {
        ok: true,
        connector: "dreamina",
        installedPath: plan.executablePath,
        message: "Dreamina CLI installed locally. Check status next; login may still be required.",
      },
    };
  } catch (error) {
    return {
      body: {
        ok: false,
        connector: "dreamina",
        errorCode: "INSTALL_FAILED",
        errorMessage: `Dreamina CLI install failed: ${cliErrorText(error)}`,
      },
    };
  }
}

async function ensureDreaminaInstalled() {
  const existing = await getInstalledDreaminaPath();
  if (existing) return existing;

  const result = await installDreamina();
  const body = result.body as { ok?: boolean; installedPath?: string; errorMessage?: string };
  if (!body.ok || !body.installedPath) {
    throw new Error(body.errorMessage ?? "Dreamina CLI install failed.");
  }
  return body.installedPath;
}

async function readHiggsfieldTransactionEvidence() {
  try {
    const { stdout } = await runHiggsfield(["account", "transactions", "--size", "100", "--json"]);
    return parseHiggsfieldTransactions(stdout);
  } catch {
    return undefined;
  }
}

function startHiggsfieldLogin(): JsonResponse {
  try {
    const child = process.platform === "win32" ? spawnWindowsHiggsfield(["auth", "login"]) : spawn("higgsfield", ["auth", "login"], {
      detached: true,
      stdio: "ignore",
      windowsHide: true,
    });
    child.unref();

    return {
      body: {
        ok: true,
        connector: "higgsfield",
        authState: "needs_auth",
        message: "Higgsfield login started in your browser. Return here and check status after login completes.",
      },
    };
  } catch (error) {
    const normalized = normalizeHiggsfieldCliError(cliErrorText(error));
    return { body: { ok: false, connector: "higgsfield", ...normalized } };
  }
}

async function startDreaminaLogin(): Promise<JsonResponse> {
  try {
    await ensureDreaminaInstalled();
    const { stdout } = await runDreamina(["login", "--headless"]);
    const login = parseDreaminaHeadlessLogin(stdout);

    if (login.reusedExistingSession) {
      return {
        body: {
          ok: true,
          connector: "dreamina",
          authState: "ready",
          message: "Dreamina login state is already available. Check status now.",
        },
      };
    }

    return {
      body: {
        ok: true,
        connector: "dreamina",
        authState: "needs_auth",
        ...login,
        message:
          "Open the authorization page, complete login, then return here and finish login.",
      },
    };
  } catch (error) {
    return {
      body: {
        ok: false,
        connector: "dreamina",
        authState: "missing_config",
        errorCode: "CONNECT_FAILED",
        errorMessage: `Dreamina login could not start: ${cliErrorText(error)}`,
      },
    };
  }
}

async function finishDreaminaLogin(deviceCode: string): Promise<JsonResponse> {
  if (!deviceCode.trim()) {
    return {
      body: {
        ok: false,
        connector: "dreamina",
        authState: "needs_auth",
        errorCode: "MISSING_DEVICE_CODE",
        errorMessage: "Dreamina login session is missing a device code. Start login again.",
      },
    };
  }

  try {
    await runDreamina(["login", "checklogin", `--device_code=${deviceCode}`, "--poll=5"]);
    return {
      body: {
        ok: true,
        connector: "dreamina",
        authState: "ready",
        message: "Dreamina login completed. You can check status now.",
      },
    };
  } catch (error) {
    return {
      body: {
        ok: false,
        connector: "dreamina",
        authState: "needs_auth",
        errorCode: "LOGIN_PENDING",
        errorMessage: `Dreamina login is not complete yet: ${cliErrorText(error)}`,
      },
    };
  }
}

async function saveBrowserExtensionSnapshot(payload: unknown): Promise<JsonResponse> {
  if (!payload || typeof payload !== "object") {
    return {
      body: {
        ok: false,
        connector: "browser",
        platform: "unknown",
        authState: "missing_config",
        errorCode: "INVALID_EXTENSION_PAYLOAD",
        errorMessage: "Browser extension payload must be a JSON object.",
      },
    };
  }

  const result = normalizeBrowserExtensionSnapshot(payload);
  if (result.platform !== "unknown") {
    browserExtensionSnapshots.set(result.platform, result);
  }
  return { body: result };
}

async function openBrowserExtensionPlatform(platform: string): Promise<JsonResponse> {
  const config = browserExtensionConfigs[platform as BrowserExtensionPlatform];
  if (!config) {
    return {
      status: 404,
      body: {
        ok: false,
        connector: "browser",
        platform,
        authState: "missing_config",
        errorCode: "UNKNOWN_PLATFORM",
        errorMessage: "Unknown browser extension platform.",
      },
    };
  }

  try {
    openUrlInDefaultBrowser(config.loginUrl);
    return {
      body: {
        ok: true,
        connector: "browser",
        platform: config.platform,
        authState: "needs_auth",
        message: "Platform opened in your default browser. Use the AIGC Credit Radar extension on the logged-in tab, then check status here.",
      },
    };
  } catch (error) {
    return {
      body: {
        ok: false,
        connector: "browser",
        platform: config.platform,
        authState: "missing_config",
        errorCode: "DEFAULT_BROWSER_OPEN_FAILED",
        errorMessage: `Could not open the platform in the default browser: ${cliErrorText(error)}`,
      },
    };
  }
}

function readBrowserExtensionSnapshotStatus(platform: string): JsonResponse {
  return { body: browserExtensionSnapshots.get(platform) ?? missingBrowserExtensionSnapshot(platform) };
}

async function readBrowserExtensionInstall(): Promise<JsonResponse> {
  const plan = getBrowserExtensionInstallPlan();
  return {
    body: {
      ok: true,
      connector: "browser",
      extensionDir: plan.extensionDir,
      browserUrls: plan.browserUrls,
    },
  };
}

async function openBrowserExtensionInstall(): Promise<JsonResponse> {
  const plan = getBrowserExtensionInstallPlan();

  try {
    await access(join(plan.extensionDir, "manifest.json"));
    openFolder(plan.extensionDir);
    const openedBrowser = await openExtensionInstallPage(plan.browserUrls[0]);

    return {
      body: {
        ok: true,
        connector: "browser",
        extensionDir: plan.extensionDir,
        browserUrls: plan.browserUrls,
        message: `${openedBrowser} extension page opened. Enable Developer mode, click Load unpacked, then select the opened folder.`,
      },
    };
  } catch (error) {
    return {
      body: {
        ok: false,
        connector: "browser",
        authState: "missing_config",
        errorCode: "EXTENSION_INSTALL_HELP_FAILED",
        errorMessage: `Could not open browser extension install helper: ${cliErrorText(error)}`,
      },
    };
  }
}

async function openExtensionInstallPage(defaultUrl: string) {
  if (process.platform !== "win32") {
    openUrlInDefaultBrowser(defaultUrl);
    return "Browser";
  }

  const target = chooseBrowserInstallTarget(getWindowsChromiumCandidates(), pathExistsSync);
  if (!target) {
    throw new Error("Chrome or Edge executable was not found. Install Chrome/Edge or open chrome://extensions manually.");
  }

  openUrlInBrowserExecutable(target.executablePath, target.url);
  return target.name;
}

async function openBrowserSession(platform: string): Promise<JsonResponse> {
  const config = browserSessionConfigs[platform];
  if (!config) {
    return { status: 404, body: { ok: false, connector: "browser", platform, errorCode: "UNKNOWN_PLATFORM", errorMessage: "Unknown browser-session platform." } };
  }

  if (process.env.AIGC_CREDIT_RADAR_ENABLE_ISOLATED_BROWSER !== "1") {
    return openBrowserExtensionPlatform(platform);
  }

  const chromePath = await findChromePath();
  if (!chromePath) {
    return {
      body: {
        ok: false,
        connector: "browser",
        platform,
        authState: "missing_config",
        errorCode: "CHROME_NOT_FOUND",
        errorMessage: "Chrome was not found. Install Chrome to use browser-session adapters.",
      },
    };
  }

  const profileDir = browserProfileDir(config.platform);
  await mkdir(profileDir, { recursive: true });
  const child = spawn(
    chromePath,
    [
      `--remote-debugging-port=${config.port}`,
      `--user-data-dir=${profileDir}`,
      "--no-first-run",
      "--new-window",
      config.loginUrl,
    ],
    {
      detached: true,
      stdio: "ignore",
      windowsHide: false,
    },
  );
  child.unref();

  return {
    body: {
      ok: true,
      connector: "browser",
      platform,
      authState: "needs_auth",
      message: "Browser session opened. Log in, navigate to the credits or account page, then scan status.",
    },
  };
}

async function readBrowserSessionStatus(platform: string): Promise<JsonResponse> {
  const config = browserSessionConfigs[platform];
  if (!config) {
    return { status: 404, body: { ok: false, connector: "browser", platform, errorCode: "UNKNOWN_PLATFORM", errorMessage: "Unknown browser-session platform." } };
  }

  try {
    const page = await readBrowserSessionPage(config);
    if (looksLikeLoginPage(page)) {
      return {
        body: {
          ok: false,
          connector: "browser",
          platform,
          authState: "needs_auth",
          errorCode: "LOGIN_REQUIRED",
          errorMessage: "The browser session still looks logged out. Complete login, open the credits or account page, then scan again.",
        },
      };
    }

    const parsed = parseBrowserCreditText(page.text);
    if (!parsed) {
      return {
        body: {
          ok: false,
          connector: "browser",
          platform,
          authState: "needs_auth",
          errorCode: "BALANCE_NOT_FOUND",
          errorMessage: "No credit or token balance was found on the current browser page. Navigate to the account, billing, wallet, or credits page, then scan again.",
        },
      };
    }

    const capturedAt = new Date().toISOString();
    return {
      body: {
        ok: true,
        connector: "browser",
        platform,
        authState: "ready",
        matchedText: parsed.matchedText,
        snapshot: {
          id: `snap-${platform}-${Date.parse(capturedAt) || Date.now()}`,
          accountId: config.accountId,
          creditsRemaining: parsed.creditsRemaining,
          creditsTotal: parsed.creditsTotal,
          currencyLabel: parsed.currencyLabel,
          capturedAt,
          sourceUpdatedAt: capturedAt,
          confidence: "verified",
        },
      },
    };
  } catch (error) {
    return {
      body: {
        ok: false,
        connector: "browser",
        platform,
        authState: "needs_auth",
        errorCode: "BROWSER_SESSION_NOT_OPEN",
        errorMessage: `Open the browser session before scanning: ${cliErrorText(error)}`,
      },
    };
  }
}

async function runHiggsfield(args: string[]) {
  if (process.platform === "win32") {
    return execFileAsync("cmd.exe", ["/d", "/s", "/c", buildWindowsHiggsfieldCommand(args)], { windowsHide: true });
  }

  return execFileAsync("higgsfield", args, { windowsHide: true });
}

async function runDreamina(args: string[]) {
  const installedDreamina = await getInstalledDreaminaPath();
  if (installedDreamina) {
    return execFileAsync(installedDreamina, args, { windowsHide: true });
  }

  if (process.platform === "win32") {
    return execFileAsync("cmd.exe", ["/d", "/s", "/c", buildWindowsDreaminaCommand(args)], { windowsHide: true });
  }

  return execFileAsync("dreamina", args, { windowsHide: true });
}

async function getInstalledDreaminaPath() {
  const plan = getDreaminaInstallPlan();
  try {
    await access(plan.executablePath);
    return plan.executablePath;
  } catch {
    return undefined;
  }
}

async function readBrowserSessionPage(config: BrowserSessionConfig): Promise<BrowserPageText> {
  const pages = await chromeJson<ChromePageInfo[]>(config.port, "/json");
  const existingPage = pages.find((page) => page.type === "page" && page.url.includes(new URL(config.scanUrl).hostname));
  const page = existingPage ?? (await openChromePage(config.port, config.scanUrl));
  if (!page.webSocketDebuggerUrl) {
    throw new Error("Chrome page did not expose a debugger URL.");
  }
  return evaluateChromePageText(page.webSocketDebuggerUrl);
}

async function openChromePage(port: number, url: string) {
  try {
    return await chromeJson<ChromePageInfo>(port, `/json/new?${encodeURIComponent(url)}`, { method: "PUT" });
  } catch {
    return chromeJson<ChromePageInfo>(port, `/json/new?${encodeURIComponent(url)}`);
  }
}

async function chromeJson<T>(port: number, path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`http://127.0.0.1:${port}${path}`, init);
  if (!response.ok) {
    throw new Error(`Chrome debugging endpoint returned HTTP ${response.status}.`);
  }
  return (await response.json()) as T;
}

function evaluateChromePageText(webSocketUrl: string) {
  return new Promise<BrowserPageText>((resolve, reject) => {
    const WebSocketCtor = (globalThis as unknown as { WebSocket?: new (url: string) => WebSocketLike }).WebSocket;
    if (!WebSocketCtor) {
      reject(new Error("This Node runtime does not provide a WebSocket client."));
      return;
    }

    const socket = new WebSocketCtor(webSocketUrl);
    const timeout = setTimeout(() => {
      socket.close();
      reject(new Error("Timed out while reading browser page text."));
    }, 15_000);

    socket.onerror = (error) => {
      clearTimeout(timeout);
      reject(error instanceof Error ? error : new Error(String(error)));
    };

    socket.onopen = () => {
      socket.send(
        JSON.stringify({
          id: 1,
          method: "Runtime.evaluate",
          params: {
            returnByValue: true,
            expression: `(() => ({
              url: location.href,
              title: document.title,
              text: (document.body && document.body.innerText ? document.body.innerText : "").slice(0, 30000)
            }))()`,
          },
        }),
      );
    };

    socket.onmessage = (event) => {
      const message = JSON.parse(String(event.data)) as {
        id?: number;
        result?: { result?: { value?: BrowserPageText } };
        error?: { message?: string };
      };
      if (message.id !== 1) return;
      clearTimeout(timeout);
      socket.close();

      if (message.error) {
        reject(new Error(message.error.message ?? "Chrome evaluation failed."));
        return;
      }

      const value = message.result?.result?.value;
      if (!value) {
        reject(new Error("Chrome evaluation did not return page text."));
        return;
      }
      resolve(value);
    };
  });
}

function looksLikeLoginPage(page: BrowserPageText) {
  const haystack = `${page.url}\n${page.title}\n${page.text.slice(0, 4000)}`.toLowerCase();
  return (
    haystack.includes("/login") ||
    haystack.includes("sign in") ||
    haystack.includes("log in") ||
    haystack.includes("create account") ||
    haystack.includes("验证码")
  );
}

async function findChromePath() {
  const candidates =
    process.platform === "win32"
      ? [
          process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, "Google", "Chrome", "Application", "chrome.exe") : "",
          process.env.PROGRAMFILES ? join(process.env.PROGRAMFILES, "Google", "Chrome", "Application", "chrome.exe") : "",
          process.env["PROGRAMFILES(X86)"] ? join(process.env["PROGRAMFILES(X86)"], "Google", "Chrome", "Application", "chrome.exe") : "",
        ]
      : process.platform === "darwin"
        ? ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"]
        : ["/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/usr/bin/chromium", "/usr/bin/chromium-browser"];

  for (const candidate of candidates.filter(Boolean)) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      // Try the next known browser path.
    }
  }

  return undefined;
}

function browserProfileDir(platform: string) {
  const base =
    process.platform === "win32"
      ? join(process.env.LOCALAPPDATA ?? process.cwd(), "AIGC Credit Radar", "browser-profiles")
      : join(process.env.HOME ?? process.cwd(), ".aigc-credit-radar", "browser-profiles");
  return join(base, platform);
}

function downloadFile(url: string, destination: string) {
  return new Promise<void>((resolve, reject) => {
    const request = https.get(url, (response) => {
      if (response.statusCode !== 200) {
        response.resume();
        reject(new Error(`Download failed with HTTP ${response.statusCode}`));
        return;
      }

      const file = createWriteStream(destination);
      response.pipe(file);
      file.on("finish", () => {
        file.close((error) => (error ? reject(error) : resolve()));
      });
      file.on("error", reject);
    });

    request.on("error", reject);
  });
}

async function readRequestJson(request: http.IncomingMessage) {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (!raw) return {};
  return JSON.parse(raw);
}

function openUrlInDefaultBrowser(url: string) {
  const child =
    process.platform === "win32"
      ? spawn("cmd.exe", ["/d", "/s", "/c", "start", "", url], {
          detached: true,
          stdio: "ignore",
          windowsHide: true,
        })
      : process.platform === "darwin"
        ? spawn("open", [url], { detached: true, stdio: "ignore" })
        : spawn("xdg-open", [url], { detached: true, stdio: "ignore" });

  child.unref();
}

function openUrlInBrowserExecutable(executablePath: string, url: string) {
  const child = spawn(executablePath, [url], {
    detached: true,
    stdio: "ignore",
    windowsHide: false,
  });

  child.unref();
}

function pathExistsSync(path: string) {
  return existsSync(path);
}

function openFolder(path: string) {
  const child =
    process.platform === "win32"
      ? spawn("explorer.exe", [path], {
          detached: true,
          stdio: "ignore",
          windowsHide: true,
        })
      : process.platform === "darwin"
        ? spawn("open", [path], { detached: true, stdio: "ignore" })
        : spawn("xdg-open", [path], { detached: true, stdio: "ignore" });

  child.unref();
}

function spawnWindowsHiggsfield(args: string[]) {
  return spawn("cmd.exe", ["/d", "/s", "/c", buildWindowsHiggsfieldCommand(args)], {
    detached: true,
    stdio: "ignore",
    windowsHide: true,
  });
}

function buildWindowsHiggsfieldCommand(args: string[]) {
  return ["higgsfield", ...args.map(quoteWindowsArg)].join(" ");
}

function buildWindowsDreaminaCommand(args: string[]) {
  return ["dreamina", ...args.map(quoteWindowsArg)].join(" ");
}

function quoteWindowsArg(arg: string) {
  if (/^[A-Za-z0-9._:/=-]+$/.test(arg)) return arg;
  return `"${arg.replace(/"/g, '\\"')}"`;
}

function cliErrorText(error: unknown): string {
  if (!error || typeof error !== "object") return String(error);
  const candidate = error as { message?: string; stderr?: string; stdout?: string };
  return [candidate.stderr, candidate.stdout, candidate.message].filter(Boolean).join("\n");
}

export function startLocalHelper() {
  if (server.listening) return Promise.resolve(server);

  return new Promise<http.Server>((resolve, reject) => {
    const onError = (error: Error) => {
      server.off("listening", onListening);
      reject(error);
    };
    const onListening = () => {
      server.off("error", onError);
      console.log(`AIGC Credit Radar helper listening at http://${host}:${port}`);
      resolve(server);
    };

    server.once("error", onError);
    server.once("listening", onListening);
    server.listen(port, host);
  });
}

export function stopLocalHelper() {
  if (!server.listening) return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  startLocalHelper().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}

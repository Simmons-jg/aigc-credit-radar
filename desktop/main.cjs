const { app, BrowserWindow, Menu, Notification, Tray, dialog, ipcMain, shell } = require("electron");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const helperBaseUrl = "http://127.0.0.1:8787";
let mainWindow;
let miniWindow;
let tray;
let helperModule;
let isQuitting = false;
let trayAlertState = { count: 0 };

function storageFilePath() {
  return path.join(app.getPath("userData"), "storage.json");
}

function isAllowedStorageKey(key) {
  return typeof key === "string" && key.startsWith("aigc-credit-radar-");
}

function readStorageFile() {
  try {
    const raw = fs.readFileSync(storageFilePath(), "utf8");
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function writeStorageFile(data) {
  fs.mkdirSync(path.dirname(storageFilePath()), { recursive: true });
  fs.writeFileSync(storageFilePath(), `${JSON.stringify(data, null, 2)}\n`);
}

function registerStorageHandlers() {
  ipcMain.on("aigc-credit-radar:storage-get", (event, key) => {
    if (!isAllowedStorageKey(key)) {
      event.returnValue = null;
      return;
    }

    const value = readStorageFile()[key];
    event.returnValue = typeof value === "string" ? value : null;
  });

  ipcMain.on("aigc-credit-radar:storage-set", (event, key, value) => {
    if (!isAllowedStorageKey(key) || typeof value !== "string") {
      event.returnValue = false;
      return;
    }

    const data = readStorageFile();
    data[key] = value;
    writeStorageFile(data);
    event.returnValue = true;
  });
}

function appIconPath() {
  const iconPath = path.join(app.getAppPath(), "public", "aigc-credit-radar-icon.ico");
  if (fs.existsSync(iconPath)) return iconPath;
  return path.join(app.getAppPath(), "public", "aigc-credit-radar-icon.svg");
}

function loadRenderer(window, hash) {
  if (process.env.VITE_DEV_SERVER_URL) {
    const url = new URL(process.env.VITE_DEV_SERVER_URL);
    if (hash) url.hash = hash;
    void window.loadURL(url.href);
    return;
  }

  void window.loadFile(path.join(app.getAppPath(), "dist", "index.html"), hash ? { hash } : undefined);
}

function showMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createWindow();
    return;
  }

  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function createMiniWindow() {
  if (miniWindow && !miniWindow.isDestroyed()) {
    miniWindow.isVisible() ? miniWindow.hide() : miniWindow.show();
    if (miniWindow.isVisible()) miniWindow.focus();
    return;
  }

  miniWindow = new BrowserWindow({
    width: 390,
    height: 520,
    minWidth: 330,
    minHeight: 420,
    title: "Credit Radar Mini",
    icon: appIconPath(),
    backgroundColor: "#edf3f3",
    alwaysOnTop: true,
    skipTaskbar: false,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, "preload.cjs"),
      sandbox: true,
    },
  });

  miniWindow.once("ready-to-show", () => {
    miniWindow.show();
  });

  miniWindow.on("close", (event) => {
    if (isQuitting) return;
    event.preventDefault();
    miniWindow.hide();
  });

  miniWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: "deny" };
  });

  loadRenderer(miniWindow, "mini");
}

function createTray() {
  if (tray) return;

  tray = new Tray(appIconPath());
  tray.on("click", () => createMiniWindow());
  updateTrayAlertState(trayAlertState);
}

function updateTrayAlertState(nextState = {}) {
  trayAlertState = {
    count: Number.isFinite(nextState.count) ? nextState.count : 0,
    level: typeof nextState.level === "string" ? nextState.level : undefined,
    title: typeof nextState.title === "string" ? nextState.title : undefined,
    body: typeof nextState.body === "string" ? nextState.body : undefined,
  };

  if (!tray) return;

  const hasUrgentRisk = trayAlertState.count > 0;
  const alertLabel = hasUrgentRisk
    ? `🚨 ${trayAlertState.count} urgent reset risk${trayAlertState.count > 1 ? "s" : ""}`
    : "No urgent reset risks";
  tray.setToolTip(hasUrgentRisk ? `AIGC Credit Radar\n${trayAlertState.title ?? alertLabel}` : "AIGC Credit Radar");
  tray.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: alertLabel,
        enabled: false,
      },
      { type: "separator" },
      {
        label: "Open Credit Radar",
        click: showMainWindow,
      },
      {
        label: "Show Mini Radar",
        click: () => createMiniWindow(),
      },
      { type: "separator" },
      {
        label: "Quit",
        click: () => {
          isQuitting = true;
          app.quit();
        },
      },
    ]),
  );
}

function isCriticalLevel(level) {
  return level === "critical" || level === "veryCritical";
}

function flashUrgentWindows() {
  for (const window of [mainWindow, miniWindow]) {
    if (!window || window.isDestroyed()) continue;
    window.flashFrame(true);
    setTimeout(() => {
      if (!window.isDestroyed()) window.flashFrame(false);
    }, 10_000);
  }
}

function registerDesktopHandlers() {
  ipcMain.on("aigc-credit-radar:show-notification", (_event, payload) => {
    if (!Notification.isSupported() || !payload || typeof payload !== "object") return;
    const title = typeof payload.title === "string" ? payload.title : "AIGC Credit Radar";
    const body = typeof payload.body === "string" ? payload.body : "";
    if (!body.trim()) return;

    const notification = new Notification({
      title,
      body,
      icon: appIconPath(),
    });
    notification.on("click", showMainWindow);
    notification.show();
    if (isCriticalLevel(payload.level)) flashUrgentWindows();
  });

  ipcMain.on("aigc-credit-radar:update-alert-state", (_event, payload) => {
    if (!payload || typeof payload !== "object") return;
    updateTrayAlertState(payload);
  });

  ipcMain.on("aigc-credit-radar:show-main-window", showMainWindow);
  ipcMain.on("aigc-credit-radar:toggle-mini-window", () => createMiniWindow());
}

app.setAppUserModelId("com.aigc.creditradar");

function helperHealthCheck() {
  return new Promise((resolve) => {
    const request = http.get(`${helperBaseUrl}/health`, (response) => {
      response.resume();
      resolve(response.statusCode === 200);
    });
    request.setTimeout(1200, () => {
      request.destroy();
      resolve(false);
    });
    request.on("error", () => resolve(false));
  });
}

async function startBundledHelper() {
  if (await helperHealthCheck()) return;

  const helperPath = path.join(__dirname, "local-helper.mjs");
  try {
    helperModule = await import(pathToFileURL(helperPath).href);
    await helperModule.startLocalHelper();
  } catch (error) {
    if (await helperHealthCheck()) return;

    const message = error instanceof Error ? error.message : String(error);
    dialog.showErrorBox(
      "AIGC Credit Radar",
      `The local connection service could not start.\n\n${message}`,
    );
  }
}

function createWindow() {
  const rendererSmoke = process.env.AIGC_CREDIT_RADAR_ELECTRON_RENDER_SMOKE === "1";

  mainWindow = new BrowserWindow({
    width: 1380,
    height: 920,
    minWidth: 980,
    minHeight: 680,
    title: "AIGC Credit Radar",
    icon: appIconPath(),
    backgroundColor: "#edf3f3",
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, "preload.cjs"),
      sandbox: true,
    },
  });

  mainWindow.once("ready-to-show", () => {
    if (rendererSmoke) return;
    mainWindow.show();
  });

  mainWindow.on("close", (event) => {
    if (isQuitting || rendererSmoke) return;
    event.preventDefault();
    mainWindow.hide();
  });

  mainWindow.on("closed", () => {
    mainWindow = undefined;
  });

  if (rendererSmoke) {
    mainWindow.webContents.once("did-fail-load", (_event, errorCode, errorDescription, validatedURL) => {
      console.error(`Renderer failed to load ${validatedURL}: ${errorCode} ${errorDescription}`);
      process.exitCode = 1;
      app.quit();
    });

    mainWindow.webContents.once("did-finish-load", async () => {
      try {
        const storageSmoke = process.env.AIGC_CREDIT_RADAR_ELECTRON_STORAGE_SMOKE === "1";
        const rendered = await mainWindow.webContents.executeJavaScript(`
          (() => {
            const hasRoot = Boolean(document.querySelector('#root')?.children.length);
            if (!hasRoot) return false;
            if (${JSON.stringify(storageSmoke)} !== true) return true;
            window.aigcCreditRadarStorage?.setItem("aigc-credit-radar-smoke", "ok");
            return window.aigcCreditRadarStorage?.getItem("aigc-credit-radar-smoke") === "ok";
          })()
        `);
        process.exitCode = rendered ? 0 : 1;
      } catch (error) {
        console.error(error instanceof Error ? error.message : error);
        process.exitCode = 1;
      } finally {
        app.quit();
      }
    });
  }

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: "deny" };
  });

  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (url.startsWith("http://127.0.0.1") || url.startsWith("file://")) return;
    event.preventDefault();
    void shell.openExternal(url);
  });

  loadRenderer(mainWindow);
}

app.whenReady().then(async () => {
  registerStorageHandlers();
  registerDesktopHandlers();
  await startBundledHelper();

  if (process.env.AIGC_CREDIT_RADAR_ELECTRON_SMOKE === "1") {
    app.quit();
    return;
  }

  createWindow();
  createTray();

  app.on("activate", () => {
    showMainWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform === "darwin") return;
  if (!tray) app.quit();
});

app.on("before-quit", () => {
  isQuitting = true;
  void helperModule?.stopLocalHelper?.();
});

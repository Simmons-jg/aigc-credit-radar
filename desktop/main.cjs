const { app, BrowserWindow, dialog, ipcMain, shell } = require("electron");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const helperBaseUrl = "http://127.0.0.1:8787";
let mainWindow;
let helperModule;

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
    icon: path.join(app.getAppPath(), "public", "aigc-credit-radar-icon.svg"),
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

  if (process.env.VITE_DEV_SERVER_URL) {
    void mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
    return;
  }

  void mainWindow.loadFile(path.join(app.getAppPath(), "dist", "index.html"));
}

app.whenReady().then(async () => {
  registerStorageHandlers();
  await startBundledHelper();

  if (process.env.AIGC_CREDIT_RADAR_ELECTRON_SMOKE === "1") {
    app.quit();
    return;
  }

  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  void helperModule?.stopLocalHelper?.();
});

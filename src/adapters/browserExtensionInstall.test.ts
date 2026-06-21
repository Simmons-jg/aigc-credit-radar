import assert from "node:assert/strict";
import { test } from "node:test";
import {
  chooseBrowserInstallTarget,
  getBrowserExtensionInstallPlan,
  getWindowsChromiumCandidates,
} from "./browserExtensionInstall";

test("getBrowserExtensionInstallPlan points at the unpacked extension and browser extension pages", () => {
  const plan = getBrowserExtensionInstallPlan("C:/project");

  assert.equal(plan.extensionDir, "C:\\project\\extensions\\aigc-credit-radar-browser");
  assert.deepEqual(plan.browserUrls, ["chrome://extensions", "edge://extensions"]);
});

test("getWindowsChromiumCandidates prefers executable paths over chrome protocol URLs", () => {
  const candidates = getWindowsChromiumCandidates({
    LOCALAPPDATA: "C:/Users/A/AppData/Local",
    PROGRAMFILES: "C:/Program Files",
    "PROGRAMFILES(X86)": "C:/Program Files (x86)",
  });

  assert.deepEqual(candidates.slice(0, 2), [
    {
      name: "Google Chrome",
      executablePath: "C:\\Users\\A\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe",
      url: "chrome://extensions",
    },
    {
      name: "Google Chrome",
      executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
      url: "chrome://extensions",
    },
  ]);
});

test("chooseBrowserInstallTarget returns the first installed Chromium executable", () => {
  const target = chooseBrowserInstallTarget(
    [
      { name: "Google Chrome", executablePath: "C:/missing/chrome.exe", url: "chrome://extensions" },
      { name: "Microsoft Edge", executablePath: "C:/edge/msedge.exe", url: "edge://extensions" },
    ],
    (path) => path.includes("edge"),
  );

  assert.deepEqual(target, {
    name: "Microsoft Edge",
    executablePath: "C:/edge/msedge.exe",
    url: "edge://extensions",
  });
});

import { join, normalize } from "node:path";

export interface BrowserExtensionInstallPlan {
  extensionDir: string;
  browserUrls: string[];
}

export interface BrowserInstallTarget {
  name: string;
  executablePath: string;
  url: string;
}

export function getBrowserExtensionInstallPlan(projectRoot = process.cwd()): BrowserExtensionInstallPlan {
  return {
    extensionDir: normalize(join(projectRoot, "extensions", "aigc-credit-radar-browser")),
    browserUrls: ["chrome://extensions", "edge://extensions"],
  };
}

export function getWindowsChromiumCandidates(env: NodeJS.ProcessEnv = process.env): BrowserInstallTarget[] {
  const localAppData = env.LOCALAPPDATA;
  const programFiles = env.PROGRAMFILES;
  const programFilesX86 = env["PROGRAMFILES(X86)"];

  return [
    localAppData && {
      name: "Google Chrome",
      executablePath: normalize(join(localAppData, "Google", "Chrome", "Application", "chrome.exe")),
      url: "chrome://extensions",
    },
    programFiles && {
      name: "Google Chrome",
      executablePath: normalize(join(programFiles, "Google", "Chrome", "Application", "chrome.exe")),
      url: "chrome://extensions",
    },
    programFilesX86 && {
      name: "Google Chrome",
      executablePath: normalize(join(programFilesX86, "Google", "Chrome", "Application", "chrome.exe")),
      url: "chrome://extensions",
    },
    localAppData && {
      name: "Microsoft Edge",
      executablePath: normalize(join(localAppData, "Microsoft", "Edge", "Application", "msedge.exe")),
      url: "edge://extensions",
    },
    programFiles && {
      name: "Microsoft Edge",
      executablePath: normalize(join(programFiles, "Microsoft", "Edge", "Application", "msedge.exe")),
      url: "edge://extensions",
    },
    programFilesX86 && {
      name: "Microsoft Edge",
      executablePath: normalize(join(programFilesX86, "Microsoft", "Edge", "Application", "msedge.exe")),
      url: "edge://extensions",
    },
  ].filter(Boolean) as BrowserInstallTarget[];
}

export function chooseBrowserInstallTarget(
  candidates: BrowserInstallTarget[],
  exists: (path: string) => boolean,
): BrowserInstallTarget | undefined {
  return candidates.find((candidate) => exists(candidate.executablePath));
}

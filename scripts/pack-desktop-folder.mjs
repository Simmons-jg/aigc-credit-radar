import { cp, mkdir, readFile, readdir, rename, rm, utimes, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const electronExecutable = require("electron");
const electronRuntimeDir = resolve(dirname(electronExecutable));
const releaseDir = resolve(root, "release");
const appName = "AIGC Credit Radar";
const appVersion = "0.0.1";
const windowsIconPath = resolve(root, "public", "aigc-credit-radar-icon.ico");

const platformOutDir =
  process.platform === "win32"
    ? resolve(releaseDir, "win-unpacked")
    : process.platform === "darwin"
      ? resolve(releaseDir, "mac-unpacked")
      : resolve(releaseDir, "linux-unpacked");

await rm(platformOutDir, { recursive: true, force: true });
await rm(`${platformOutDir}.tmp`, { recursive: true, force: true });
await mkdir(releaseDir, { recursive: true });
await cp(electronRuntimeDir, platformOutDir, { recursive: true });

if (process.platform === "win32") {
  const sourceExe = resolve(platformOutDir, basename(electronExecutable));
  const targetExe = resolve(platformOutDir, `${appName}.exe`);
  await rename(sourceExe, targetExe);
  await stampWindowsExecutable(targetExe, windowsIconPath);
} else if (process.platform === "linux") {
  const sourceBinary = resolve(platformOutDir, basename(electronExecutable));
  await rename(sourceBinary, resolve(platformOutDir, "aigc-credit-radar"));
}

const appDir = resolve(platformOutDir, "resources", "app");
await rm(appDir, { recursive: true, force: true });
await mkdir(appDir, { recursive: true });

await cp(resolve(root, "dist"), resolve(appDir, "dist"), { recursive: true });
await cp(resolve(root, "dist-electron"), resolve(appDir, "dist-electron"), { recursive: true });
await cp(resolve(root, "public"), resolve(appDir, "public"), { recursive: true });
await rm(resolve(appDir, "public", "ocr"), { recursive: true, force: true });
await cp(resolve(root, "extensions"), resolve(appDir, "extensions"), { recursive: true });

await writeFile(
  resolve(appDir, "package.json"),
  JSON.stringify(
    {
      name: "aigc-credit-radar",
      version: appVersion,
      description: "Local-first desktop radar for expiring AIGC platform credits.",
      main: "dist-electron/main.cjs",
    },
    null,
    2,
  ),
);

await touchPackagedFiles(platformOutDir);

console.log(`Desktop folder packaged at ${platformOutDir}`);

async function stampWindowsExecutable(exePath, iconPath) {
  const ResEdit = require("resedit");
  const [exeData, iconData] = await Promise.all([readFile(exePath), readFile(iconPath)]);
  const exe = ResEdit.NtExecutable.from(exeData, { ignoreCert: true });
  const res = ResEdit.NtExecutableResource.from(exe);
  const iconFile = ResEdit.Data.IconFile.from(iconData);
  const language = { lang: 1033, codepage: 1200 };

  ResEdit.Resource.IconGroupEntry.replaceIconsForResource(
    res.entries,
    1,
    language.lang,
    iconFile.icons.map((item) => item.data),
  );

  const versionInfo =
    ResEdit.Resource.VersionInfo.fromEntries(res.entries)[0] ??
    ResEdit.Resource.VersionInfo.create(language.lang, {}, [{ ...language, values: {} }]);

  versionInfo.setFileVersion(`${appVersion}.0`, language.lang);
  versionInfo.setProductVersion(`${appVersion}.0`, language.lang);
  versionInfo.setStringValues(language, {
    CompanyName: "AIGC Credit Radar Contributors",
    FileDescription: appName,
    InternalName: appName,
    LegalCopyright: "Copyright (C) AIGC Credit Radar Contributors",
    OriginalFilename: `${appName}.exe`,
    ProductName: appName,
  });
  versionInfo.outputToResourceEntries(res.entries);
  res.outputResource(exe);

  await writeFile(exePath, Buffer.from(exe.generate()));
}

async function touchPackagedFiles(dir, time = new Date()) {
  const entries = await readdir(dir, { withFileTypes: true });
  await Promise.all(
    entries.map(async (entry) => {
      const fullPath = resolve(dir, entry.name);
      if (entry.isDirectory()) {
        await touchPackagedFiles(fullPath, time);
      }

      await utimes(fullPath, time, time);
    }),
  );
}

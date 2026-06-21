import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const installScript = resolve(root, "node_modules", "electron", "install.js");

if (!existsSync(installScript)) {
  console.error("Electron is not installed yet. Run npm install first, then run npm run repair:electron.");
  process.exit(1);
}

const requestedMirror = process.env.ELECTRON_MIRROR?.trim();
const defaultMirror = "https://npmmirror.com/mirrors/electron/";
const mirrors = requestedMirror
  ? [requestedMirror, defaultMirror, undefined].filter((mirror, index, list) => list.indexOf(mirror) === index)
  : [defaultMirror, undefined];

for (const mirror of mirrors) {
  const label = mirror ? `mirror ${mirror}` : "official Electron download source";
  console.log(`Trying ${label}...`);

  const result = spawnSync(process.execPath, [installScript], {
    cwd: root,
    env: mirror ? { ...process.env, ELECTRON_MIRROR: mirror } : process.env,
    stdio: "inherit",
  });

  if (result.status === 0) {
    console.log("Electron binary installed.");
    process.exit(0);
  }
}

console.error("Electron binary download failed. Check your network/proxy, then rerun npm run repair:electron.");
process.exit(1);

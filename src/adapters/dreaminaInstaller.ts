import path from "node:path";
import { homedir } from "node:os";

const downloadBase = "https://lf3-static.bytednsdoc.com/obj/eden-cn/psj_hupthlyk/ljhwZthlaukjlkulzlp/dreamina_cli_beta";

type SupportedPlatform = "win32" | "darwin" | "linux";

interface EnvLike {
  HOME?: string;
  LOCALAPPDATA?: string;
  USERPROFILE?: string;
}

export interface DreaminaInstallPlan {
  downloadUrl: string;
  executablePath: string;
  installDir: string;
  targetName: string;
}

export function getDreaminaInstallPlan(
  platform: NodeJS.Platform = process.platform,
  arch: string = process.arch,
  env: EnvLike = process.env,
): DreaminaInstallPlan {
  const normalizedPlatform = normalizePlatform(platform);
  const normalizedArch = normalizeArch(arch);
  const targetName = normalizedPlatform === "win32" ? "dreamina.exe" : "dreamina";
  const downloadFile =
    normalizedPlatform === "win32"
      ? `dreamina_cli_windows_${normalizedArch}.exe`
      : `dreamina_cli_${normalizedPlatform}_${normalizedArch}`;
  const installDir = defaultInstallDir(normalizedPlatform, env);
  const pathApi = normalizedPlatform === "win32" ? path.win32 : path.posix;

  return {
    downloadUrl: `${downloadBase}/${downloadFile}`,
    executablePath: pathApi.join(installDir, targetName),
    installDir,
    targetName,
  };
}

function normalizePlatform(platform: NodeJS.Platform): SupportedPlatform {
  if (platform === "win32" || platform === "darwin" || platform === "linux") return platform;
  throw new Error(`Unsupported Dreamina CLI platform: ${platform}`);
}

function normalizeArch(arch: string) {
  if (arch === "x64" || arch === "amd64") return "amd64";
  if (arch === "arm64" || arch === "aarch64") return "arm64";
  throw new Error(`Unsupported Dreamina CLI architecture: ${arch}`);
}

function defaultInstallDir(platform: SupportedPlatform, env: EnvLike) {
  if (platform === "win32") {
    const localAppData = env.LOCALAPPDATA ?? path.win32.join(env.USERPROFILE ?? homedir(), "AppData", "Local");
    return path.win32.join(localAppData, "AIGC Credit Radar", "bin");
  }

  return path.posix.join(env.HOME ?? homedir(), ".aigc-credit-radar", "bin");
}

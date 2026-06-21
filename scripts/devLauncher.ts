import { spawn, type ChildProcess } from "node:child_process";
import { join } from "node:path";

export interface CommandSpec {
  file: string;
  args: string[];
}

export interface DevLaunchPlan {
  helper: {
    command: CommandSpec;
    healthUrl: string;
  };
  vite: {
    command: CommandSpec;
  };
}

interface DevLaunchOptions {
  helperPort?: number;
  viteArgs?: string[];
}

export function createDevLaunchPlan(options: DevLaunchOptions = {}): DevLaunchPlan {
  const helperPort = options.helperPort ?? Number(process.env.AIGC_CREDIT_RADAR_HELPER_PORT ?? 8787);
  const viteArgs = normalizeViteArgs(options.viteArgs ?? process.argv.slice(2));

  return {
    helper: {
      command: { file: "tsx", args: ["scripts/local-helper.ts"] },
      healthUrl: `http://127.0.0.1:${helperPort}/health`,
    },
    vite: {
      command: { file: "vite", args: viteArgs },
    },
  };
}

export async function runDevLauncher(viteArgs = process.argv.slice(2)): Promise<void> {
  const plan = createDevLaunchPlan({ viteArgs });
  let helperProcess: ChildProcess | undefined;

  if (await isServiceHealthy(plan.helper.healthUrl)) {
    console.log(`[dev] Local connection service is already running at ${plan.helper.healthUrl}`);
  } else {
    console.log("[dev] Starting local connection service...");
    helperProcess = spawnCommand(plan.helper.command);
    try {
      await waitForService(plan.helper.healthUrl, 15_000);
    } catch (error) {
      if (!helperProcess.killed) {
        helperProcess.kill();
      }
      throw error;
    }
    console.log(`[dev] Local connection service is ready at ${plan.helper.healthUrl}`);
  }

  console.log("[dev] Starting app UI...");
  const viteProcess = spawnCommand(plan.vite.command);

  const shutdown = (exitCode = 0) => {
    if (helperProcess && !helperProcess.killed) {
      helperProcess.kill();
    }

    if (!viteProcess.killed) {
      viteProcess.kill();
    }

    process.exit(exitCode);
  };

  process.on("SIGINT", () => shutdown(0));
  process.on("SIGTERM", () => shutdown(0));

  viteProcess.on("exit", (code) => {
    shutdown(code ?? 0);
  });
}

export async function isServiceHealthy(healthUrl: string): Promise<boolean> {
  try {
    const response = await fetch(healthUrl, { cache: "no-store" });
    return response.ok;
  } catch {
    return false;
  }
}

export async function waitForService(
  healthUrl: string,
  timeoutMs = 10_000,
  intervalMs = 250,
): Promise<void> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    if (await isServiceHealthy(healthUrl)) {
      return;
    }

    await sleep(intervalMs);
  }

  throw new Error(`Local connection service did not become ready at ${healthUrl}`);
}

export function spawnCommand(command: CommandSpec): ChildProcess {
  const spawnSpec = resolveCommandForSpawn(command);

  return spawn(spawnSpec.file, spawnSpec.args, {
    env: process.env,
    stdio: "inherit",
  });
}

export function resolveCommandForSpawn(command: CommandSpec): CommandSpec {
  if (command.file === "tsx") {
    return {
      file: process.execPath,
      args: [join(process.cwd(), "node_modules", "tsx", "dist", "cli.mjs"), ...command.args],
    };
  }

  if (command.file === "vite") {
    return {
      file: process.execPath,
      args: [join(process.cwd(), "node_modules", "vite", "bin", "vite.js"), ...command.args],
    };
  }

  return command;
}

function normalizeViteArgs(viteArgs: string[]) {
  if (viteArgs.some((arg) => arg === "--host" || arg.startsWith("--host="))) {
    return viteArgs;
  }

  return ["--host", "127.0.0.1", ...viteArgs];
}

function sleep(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

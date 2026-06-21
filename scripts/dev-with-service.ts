import { runDevLauncher } from "./devLauncher";

runDevLauncher().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

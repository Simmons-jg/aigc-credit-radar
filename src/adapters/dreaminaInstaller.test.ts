import assert from "node:assert/strict";
import { test } from "node:test";
import { getDreaminaInstallPlan } from "./dreaminaInstaller";

test("getDreaminaInstallPlan chooses app-managed Windows install path", () => {
  const plan = getDreaminaInstallPlan("win32", "x64", {
    LOCALAPPDATA: "C:\\Users\\Ada\\AppData\\Local",
  });

  assert.equal(
    plan.downloadUrl,
    "https://lf3-static.bytednsdoc.com/obj/eden-cn/psj_hupthlyk/ljhwZthlaukjlkulzlp/dreamina_cli_beta/dreamina_cli_windows_amd64.exe",
  );
  assert.equal(plan.targetName, "dreamina.exe");
  assert.equal(plan.installDir, "C:\\Users\\Ada\\AppData\\Local\\AIGC Credit Radar\\bin");
  assert.equal(plan.executablePath, "C:\\Users\\Ada\\AppData\\Local\\AIGC Credit Radar\\bin\\dreamina.exe");
});

test("getDreaminaInstallPlan supports macOS arm64", () => {
  const plan = getDreaminaInstallPlan("darwin", "arm64", { HOME: "/Users/ada" });

  assert.equal(plan.targetName, "dreamina");
  assert.equal(plan.downloadUrl.endsWith("/dreamina_cli_darwin_arm64"), true);
  assert.equal(plan.executablePath, "/Users/ada/.aigc-credit-radar/bin/dreamina");
});

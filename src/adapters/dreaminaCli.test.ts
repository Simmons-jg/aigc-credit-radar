import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeDreaminaCliError, parseDreaminaCredit, parseDreaminaHeadlessLogin } from "./dreaminaCli";

test("parseDreaminaCredit extracts credits from JSON output", () => {
  const result = parseDreaminaCredit(
    JSON.stringify({ credit: 128, total_credit: 300, email: "artist@example.com" }),
    { accountId: "jimeng-main", capturedAt: "2026-06-19T12:00:00.000Z" },
  );

  assert.equal(result.authState, "ready");
  assert.equal(result.snapshot.accountId, "jimeng-main");
  assert.equal(result.snapshot.creditsRemaining, 128);
  assert.equal(result.snapshot.creditsTotal, 300);
  assert.equal(result.accountEmail, "artist@example.com");
});

test("parseDreaminaCredit treats Dreamina total_credit-only output as remaining credits", () => {
  const result = parseDreaminaCredit(
    JSON.stringify({ total_credit: 8830, user_id: 3960900296643549, vip_level: "artisan" }),
    { accountId: "jimeng-main", capturedAt: "2026-06-19T12:00:00.000Z" },
  );

  assert.equal(result.authState, "ready");
  assert.equal(result.snapshot.creditsRemaining, 8830);
  assert.equal(result.snapshot.creditsTotal, 8830);
});

test("parseDreaminaCredit extracts credits from Chinese text output", () => {
  const result = parseDreaminaCredit("剩余积分：1,234\\n总积分：2,000", {
    accountId: "jimeng-main",
    capturedAt: "2026-06-19T12:00:00.000Z",
  });

  assert.equal(result.snapshot.creditsRemaining, 1234);
  assert.equal(result.snapshot.creditsTotal, 2000);
});

test("normalizeDreaminaCliError maps missing CLI to missing config", () => {
  assert.deepEqual(normalizeDreaminaCliError("dreamina: command not found"), {
    authState: "missing_config",
    errorCode: "CLI_NOT_FOUND",
    errorMessage: "Dreamina connector is not ready yet. Start login in the app and wait for local setup.",
  });
});

test("normalizeDreaminaCliError maps Windows missing command text", () => {
  assert.equal(
    normalizeDreaminaCliError("'dreamina' is not recognized as an internal or external command").errorCode,
    "CLI_NOT_FOUND",
  );
});

test("normalizeDreaminaCliError maps mojibake Windows missing command text", () => {
  assert.equal(
    normalizeDreaminaCliError("Command failed: cmd.exe /d /s /c dreamina user_credit\n'dreamina' �����ڲ����ⲿ����").errorCode,
    "CLI_NOT_FOUND",
  );
});

test("parseDreaminaHeadlessLogin extracts OAuth device flow material", () => {
  const result = parseDreaminaHeadlessLogin(`请使用浏览器完成 OAuth Device Flow 登录。
verification_uri: https://jimeng.jianying.com/ai-tool/cli-auth?verification_uri=https%3A%2F%2Fexample.test
user_code: 3c2b8b2ef59c8062fdd7a186cc1fa7be
device_code: 094070a5175ad61bc55bb5cfd79d8ac0
poll_interval: 1s
expires_at: 2026-06-19T21:31:27+08:00`);

  assert.equal(result.verificationUri, "https://jimeng.jianying.com/ai-tool/cli-auth?verification_uri=https%3A%2F%2Fexample.test");
  assert.equal(result.userCode, "3c2b8b2ef59c8062fdd7a186cc1fa7be");
  assert.equal(result.deviceCode, "094070a5175ad61bc55bb5cfd79d8ac0");
  assert.equal(result.pollInterval, "1s");
  assert.equal(result.expiresAt, "2026-06-19T21:31:27+08:00");
});

test("parseDreaminaHeadlessLogin accepts reused local OAuth login state", () => {
  const result = parseDreaminaHeadlessLogin("已复用当前本地 OAuth 登录态。\n");

  assert.equal(result.reusedExistingSession, true);
});

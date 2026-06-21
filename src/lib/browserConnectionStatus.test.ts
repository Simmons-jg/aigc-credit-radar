import assert from "node:assert/strict";
import { test } from "node:test";
import { browserConnectionFromStatus } from "./browserConnectionStatus";

const copy = {
  extensionSnapshotMissing: "还没有收到扩展快照",
  browserLoginRequired: "这个标签页看起来还没有登录",
  browserBalanceNotFound: "没有找到余额",
};

test("browserConnectionFromStatus shows extension snapshot missing as pending, not login required", () => {
  const next = browserConnectionFromStatus(
    {
      ok: false,
      authState: "needs_auth",
      errorCode: "EXTENSION_SNAPSHOT_MISSING",
    },
    copy,
  );

  assert.deepEqual(next, {
    phase: "extension_pending",
    authState: "missing_config",
    errorCode: "EXTENSION_SNAPSHOT_MISSING",
    message: "还没有收到扩展快照",
  });
});

test("browserConnectionFromStatus still shows real logged-out tabs as needing login", () => {
  const next = browserConnectionFromStatus(
    {
      ok: false,
      authState: "needs_auth",
      errorCode: "LOGIN_REQUIRED",
    },
    copy,
  );

  assert.deepEqual(next, {
    phase: "needs_auth",
    authState: "needs_auth",
    errorCode: "LOGIN_REQUIRED",
    message: "这个标签页看起来还没有登录",
  });
});

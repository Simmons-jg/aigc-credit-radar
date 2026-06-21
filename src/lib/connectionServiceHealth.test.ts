import assert from "node:assert/strict";
import { test } from "node:test";
import { browserConnectionAfterServiceHealth } from "./connectionServiceHealth";

test("browserConnectionAfterServiceHealth marks an offline browser connector online when the service is healthy", () => {
  const next = browserConnectionAfterServiceHealth(
    { phase: "helper_offline", errorCode: "HELPER_OFFLINE", message: "本机连接服务未启动" },
    true,
    { online: "本机连接服务已启动", offline: "本机连接服务未启动" },
  );

  assert.deepEqual(next, {
    phase: "service_ready",
    message: "本机连接服务已启动",
  });
});

test("browserConnectionAfterServiceHealth does not erase an in-progress browser connector state", () => {
  const next = browserConnectionAfterServiceHealth(
    { phase: "needs_auth", message: "平台已打开" },
    true,
    { online: "本机连接服务已启动", offline: "本机连接服务未启动" },
  );

  assert.deepEqual(next, { phase: "needs_auth", message: "平台已打开" });
});

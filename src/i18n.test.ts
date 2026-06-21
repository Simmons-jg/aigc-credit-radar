import assert from "node:assert/strict";
import { test } from "node:test";
import { copy, t } from "./i18n";

test("Chinese connection-service copy avoids developer-facing helper wording", () => {
  const strings = t("zh");
  const visibleCopy = JSON.stringify(copy.zh);

  assert.equal(strings.localHelper, "本机连接服务");
  assert.equal(strings.helperOffline, "本机连接服务未启动");
  assert.equal(strings.helperOnline, "本机连接服务已启动");
  assert.ok(!visibleCopy.includes("本地助手"));
});

test("English connection-service copy avoids developer-facing helper wording", () => {
  const strings = t("en");
  const visibleCopy = JSON.stringify(copy.en);

  assert.equal(strings.localHelper, "Local connection service");
  assert.equal(strings.helperOffline, "Connection service offline");
  assert.equal(strings.helperOnline, "Connection service online");
  assert.ok(!visibleCopy.includes("Local helper"));
});

test("browser connector copy presents automation first and bookmarklets as fallback", () => {
  assert.equal(t("en").browserConnector, "Automatic browser connector");
  assert.equal(t("zh").browserConnector, "自动浏览器连接器");
  assert.equal(t("en").copyBookmarklet, "Copy bookmarklet");
  assert.equal(t("zh").copyBookmarklet, "复制书签按钮");
  assert.ok(t("en").browserConnectorNote.toLowerCase().includes("automatically"));
  assert.ok(t("zh").browserConnectorNote.includes("自动"));
  assert.ok(t("en").browserBookmarkletFallback.toLowerCase().includes("fallback"));
  assert.ok(t("zh").browserBookmarkletFallback.includes("备用"));
});

test("browser connector copy avoids asking users to close Chrome", () => {
  const visibleCopy = `${JSON.stringify(copy.zh)}\n${JSON.stringify(copy.en)}`;

  assert.equal(t("en").installBrowserExtension, "Setup guide");
  assert.equal(t("zh").installBrowserExtension, "安装向导");
  assert.ok(t("en").browserExtensionInstallOpened.includes("development connector"));
  assert.ok(t("zh").browserExtensionInstallOpened.includes("开发版连接器"));
  assert.ok(!visibleCopy.includes("close Chrome"));
  assert.ok(!visibleCopy.includes("close all Chrome"));
  assert.ok(!visibleCopy.includes("关闭 Chrome"));
  assert.ok(!visibleCopy.includes("关闭所有 Chrome"));
  assert.ok(!visibleCopy.includes("Launch extension browser"));
  assert.ok(!visibleCopy.includes("启动扩展浏览器"));
});

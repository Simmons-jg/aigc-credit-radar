(() => {
  const helperBaseUrl = "http://127.0.0.1:8787";
  const maxTextLength = 30000;
  let lastSignature = "";
  let pendingTimer;

  function platformFromHostname(hostname) {
    const host = hostname.toLowerCase();
    if (host === "lovart.ai" || host.endsWith(".lovart.ai")) return "lovart";
    if (host === "app.tapnow.ai") return "tapnow";
    return undefined;
  }

  function pagePayload() {
    const platform = platformFromHostname(location.hostname);
    if (!platform) return undefined;

    return {
      platform,
      url: location.href,
      title: document.title,
      text: (document.body?.innerText ?? "").slice(0, maxTextLength),
    };
  }

  function snapshotSignature(payload) {
    return [
      payload.platform,
      payload.url,
      payload.title,
      payload.text.length,
      payload.text.slice(0, 500),
      payload.text.slice(-500),
    ].join("\n");
  }

  async function sendSnapshot() {
    const payload = pagePayload();
    if (!payload || !payload.text.trim()) return;

    const signature = snapshotSignature(payload);
    if (signature === lastSignature) return;
    lastSignature = signature;

    try {
      await fetch(`${helperBaseUrl}/api/browser-extension/snapshot`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    } catch {
      // The local app may be closed. Keep the page quiet and retry on the next visible change.
    }
  }

  function scheduleSnapshot(delay = 1400) {
    window.clearTimeout(pendingTimer);
    pendingTimer = window.setTimeout(sendSnapshot, delay);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => scheduleSnapshot(800), { once: true });
  } else {
    scheduleSnapshot(800);
  }

  window.addEventListener("focus", () => scheduleSnapshot(800));
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) scheduleSnapshot(800);
  });

  new MutationObserver(() => scheduleSnapshot(2500)).observe(document.documentElement, {
    childList: true,
    subtree: true,
    characterData: true,
  });

  window.setInterval(() => scheduleSnapshot(0), 10 * 60 * 1000);
})();

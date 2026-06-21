const helperBaseUrl = "http://127.0.0.1:8787";
const statusElement = document.getElementById("status");
const sendButton = document.getElementById("send");

function setStatus(message, tone = "neutral") {
  statusElement.textContent = message;
  statusElement.className = `status ${tone === "neutral" ? "" : tone}`.trim();
}

function platformFromUrl(url) {
  const { hostname } = new URL(url);
  if (hostname === "lovart.ai" || hostname.endsWith(".lovart.ai")) return "lovart";
  if (hostname === "app.tapnow.ai") return "tapnow";
  return undefined;
}

async function activeTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs[0];
}

async function readVisibleText(tabId) {
  const [result] = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => ({
      url: location.href,
      title: document.title,
      text: (document.body?.innerText ?? "").slice(0, 30000),
    }),
  });

  return result.result;
}

async function sendVisibleBalance() {
  sendButton.disabled = true;
  setStatus("Reading visible page text...");

  try {
    const tab = await activeTab();
    if (!tab?.id || !tab.url) throw new Error("No active browser tab found.");

    const platform = platformFromUrl(tab.url);
    if (!platform) throw new Error("Open Lovart or TapNow in this tab first.");

    const page = await readVisibleText(tab.id);
    const response = await fetch(`${helperBaseUrl}/api/browser-extension/snapshot`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ platform, ...page }),
    });
    const body = await response.json();

    if (!body.ok) throw new Error(body.errorMessage ?? "The local helper could not parse a balance.");

    setStatus(`Saved ${body.snapshot.creditsRemaining} ${body.snapshot.currencyLabel}. Return to Credit Radar and click Check status.`, "ok");
  } catch (error) {
    setStatus(error instanceof Error ? error.message : String(error), "error");
  } finally {
    sendButton.disabled = false;
  }
}

sendButton.addEventListener("click", sendVisibleBalance);

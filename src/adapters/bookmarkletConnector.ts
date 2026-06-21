export interface BookmarkletOptions {
  helperBaseUrl?: string;
  maxTextLength?: number;
}

const defaultHelperBaseUrl = "http://127.0.0.1:8787";
const defaultMaxTextLength = 30_000;

export function createBrowserSnapshotBookmarklet(options: BookmarkletOptions = {}) {
  const helperBaseUrl = (options.helperBaseUrl ?? defaultHelperBaseUrl).replace(/\/+$/, "");
  const maxTextLength = Math.max(1, Math.floor(options.maxTextLength ?? defaultMaxTextLength));
  const endpoint = `${helperBaseUrl}/api/browser-extension/snapshot`;
  const script = [
    "(()=>{",
    'const h=location.hostname.toLowerCase();',
    'const p=h==="lovart.ai"||h.endsWith(".lovart.ai")?"lovart":h==="app.tapnow.ai"||h.endsWith(".tapnow.ai")?"tapnow":"";',
    'if(!p){alert("AIGC Credit Radar: open Lovart or TapNow first, then click this bookmarklet.");return;}',
    `const text=((document.body&&document.body.innerText)||"").slice(0,${maxTextLength});`,
    `fetch("${endpoint}",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({platform:p,url:location.href,title:document.title,text})})`,
    '.then(r=>r.json())',
    '.then(d=>alert(d.ok?"AIGC Credit Radar: snapshot sent. Return to the app and click Check status.":"AIGC Credit Radar: "+(d.errorMessage||d.message||"No visible balance found.")))',
    '.catch(()=>alert("AIGC Credit Radar: local connection service is not running."));',
    "})();",
  ].join("");

  return `javascript:${encodeURIComponent(script)}`;
}

export function applyBookmarkletHref(target: Pick<HTMLAnchorElement, "setAttribute"> | null, href: string) {
  if (!target || !href) return;
  target.setAttribute("href", href);
}

# AIGC Credit Radar

AIGC Credit Radar is a local-first desktop monitor for expiring AI generation credits. It helps people who subscribe to multiple AIGC platforms see which balances are about to reset, when the data was last checked, and what needs attention first.

中文一句话：这是一个“积分过期监控仪”，重点不是记账，而是每天帮你看哪些平台的可用积分可能快浪费了。

## What Works Today

- Desktop app shell with an auto-started local connection service.
- Web UI for development and portfolio demos.
- Higgsfield real connector through the official local CLI.
- Jimeng / Dreamina real connector through the official Dreamina CLI.
- Manual import for platforms without a stable CLI/API/MCP connector, such as Lovart, TapNow, LibTV, Kling, Shotlab, and custom platforms.
- User-configured reset rules: monthly day, yearly date, or manual next reset date.
- Risk windows based on days left and remaining balance:
  - Very critical: 1 day or less
  - Critical: 3 days or less
  - High: 7 days or less
  - Medium: 10 days or less
- In-app automatic daily checks while the app is running.
- Browser notification reminders after the user grants notification permission.
- Bilingual UI: Chinese / English.

## Honest Limits

- A pure GitHub Pages style website can show the UI, but it cannot run local CLIs, start the helper, keep secrets local, or perform background notifications after the page is closed.
- The desktop app is the recommended user-facing product because it can bundle and start the local helper automatically.
- Lovart, TapNow, and other platforms without a stable connector are not shown as automatic connectors. They use manual import for now.
- Automatic checks currently run while the desktop app or dev page is open. True background checks after the app quits are a later native/background-worker milestone.
- OAuth/API keys are account-specific secrets. Do not commit them.

## For Users

Download an installer or portable build from the project's release page when one is available. After installing:

1. Open AIGC Credit Radar.
2. Click **Connect accounts**.
3. Connect Higgsfield or Jimeng if you use those platforms.
4. For platforms without a real connector, use **Manual import** and enter the balance.
5. Set the reset rule, for example `monthly, day 7`.
6. Turn on **Auto checks** and allow notifications.

The table only keeps accounts you have connected or manually imported. If you no longer want to track one, delete it from the row action.

## Development

Requirements:

- Node.js 22.12 or newer
- npm
- Windows, macOS, or Linux

Install and run the development app:

```bash
npm install
npm run dev
```

Open `http://127.0.0.1:5173`.

`npm run dev` starts two things:

- Vite UI at `http://127.0.0.1:5173`
- Local connection service at `http://127.0.0.1:8787`

Advanced debugging:

```bash
npm run helper
npm run dev:ui
```

## Desktop App

Run the desktop app locally:

```bash
npm run desktop
```

This builds the Vite app, bundles the local helper into `dist-electron`, starts the helper automatically, then opens the Electron window.

If Electron failed to download during install, repair it:

```bash
npm run repair:electron
```

This retries the Electron binary install. By default it tries the npmmirror Electron mirror before the official Electron release source, which is useful on networks where GitHub release downloads are unstable. To force another mirror, set `ELECTRON_MIRROR` before running the command.

## Build Installers

Create a runnable unpacked desktop app first:

```bash
npm run pack:desktop
```

This writes a platform-specific app folder such as `release/win-unpacked/`. It is the most reliable smoke package because it uses the installed Electron runtime directly and does not need NSIS or installer helper downloads.

Create distributable desktop builds:

```bash
npm run dist
```

Artifacts are written to `release/`.

The current build config creates:

- Windows NSIS installer
- Windows portable app
- macOS DMG
- Linux AppImage

Platform signing, notarization, auto-update, and release publishing are not configured yet.

If installer packaging fails while downloading builder binaries from GitHub, keep `npm run pack:desktop` as the fallback release path or retry on a network with GitHub release access.

## Connect Higgsfield

In the app, open **Connect accounts** and click **Start login** on Higgsfield. The helper runs:

```bash
higgsfield auth login
higgsfield account status --json
```

If the session is expired, the app shows an auth-required state instead of a fake balance.

The connector reads account status for the current balance and recent transactions for evidence such as `sourceUpdatedAt`, `lastGrantAt`, and inferred reset timing when the CLI does not expose an explicit reset field.

## Connect Jimeng / Dreamina

In the app, open **Connect accounts** and click **Start login** on Jimeng. On first use, the local service prepares the official Dreamina CLI and starts the device login flow.

User flow:

1. Click **Start login**.
2. Open the authorization page shown by the app.
3. Approve the account in the browser.
4. Return to the app and click **Finish login**.

After login, the helper reads:

```bash
dreamina user_credit
```

The app exposes `/api/dreamina/login`, `/api/dreamina/login/check`, and `/api/dreamina/status` through the local helper.

## Manual Import Platforms

For platforms without a reliable connector, use manual import:

1. Pick a preset platform or choose custom.
2. Open the official website from the app.
3. Copy the visible balance or type it in.
4. Optionally upload a screenshot or click the OCR paste box and press `Ctrl+V` after copying a screenshot.
5. Optionally paste page text so the app can parse likely credit numbers.
6. Set the reset rule.

This is intentionally labeled manual. The app should never pretend that a platform was automatically connected when it only has user-entered data.

## Adapter Contract

Real adapters should return normalized balance snapshots:

- `cli`: official local CLIs, such as Higgsfield and Dreamina.
- `api`: stable balance endpoints when contributors identify a reliable JSON contract.
- `browser`: user-approved browser extension or current-tab connector for platforms without stable APIs.
- `manual`: user-entered balance with clear provenance.

Credentials stay local. The app should not ask for platform passwords, scrape hidden tokens, or store raw cookies.

## Test And Verify

```bash
npm test -- --test-reporter=spec
npm run build:desktop
```

`npm run build:desktop` verifies both the browser build and the bundled desktop helper runtime.

import type { AuthState } from "../types";
import type { ConnectorConnectionState } from "./connectionServiceHealth";

interface BrowserStatusResult {
  ok: boolean;
  authState?: AuthState;
  errorCode?: string;
  errorMessage?: string;
  message?: string;
}

interface BrowserStatusCopy {
  extensionSnapshotMissing: string;
  browserLoginRequired: string;
  browserBalanceNotFound: string;
}

export function browserStatusMessage(copy: BrowserStatusCopy, body: BrowserStatusResult) {
  switch (body.errorCode) {
    case "EXTENSION_SNAPSHOT_MISSING":
      return copy.extensionSnapshotMissing;
    case "LOGIN_REQUIRED":
      return copy.browserLoginRequired;
    case "BALANCE_NOT_FOUND":
      return copy.browserBalanceNotFound;
    default:
      return body.message ?? body.errorMessage;
  }
}

export function browserConnectionFromStatus(
  body: BrowserStatusResult,
  copy: BrowserStatusCopy,
): ConnectorConnectionState {
  const message = browserStatusMessage(copy, body);

  if (body.errorCode === "EXTENSION_SNAPSHOT_MISSING") {
    return {
      phase: "extension_pending",
      authState: "missing_config",
      errorCode: body.errorCode,
      message,
    };
  }

  const authState = body.authState === "needs_auth" ? "needs_auth" : "missing_config";
  return {
    phase: authState,
    authState,
    errorCode: body.errorCode,
    message,
  };
}

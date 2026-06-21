export type ConnectionPhase =
  | "idle"
  | "checking"
  | "ready"
  | "needs_auth"
  | "missing_config"
  | "helper_offline"
  | "installing"
  | "installed"
  | "service_ready"
  | "extension_pending"
  | "login_started"
  | "error";

export interface ConnectorConnectionState {
  phase: ConnectionPhase;
  authState?: "ready" | "needs_auth" | "missing_config" | "demo";
  accountEmail?: string;
  planLabel?: string;
  verificationUri?: string;
  userCode?: string;
  deviceCode?: string;
  expiresAt?: string;
  errorCode?: string;
  message?: string;
}

interface HealthCopy {
  online: string;
  offline: string;
}

export function browserConnectionAfterServiceHealth(
  current: ConnectorConnectionState | undefined,
  isServiceOnline: boolean,
  copy: HealthCopy,
): ConnectorConnectionState {
  if (!isServiceOnline) {
    return {
      phase: "helper_offline",
      errorCode: "HELPER_OFFLINE",
      message: copy.offline,
    };
  }

  if (current && current.phase !== "idle" && current.phase !== "helper_offline") {
    return current;
  }

  return {
    phase: "service_ready",
    message: copy.online,
  };
}

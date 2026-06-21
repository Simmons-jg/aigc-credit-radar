import type { AuthState } from "../types";

interface DreaminaAuthResult {
  ok: boolean;
  authState?: AuthState;
}

export function shouldFetchDreaminaStatusAfterAuth(result: DreaminaAuthResult) {
  return result.ok && result.authState === "ready";
}

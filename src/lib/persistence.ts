import type { PlatformRecord } from "../types";

const recordsStorageKey = "aigc-credit-radar-records";

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

declare global {
  interface Window {
    aigcCreditRadarStorage?: StorageLike;
  }
}

export function mergeStoredRecords(defaultRecords: PlatformRecord[], storedRecords: PlatformRecord[]): PlatformRecord[] {
  const storedById = new Map(storedRecords.map((record) => [record.account.id, record]));
  const defaultIds = new Set(defaultRecords.map((record) => record.account.id));
  const defaultPlatforms = new Set(defaultRecords.map((record) => record.account.platform));

  const mergedDefaults = defaultRecords.map((defaultRecord) => {
    const stored = storedById.get(defaultRecord.account.id);
    if (!stored) return defaultRecord;

    return {
      ...defaultRecord,
      account: {
        ...defaultRecord.account,
        authState: stored.account.authState,
        enabled: stored.account.enabled ?? defaultRecord.account.enabled,
        resetRule: stored.account.resetRule,
        tracked: stored.account.tracked,
      },
      snapshot: stored.snapshot,
      lastRun: stored.lastRun,
      nextRunAt: stored.nextRunAt,
      cadence: stored.cadence,
    };
  });

  const userAddedRecords = storedRecords.filter((stored) => {
    if (defaultIds.has(stored.account.id)) return false;
    if (defaultPlatforms.has(stored.account.platform)) return true;
    return stored.account.adapterKind === "manual" && Boolean(stored.snapshot);
  });

  return [...mergedDefaults, ...userAddedRecords];
}

export function loadPlatformRecords(defaultRecords: PlatformRecord[], storage?: StorageLike) {
  const primaryStorage = storage ?? defaultRecordsStorage();

  try {
    const raw = readStoredRecords(primaryStorage, storage === undefined);
    if (!raw) return defaultRecords;
    const stored = JSON.parse(raw) as PlatformRecord[];
    if (!Array.isArray(stored)) return defaultRecords;
    return mergeStoredRecords(defaultRecords, stored);
  } catch {
    return defaultRecords;
  }
}

export function savePlatformRecords(records: PlatformRecord[], storage: StorageLike = defaultRecordsStorage()) {
  storage.setItem(recordsStorageKey, JSON.stringify(records));
}

function defaultRecordsStorage(): StorageLike {
  return window.aigcCreditRadarStorage ?? window.localStorage;
}

function readStoredRecords(primaryStorage: StorageLike, allowLocalStorageMigration: boolean) {
  const raw = primaryStorage.getItem(recordsStorageKey);
  if (raw || !allowLocalStorageMigration || !window.aigcCreditRadarStorage) return raw;

  const localRaw = window.localStorage.getItem(recordsStorageKey);
  if (localRaw) {
    primaryStorage.setItem(recordsStorageKey, localRaw);
  }

  return localRaw;
}

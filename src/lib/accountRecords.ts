import type { PlatformRecord } from "../types";

export function primaryAccountId(platform: string) {
  return `${platform}-main`;
}

export function isUserAddedAccountRecord(record: PlatformRecord) {
  return record.account.id !== primaryAccountId(record.account.platform);
}

export function shouldShowAccountRecord(record: PlatformRecord) {
  if (record.account.enabled === false) return false;

  if (record.account.adapterKind === "browser" || record.account.adapterKind === "manual") {
    return Boolean(record.snapshot);
  }

  return (
    record.account.tracked === true ||
    isUserAddedAccountRecord(record) ||
    record.account.authState === "ready" ||
    Boolean(record.snapshot)
  );
}

export function visibleAccountRecords(records: PlatformRecord[]) {
  return records.filter(shouldShowAccountRecord);
}

export function hasVisibleAccountForPlatform(records: PlatformRecord[], platform: string) {
  return visibleAccountRecords(records).some((record) => record.account.platform === platform);
}

export function createAdditionalAccountRecord(records: PlatformRecord[], platform: string): PlatformRecord | undefined {
  const base = records.find((record) => record.account.platform === platform);
  if (!base) return undefined;

  const samePlatform = records.filter((record) => record.account.platform === platform);
  let nextIndex = samePlatform.length + 1;
  let id = `${platform}-${nextIndex}`;
  while (records.some((record) => record.account.id === id)) {
    nextIndex += 1;
    id = `${platform}-${nextIndex}`;
  }

  return {
    account: {
      ...base.account,
      id,
      label: `${base.account.label} #${nextIndex}`,
      authState: "missing_config",
      enabled: true,
      tracked: true,
    },
    nextRunAt: "",
    cadence: "paused",
  };
}

export function trackAccountPlatform(records: PlatformRecord[], platform: string): PlatformRecord[] {
  const primaryId = primaryAccountId(platform);
  const primary = records.find((record) => record.account.id === primaryId);
  if (!primary) return records;

  if (!hasVisibleAccountForPlatform(records, platform) || !shouldShowAccountRecord(primary)) {
    return records.map((record) =>
      record.account.id === primaryId
        ? {
            ...record,
            account: {
              ...record.account,
              enabled: true,
              tracked: true,
            },
          }
        : record,
    );
  }

  return records;
}

export function removeAccountRecord(records: PlatformRecord[], accountId: string): PlatformRecord[] {
  return records.flatMap((record) => {
    if (record.account.id !== accountId) return [record];

    if (isUserAddedAccountRecord(record)) return [];

    return [
      {
        ...record,
        account: {
          ...record.account,
          authState: "missing_config",
          enabled: false,
          tracked: false,
        },
        snapshot: undefined,
        lastRun: undefined,
        nextRunAt: "",
        cadence: "paused",
      },
    ];
  });
}

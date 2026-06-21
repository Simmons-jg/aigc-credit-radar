import type { ConnectorDefinition } from "../types";

export const connectorDefinitions: ConnectorDefinition[] = [
  {
    id: "higgsfield-cli",
    platform: "higgsfield",
    adapterKind: "cli",
    maturity: "recommended",
    titleKey: "officialCliTitle",
    subtitleKey: "officialCliSubtitle",
    primaryActionKey: "checkStatus",
    secondaryActionKey: "startLogin",
  },
  {
    id: "jimeng-cli",
    platform: "jimeng",
    adapterKind: "cli",
    maturity: "available",
    titleKey: "jimengTitle",
    subtitleKey: "jimengSubtitle",
    primaryActionKey: "checkStatus",
    secondaryActionKey: "startLogin",
    installUrl: "https://jimeng.jianying.com/cli",
    installCommand: "curl -s https://jimeng.jianying.com/cli | bash",
    statusCommand: "dreamina user_credit",
  },
];

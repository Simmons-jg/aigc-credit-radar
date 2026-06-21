import assert from "node:assert/strict";
import { test } from "node:test";
import { connectorDefinitions } from "./connectors";

test("connect panel only exposes connectors that can run inside this app", () => {
  const connectorPlatforms = connectorDefinitions.map((connector) => connector.platform);

  assert.deepEqual(connectorPlatforms, ["higgsfield", "jimeng"]);
  assert.equal(connectorPlatforms.includes("openart"), false);
  assert.equal(connectorPlatforms.includes("lovart"), false);
  assert.equal(connectorPlatforms.includes("tapnow"), false);
});

test("browser extension platforms stay out of the automatic connector panel until install is production-ready", () => {
  const browserConnectors = connectorDefinitions.filter((connector) => connector.adapterKind === "browser");

  assert.deepEqual(browserConnectors, []);
});

test("OpenArt stays out of the automatic connector panel until local MCP OAuth exists", () => {
  const openart = connectorDefinitions.find((connector) => connector.platform === "openart");

  assert.equal(openart, undefined);
});

test("Jimeng uses the Dreamina CLI connector contract", () => {
  const jimeng = connectorDefinitions.find((connector) => connector.platform === "jimeng");

  assert.equal(jimeng?.adapterKind, "cli");
  assert.equal(jimeng?.installUrl, "https://jimeng.jianying.com/cli");
  assert.equal(jimeng?.installCommand, "curl -s https://jimeng.jianying.com/cli | bash");
  assert.equal(jimeng?.statusCommand, "dreamina user_credit");
  assert.equal(jimeng?.primaryActionKey, "checkStatus");
  assert.equal(jimeng?.secondaryActionKey, "startLogin");
});

test("CLI connectors expose login as the user-facing setup action", () => {
  const cliConnectors = connectorDefinitions.filter((connector) => connector.adapterKind === "cli");

  assert.deepEqual(
    cliConnectors.map((connector) => [connector.platform, connector.primaryActionKey, connector.secondaryActionKey]),
    [
      ["higgsfield", "checkStatus", "startLogin"],
      ["jimeng", "checkStatus", "startLogin"],
    ],
  );
});

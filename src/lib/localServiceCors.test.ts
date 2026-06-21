import assert from "node:assert/strict";
import { test } from "node:test";
import { createLocalServiceCorsHeaders } from "./localServiceCors";

test("createLocalServiceCorsHeaders allows bookmarklets on public HTTPS pages to reach localhost", () => {
  const headers = createLocalServiceCorsHeaders();

  assert.equal(headers["Access-Control-Allow-Origin"], "*");
  assert.equal(headers["Access-Control-Allow-Private-Network"], "true");
  assert.match(headers["Access-Control-Allow-Headers"], /Content-Type/);
  assert.match(headers["Access-Control-Allow-Methods"], /OPTIONS/);
});

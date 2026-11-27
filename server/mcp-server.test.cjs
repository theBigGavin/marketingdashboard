"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { version } = require("../package.json");
const { createMcpHandler, createMcpSession } = require("./mcp-server.cjs");

test("MCP initialize 版本与 package.json 保持一致", async () => {
  const session = createMcpSession({});
  const response = await session.handleRequest({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {},
  });

  assert.equal(response.result.serverInfo.name, "mrd");
  assert.equal(response.result.serverInfo.version, version);
});

test("MCP GET 元数据版本与 package.json 保持一致", async () => {
  const handler = createMcpHandler({});
  const req = { url: "/mcp", method: "GET", headers: {} };
  let status = null;
  let payload = null;
  const res = {
    writeHead(code) { status = code; },
    end(body) { payload = JSON.parse(body); },
  };

  const result = await handler(null, null, req, res);

  assert.equal(result, "MRD_MCP_HANDLED");
  assert.equal(status, 200);
  assert.equal(payload.version, version);
});

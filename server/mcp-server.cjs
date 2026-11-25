/**
 * MRD MCP Server — Phase 1.5
 * 协议: JSON-RPC 2.0 over Streamable HTTP (SSE chunks)
 * 零新依赖，同进程复用 cached() 共享缓存
 *
 * 注入: createMcpServer({ fetchText, fetchTextAny, curlText, cache, cacheSet,
 *                           cached, entry, failEntry, quoteBackoff, TTLS,
 *                           num, changeOf, pctOf, fmtHHMM, parseCsvParam,
 *                           chunked, safeRecord, toMarketCode6,
 *                           handleQuotes, handleMinute, handleBoards,
 *                           handleBoardStocks, handleFutures, handleFutureMinute,
 *                           handleMoneyFlowEM, handleRank, handleNews,
 *                           handleStockSearch })
 */
"use strict";

const { version: APP_VERSION } = require("../package.json");
const { parseCsvParam } = require("./lib/netutil.cjs");

// ---- JSON-RPC 2.0 helpers ----
function jsonrpcResult(id, result) {
  return { jsonrpc: "2.0", id, result };
}
function jsonrpcError(id, code, message) {
  return { jsonrpc: "2.0", id: id ?? null, error: { code, message } };
}
function parseReq(body) {
  if (typeof body === "string" || Buffer.isBuffer(body)) {
    try { return JSON.parse(String(body)); } catch { return null; }
  }
  return body || null;
}

// ---- MRD 内置工具清单 (public, 5 tools) ----
const TOOLS = [
  {
    name: "get_quotes",
    description: "获取 A股/港股/美股/外汇实时行情。输入股票代码列表（逗号分隔，如 sh000001,hkHSI,usNVDA），支持腾讯 6 位市场前缀。返回: 代码、名称、现价、涨跌幅、成交量、成交额。",
    inputSchema: {
      type: "object",
      properties: {
        codes: {
          type: "string",
          description: "股票代码，逗号分隔。示例: sh000001,sz399001,hkHSI,usNVDA",
        },
      },
      required: ["codes"],
    },
  },
  {
    name: "get_boards",
    description: "获取沪深/港股/美股板块涨跌排行。type=01(沪深行业) | 02(沪深概念) | 03(港股行业) | 05(美股)；dir=0(降序) | 1(升序)；n=返回条数(默认30)。",
    inputSchema: {
      type: "object",
      properties: {
        type: {
          type: "string",
          description: "板块类型: 01=沪深行业, 02=沪深概念, 03=港股行业, 05=美股（默认01）",
          default: "01",
        },
        dir: {
          type: "string",
          description: "排序方向: 0=降序(跌幅前列), 1=升序(涨幅前列)（默认0）",
          default: "0",
        },
        n: {
          type: "string",
          description: "返回条数（默认30）",
          default: "30",
        },
      },
    },
  },
  {
    name: "get_futures",
    description: "获取贵金属/原油/商品期货实时行情。默认列表: hf_GC(纽约金),hf_XAU(现货金),hf_SI(纽约银),hf_CAD(加元),hf_CL(原油),hf_VX(VIX恐慌),nf_AU0(国内黄金),BTCUSDT。",
    inputSchema: {
      type: "object",
      properties: {
        list: {
          type: "string",
          description: "期货代码列表，逗号分隔。示例: hf_GC,hf_XAU,hf_CL",
          default: "hf_GC,hf_XAU,hf_SI,hf_CAD,hf_CL,hf_VX,nf_AU0,BTCUSDT",
        },
      },
    },
  },
  {
    name: "get_money_flow",
    description: "获取 A股主力资金净流入排行。东财主源，失败回退新浪。n=返回条数（默认20）。返回: 代码、名称、主力净流入、主力净流入占比。",
    inputSchema: {
      type: "object",
      properties: {
        n: {
          type: "string",
          description: "返回条数（默认20）",
          default: "20",
        },
      },
    },
  },
  {
    name: "get_news",
    description: "获取新浪 7×24 快讯。page=页码（默认1），size=每页条数（默认40）。返回: 时间、标题、来源、摘要。",
    inputSchema: {
      type: "object",
      properties: {
        page: {
          type: "string",
          description: "页码（默认1）",
          default: "1",
        },
        size: {
          type: "string",
          description: "每页条数（默认40）",
          default: "40",
        },
      },
    },
  },
];

// ---- 工具执行器 ----
async function callTool(name, args, ctx) {
  const { handleQuotes, handleBoards, handleBoardStocks, handleFutures,
          handleMoneyFlowEM, handleRank, handleNews, handleStockSearch } = ctx;
  switch (name) {
    case "get_quotes": {
      const codes = parseCsvParam(args.codes || "");
      if (!codes.length) return { error: "codes is required" };
      return handleQuotes(codes.join(","));
    }
    case "get_boards": {
      const type = args.type || "01";
      const dir = args.dir || "0";
      const n = args.n || "30";
      return handleBoards(type, dir, n);
    }
    case "get_futures": {
      const list = args.list || "hf_GC,hf_XAU,hf_SI,hf_CAD,hf_CL,hf_VX,nf_AU0,BTCUSDT";
      return handleFutures(list);
    }
    case "get_money_flow": {
      const n = args.n || "20";
      // 先试东财，失败回退新浪
      const em = await handleMoneyFlowEM(n).catch(() => null);
      if (em && em.length) return em;
      return handleRank("changepercent", "0", "5").catch(() => []);
    }
    case "get_news": {
      const page = args.page || "1";
      const size = args.size || "40";
      return handleNews(page, size);
    }
    default:
      return { error: `Unknown tool: ${name}` };
  }
}

// ---- MCP Streamable HTTP 会话 ----
function createMcpSession(ctx) {
  const clients = new Set(); // 持有 pending SSE 响应的 write 函数

  // 推送一个 JSON-RPC 消息到所有已连接的客户端
  function broadcast(msg) {
    const data = `data: ${JSON.stringify(msg)}\n\n`;
    for (const write of clients) {
      try { write(data); } catch { clients.delete(write); }
    }
  }

  // 主动通知（server → client）
  function notify(method, params) {
    broadcast({ jsonrpc: "2.0", method, params });
  }

  // 请求处理器（同步，返回值给 SSE 流）
  async function handleRequest(body) {
    const req = parseReq(body);
    if (!req) return jsonrpcError(null, -32700, "Parse error");

    // 单个请求
    if (req.method) return handleSingle(req);

    // 批量请求
    if (Array.isArray(req)) {
      const results = await Promise.all(req.map(r => handleSingle(r)));
      return results;
    }

    return jsonrpcError(null, -32600, "Invalid Request");
  }

  async function handleSingle(req) {
    const id = req.id;
    const method = req.method || "";
    const params = req.params || {};

    switch (method) {
      case "initialize":
        return jsonrpcResult(id, {
          protocolVersion: "2024-11-05",
          capabilities: { tools: {}, resources: {} },
          serverInfo: { name: "mrd", version: APP_VERSION },
        });

      case "tools/list":
        return jsonrpcResult(id, { tools: TOOLS });

      case "tools/call": {
        const { name, arguments: args = {} } = params;
        if (!name) return jsonrpcError(id, -32602, "Missing tool name");
        try {
          const result = await callTool(name, args, ctx);
          return jsonrpcResult(id, {
            content: [
              {
                type: "text",
                text: typeof result === "object" ? JSON.stringify(result, null, 2) : String(result),
              },
            ],
          });
        } catch (e) {
          return jsonrpcError(id, -32603, e?.message || "Tool call failed");
        }
      }

      case "resources/list":
        return jsonrpcResult(id, {
          resources: [
            { uri: "mrd://health", name: "健康状态", mimeType: "application/json" },
            { uri: "mrd://stats", name: "服务统计", mimeType: "application/json" },
          ],
        });

      case "resources/read": {
        const uri = params.uri || "";
        if (uri === "mrd://health") {
          return jsonrpcResult(id, {
            contents: [{ uri, mimeType: "application/json", text: JSON.stringify({ status: "ok", ts: Date.now() }) }],
          });
        }
        if (uri === "mrd://stats") {
          const { cache } = ctx;
          return jsonrpcResult(id, {
            contents: [{
              uri, mimeType: "application/json",
              text: JSON.stringify({ cacheSize: cache.size, ts: Date.now() }),
            }],
          });
        }
        return jsonrpcError(id, -32602, `Unknown resource: ${uri}`);
      }

      case "ping":
        return jsonrpcResult(id, null);

      default:
        return jsonrpcError(id, -32601, `Method not found: ${method}`);
    }
  }

  // Streamable HTTP: 创建 SSE 响应流（客户端 long-poll）
  function createSseStream() {
    let closed = false;
    const chunks = [];

    function write(data) {
      if (!closed) chunks.push(data);
    }

    function close() {
      closed = true;
      clients.delete(write);
    }

    clients.add(write);

    return {
      write,
      close,
      getChunks: () => chunks,
    };
  }

  return { handleRequest, notify, createSseStream };
}

// ---- MCP HTTP 处理函数（挂载到 /mcp 路由）----
// 签名兼容 index.cjs routes{} 约定: (q, body, req)
// MCP 自身不使用 q/body，由内部 readBodyWithLimit 从 req 直接读
function createMcpHandler(ctx) {
  const { handleRequest, createSseStream } = createMcpSession(ctx);

  // 读取带限的请求体
  function readBodyWithLimit(req, limit = 256 * 1024) {
    return new Promise((resolve) => {
      const chunks = [];
      let size = 0;
      let settled = false;
      const done = (buf) => { if (!settled) { settled = true; resolve(buf); } };
      req.on("data", (chunk) => {
        size += chunk.length;
        if (size > limit) { req.removeAllListeners("data"); req.resume(); done(null); return; }
        chunks.push(chunk);
      });
      req.on("end", () => done(Buffer.concat(chunks)));
      req.on("error", () => done(null));
      req.on("close", () => done(Buffer.concat(chunks)));
    });
  }

  return async function handleMcp(_q, body, req, res) {
    const u = new URL(req.url, "http://localhost");

    // 提取 lastEventId（SSE 重连用）
    const lastEventId = req.headers["last-event-id"] || u.searchParams.get("lastEventId") || null;

    // Streamable HTTP: 区分 SSE 端点和 POST 端点
    if (u.pathname === "/mcp/stream" || u.searchParams.get("stream") === "true") {
      // SSE 模式: 建立持久连接，接收服务端推送
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no", // 禁用 Nginx 缓冲
        ...(lastEventId ? { "Last-Event-Id": lastEventId } : {}),
      });

      const stream = createSseStream();

      // 发送初始 ping
      stream.write(`data: ${JSON.stringify({ jsonrpc: "2.0", method: "initialized", params: {} })}\n\n`);

      req.on("close", () => stream.close());
      return "MRD_MCP_HANDLED"; // 告诉 index.cjs: 已直接写响应，不要再 send()
    }

    // POST: 处理 JSON-RPC 请求
    if (req.method === "POST") {
      // body 已由 index.cjs server 回调预解析（req.on("data") 已消费 stream）
      // index.cjs 解析成功时传入非空 body；解析失败时抛 400 由 index.cjs 处理，handler 不到达
      if (!body || (typeof body === "object" && body.__rawResponse === undefined && Object.keys(body).length === 0 && req.headers["content-type"]?.includes("application/json"))) {
        // body 是空对象且 content-type 是 json —— index.cjs 解析失败后抛错，handler 不应到达
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end('{"jsonrpc":"2.0","error":{"code":-32700,"message":"Missing request body"}}');
        return;
      }
      const result = await handleRequest(body);
      const respBody = JSON.stringify(result);
      res.writeHead(200, {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(respBody),
        "Cache-Control": "no-store",
      });
      res.end(respBody);
      return "MRD_MCP_HANDLED"; // 告诉 index.cjs: 已直接写响应，不要再 send()
    }

    // GET: 返回 MCP 端点元数据
    if (req.method === "GET") {
      const meta = {
        name: "mrd",
        version: APP_VERSION,
        description: "Market Research Dashboard MCP Server — A股/港股/美股/期货/资金流/快讯",
        endpoint: "/mcp",
        streamEndpoint: "/mcp/stream",
        protocol: "JSON-RPC 2.0 over Streamable HTTP",
        tools: TOOLS.map((t) => ({ name: t.name, description: t.description.split("\n")[0] })),
        resources: [
          { uri: "mrd://health", name: "健康状态" },
          { uri: "mrd://stats", name: "服务统计" },
        ],
      };
      const body = JSON.stringify(meta, null, 2);
      res.writeHead(200, {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body),
        "Cache-Control": "no-store",
      });
      res.end(body);
      return "MRD_MCP_HANDLED"; // 告诉 index.cjs: 已直接写响应，不要再 send()
    }

    // 方法不允许
    res.writeHead(405, { "Content-Type": "application/json", "Allow": "GET, POST" });
    res.end('{"ok":false,"error":"method not allowed"}');
    return "MRD_MCP_HANDLED"; // 告诉 index.cjs: 已直接写响应，不要再 send()
  };
}

module.exports = { createMcpHandler, createMcpSession };

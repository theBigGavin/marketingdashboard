/**
 * 市场研究驾驶舱 — 数据代理与静态服务器
 * 聚合: 腾讯行情(A股/港股/美股/汇率) · 腾讯板块榜 · 新浪期货(金银铜油)
 *       新浪个股榜单 · 新浪资金流 · 新浪7x24快讯 · CNBC美债收益率
 */
const http = require("http");
const fs = require("fs");
const path = require("path");
const { num, changeOf, pctOf, fmtHHMM, toMarketCode6 } = require("./lib/format.cjs");
const { parseCsvParam, chunked, safeRecord } = require("./lib/netutil.cjs");
const { bjToday, readHistory, writeHistory } = require("./lib/persist.cjs");
const { createCache } = require("./lib/cache.cjs");
const createFetchAny = require("./lib/fetch-any.cjs");
const createLastGood = require("./lib/last-good.cjs");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 分钟线缓存 TTL: 常规 5s(与报价中心同频); 汇率(wh*)降频 2min —
// 东财 WAF 限流(SSL unexpected eof)主因是频率, 汇率分时 2min 粒度足够且命中率降 24 倍
const MINUTE_TTL = 5000;
const FX_MINUTE_TTL = 120000;
const minuteTtl = (code) => (code && code.startsWith("wh") ? FX_MINUTE_TTL : MINUTE_TTL);

// 运行观测(压测/运维): 仅聚合计数, 无敏感信息; /api/stats 读取
const stats = { reqs: 0, upstream: 0, blocked: 0, started: Date.now() };

// 统一上游数据通道(fetch/curl 双通道 + 状态码校验)与统一内存缓存(命名 TTL + 失败退避 + 负缓存)
const { fetchText, curlText, fetchTextAny, fetchWithFallback, UA } = createFetchAny({ onUpstream: () => stats.upstream++ });
const { cache, set: cacheSet, sweep: sweepCache, backoffOf, cached, cachedMeta, quoteBackoff, entry, failEntry, TTLS } = createCache();
const qqRank = require("./lib/qq-rank.cjs")({ fetchText, num });

// 上次成功数据快照(内存+磁盘): 上游全挂时四类资金流接口降级返回旧值并带 stale/asof,
// 而不是 502。落盘目录 server/data/last-good(server/data/ 已 gitignore, 不进版本库)
const lastGood = createLastGood({ fs, path, dir: path.join(__dirname, "data", "last-good") });

// 加载 .env(须先于数据源模块 require, 模块内读取 process.env 密钥)
try {
  const envPath = path.join(__dirname, ".env");
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, "utf-8").split("\n")) {
      const m = line.trim().match(/^export\s+(.+?)=(.*)$/) || line.trim().match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
      if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
    console.log("[env] loaded", envPath);
  }
} catch (e) { console.error("[env] load error:", e.message); }

// 数据源适配器(依赖注入共享工具: 统一 fetch 通道 / 统一缓存)
const srcTencent = require("./sources/tencent.cjs")({
  fetchText, fetchTextAny, curlText, cache, cacheSet, parseCsvParam, chunked, safeRecord, num, changeOf, pctOf,
  entry, failEntry, quoteBackoff, TTLS, qqRank,
});
const { handleQuotes, handleMinute, handleBoards, handleBoardStocks } = srcTencent;

const srcFutures = require("./sources/futures.cjs")({
  fetchText, curlText, fetchWithFallback, num, changeOf, pctOf, fmtHHMM, safeRecord,
  cache, cacheSet, cached, entry, failEntry, quoteBackoff, TTLS,
});
const { handleFutures, handleFutureMinute, handleFutureDaily } = srcFutures;

const srcAi = require("./sources/ai.cjs")({
  cache, cacheSet, cached, entry, failEntry, quoteBackoff, TTLS,
});
const { handleMysterySelect } = srcAi;

const srcEastmoney = require("./sources/eastmoney.cjs")({
  fetchText, fetchWithFallback, cache, cacheSet, num, toMarketCode6,
  entry, failEntry, quoteBackoff, TTLS, qqRank,
});
const { handleRank, handleMoneyFlow, handleStockBoards, handleMoneyFlowEM, handleBoardMoneyFlow, handleStockFlows, handleBoardFlow, fetchSinaJson } = srcEastmoney;

// 资金流四接口的多源回退层(东财 push2* 出网被掐后的替代源链 + 旧数据降级):
// /api/board-flow · /api/board-moneyflow · /api/stock-flow(s) · /api/stock-boards
// 东财实现(上面 srcEastmoney)原样保留为链首主源, 上游恢复即自动回到东财口径。
const srcMoneyFlow = require("./sources/moneyflow.cjs")({
  fetchWithFallback, fetchSinaJson, num, toMarketCode6, qqRank,
  cache, cacheSet, entry, TTLS, lastGood,
  em: { handleBoardFlow, handleBoardMoneyFlow, handleStockFlows, handleStockBoards },
});
const { boardFlow, boardMoneyFlow, stockFlow, stockFlows, stockBoards } = srcMoneyFlow;

const srcSina = require("./sources/sina.cjs")({
  fetchTextAny, fetchSinaJson, num, toMarketCode6,
  cache, cacheSet, cached, entry, failEntry, quoteBackoff, TTLS,
});
const { handleNews, handleStockSearch } = srcSina;

const srcEastmoneyFin = require("./sources/eastmoney-fin.cjs")({
  fetchTextAny, num, toMarketCode6,
  cache, cacheSet, cached, entry, failEntry, quoteBackoff, TTLS,
});
const { handleFinanceMain, handleFinanceBoard, handleFinanceForecast, validPeriod } = srcEastmoneyFin;

const srcTreasuries = require("./sources/treasuries.cjs")({ fetchTextAny, num, fs, path });
const { handleTreasuries, handleTreasuryHistory } = srcTreasuries;

// 黄金观察: 本地 gold-monitor/SQLite 优先；缺数时走真实在线源，最后使用独立 last-good 快照。
const srcGoldOnline = require("./sources/gold-online.cjs")({ fetchTextAny });
const srcGold = require("./sources/gold.cjs")({ fs, path, lastGood, online: srcGoldOnline, env: process.env });
const { handleGold, handleGoldHistory } = srcGold;

const srcOpenRouter = require("./sources/openrouter.cjs")({ safeRecord, fs, path });
const { handleOpenRouterUsage } = srcOpenRouter;

const srcAiInfra = require("./sources/ai-infra.cjs")({ fetchText, fetchWithFallback, readHistory, writeHistory, bjToday, num, fs, path });
const { handleAiInfra } = srcAiInfra;

const srcSunsirs = require("./sources/sunsirs.cjs")({ fetchText, num, UA, readHistory, writeHistory, bjToday, path, fs });
const { handleSpotTable, handleChemSpot } = srcSunsirs;

const srcAiModels = require("./sources/ai-models.cjs")({ fetchText, num, readHistory, writeHistory, bjToday, path, fs });
const { handleAaModels, handleSpendIndex } = srcAiModels;

// ---- MCP 层（Phase 1.5）: 同进程零依赖嵌入 ----
const { createMcpHandler } = require("./mcp-server.cjs");
const handleMcp = createMcpHandler({
  handleQuotes, handleBoards, handleBoardStocks, handleFutures,
  handleMoneyFlowEM, handleRank, handleNews, handleStockSearch,
  cache, cached,
});

// 个股资金流上游 inflight 去重表(handleStockFlows 使用)
const flowInflight = new Map();

// 活跃访客窗口: ip -> 最近请求时间戳; /api/stats 暴露 activeIps5m / visitors24h
const activeIps = new Map(); // ip -> lastSeen(ms), 24h 内访问过的 IP 保留(个人站点量级, 内存有界)
const activeSweeper = setInterval(() => {
  const cutoff = Date.now() - 24 * 3600 * 1000;
  for (const [ip, last] of activeIps) if (last < cutoff) activeIps.delete(ip);
}, 5 * 60 * 1000);
activeSweeper.unref();
function trackActiveIp(ip) { activeIps.set(ip, Date.now()); }

const PORT = process.env.PORT || 3000;
const DIST = path.join(__dirname, "..", "dist");

function send(res, code, obj, extra = {}) {
  const body = typeof obj === "string" ? obj : JSON.stringify(obj);
  const headers = {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    ...extra,
  };
  // extra 中值为 null 的头表示显式移除; ACAO 不默认下发, 仅同源请求由 corsHeadersFor 反射
  for (const k of Object.keys(headers)) if (headers[k] == null) delete headers[k];
  res.writeHead(code, headers);
  res.end(body);
}

// 数据新鲜度契约(四类资金流接口): 数据源 handler 返回 { data, stale, asof, source, partial? } 时,
// 路由用 freshness(payload, env) 包成 sentinel; 响应层把 stale/asof/source 平铺到信封(数组端点无法带字段)
// 或合并进 data(对象端点) —— 既有字段一个不动, 只做增量。env 为 cachedMeta() 的 { ts, stale }(缓存层降级)
function freshness(p, env) {
  const meta = {
    stale: !!(p && p.stale) || !!(env && env.stale),
    asof: (p && p.asof) ?? (env && env.ts) ?? null,
    source: (p && p.source) ?? null,
  };
  if (p && p.partial) meta.partial = true;
  let data = p && typeof p === "object" && "data" in p ? p.data : p;
  if (data && !Array.isArray(data) && typeof data === "object") {
    data = { ...data, stale: meta.stale, asof: meta.asof, source: meta.source };
  }
  return { __fresh: { data, meta } };
}

/* ---------------- TTL 缓存 + 并发合并(防上游限流) — cached() 在 lib/cache.cjs 统一实现 ---------------- */

const { handleChainParse } = require("./lib/chain-parse.cjs");

/* ---------------- GitHub stars 汇总配置（公司产品仓库白名单）----------------
   加产品仓库：只改 GITHUB_STARS_WHITELIST 数组，无需改代码 */
const GITHUB_STARS_OWNER = "theBigGavin";
const GITHUB_STARS_WHITELIST = ["marketingdashboard", "mylauncher"];

/* ---------------- 主机路由表 ---------------- */
const routes = {
  "/api/quotes": async (q) => handleQuotes(q.get("codes") || ""), // 内部按代码独立缓存(TTL 5s)
  "/api/aa-models": async () => cached("aa-models", 24 * 3600 * 1000, () => handleAaModels()), // AA 全模型定价, 24h 缓存 + 每日快照落盘
  "/api/spend-index": async () => cached("spend-index", 6 * 3600 * 1000, () => handleSpendIndex()), // traktoken 支出指数(60天 + 事件)
  "/api/stats": async () => {
    const now = Date.now();
    const cutoff5m = now - 5 * 60 * 1000;
    const cutoff24h = now - 24 * 3600 * 1000;
    let active5m = 0, visitors24h = 0;
    for (const last of activeIps.values()) {
      if (last >= cutoff5m) active5m++;
      if (last >= cutoff24h) visitors24h++;
    }
    return {
      reqs: stats.reqs, upstream: stats.upstream, blocked: stats.blocked,
      uptimeSec: Math.round((now - stats.started) / 1000),
      activeIps5m: active5m, visitors24h,
    };
  },
  "/api/leads": async (_q, body) => {
    // Pro landing 预注册: 收集付费意向线索, 落盘到 data/leads.json
    const email = String(body?.email || "").trim().slice(0, 200);
    const need = String(body?.need || "").trim().slice(0, 500);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      const e = new Error("invalid email"); e.status = 400; throw e;
    }
    const rec = { email, need, plan: String(body?.plan || "").slice(0, 50), ts: new Date().toISOString() };
    const file = path.join(__dirname, "data", "leads.json");
    let arr = [];
    try { arr = JSON.parse(fs.readFileSync(file, "utf-8")); } catch {}
    arr.push(rec);
    fs.writeFileSync(file, JSON.stringify(arr, null, 2));
    return { received: true, count: arr.length };
  },
  "/api/minute": async (q) => {
    const code = q.get("code") || "sh000001";
    return cached(`minute:${code}`, minuteTtl(code), () => handleMinute(code));
  },
  // 批量分钟线: 将 N 次单独请求合并为 1 次, 大幅降低冷启动爆发请求数
  "/api/batch-minute": async (q) => {
    const codes = parseCsvParam(q.get("codes") || "");
    if (codes.length === 0) return {};
    if (codes.length > 30) codes.length = 30; // 上限防滥用
    const map = {};
    // 逐个走缓存(常规代码 5s TTL, 汇率 wh* 降频 2min), 但共享一次 HTTP 往返
    await Promise.all(codes.map(async (c) => {
      try { map[c] = await cached(`minute:${c}`, minuteTtl(c), () => handleMinute(c)); } catch (e) { map[c] = null; console.error("[batch-minute]", c, e?.message || e); }
    }));
    return map;
  },
  "/api/boards": async (q) =>
    cached(`boards:${q.get("type")}:${q.get("dir")}:${q.get("n")}`, 5000, () =>
      handleBoards(q.get("type") || "01", q.get("dir") || "0", q.get("n") || "30")
    ),
  "/api/board-stocks": async (q) =>
    cached(`bstocks:${q.get("code")}:${q.get("dir")}:${q.get("n")}`, 8000, () =>
      handleBoardStocks(q.get("code") || "", q.get("dir") || "down", q.get("n") || "10")
    ),
  "/api/futures": async (q) =>
    cached(`futures:${q.get("list")}`, 15000, () => handleFutures(q.get("list") || "hf_GC,hf_XAU,hf_SI,hf_CAD,hf_CL,hf_VX,nf_AU0,BTCUSDT")),
  "/api/future-daily": async (q) =>
    cached(`fdaily:${q.get("code")}:${q.get("n") || ""}`, 3600000, () =>
      handleFutureDaily(q.get("code") || "", Math.min(parseInt(q.get("n")) || 400, 5000))
    ), // 日线K线(默认近400根), 1h缓存
  "/api/spot-table": async () => cached("spot:table", 8 * 3600000, () => handleSpotTable()), // 生意社现期表, 8h缓存(每日16:30更新)
  "/api/chem-spot": async (q) =>
    cached(`chem:${q.get("id")}:${q.get("name") || ""}`, 8 * 3600000, () =>
      handleChemSpot(q.get("id") || "", q.get("name") || q.get("id") || "")), // 生意社化工现货, 8h缓存
  "/api/future-minute": async (q) =>
    cached(`fmin:${q.get("code")}`, 60000, () => handleFutureMinute(q.get("code") || "")),
  // 批量期货分钟线
  "/api/batch-fmin": async (q) => {
    const codes = parseCsvParam(q.get("codes") || "");
    if (codes.length === 0) return {};
    if (codes.length > 20) codes.length = 20;
    const map = {};
    await Promise.all(codes.map(async (c) => {
      try { map[c] = await cached(`fmin:${c}`, 60000, () => handleFutureMinute(c)); } catch (e) { map[c] = null; console.error("[batch-fmin]", c, e?.message || e); }
    }));
    return map;
  },
  "/api/rank": async (q) =>
    cached(`rank:${q.get("sort")}:${q.get("asc")}:${q.get("n")}`, 5000, () =>
      handleRank(q.get("sort") || "changepercent", q.get("asc") || "0", q.get("n") || "30")
    ),
  "/api/moneyflow": async (q) =>
    cached(`mf:${q.get("n")}`, 8000, () =>
      // 东财主源, 失败回退新浪
      handleMoneyFlowEM(q.get("n") || "20").then((rows) => {
        if (rows.length) return rows;
        return handleMoneyFlow(q.get("n") || "20");
      }).catch(() => handleMoneyFlow(q.get("n") || "20"))
    ),
  // 板块成分股主力净流入排行: 东财 clist(fs=b:板块代码) → 新浪 bankuai= 完整榜 → 成分清单×全市场净额映射
  "/api/board-moneyflow": async (q) => {
    const env = await cachedMeta(`bmf:${q.get("code")}:${q.get("n")}`, 8000, () => boardMoneyFlow(q.get("code") || "", q.get("n") || "15"));
    return freshness(env.data, env);
  },
  // 个股资金流: 东财 ulist → 新浪全市场榜/个股日频; 取不到且无历史快照才报错
  "/api/stock-flow": async (q) => freshness(await stockFlow(q.get("code") || "", flowInflight)),
  "/api/stock-flows": async (q) => freshness(await stockFlows(q.get("codes") || "", flowInflight)),
  "/api/board-flow": async (q) => {
    const env = await cachedMeta(`bf:${q.get("n")}`, 120000, () => boardFlow(q.get("n") || "20"));
    return freshness(env.data, env);
  },
  // 个股所属板块: 东财 push2 f127/f128/f129 → 东财 datacenter-web F10 核心题材(行业/地域/概念)
  "/api/stock-boards": async (q) => {
    const env = await cachedMeta(`sb:${q.get("code")}`, 24 * 3600 * 1000, () => stockBoards(q.get("code") || ""));
    return freshness(env.data, env);
  },
  "/api/news": async (q) =>
    cached(`news:${q.get("page")}:${q.get("size")}`, 8000, () =>
      handleNews(q.get("page") || "1", q.get("size") || "40")
    ),
  "/api/treasuries": async () => cached("treasuries", 30000, () => handleTreasuries()),
  // 黄金观察（25）: 聚合(8 面板字段) + 历史序列(days=1|7|30), TTL 60s(mrd 轮询风格)
  "/api/gold": async () => cached("gold:summary", 60000, () => handleGold()),
  "/api/gold/history": async (q) => cached(`gold:hist:${q.get("days") || "1"}`, 60000, () => handleGoldHistory(q.get("days") || "1")),
  "/api/finance-main": async (q) =>
    cached(`fin-main:${q.get("code")}`, 3600000, () => handleFinanceMain(q.get("code") || "")), // 单公司近12期主指标, 1h缓存
  "/api/finance-board": async (q) => {
    const p = validPeriod(q.get("period"));
    return cached(`fin-board:${p}`, 3600000, () => handleFinanceBoard(p)); // 盈利榜+行业聚合+披露日历, 1h缓存
  },
  "/api/finance-forecast": async (q) => {
    const p = validPeriod(q.get("period"));
    return cached(`fin-forecast:${p}`, 3600000, () => handleFinanceForecast(p)); // 业绩预告, 1h缓存
  },
  "/api/treasury-history": async () => cached("treasury-history", 6 * 3600 * 1000, () => handleTreasuryHistory()),
  "/api/health": async () => ({ status: "up", ts: Date.now(), cache: cache.size }),
  "/api/repo-stats": async () =>
    cached("repo-stats", 3600000, async () => {
      // GitHub repo 元数据(star/forks), 1h 缓存防限流; 失败返回 0 不阻断页面
      try {
        const txt = await fetchText("https://api.github.com/repos/theBigGavin/marketingdashboard", {
          headers: { Accept: "application/vnd.github+json", "User-Agent": UA },
        });
        const d = JSON.parse(txt);
        return { stars: d.stargazers_count ?? 0, forks: d.forks_count ?? 0, ts: Date.now() };
      } catch (e) {
        return { stars: 0, forks: 0, ts: Date.now() };
      }
    }),
  "/api/github/stars": async () =>
    cached("github-stars", 3600000, async () => {
      // 公司产品仓库 star 汇总: users/{owner}/repos 一次拉全, 过滤 fork + 白名单后求和。
      // 1h 缓存防 GitHub 匿名限流(60/h/IP), 限流由服务端单点吸收; 失败时 cached() 降级返回上次成功值
      const txt = await fetchText(
        `https://api.github.com/users/${GITHUB_STARS_OWNER}/repos?per_page=100&type=owner`,
        { headers: { Accept: "application/vnd.github+json", "User-Agent": UA } }
      );
      const repos = JSON.parse(txt);
      const picked = (Array.isArray(repos) ? repos : [])
        .filter((r) => !r.fork && GITHUB_STARS_WHITELIST.includes(r.name))
        .map((r) => ({ name: r.name, stars: r.stargazers_count ?? 0 }));
      return { total: picked.reduce((s, r) => s + r.stars, 0), repos: picked, ts: Date.now() };
    }),
  "/api/openrouter-usage": async () => cached("or-usage", 3600000, () => handleOpenRouterUsage()), // 1h cache
  "/api/ai-infra": async () => cached("ai-infra", 24 * 3600 * 1000, () => handleAiInfra()), // 财报/定价日更, 24h 缓存
  "/api/mystery-select": async (q) =>
    cached(`ms:${q.get("query")}:${q.get("limit")}:${q.get("page")}`, 60000, () =>
      handleMysterySelect(q.get("query") || "", q.get("limit") || "30", q.get("page") || "1")
    ),
  "/api/stock-search": async (q) =>
    cached(`ssearch:${q.get("q")}`, 5000, () => handleStockSearch(q.get("q") || "")), // 前端击键触发, 短缓存防新浪WAF
  "/api/chain-parse": async (_q, body) => handleChainParse(body || {}),
  // MCP 层（Phase 1.5）: Streamable HTTP, JSON-RPC 2.0
  "/mcp": async (_q, _body, req, res) => handleMcp(_q, _body, req, res),
};

// ---- 托管版托管层（HOSTING=1 启用）: 单实例多租户账号系统, 只增不改核心路由 ----
// 复用本文件数据管道/共享缓存(公开行情只读共享); 新增 /api/hosting/* 账号路由
// (SQLite users 表, 邮箱+密码, Bearer token; watchlist 等个性化数据按租户隔离)。
// 开源版(HOSTING 未设置)完全不加载, 行为与以往逐字节一致。
if (process.env.HOSTING === "1") {
  try {
    const { initHosting } = require("./hosting/index.cjs");
    const hosting = initHosting();
    Object.assign(routes, hosting.routes);
  } catch (e) {
    // 拆库后(2026-08-18): 托管层由私有仓库 mrd-pro 经 start_hosting.sh 注入部署。
    // 托管模式(HOSTING=1)下加载失败 = 账号墙缺失 → 裸开源实例暴露在托管域名(host.hermes.cc.cd)
    // 是安全隐患(任何访客绕过登录墙直达看板) → 拒绝启动。
    console.error("[hosting] 托管层加载失败(HOSTING=1, 拒绝启动防裸奔):", e?.stack || e?.message || e);
    process.exit(1);
  }
}

// ---- demo-funnel 数据源镜像(0825-retro-3 + 0830-gov-b): 架构拆分后 visits.json(官网→company-site-backend)、
// demo/status.json(→~/.hermes/opc/demo)、assistant-leads.jsonl(/api/assistant→company-site-backend)产出方均外迁,
// demo_funnel.py 仍读本仓 server/data/ 路径 → 启动即同步 + 每 5 分钟把真实产出方文件镜像到本仓
// (只读镜像, 不改业务数据, mtime 守卫 + 原子写)。
// HOSTING=1(托管实例, 客户环境无本机 OPC 数据源)跳过, 避免无谓 IO 与双实例重复写。
if (process.env.HOSTING !== "1") {
  const demoFunnel = require("./sources/demo-funnel.cjs")({ fs, path });
  demoFunnel.mirrorAll();
  setInterval(() => demoFunnel.mirrorAll(), 5 * 60 * 1000).unref();
  console.log("[demo-funnel] 数据源镜像已启动(5min 周期): visits.json + demo/status.json + assistant-leads.jsonl");
}

// ---- 手速排行榜迁移(0819-i): 已迁独立进程 server/knock-standalone.cjs(:3032, 公网入口
// https://hermes.cc.cd/api/v1/knock, cloudflared ingress)。此处不再挂载 initKnock,
// 避免双进程写同一 SQLite(server/data/knock.db); 旧路径改由下方请求处理器 302 重定向到新域。

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".webmanifest": "application/manifest+json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".mp4": "video/mp4",
};

// 静态资源安全头; CSP 仅随 HTML 下发(脚本均为构建产物, 内联 style 属性需 unsafe-inline)
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self' data:",
  "connect-src 'self' https:", // 浏览器直连兜底源(qt.gtimg.cn / wscn / binance 等)
  "manifest-src 'self'",
  "worker-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
].join("; ");

// 公司落地页专用 CSP: 独立静态页, 允许内联脚本(主题切换)与外部图(shields.io star badge)
const COMPANY_CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https:",
  "font-src 'self' data:",
  "connect-src 'self' https:",
  "base-uri 'self'",
].join("; ");

const STATIC_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "same-origin",
};

/* ---------------- 同源校验与 CORS(经 CF Tunnel 公网可达, 默认不授权任何跨源浏览器读取) ---------------- */
const PROTECTED_ROUTES = new Set(["/api/mystery-select", "/api/openrouter-usage"]);

// 环回地址互认: 开发期 vite 代理(:3000→:3001)跨端口转发, Origin/Host 端口必然不同, 视为同源
const isLoopbackHost = (h) => /^(localhost|127\.\d{1,3}\.\d{1,3}\.\d{1,3}|\[::1\])(:\d+)?$/.test(h);

// 带 Origin/Referer 时其 host 必须与请求 Host 一致(或同为环回); 都不带(curl/同源导航)则放行
function isSameOrigin(req) {
  const host = req.headers.host;
  if (!host) return true;
  for (const h of [req.headers.origin, req.headers.referer]) {
    if (!h) continue;
    try {
      const oh = new URL(h).host;
      if (oh !== host && !(isLoopbackHost(oh) && isLoopbackHost(host))) return false;
    } catch {
      return false;
    }
  }
  return true;
}

// 全端点统一: 仅同源(或环回开发)浏览器请求反射 Origin, 跨源一律不下发 ACAO
function corsHeadersFor(req) {
  const origin = req.headers.origin;
  return { "Access-Control-Allow-Origin": origin && isSameOrigin(req) ? origin : null };
}

/* ---------------- 按客户端 IP 限流(CF Tunnel 后真实 IP 取 CF-Connecting-IP 头) ---------------- */
// 仅当连接来自可信代理(Cloudflare 边缘网段或本机环回)时采信代理头, 否则用 socket 地址,
// 防止绕过 Tunnel 直连时伪造 cf-connecting-ip/x-forwarded-for 刷穿限流
const CF_EDGE_RANGES = [
  "173.245.48.0/20", "103.21.244.0/22", "103.22.200.0/22", "103.31.4.0/22",
  "141.101.64.0/18", "108.162.192.0/18", "190.93.240.0/20", "188.114.96.0/20",
  "197.234.240.0/22", "198.41.128.0/17", "162.158.0.0/15", "104.16.0.0/13",
  "104.24.0.0/14", "172.64.0.0/13", "131.0.72.0/22",
];
function ipInRanges(ip, ranges) {
  if (!ip || ip.includes(":")) return false; // 仅支持 IPv4 网段匹配
  const n = (s) => s.split(".").reduce((a, b) => (a << 8) + +b, 0) >>> 0;
  const addr = n(ip);
  return ranges.some((r) => {
    const [base, bits] = r.split("/");
    const mask = bits === "0" ? 0 : (~0 << (32 - +bits)) >>> 0;
    return (addr & mask) === (n(base) & mask);
  });
}
function clientIp(req) {
  const peer = req.socket.remoteAddress || "unknown";
  const trusted = peer === "127.0.0.1" || peer === "::1" || peer === "::ffff:127.0.0.1" || ipInRanges(peer, CF_EDGE_RANGES);
  if (trusted) {
    const cf = req.headers["cf-connecting-ip"];
    if (typeof cf === "string" && cf.trim()) return cf.trim();
    const xff = req.headers["x-forwarded-for"];
    if (typeof xff === "string" && xff.trim()) return xff.split(",")[0].trim();
  }
  return peer;
}

// 滑动窗口计数器: 记录最近 windowMs 内的请求时间戳, 超 max 返回 false。
// 相比固定窗口(首请求起计), 滑动窗口在连续轮询场景下更公平, 不会因窗口边界触发误限。
function makeLimiter(windowMs, max) {
  const hits = new Map(); // ip -> number[] (请求时间戳)
  const sweeper = setInterval(() => {
    const cutoff = Date.now() - windowMs;
    for (const [ip, ts] of hits) {
      const idx = ts.findIndex((t) => t >= cutoff);
      if (idx > 0) hits.set(ip, ts.slice(idx));
      else if (idx === -1) hits.delete(ip);
    }
  }, Math.min(windowMs, 30000));
  sweeper.unref();
  return (ip) => {
    const now = Date.now();
    const cutoff = now - windowMs;
    let ts = hits.get(ip);
    if (!ts) { hits.set(ip, [now]); return true; }
    // 剔除过期时间戳
    const idx = ts.findIndex((t) => t >= cutoff);
    if (idx > 0) ts = ts.slice(idx);
    else if (idx === -1) { hits.set(ip, [now]); return true; }
    ts.push(now);
    hits.set(ip, ts);
    return ts.length <= max;
  };
}

// 公开 /api: 每 IP 每分钟 2400 次(40/s)。单个客户端轮询 ~0.5 req/s, 40/s 覆盖 ~80 个用户共享的
// 办公室 NAT 出口 IP; 上游安全由 TTL 缓存 + 失败退避保证, 限流只兜恶意突发
const apiLimiter = makeLimiter(60 * 1000, 2400);
const protectedLimiter = makeLimiter(60 * 1000, 30); // 私有 key 端点: 每 IP 每分钟 30 次, 防脚本刷配额

// 读取 POST body, 超过 limit 字节即停止累积({ tooBig: true }), 防止无限读入
function readBodyWithLimit(req, limit) {
  return new Promise((resolve) => {
    const chunks = [];
    let size = 0;
    let settled = false;
    const done = (r) => { if (!settled) { settled = true; resolve(r); } };
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > limit) {
        req.removeAllListeners("data");
        req.resume(); // 排空剩余数据, 避免背压卡死连接
        done({ tooBig: true });
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => done({ buf: Buffer.concat(chunks) }));
    req.on("error", () => done({ buf: Buffer.concat(chunks) }));
    req.on("close", () => done({ buf: Buffer.concat(chunks) })); // 客户端中途断连兜底, 防止悬挂
  });
}

const server = http.createServer(async (req, res) => {
  try {
    const u = new URL(req.url, "http://localhost");
    // ---- 手速排行榜旧路径重定向(0819-i): knock 已迁独立进程(hermes.cc.cd/api/v1/knock, :3032)。
    // mrd 旧路径 /api/v1/knock/* 一律 302 到新域, 保留剩余路径与 query 参数; 旧版 mylauncher
    // 升级前排行榜不中断(客户端默认跟随重定向)。GET/HEAD 用 302; POST 用 307(保留方法与 body,
    // 旧版 submit 不被 302 转 GET 丢体)。放在请求处理最前, 先于一切路由/预检分支。
    if (u.pathname.startsWith("/api/v1/knock/")) {
      const rest = u.pathname.slice("/api/v1/knock".length) || "/";
      const loc = "https://hermes.cc.cd/api/v1/knock" + rest + (u.search || "");
      res.writeHead(req.method === "POST" ? 307 : 302, {
        Location: loc,
        "Cache-Control": "no-store",
        ...STATIC_HEADERS,
      });
      return res.end();
    }
    if (routes[u.pathname]) {
      stats.reqs++;
      const ip = clientIp(req);
      trackActiveIp(ip);
      const cors = corsHeadersFor(req);
      // 按 IP 限流(先于缓存命中判断, 防唯一 key 旋转造成的上游请求放大)
      const allowed = (PROTECTED_ROUTES.has(u.pathname) ? protectedLimiter : apiLimiter)(clientIp(req));
      if (!allowed) {
        stats.blocked++;
        send(res, 429, { ok: false, error: "too many requests" }, cors);
        return;
      }
      // 私有 API key 端点: 跨源请求直接拒绝, 防止被刷配额
      if (PROTECTED_ROUTES.has(u.pathname) && !isSameOrigin(req)) {
        send(res, 403, { ok: false, error: "forbidden" }, cors);
        return;
      }
      // 用户输入参数长度上限(缓存 key 由参数拼接, 防止无界增长)
      for (const v of u.searchParams.values()) {
        if (v.length > 2000) {
          send(res, 400, { ok: false, error: "param too long" }, cors);
          return;
        }
      }
      try {
        let body;
        if (req.method === "POST") {
          const r = await readBodyWithLimit(req, 256 * 1024);
          if (r.tooBig) {
            res.on("finish", () => req.destroy()); // 响应送达后再回收连接
            send(res, 413, { ok: false, error: "payload too large" }, cors);
            return;
          }
          try { body = JSON.parse(r.buf.toString()); } catch { send(res, 400, { ok: false, error: "invalid json body" }, cors); return; }
        }
        const data = await routes[u.pathname](u.searchParams, body, req, res);
        // MCP handler 已直接写响应（返回 sentinel），不再包装
        if (data === "MRD_MCP_HANDLED") return;
        // __fresh 约定(四类资金流接口): 路由用 freshness() 包出 { data, meta }, 信封多带
        // stale/asof/source(/partial) 增量字段; data 本身形态与改造前一致
        if (data && data.__fresh) {
          send(res, 200, { ok: true, data: data.__fresh.data, ts: Date.now(), ...data.__fresh.meta }, cors);
        } else if (data && data.__rawResponse !== undefined) {
          // __rawResponse 约定(排行榜 0818): 契约要求裸 JSON 响应体(如 /api/v1/knock 的
          // {"leaderboard":...}), handler 返回 {__rawResponse: <payload>} 时原样输出, 不套 ok/data 包装。
          send(res, 200, data.__rawResponse, cors);
        } else {
          send(res, 200, { ok: true, data, ts: Date.now() }, cors);
        }
      } catch (e) {
        // 错误回显契约: 内部细节只记日志; err.status 由可预期的业务错误(队列满/问财配额等)携带,
        // 其 message 必须为白名单文案(不含 URL/网络细节); 无 status 一律回显静态 "upstream error"
        console.error("[api]", u.pathname, e?.stack || e?.message || e);
        send(res, e?.status || 502, { ok: false, error: e?.status ? e.message : "upstream error" }, cors);
      }
      return;
    }
    // /api/ 下未命中的路由返回 404 JSON, 不走 SPA fallback
    if (u.pathname.startsWith("/api/")) {
      send(res, 404, { ok: false, error: "not found" });
      return;
    }
    // ---- /company/* 公司站 HTML 副本清理(单一事实源 = www.hermes.cc.cd)----
    // Gavin 拍板: mrd 域 /company/ 不再 serve 公司站 HTML, 一律 301 到官网对应路径(保 SEO/书签跳转)。
    // 映射: /company/ → https://www.hermes.cc.cd/ 、 /company/opc/ → https://www.hermes.cc.cd/opc/ 、
    //       /company/blog/ → https://www.hermes.cc.cd/blog/ (去掉 /company 前缀, index.html 归一为目录)。
    // 历史遗留: /company/opc/status.json 静态服务保留 —— P0-1 已停更、无读者(前端全切 www 域), 勿写新数据;
    //           删除需另行评估(check_product_boundary 白名单依赖)。继续走下方静态服务(CORS + CF 短缓存)。
    if (req.method === "GET" || req.method === "HEAD") {
      if (u.pathname === "/company" || u.pathname.startsWith("/company/")) {
        if (u.pathname !== "/company/opc/status.json") {
          let rest = u.pathname === "/company" ? "" : u.pathname.slice("/company".length);
          if (!rest.startsWith("/")) rest = "/" + rest;
          if (rest.endsWith("/index.html")) rest = rest.slice(0, -"index.html".length);
          if (rest === "/") rest = ""; // 根路径不带尾斜杠, www Pages 能处理
          const loc = "https://www.hermes.cc.cd" + rest + (u.search || "");
          res.writeHead(301, {
            Location: loc,
            "Cache-Control": "public, max-age=3600",
            ...STATIC_HEADERS,
          });
          return res.end();
        }
      }
    }
    // 静态资源 + SPA fallback
    let p = decodeURIComponent(u.pathname);
    if (p === "/" || p.endsWith("/")) p += "index.html";
    const file = path.join(DIST, path.normalize(p));
    if (file !== DIST && !file.startsWith(DIST + path.sep)) {
      send(res, 403, { ok: false });
      return;
    }
    fs.readFile(file, (err, buf) => {
      if (err) {
        // 带扩展名的资源未命中: 直接 404, 不回退 index.html(避免 200+HTML 伪装成 JS/CSS)
        if (path.extname(file)) return send(res, 404, { ok: false, error: "not found" });
        // 目录路径(如 /company 不带尾斜杠): 先试目录内 index.html, 再 SPA fallback
        fs.readFile(path.join(file, "index.html"), (e3, dirHtml) => {
          if (!e3) {
            const h = {
              "Content-Type": "text/html; charset=utf-8",
              ...STATIC_HEADERS,
            };
            h["Content-Security-Policy"] = u.pathname.startsWith("/company") ? COMPANY_CSP : CSP;
            res.writeHead(200, h);
            return res.end(dirHtml);
          }
          fs.readFile(path.join(DIST, "index.html"), (e2, html) => {
            if (e2) return send(res, 404, { ok: false });
            res.writeHead(200, {
              "Content-Type": "text/html; charset=utf-8",
              "Content-Security-Policy": CSP,
              ...STATIC_HEADERS,
            });
            res.end(html);
          });
        });
        return;
      }
      const headers = {
        "Content-Type": MIME[path.extname(file).toLowerCase()] || "application/octet-stream",
        "Cache-Control": file.includes("/assets/") ? "public, max-age=31536000, immutable" : "no-cache",
        ...STATIC_HEADERS,
      };
      if (file.endsWith(".html")) headers["Content-Security-Policy"] = u.pathname.startsWith("/company") ? COMPANY_CSP : CSP;
      // OPC 透明办公室数据跨域读: 仅 www.hermes.cc.cd(Pages 独立站)可读
      if (u.pathname === "/company/opc/status.json") {
        headers["Access-Control-Allow-Origin"] = "https://www.hermes.cc.cd";
        headers["Vary"] = "Origin";
        // 13a 安全加固: CF 边缘短缓存 10s 吸收前端 10s 轮询刷新量(回源率降 ~90%);
        // 浏览器侧同样 10s(2 分钟级数据, 10s 旧无感); s-maxage 对共享缓存生效
        headers["Cache-Control"] = "public, max-age=10, s-maxage=10";
      }
      res.writeHead(200, headers);
      res.end(buf);
    });
  } catch (e) {
    console.error("[server] error:", e?.message || e);
    send(res, 500, { ok: false, error: "internal error" });
  }
});

server.listen(PORT, () => console.log(`[market-cockpit] listening on :${PORT}`));

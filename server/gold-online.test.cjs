"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");
const createGold = require("./sources/gold.cjs");
const createGoldOnline = require("./sources/gold-online.cjs");
const createLastGood = require("./lib/last-good.cjs");

const NOW = Date.parse("2026-11-26T02:00:00Z");
const silentLogger = { warn() {} };
const NOMINAL_HEADER = "Date,1 Mo,3 Mo,6 Mo,1 Yr,2 Yr,3 Yr,5 Yr,7 Yr,10 Yr,20 Yr,30 Yr";
const REAL_HEADER = "Date,5 YR,7 YR,10 YR,20 YR,30 YR";
const nominalRow = (date, ten, five = 4) => `${date},3.7,3.75,3.8,3.85,3.9,3.95,${five},4.1,${ten},4.9,5`;
const realRow = (date, ten = 1.8) => `${date},1.5,1.6,${ten},2.1,2.2`;

function sandbox(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "gold-online-test-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return {
    root, dataDir: path.join(root, "data"), dbPath: path.join(root, "db", "gold.db"),
    lastGood: createLastGood({ fs, path, dir: path.join(root, "last-good") }),
  };
}

function defaultFetch(overrides = {}) {
  return async (rawUrl) => {
    const url = new URL(rawUrl);
    const route = `${url.hostname}${url.pathname}`;
    if (overrides[route]) {
      const value = typeof overrides[route] === "function" ? overrides[route](url) : overrides[route];
      if (value instanceof Error) throw value;
      return value;
    }
    if (route === "xaus.com/api/v1/spot") return JSON.stringify({
      spot_usd_oz: 4000, xau: { price: 28800, currency: "CNY", unit: "troy_oz" },
      price_as_of: "2026-11-26T01:59:00Z", data_state: { status: "fresh", as_of: "2026-11-26T01:59:00Z" }, stale: false,
    });
    if (route === "xaus.com/api/v1/reserves") return JSON.stringify({
      updated: "2026-11-09", data_state: { status: "stale" }, reserves: [
        { iso: "us", country: "United States", institution: "Federal Reserve", t: 8133.53, prev: 8133.53, ref: "Sep 2026", rank: 1 },
        { iso: "cn", country: "China", institution: "People's Bank of China", t: 2300, prev: 2297.5, ref: "Oct 2026", rank: 5 },
        { iso: "xx", country: "Institution total", institution: "IMF", t: 9999, prev: 9999, ref: "Sep 2026", rank: 99, isInstitution: true },
      ],
    });
    if (route === "xaus.com/api/v1/intraday") return JSON.stringify({
      data_state: { status: "fresh", as_of: "2026-11-26T01:59:00Z" },
      points: [{ t: NOW / 1000 - 3600, p: 3990 }, { t: NOW / 1000, p: 4000 }],
    });
    if (route === "xaus.com/api/v1/history") return JSON.stringify({
      data_state: { status: "fresh", as_of: "2026-11-26T00:00:00Z" },
      points: [{ d: "2026-11-24", c: 3970 }, { d: "2026-11-25", c: 3980 }, { d: "2026-11-26", c: 3985 }],
    });
    if (route === "home.treasury.gov/resource-center/data-chart-center/interest-rates/daily-treasury-rates.csv/2026/all") {
      return url.searchParams.get("type") === "daily_treasury_real_yield_curve"
        ? `${REAL_HEADER}\n${realRow("11/25/2026")}\n${realRow("11/24/2026", 1.7)}`
        : `${NOMINAL_HEADER}\n${nominalRow("11/25/2026", 4.5)}\n${nominalRow("11/24/2026", 4.4)}`;
    }
    if (route === "fred.stlouisfed.org/graph/fredgraph.csv") {
      const id = url.searchParams.get("id");
      if (id === "DFF") return "observation_date,DFF\n2026-11-24,3.88\n2026-11-25,.\n";
      if (id === "CPIAUCSL") return "observation_date,CPIAUCSL_PC1\n2026-09-01,3.71725\n2026-10-01,\n";
      if (id === "CPILFESL") return "observation_date,CPILFESL_PC1\n2026-09-01,2.56584\n2026-10-01,.\n";
    }
    if (route === "news.google.com/rss/search") return `<?xml version="1.0"?><rss><channel><item>
      <title>Gold &amp; silver outlook &#x2014; Reuters</title>
      <link>https://news.example/story?id=7&amp;lang=en</link>
      <source url="https://www.reuters.com">Reuters</source><pubDate>Wed, 25 Nov 2026 12:00:00 GMT</pubDate>
      </item></channel></rss>`;
    throw new Error(`unexpected fixture url: ${rawUrl}`);
  };
}

function createSource(box, fetchTextAny = defaultFetch()) {
  const online = createGoldOnline({ fetchTextAny, now: () => NOW });
  return createGold({
    fs, path, online, lastGood: box.lastGood,
    env: { GOLD_DATA_DIR: box.dataDir, GOLD_CB_DB_PATH: box.dbPath }, logger: silentLogger,
  });
}

function writeLocalAssets(box) {
  fs.mkdirSync(box.dataDir, { recursive: true });
  const stamp = (offset) => {
    const d = new Date(Date.now() + offset), p = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
  };
  for (const [offset, price] of [[-3600e3, 3990], [0, 4000]]) {
    fs.writeFileSync(path.join(box.dataDir, `gold_data_${stamp(offset)}.json`), JSON.stringify({
      gold_price: { prices: { USD: { price }, CNY: { price: price * 7.2 } }, intraday: {} },
      live_treasury_yields: { date: "2026-11-25", yields: { "10Y": 4.4 } },
    }));
  }
  fs.mkdirSync(path.dirname(box.dbPath), { recursive: true });
  const db = new DatabaseSync(box.dbPath);
  db.exec(`CREATE TABLE cb_transactions (country TEXT, transaction_date TEXT, change_tonnes REAL, notes TEXT);
    CREATE TABLE gold_reserves (country TEXT, date TEXT, reserves_tonnes REAL);
    INSERT INTO cb_transactions VALUES ('中国', '2026-10', 2.5, 'fixture');
    INSERT INTO gold_reserves VALUES ('中国', '2026-10', 2300);`);
  db.close();
}

test("本地资产缺失时，在线真实源恢复全部面板并保留 stale、空值与 RSS 语义", async (t) => {
  const box = sandbox(t);
  const { handleGold, handleGoldHistory } = createSource(box);
  const summary = await handleGold();
  assert.equal(summary.source, "online");
  assert.equal(summary.gold.usd, 4000);
  assert.equal(summary.gold.cnyPerG, 28800 / 31.1034768);
  assert.equal(summary.treasury.yields["10Y"], 4.5);
  assert.equal(summary.real_curve.breakeven_rates["10"], 2.7);
  assert.equal(summary.inflation.headlines.CPI.yoy_pct, 3.71725);
  assert.equal(summary.inflation.headlines.CPI.date, "2026-09-01", "空白十月不得前向填充");
  assert.equal(summary.fed.effectiveRate, 3.88);
  assert.equal(summary.news[0].title, "Gold & silver outlook — Reuters");
  assert.equal(summary.news[0].url, "https://news.example/story?id=7&lang=en");
  assert.equal(summary.central_bank.top10.length, 2, "机构汇总不得进入国家 TOP10");
  assert.equal(summary.central_bank.transactions[0].tonnes, 2.5);
  assert.equal(summary.central_bank.transactions[0].ym, "2026-10");
  assert.equal(summary.sources.centralBank.status, "stale");
  assert.equal(summary.sources.centralBank.reason, "UPSTREAM_STALE");
  assert.equal(summary.stale, true);

  const history = await handleGoldHistory("7");
  assert.equal(history.status, "ok");
  assert.equal(history.source, "xaus");
  assert.equal(history.count, 5);
  assert.equal(history.points.at(-1).p, 4000);
});

test("本地监控、央行与历史均有效时，在线回退调用次数为零", async (t) => {
  const box = sandbox(t);
  writeLocalAssets(box);
  const calls = { monitor: 0, centralBank: 0, history: 0 };
  const online = {
    fetchMonitor: async () => { calls.monitor++; throw new Error("must not call"); },
    fetchCentralBank: async () => { calls.centralBank++; throw new Error("must not call"); },
    fetchHistory: async () => { calls.history++; throw new Error("must not call"); },
  };
  const { handleGold, handleGoldHistory } = createGold({
    fs, path, online, lastGood: box.lastGood,
    env: { GOLD_DATA_DIR: box.dataDir, GOLD_CB_DB_PATH: box.dbPath }, logger: silentLogger,
  });
  const summary = await handleGold();
  const history = await handleGoldHistory("7");
  assert.equal(summary.status, "ok");
  assert.equal(summary.gold.usd, 4000);
  assert.equal(history.count, 2);
  assert.deepEqual(calls, { monitor: 0, centralBank: 0, history: 0 });
});

test("盈亏平衡使用同日期同期限名义与实际收益率，不跨日期拼接", async (t) => {
  const box = sandbox(t);
  const route = "home.treasury.gov/resource-center/data-chart-center/interest-rates/daily-treasury-rates.csv/2026/all";
  const fetchTextAny = defaultFetch({
    [route]: (url) => url.searchParams.get("type") === "daily_treasury_real_yield_curve"
      ? `${REAL_HEADER}\n${realRow("11/24/2026", 1.8)}\n${realRow("11/23/2026", 1.6)}`
      : `${NOMINAL_HEADER}\n${nominalRow("11/25/2026", 4.5)}\n${nominalRow("11/24/2026", 4.4)}`,
  });
  const { handleGold } = createSource(box, fetchTextAny);
  const summary = await handleGold();
  assert.equal(summary.treasury.date, "2026-11-25");
  assert.equal(summary.real_curve.date, "2026-11-24");
  assert.equal(summary.real_curve.breakeven_rates["10"], 2.6);
  assert.equal(summary.inflation.breakeven_inflation["10Y"], 2.6);
});

test("新闻故障被隔离，现货和宏观面板仍返回并标 partial", async (t) => {
  const box = sandbox(t);
  const fetchTextAny = defaultFetch({ "news.google.com/rss/search": new Error("rss down") });
  const { handleGold } = createSource(box, fetchTextAny);
  const summary = await handleGold();
  assert.equal(summary.gold.usd, 4000);
  assert.equal(summary.fed.effectiveRate, 3.88);
  assert.deepEqual(summary.news, []);
  assert.equal(summary.sources.monitor.status, "partial");
  assert.equal(summary.sources.monitor.reason, "ONLINE_NEWS_UNAVAILABLE");
});

test("CNBC 新闻过滤旧闻和无关条目，并保留真实发布日期", async (t) => {
  const box = sandbox(t);
  const rss = `<?xml version="1.0"?><rss><channel>
    <item><title>Fed inflation outlook lifts gold</title><link>https://cnbc.example/fed-gold</link><pubDate>Wed, 25 Nov 2026 12:00:00 GMT</pubDate></item>
    <item><title>Old gold story</title><link>https://cnbc.example/old-gold</link><pubDate>Thu, 18 Oct 2018 09:54:59 GMT</pubDate></item>
    <item><title>OpenAI chip update</title><link>https://cnbc.example/openai</link><pubDate>Wed, 25 Nov 2026 12:00:00 GMT</pubDate></item>
    </channel></rss>`;
  const fetchTextAny = defaultFetch({ "www.cnbc.com/id/10000664/device/rss/rss.html": rss });
  const { handleGold } = createSource(box, fetchTextAny);
  const summary = await handleGold();
  assert.equal(summary.news.length, 1);
  assert.equal(summary.news[0].title, "Fed inflation outlook lifts gold");
  assert.equal(summary.news[0].publishedAt, "2026-11-25T12:00:00.000Z");
  assert.equal(summary.providers.news, "CNBC（黄金/宏观筛选）");
});

test("历史上游从成功转为故障时，返回独立在线 last-good 快照", async (t) => {
  const box = sandbox(t);
  let offline = false;
  const fetchTextAny = defaultFetch({
    "xaus.com/api/v1/intraday": () => {
      if (offline) throw new Error("intraday down");
      return JSON.stringify({ data_state: { status: "fresh" }, points: [{ t: NOW / 1000 - 60, p: 3999 }, { t: NOW / 1000, p: 4000 }] });
    },
  });
  const { handleGoldHistory } = createSource(box, fetchTextAny);
  const fresh = await handleGoldHistory("1");
  assert.equal(fresh.status, "ok");
  assert.equal(fresh.points.length, 2);
  assert.equal(fresh.stale, false);
  offline = true;
  const degraded = await handleGoldHistory("1");
  assert.deepEqual(degraded.points, fresh.points);
  assert.equal(degraded.stale, true, JSON.stringify(degraded));
  assert.equal(degraded.reason, "ONLINE_HISTORY_UNAVAILABLE");
  assert.equal(degraded.__ttl, 15000);
});

test("XAUS 现货失败时使用独立 Gold API，且不伪造 CNY 换算", async (t) => {
  const box = sandbox(t);
  const fetchTextAny = defaultFetch({
    "xaus.com/api/v1/spot": new Error("xaus down"),
    "api.gold-api.com/price/XAU": JSON.stringify({ price: 4012.5, updatedAt: "2026-11-26T01:58:00Z" }),
  });
  const { handleGold } = createSource(box, fetchTextAny);
  const summary = await handleGold();
  assert.equal(summary.gold.usd, 4012.5);
  assert.equal(summary.gold.cny, null);
  assert.equal(summary.providers.gold, "Gold API");
});

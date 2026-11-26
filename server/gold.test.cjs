"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");
const createGold = require("./sources/gold.cjs");
const createLastGood = require("./lib/last-good.cjs");

const silentLogger = { warn() {} };

function sandbox(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "gold-source-test-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return {
    root,
    dataDir: path.join(root, "data"),
    dbPath: path.join(root, "db", "gold_reserves.db"),
    lastGood: createLastGood({ fs, path, dir: path.join(root, "last-good") }),
  };
}

function source(box, fsImpl = fs) {
  return createGold({
    fs: fsImpl,
    path,
    lastGood: box.lastGood,
    env: { GOLD_DATA_DIR: box.dataDir, GOLD_CB_DB_PATH: box.dbPath },
    logger: silentLogger,
  });
}

function fileStamp(offsetMs = 0) {
  const d = new Date(Date.now() + offsetMs);
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

function monitorFixture(price) {
  return {
    fetched_at: "2026-11-25T12:00:00+08:00",
    gold_price: {
      prices: {
        USD: { price, timestamp: "2026-11-25T11:59:00+08:00" },
        CNY: { price: price * 7.2, timestamp: "2026-11-25T11:59:00+08:00" },
      },
      intraday: { change_pct: 0.5 },
    },
    live_treasury_yields: { date: "2026-11-25", yields: { "10Y": "4.25" } },
    real_yield_curve: { real_rates: { "10": 1.8, "3": -126 } },
    cpi_inflation: {},
    live_fed_rate: {},
    recent_news: { news: [{ title: "Gold", url: "https://example.test", source: "fixture" }] },
  };
}

function writeMonitor(box, price, offsetMs = 0) {
  fs.mkdirSync(box.dataDir, { recursive: true });
  const file = path.join(box.dataDir, `gold_data_${fileStamp(offsetMs)}.json`);
  fs.writeFileSync(file, JSON.stringify(monitorFixture(price)));
  return file;
}

function createCbFixture(box) {
  fs.mkdirSync(path.dirname(box.dbPath), { recursive: true });
  const db = new DatabaseSync(box.dbPath);
  db.exec(`
    CREATE TABLE cb_transactions (country TEXT, transaction_date TEXT, change_tonnes REAL, notes TEXT);
    CREATE TABLE gold_reserves (country TEXT, date TEXT, reserves_tonnes REAL);
    INSERT INTO cb_transactions VALUES ('中国', '2026-10', 2.5, 'fixture');
    INSERT INTO gold_reserves VALUES ('中国', '2026-10', 2300);
  `);
  db.close();
}

test("目录和数据库均缺失 → 明确 unavailable + 来源原因码，不伪装正常空数据", async (t) => {
  const box = sandbox(t);
  const { handleGold, handleGoldHistory } = source(box);
  const summary = await handleGold();
  assert.equal(summary.status, "unavailable");
  assert.equal(summary.reason, "DATA_DIR_NOT_FOUND");
  assert.equal(summary.stale, false);
  assert.deepEqual(summary.sources.monitor, { status: "unavailable", reason: "DATA_DIR_NOT_FOUND", asof: null });
  assert.deepEqual(summary.sources.centralBank, { status: "unavailable", reason: "DB_NOT_FOUND", asof: null });
  assert.equal(summary.gold, null);

  const history = await handleGoldHistory("7");
  assert.equal(history.status, "unavailable");
  assert.equal(history.reason, "DATA_DIR_NOT_FOUND");
  assert.equal(history.points.length, 0);
});

test("监控文件有效但央行库缺失 → partial，金价与宏观数据仍正常返回", async (t) => {
  const box = sandbox(t);
  writeMonitor(box, 4100);
  const { handleGold } = source(box);
  const summary = await handleGold();
  assert.equal(summary.status, "partial");
  assert.equal(summary.gold.usd, 4100);
  assert.equal(summary.treasury.yields["10Y"], 4.25);
  assert.equal(summary.real_curve.real_rates["3"], undefined, "脏实际利率仍应过滤");
  assert.equal(summary.sources.monitor.status, "ok");
  assert.equal(summary.sources.centralBank.reason, "DB_NOT_FOUND");
});

test("监控管道缺失不阻断央行独立数据源", async (t) => {
  const box = sandbox(t);
  createCbFixture(box);
  const { handleGold } = source(box);
  const summary = await handleGold();
  assert.equal(summary.status, "partial");
  assert.equal(summary.sources.monitor.status, "unavailable");
  assert.equal(summary.sources.centralBank.status, "ok");
  assert.equal(summary.central_bank.transactions.length, 1);
  assert.equal(summary.central_bank.top10[0].country, "中国");
});

test("最新文件损坏及目录随后消失 → 分别回退监控与历史快照并标 stale", async (t) => {
  const box = sandbox(t);
  writeMonitor(box, 4000, -3600e3);
  const latest = writeMonitor(box, 4200);
  const { handleGold, handleGoldHistory } = source(box);

  const fresh = await handleGold();
  assert.equal(fresh.gold.usd, 4200);
  const freshHistory = await handleGoldHistory("7");
  assert.equal(freshHistory.status, "ok");
  assert.equal(freshHistory.points.length, 2);

  fs.writeFileSync(latest, "{bad json");
  const degraded = await handleGold();
  assert.equal(degraded.gold.usd, 4200);
  assert.equal(degraded.stale, true);
  assert.equal(degraded.reason, "DATA_FILE_INVALID");
  assert.equal(degraded.sources.monitor.status, "stale");
  assert.equal(degraded.__ttl, 15000);

  fs.rmSync(box.dataDir, { recursive: true });
  const history = await handleGoldHistory("7");
  assert.equal(history.stale, true);
  assert.equal(history.reason, "DATA_DIR_NOT_FOUND");
  assert.equal(history.points.length, 2);
  assert.equal(history.__ttl, 15000);
});

test("目录可读但所选窗口无点 → empty，而非来源故障或旧快照", async (t) => {
  const box = sandbox(t);
  writeMonitor(box, 4000, -8 * 24 * 3600e3);
  const { handleGoldHistory } = source(box);
  const history = await handleGoldHistory("7");
  assert.equal(history.status, "empty");
  assert.equal(history.reason, "HISTORY_WINDOW_EMPTY");
  assert.equal(history.stale, false);
  assert.equal(history.count, 0);
});


test("历史接口先按文件名日期筛选，窗口外文件不发起读取", async (t) => {
  const box = sandbox(t);
  writeMonitor(box, 3900, -9 * 24 * 3600e3);
  writeMonitor(box, 3950, -8 * 24 * 3600e3);
  writeMonitor(box, 4000, -3600e3);
  writeMonitor(box, 4100);

  let reads = 0;
  const fsSpy = {
    ...fs,
    promises: {
      ...fs.promises,
      readFile: async (...args) => {
        reads += 1;
        return fs.promises.readFile(...args);
      },
    },
  };
  const { handleGoldHistory } = source(box, fsSpy);
  const history = await handleGoldHistory("7");
  assert.equal(history.status, "ok");
  assert.equal(history.count, 2);
  assert.equal(history.points.at(-1).p, 4100);
  assert.equal(reads, 2, "两个窗口外文件应被文件名日期预筛选排除");
});

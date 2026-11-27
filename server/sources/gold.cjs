// mrd 黄金观察 /gold · 数据源 = 读 gold-monitor 产物文件 + central-bank-gold SQLite(只读)
// 配置: GOLD_DATA_DIR / GOLD_CB_DB_PATH；缺省值兼容原 Linux 部署。
// 原则: 不修改数据资产；缺失/损坏必须返回明确原因，绝不用空数组冒充正常空数据。
"use strict";

const { DatabaseSync } = require("node:sqlite");

const DEFAULT_GOLD_DATA_DIR = "/home/gavin/hermes_space/gold-monitor/data";
const DEFAULT_CB_DB_PATH = "/home/gavin/hermes_space/central-bank-gold/db/gold_reserves.db";
// 盎司 → 克: 1 金衡盎司 = 31.1034768 克
const OZ_TO_G = 31.1034768;
const EMPTY_CB = { transactions: [], top10: [] };
const sourceState = (status, reason = null, asof = null) => ({ status, reason, asof });

module.exports = (ctx) => {
  const { fs, path, lastGood = null, online = null, env = process.env, logger = console } = ctx;
  const GOLD_DATA_DIR = env.GOLD_DATA_DIR || DEFAULT_GOLD_DATA_DIR;
  const CB_DB_PATH = env.GOLD_CB_DB_PATH || DEFAULT_CB_DB_PATH;
  const loadSnapshot = (key) => lastGood ? lastGood.read(key) : null;
  const saveSnapshot = (key, data) => { if (lastGood) lastGood.write(key, data); };

  // 启动即报告依赖缺失；黄金是可选页面，不阻断其他驾驶舱接口。
  if (!fs.existsSync(GOLD_DATA_DIR)) logger.warn(`[gold] GOLD_DATA_DIR 不存在: ${GOLD_DATA_DIR}`);
  if (!fs.existsSync(CB_DB_PATH)) logger.warn(`[gold] GOLD_CB_DB_PATH 不存在: ${CB_DB_PATH}`);

  /* ---------------- 文件层 ---------------- */

  /** 最新一份 gold_data_*.json；所有失败都带稳定原因码，不把异常吞成 null。 */
  function latestGoldFile() {
    if (!fs.existsSync(GOLD_DATA_DIR)) return { file: null, reason: "DATA_DIR_NOT_FOUND" };
    let names;
    try { names = fs.readdirSync(GOLD_DATA_DIR); } catch { return { file: null, reason: "DATA_DIR_UNREADABLE" }; }
    const golds = names
      .filter((n) => /^gold_data_\d{8}_\d{6}\.json$/.test(n))
      .map((n) => ({ n, p: path.join(GOLD_DATA_DIR, n) }))
      .sort((a, b) => {
        try { return fs.statSync(b.p).mtimeMs - fs.statSync(a.p).mtimeMs; } catch { return 0; }
      });
    return golds.length
      ? { file: golds[0].p, reason: null }
      : { file: null, reason: "DATA_FILE_NOT_FOUND" };
  }

  function readGoldJson(file) {
    try { return { data: JSON.parse(fs.readFileSync(file, "utf8")), reason: null }; }
    catch { return { data: null, reason: "DATA_FILE_INVALID" }; }
  }

  /** 文件名 gold_data_20260820_174713.json → Date（本地时区；失败回退 mtime） */
  function fileTimeFromName(file) {
    const m = path.basename(file).match(/^gold_data_(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})\.json$/);
    if (!m) return null;
    const d = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  function fileTime(file) {
    const parsed = fileTimeFromName(file);
    if (parsed) return parsed;
    try { return new Date(fs.statSync(file).mtimeMs); } catch { return new Date(0); }
  }

  /* ---------------- SQLite 层（node:sqlite 内置, 只读） ---------------- */

  /** 央行购金动态: 同月同国去重，排除全球汇总及绝对值 >=20 吨的脏数据。 */
  function cbTransactions(db) {
    const rows = db.prepare(`
      SELECT country, transaction_date AS ym, change_tonnes AS tonnes, notes
      FROM cb_transactions
      WHERE ABS(change_tonnes) < 20
        AND country NOT LIKE '%全球%'
      ORDER BY transaction_date DESC, change_tonnes DESC
    `).all();
    const seen = new Set();
    const out = [];
    for (const r of rows) {
      if (!r.ym) continue;
      const key = `${r.ym.slice(0, 7)}|${r.country}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ country: r.country, ym: r.ym.slice(0, 7), tonnes: r.tonnes, notes: r.notes || "" });
      if (out.length >= 15) break;
    }
    return out;
  }

  /** 央行储备 TOP10: 每个国家取最新日期快照。 */
  function cbReservesTop(db) {
    const rows = db.prepare(`
      SELECT r.country, r.date, r.reserves_tonnes AS tonnes
      FROM gold_reserves r
      JOIN (SELECT country, MAX(date) AS md FROM gold_reserves GROUP BY country) t
        ON r.country = t.country AND r.date = t.md
      ORDER BY r.reserves_tonnes DESC
      LIMIT 10
    `).all();
    return rows.map((r) => ({ country: r.country, date: r.date, tonnes: r.tonnes }));
  }

  function readCentralBank() {
    let reason = null;
    if (!fs.existsSync(CB_DB_PATH)) reason = "DB_NOT_FOUND";
    let db = null;
    if (!reason) {
      try {
        db = new DatabaseSync(CB_DB_PATH, { readOnly: true });
        const data = { transactions: cbTransactions(db), top10: cbReservesTop(db) };
        saveSnapshot("gold:central-bank", data);
        return { data, state: sourceState("ok", null, Date.now()) };
      } catch {
        reason = "DB_UNAVAILABLE";
      } finally {
        if (db) { try { db.close(); } catch {} }
      }
    }
    const snapshot = loadSnapshot("gold:central-bank");
    if (snapshot) return { data: snapshot.data, state: sourceState("stale", reason, snapshot.at) };
    return { data: { ...EMPTY_CB }, state: sourceState("unavailable", reason) };
  }

  /* ---------------- 换算与清洗 ---------------- */

  function convertPrices(prices) {
    const usdEntry = prices && prices.USD && typeof prices.USD.price === "number" ? prices.USD : null;
    const cnyEntry = prices && prices.CNY && typeof prices.CNY.price === "number" ? prices.CNY : null;
    if (!usdEntry && !cnyEntry) return null;
    const usd = usdEntry ? usdEntry.price : null;
    const cny = cnyEntry ? cnyEntry.price : null;
    let cnyPerG = null;
    let note = "";
    if (cny != null) {
      cnyPerG = cny / OZ_TO_G;
    } else if (usd != null) {
      note = "CNY 报价缺失，克价暂不可换算";
    }
    return {
      usd,
      cny,
      cnyPerG,
      ts: (usdEntry && usdEntry.timestamp) || (cnyEntry && cnyEntry.timestamp) || null,
      note,
    };
  }

  function yieldsToNum(yields) {
    const out = {};
    for (const [k, v] of Object.entries(yields || {})) {
      const n = Number(v);
      if (Number.isFinite(n) && n > 0 && n < 30) out[k] = n;
    }
    return out;
  }

  function cleanRealRates(rates) {
    const out = {};
    for (const [k, v] of Object.entries(rates || {})) {
      if (v == null) continue;
      const n = Number(v);
      if (Number.isFinite(n) && Math.abs(n) < 50) out[k] = n;
    }
    return out;
  }

  function emptyMonitor() {
    return {
      fetched_at: null,
      gold: null,
      treasury: null,
      real_curve: null,
      inflation: null,
      fed: null,
      news: [],
    };
  }

  function monitorPayload(d) {
    const price = convertPrices(d.gold_price && d.gold_price.prices);
    const intraday = (d.gold_price && d.gold_price.intraday) || {};
    const yields = yieldsToNum(d.live_treasury_yields && d.live_treasury_yields.yields);
    const ryc = d.real_yield_curve || {};
    const cpi = d.cpi_inflation || {};
    const fed = d.live_fed_rate || {};
    const newsRaw = (d.recent_news && d.recent_news.news) || [];
    return {
      fetched_at: d.fetched_at || null,
      gold: {
        usd: price ? price.usd : null,
        cny: price ? price.cny : null,
        cnyPerG: price ? price.cnyPerG : null,
        ts: price ? price.ts : null,
        note: price ? price.note : "",
        changePct: typeof intraday.change_pct === "number" ? intraday.change_pct : null,
        intradayNote: intraday.note || "",
      },
      treasury: {
        date: (d.live_treasury_yields && d.live_treasury_yields.date) || null,
        fetchedAt: (d.live_treasury_yields && d.live_treasury_yields.fetched_at) || null,
        yields,
      },
      real_curve: {
        date: ryc.date || null,
        nominal_rates: ryc.nominal_rates || null,
        breakeven_rates: ryc.breakeven_rates || null,
        real_rates: cleanRealRates(ryc.real_rates),
      },
      inflation: {
        headlines: cpi.headlines || null,
        breakeven_inflation: cpi.breakeven_inflation || null,
      },
      fed: {
        date: fed.date || null,
        effectiveRate: typeof fed.effective_rate === "number" ? fed.effective_rate : null,
        fetchedAt: fed.fetched_at || null,
      },
      news: newsRaw.slice(0, 8).map((n) => ({
        title: String(n.title || ""),
        url: String(n.url || ""),
        source: String(n.source || ""),
        publishedAt: n.publishedAt || n.pubDate || null,
      })),
    };
  }

  function readMonitor() {
    const latest = latestGoldFile();
    let reason = latest.reason;
    if (latest.file) {
      const parsed = readGoldJson(latest.file);
      reason = parsed.reason;
      if (parsed.data) {
        const data = monitorPayload(parsed.data);
        saveSnapshot("gold:monitor", data);
        return { data, state: sourceState("ok", null, Date.now()) };
      }
    }
    const snapshot = loadSnapshot("gold:monitor");
    if (snapshot) return { data: snapshot.data, state: sourceState("stale", reason, snapshot.at) };
    return { data: emptyMonitor(), state: sourceState("unavailable", reason) };
  }

  /* ---------------- 在线回退（仅在对应本地来源非 ok 时启用） ---------------- */

  function monitorValue(data, key) {
    if (!data) return false;
    if (key === "gold") return data.gold != null && (data.gold.usd != null || data.gold.cny != null);
    if (key === "treasury") return Object.keys(data.treasury?.yields || {}).length > 0;
    if (key === "real_curve") return Object.keys(data.real_curve?.real_rates || {}).length > 0 || Object.keys(data.real_curve?.breakeven_rates || {}).length > 0;
    if (key === "inflation") return data.inflation?.headlines != null || data.inflation?.breakeven_inflation != null;
    if (key === "fed") return data.fed?.effectiveRate != null;
    if (key === "news") return Array.isArray(data.news) && data.news.length > 0;
    return false;
  }

  function mergeMonitor(primary, fallback) {
    const data = { ...primary, fetched_at: primary.fetched_at || fallback?.fetched_at || null };
    let usedFallback = false;
    for (const key of ["gold", "treasury", "real_curve", "inflation", "fed", "news"]) {
      if (!monitorValue(primary, key) && monitorValue(fallback, key)) {
        data[key] = fallback[key];
        usedFallback = true;
      }
    }
    return { data, usedFallback };
  }

  async function resolveMonitor(local) {
    if (!online || local.state.status === "ok") return { ...local, provider: "gold-monitor", providers: {}, origin: "local" };
    const previous = loadSnapshot("gold:online-monitor");
    try {
      const result = await online.fetchMonitor();
      const merged = mergeMonitor(result.data, previous?.data?.data || local.data);
      const payload = { data: merged.data, providers: result.providers || {} };
      saveSnapshot("gold:online-monitor", payload);
      const stale = result.stale === true || merged.usedFallback;
      return {
        data: merged.data,
        state: sourceState(stale ? "stale" : result.errors?.length ? "partial" : "ok",
          result.stale ? "UPSTREAM_STALE" : merged.usedFallback ? "ONLINE_SNAPSHOT_PARTIAL" : result.errors?.[0] || null,
          Date.now()),
        provider: "在线数据源", providers: result.providers || {}, origin: "online",
      };
    } catch (e) {
      logger.warn("[gold] 在线聚合回退失败:", e?.message || e);
      if (previous) return {
        data: previous.data.data,
        state: sourceState("stale", "ONLINE_UNAVAILABLE", previous.at),
        provider: "在线缓存快照", providers: previous.data.providers || {}, origin: "online-snapshot",
      };
      return { ...local, provider: "gold-monitor", providers: {}, origin: "local" };
    }
  }

  async function resolveCentralBank(local) {
    if (!online || local.state.status === "ok") return { ...local, provider: "central-bank-gold", origin: "local" };
    const key = "gold:online-central-bank";
    try {
      const result = await online.fetchCentralBank();
      saveSnapshot(key, result);
      return {
        data: result.data,
        state: sourceState(result.stale ? "stale" : "ok", result.stale ? "UPSTREAM_STALE" : null,
          Date.parse(result.updated || "") || Date.now()),
        provider: result.provider || "XAUS", origin: "online",
      };
    } catch (e) {
      logger.warn("[gold] 在线央行储备回退失败:", e?.message || e);
      const snapshot = loadSnapshot(key);
      if (snapshot) return {
        data: snapshot.data.data,
        state: sourceState("stale", "ONLINE_UNAVAILABLE", snapshot.at),
        provider: snapshot.data.provider || "XAUS 缓存快照", origin: "online-snapshot",
      };
      return { ...local, provider: "central-bank-gold", origin: "local" };
    }
  }

  /* ---------------- 聚合 /api/gold ---------------- */

  async function handleGold() {
    // 两路独立回退，并允许彼此并行；单路故障不会拖垮另一面板组。
    const [monitor, centralBank] = await Promise.all([
      resolveMonitor(readMonitor()), resolveCentralBank(readCentralBank()),
    ]);
    const states = [monitor.state, centralBank.state];
    const unavailable = states.every((s) => s.status === "unavailable");
    const allFresh = states.every((s) => s.status === "ok");
    const stale = states.some((s) => s.status === "stale");
    const localOnly = monitor.origin === "local" && centralBank.origin === "local";
    return {
      __ttl: stale ? 15000 : 60000,
      ...monitor.data,
      central_bank: centralBank.data,
      source: localOnly ? "gold-monitor" : monitor.origin === "online" && centralBank.origin === "online" ? "online" : "hybrid",
      provider: [...new Set([...Object.values(monitor.providers || {}), centralBank.provider].filter(Boolean))].join(" · "),
      providers: { ...(monitor.providers || {}), centralBank: centralBank.provider },
      status: unavailable ? "unavailable" : allFresh ? "ok" : "partial",
      reason: monitor.state.reason || centralBank.state.reason,
      stale,
      asof: monitor.state.asof ?? centralBank.state.asof,
      sources: { monitor: monitor.state, centralBank: centralBank.state },
    };
  }

  /* ---------------- 历史序列 /api/gold/history?days=1|7|30 ---------------- */

  async function withOnlineHistory(days, localResult) {
    if (!online || localResult.status === "ok") return localResult;
    const onlineKey = `gold:online-history:${days}`;
    try {
      const result = await online.fetchHistory(days);
      saveSnapshot(onlineKey, result);
      return { ...result, __ttl: result.stale ? 15000 : 60000 };
    } catch (e) {
      logger.warn("[gold] 在线历史回退失败:", e?.message || e);
      const snapshot = loadSnapshot(onlineKey);
      if (snapshot) return {
        ...snapshot.data, __ttl: 15000, reason: "ONLINE_HISTORY_UNAVAILABLE", stale: true, asof: snapshot.at,
      };
      // 在线源也失败时保留原有本地快照/明确空态，不用假曲线填坑。
      return localResult;
    }
  }

  async function handleGoldHistory(daysRaw) {
    const days = daysRaw === "7" ? 7 : daysRaw === "30" ? 30 : 1;
    const snapshotKey = `gold:history:${days}`;
    let names = null;
    let reason = null;
    if (!fs.existsSync(GOLD_DATA_DIR)) reason = "DATA_DIR_NOT_FOUND";
    else {
      try { names = await fs.promises.readdir(GOLD_DATA_DIR); }
      catch { reason = "DATA_DIR_UNREADABLE"; }
    }
    if (names && !names.some((n) => /^gold_data_\d{8}_\d{6}\.json$/.test(n))) reason = "DATA_FILE_NOT_FOUND";
    if (reason) {
      const snapshot = loadSnapshot(snapshotKey);
      const localResult = snapshot ? {
        ...snapshot.data,
        __ttl: 15000,
        reason,
        stale: true,
        asof: snapshot.at,
      } : {
        __ttl: 60000,
        days,
        points: [],
        count: 0,
        source: "gold-monitor",
        status: "unavailable",
        reason,
        stale: false,
        asof: null,
      };
      return withOnlineHistory(days, localResult);
    }

    const windowMs = days * 24 * 3600 * 1000;
    const now = Date.now();
    // 先按文件名日期排除窗口外文件，避免每次刷新都解析全部历史快照。
    const candidates = names
      .filter((n) => /^gold_data_\d{8}_\d{6}\.json$/.test(n))
      .map((n) => {
        const file = path.join(GOLD_DATA_DIR, n);
        const parsed = fileTimeFromName(file);
        return { file, t: parsed ? parsed.getTime() : null };
      })
      .filter(({ t }) => t == null || (t >= now - windowMs && t <= now + 5 * 60 * 1000));
    const points = [];
    // 分批异步读取，既不阻塞事件循环，也避免数百文件同时打开。
    const READ_BATCH = 16;
    for (let i = 0; i < candidates.length; i += READ_BATCH) {
      const batch = await Promise.all(candidates.slice(i, i + READ_BATCH).map(async ({ file, t }) => {
        try {
          const d = JSON.parse(await fs.promises.readFile(file, "utf8"));
          const p = d && d.gold_price && d.gold_price.prices && d.gold_price.prices.USD &&
            typeof d.gold_price.prices.USD.price === "number" ? d.gold_price.prices.USD.price : null;
          if (p == null) return null;
          const ts = t ?? fileTime(file).getTime();
          if (ts < now - windowMs || ts > now + 5 * 60 * 1000) return null;
          return { t: new Date(ts).toISOString(), p };
        } catch { return null; }
      }));
      for (const point of batch) if (point) points.push(point);
    }
    points.sort((a, b) => a.t.localeCompare(b.t));

    const MAX_POINTS = 200;
    let series = points;
    if (points.length > MAX_POINTS) {
      const step = points.length / MAX_POINTS;
      series = [];
      for (let i = 0; i < MAX_POINTS; i++) {
        series.push(points[Math.min(points.length - 1, Math.floor(i * step))]);
      }
      series[series.length - 1] = points[points.length - 1];
    }

    const data = {
      days,
      points: series.map(({ t, p }) => ({ t, p: Math.round(p * 100) / 100 })),
      count: points.length,
      source: "gold-monitor",
      status: points.length >= 2 ? "ok" : "empty",
      reason: points.length >= 2 ? null : points.length === 0 ? "HISTORY_WINDOW_EMPTY" : "HISTORY_INSUFFICIENT_POINTS",
      stale: false,
      asof: Date.now(),
    };
    if (points.length >= 2) saveSnapshot(snapshotKey, data);
    return withOnlineHistory(days, { __ttl: 60000, ...data });
  }

  return { handleGold, handleGoldHistory };
};

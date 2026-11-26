// 黄金观察在线回退源：XAUS 现货/历史/央行储备 + 美国财政部 + FRED + Google News RSS。
// 只返回真实上游数据与新鲜度；调用方负责本地优先和 last-good 快照。
"use strict";

const OZ_TO_G = 31.1034768;
const FETCH_OPTS = { timeout: 12000, headers: { Accept: "application/json,text/csv,application/rss+xml,text/xml,*/*" } };
const NOMINAL_COLS = {
  "1M": "1 Mo", "3M": "3 Mo", "6M": "6 Mo", "1Y": "1 Yr", "2Y": "2 Yr",
  "3Y": "3 Yr", "5Y": "5 Yr", "7Y": "7 Yr", "10Y": "10 Yr", "20Y": "20 Yr", "30Y": "30 Yr",
};
const REAL_COLS = { "5": "5 YR", "7": "7 YR", "10": "10 YR", "20": "20 YR", "30": "30 YR" };
const MONTHS = { jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06", jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12" };

const finite = (v, positive = false) => {
  if (v == null || (typeof v === "string" && v.trim() === "")) return null;
  const n = typeof v === "number" ? v : Number(String(v).trim());
  return Number.isFinite(n) && (!positive || n > 0) ? n : null;
};
const isoNow = (now) => new Date(now()).toISOString();

async function fetchJson(fetchTextAny, url) {
  const data = JSON.parse(await fetchTextAny(url, FETCH_OPTS));
  if (!data || typeof data !== "object" || data.error) throw new Error("invalid upstream json");
  return data;
}

/** 小型 CSV 解析器：支持引号、逗号与双引号转义，避免按逗号 split 破坏列对齐。 */
function parseCsvRows(text) {
  const rows = [];
  let row = [], field = "", quoted = false;
  const input = String(text || "").replace(/^\uFEFF/, "");
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (quoted) {
      if (ch === '"' && input[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { row.push(field); field = ""; }
    else if (ch === "\n") {
      row.push(field.replace(/\r$/, ""));
      if (row.some((v) => v.trim() !== "")) rows.push(row);
      row = []; field = "";
    } else field += ch;
  }
  row.push(field.replace(/\r$/, ""));
  if (row.some((v) => v.trim() !== "")) rows.push(row);
  return rows;
}

function csvObjects(text, requiredCols) {
  const rows = parseCsvRows(text);
  if (rows.length < 2) throw new Error("csv has no data rows");
  const header = rows[0].map((v) => v.trim());
  for (const col of requiredCols) if (!header.includes(col)) throw new Error(`csv column missing: ${col}`);
  return rows.slice(1).map((fields) => Object.fromEntries(header.map((h, i) => [h, (fields[i] ?? "").trim()])));
}

function latestFredValue(text, series) {
  const rows = csvObjects(text, [series]);
  let latest = null;
  for (const row of rows) {
    const date = row.observation_date || row.DATE || Object.values(row)[0];
    const value = finite(row[series]);
    // FRED 尚未公布的月份以 "." 或空单元格出现：跳过，不前向填充、不造 0。
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date || "") || value == null) continue;
    if (!latest || date > latest.date) latest = { date, value };
  }
  if (!latest) throw new Error(`no finite ${series} observation`);
  return latest;
}

function treasuryUrl(year, type) {
  return `https://home.treasury.gov/resource-center/data-chart-center/interest-rates/daily-treasury-rates.csv/${year}/all?type=${type}&field_tdr_date_value=${year}&_format=csv`;
}

function treasuryRows(text, columns, positive) {
  const rows = csvObjects(text, ["Date", ...Object.values(columns)]);
  const byDate = new Map();
  for (const row of rows) {
    const m = String(row.Date).match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (!m) continue;
    const date = `${m[3]}-${m[1]}-${m[2]}`;
    const values = {};
    for (const [key, col] of Object.entries(columns)) {
      const value = finite(row[col], positive);
      if (value != null && Math.abs(value) < 50) values[key] = value;
    }
    if (Object.keys(values).length) byDate.set(date, values);
  }
  if (!byDate.size) throw new Error("no usable treasury rows");
  return byDate;
}

function refToMonth(ref, fallback) {
  const m = String(ref || "").match(/^([A-Za-z]{3})[a-z]*\s+(\d{4})$/);
  const mm = m && MONTHS[m[1].toLowerCase()];
  return m && mm ? `${m[2]}-${mm}` : String(fallback || "").slice(0, 7) || null;
}

function decodeXml(value) {
  return String(value || "").replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (all, entity) => {
    const lower = entity.toLowerCase();
    if (lower === "amp") return "&";
    if (lower === "lt") return "<";
    if (lower === "gt") return ">";
    if (lower === "quot") return '"';
    if (lower === "apos") return "'";
    const code = lower.startsWith("#x") ? parseInt(lower.slice(2), 16) : lower.startsWith("#") ? parseInt(lower.slice(1), 10) : NaN;
    return Number.isFinite(code) && code >= 0 && code <= 0x10ffff ? String.fromCodePoint(code) : all;
  });
}

function xmlTag(block, tag) {
  const m = block.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, "i"));
  if (!m) return "";
  return decodeXml(m[1].replace(/^\s*<!\[CDATA\[|\]\]>\s*$/g, "").trim());
}

function downsample(points, max = 200) {
  if (points.length <= max) return points;
  const step = points.length / max;
  const out = Array.from({ length: max }, (_, i) => points[Math.min(points.length - 1, Math.floor(i * step))]);
  out[out.length - 1] = points[points.length - 1];
  return out;
}

module.exports = function createGoldOnline(ctx) {
  const { fetchTextAny, now = Date.now } = ctx;

  async function fetchSpot() {
    try {
      const d = await fetchJson(fetchTextAny, "https://xaus.com/api/v1/spot?currency=CNY&compact=1");
      const usd = finite(d.spot_usd_oz, true);
      const cny = d.xau?.currency === "CNY" && d.xau?.unit === "troy_oz" ? finite(d.xau?.price, true) : null;
      if (usd == null || d.data_state?.status === "unavailable") throw new Error("xaus spot unavailable");
      return {
        price: {
          usd, cny, cnyPerG: cny == null ? null : cny / OZ_TO_G,
          ts: d.price_as_of || d.data_state?.as_of || d.updated_at || isoNow(now),
          note: cny == null ? "CNY 报价缺失，克价暂不可换算" : "",
          changePct: null, intradayNote: "",
        },
        provider: "XAUS", stale: d.stale === true || d.data_state?.status === "stale",
      };
    } catch (primaryError) {
      // 独立现货兜底仅提供 USD；不拿硬编码汇率伪造人民币报价。
      try {
        const d = await fetchJson(fetchTextAny, "https://api.gold-api.com/price/XAU");
        const usd = finite(d.price, true);
        if (usd == null) throw new Error("gold-api spot unavailable");
        return {
          price: { usd, cny: null, cnyPerG: null, ts: d.updatedAt || isoNow(now), note: "CNY 报价缺失，克价暂不可换算", changePct: null, intradayNote: "" },
          provider: "Gold API", stale: false,
        };
      } catch {
        throw primaryError;
      }
    }
  }

  async function fetchTreasuryCurves() {
    const year = new Date(now()).getUTCFullYear();
    const [nominalResult, realResult] = await Promise.allSettled([
      fetchTextAny(treasuryUrl(year, "daily_treasury_yield_curve"), FETCH_OPTS),
      fetchTextAny(treasuryUrl(year, "daily_treasury_real_yield_curve"), FETCH_OPTS),
    ]);
    const errors = [];
    let nominal = null, real = null;
    try {
      if (nominalResult.status === "fulfilled") nominal = treasuryRows(nominalResult.value, NOMINAL_COLS, true);
      else errors.push("TREASURY_NOMINAL_UNAVAILABLE");
    } catch { errors.push("TREASURY_NOMINAL_INVALID"); }
    try {
      if (realResult.status === "fulfilled") real = treasuryRows(realResult.value, REAL_COLS, false);
      else errors.push("TREASURY_REAL_UNAVAILABLE");
    } catch { errors.push("TREASURY_REAL_INVALID"); }
    if (!nominal && !real) throw new Error("treasury curves unavailable");

    const latestNominalDate = nominal ? [...nominal.keys()].sort().at(-1) : null;
    const latestRealDate = real ? [...real.keys()].sort().at(-1) : null;
    // 盈亏平衡只能在同日期、同期限上相减；实际曲线日期可独立于最新名义曲线。
    const matchedDate = nominal && real
      ? [...real.keys()].sort().reverse().find((date) => nominal.has(date)) || null
      : null;
    const breakeven = {};
    if (matchedDate) {
      for (const key of Object.keys(REAL_COLS)) {
        const r = real.get(matchedDate)?.[key];
        const n = nominal.get(matchedDate)?.[`${key}Y`];
        if (r != null && n != null) breakeven[key] = Math.round((n - r) * 10000) / 10000;
      }
    }
    return {
      treasury: latestNominalDate ? { date: latestNominalDate, fetchedAt: isoNow(now), yields: nominal.get(latestNominalDate) } : null,
      real_curve: latestRealDate ? {
        date: latestRealDate,
        nominal_rates: matchedDate ? nominal.get(matchedDate) : null,
        real_rates: real.get(latestRealDate),
        breakeven_rates: Object.keys(breakeven).length ? breakeven : null,
      } : null,
      errors,
    };
  }

  async function fetchFred() {
    const cosd = new Date(now() - 400 * 24 * 3600e3).toISOString().slice(0, 10);
    const specs = [
      { id: "DFF", transform: null, series: "DFF" },
      { id: "CPIAUCSL", transform: "pc1", series: "CPIAUCSL_PC1" },
      { id: "CPILFESL", transform: "pc1", series: "CPILFESL_PC1" },
    ];
    const results = await Promise.allSettled(specs.map(async (spec) => {
      const params = new URLSearchParams({ id: spec.id, cosd });
      if (spec.transform) params.set("transformation", spec.transform);
      const text = await fetchTextAny(`https://fred.stlouisfed.org/graph/fredgraph.csv?${params}`, FETCH_OPTS);
      return latestFredValue(text, spec.series);
    }));
    if (results.every((r) => r.status === "rejected")) throw new Error("fred series unavailable");
    const [dff, cpi, core] = results;
    const headlines = {};
    if (cpi.status === "fulfilled") headlines.CPI = { date: cpi.value.date, yoy_pct: cpi.value.value };
    if (core.status === "fulfilled") headlines["Core CPI"] = { date: core.value.date, yoy_pct: core.value.value };
    return {
      inflation: { headlines: Object.keys(headlines).length ? headlines : null },
      fed: dff.status === "fulfilled" ? { date: dff.value.date, effectiveRate: dff.value.value, fetchedAt: isoNow(now) } : null,
      errors: results.map((r, i) => r.status === "rejected" ? `FRED_${specs[i].id}_UNAVAILABLE` : null).filter(Boolean),
    };
  }

  async function fetchNews() {
    const feeds = [
      {
        url: "https://www.cnbc.com/id/10000664/device/rss/rss.html", provider: "CNBC（黄金/宏观筛选）", maxAgeDays: 8,
        keywords: /gold|xau|bullion|precious metal|federal reserve|\bfed\b|inflation|central bank|treasury|dollar/i,
      },
      { url: "https://news.google.com/rss/search?q=gold%20OR%20XAUUSD%20when%3A7d&hl=en-US&gl=US&ceid=US%3Aen", provider: "Google News RSS", maxAgeDays: 8 },
      {
        url: "https://www.gold.org/rss.xml", provider: "World Gold Council", maxAgeDays: 90,
        keywords: /gold|central bank|reserve|investment|bullion/i,
      },
    ];
    let lastError = null;
    for (const feed of feeds) {
      try {
        const xml = await fetchTextAny(feed.url, FETCH_OPTS);
        const items = [...String(xml).matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/gi)].map((m) => {
          const publishedAt = xmlTag(m[1], "pubDate");
          return {
            title: xmlTag(m[1], "title"), url: xmlTag(m[1], "link"),
            source: xmlTag(m[1], "source") || feed.provider.replace(/（.*）/, ""),
            publishedAt: publishedAt || null, publishedMs: Date.parse(publishedAt),
          };
        }).filter((n) => n.title && /^https?:\/\//.test(n.url) && Number.isFinite(n.publishedMs)
          && n.publishedMs >= now() - feed.maxAgeDays * 24 * 3600e3 && n.publishedMs <= now() + 24 * 3600e3
          && (!feed.keywords || feed.keywords.test(n.title)))
          .sort((a, b) => b.publishedMs - a.publishedMs).slice(0, 8)
          .map(({ publishedMs, ...n }) => ({ ...n, publishedAt: new Date(publishedMs).toISOString() }));
        if (!items.length) throw new Error("no recent relevant news");
        return { items, provider: feed.provider };
      } catch (e) { lastError = e; }
    }
    throw lastError || new Error("news feeds unavailable");
  }

  async function fetchMonitor() {
    const results = await Promise.allSettled([fetchSpot(), fetchTreasuryCurves(), fetchFred(), fetchNews()]);
    const [spotR, treasuryR, fredR, newsR] = results;
    const spot = spotR.status === "fulfilled" ? spotR.value : null;
    const curves = treasuryR.status === "fulfilled" ? treasuryR.value : null;
    const fred = fredR.status === "fulfilled" ? fredR.value : null;
    const newsResult = newsR.status === "fulfilled" ? newsR.value : null;
    const news = newsResult?.items || [];
    if (!spot && !curves && !fred && !news.length) throw new Error("all online monitor sources unavailable");
    const be10 = curves?.real_curve?.breakeven_rates?.["10"];
    return {
      data: {
        fetched_at: isoNow(now),
        gold: spot?.price || null,
        treasury: curves?.treasury || null,
        real_curve: curves?.real_curve || null,
        inflation: { headlines: fred?.inflation?.headlines || null, breakeven_inflation: be10 != null ? { "10Y": be10 } : null },
        fed: fred?.fed || null,
        news,
      },
      providers: {
        gold: spot?.provider || null,
        treasury: curves ? "美国财政部" : null,
        macro: fred ? "FRED" : null,
        news: newsResult?.provider || null,
      },
      stale: spot?.stale === true,
      errors: [
        spotR.status === "rejected" ? "ONLINE_SPOT_UNAVAILABLE" : null,
        treasuryR.status === "rejected" ? "ONLINE_TREASURY_UNAVAILABLE" : null,
        fredR.status === "rejected" ? "ONLINE_FRED_UNAVAILABLE" : null,
        newsR.status === "rejected" ? "ONLINE_NEWS_UNAVAILABLE" : null,
        ...(curves?.errors || []), ...(fred?.errors || []),
      ].filter(Boolean),
    };
  }

  async function fetchCentralBank() {
    const d = await fetchJson(fetchTextAny, "https://xaus.com/api/v1/reserves");
    const rows = (Array.isArray(d.reserves) ? d.reserves : []).filter((r) =>
      r && !r.isInstitution && finite(r.rank, true) != null && finite(r.t, true) != null
    );
    const top10 = rows.slice().sort((a, b) => b.t - a.t).slice(0, 10).map((r) => ({
      country: String(r.country || r.iso || "Unknown"),
      date: refToMonth(r.ref, d.updated), tonnes: finite(r.t, true),
    }));
    if (!top10.length) throw new Error("central-bank reserves empty");
    const transactions = rows.map((r) => ({ r, current: finite(r.t), previous: finite(r.prev) }))
      .filter((x) => x.current != null && x.previous != null)
      .map((x) => ({ ...x, tonnes: x.current - x.previous }))
      .filter((x) => Math.abs(x.tonnes) >= 0.005)
      .sort((a, b) => Math.abs(b.tonnes) - Math.abs(a.tonnes)).slice(0, 15)
      .map(({ r, tonnes }) => ({
        country: String(r.country || r.iso || "Unknown"),
        ym: refToMonth(r.ref, d.updated), tonnes: Math.round(tonnes * 100) / 100,
        notes: `${r.institution || "官方储备机构"} · ${r.ref || d.updated || "最新报告期"} · 较上期储备变化`,
      }));
    return {
      data: { transactions, top10 }, provider: "XAUS（WGC/IMF 口径）",
      stale: d.data_state?.status === "stale", updated: d.updated || null,
    };
  }

  async function fetchHistory(daysRaw) {
    const days = daysRaw === 7 || daysRaw === "7" ? 7 : daysRaw === 30 || daysRaw === "30" ? 30 : 1;
    const nowMs = now();
    const intradayUrl = `https://xaus.com/api/v1/intraday?symbol=xau&hours=${days === 1 ? 24 : 48}`;
    const tasks = [fetchJson(fetchTextAny, intradayUrl)];
    if (days > 1) tasks.push(fetchJson(fetchTextAny, "https://xaus.com/api/v1/history"));
    const [intradayR, dailyR] = await Promise.allSettled(tasks);
    if (intradayR.status === "rejected" && (days === 1 || dailyR.status === "rejected")) throw new Error("online gold history unavailable");
    const merged = new Map();
    const add = (ms, price) => {
      const p = finite(price, true);
      if (p == null || !Number.isFinite(ms) || ms < nowMs - days * 24 * 3600e3 || ms > nowMs + 5 * 60e3) return;
      merged.set(ms, { t: new Date(ms).toISOString(), p });
    };
    if (dailyR?.status === "fulfilled") {
      for (const point of dailyR.value.points || []) add(Date.parse(`${point.d}T00:00:00Z`), point.c);
    }
    if (intradayR.status === "fulfilled") {
      for (const point of intradayR.value.points || []) add(finite(point.t) * 1000, point.p);
    }
    const points = [...merged.entries()].sort(([a], [b]) => a - b).map(([, point]) => point);
    if (points.length < 2) throw new Error("online gold history has insufficient points");
    const states = [intradayR, dailyR].filter((r) => r?.status === "fulfilled").map((r) => r.value.data_state);
    const stale = states.some((s) => s?.status === "stale");
    return {
      days, points: downsample(points).map(({ t, p }) => ({ t, p: Math.round(p * 100) / 100 })),
      count: points.length, source: "xaus", provider: "XAUS", status: "ok",
      reason: stale ? "UPSTREAM_STALE" : null, stale,
      asof: Date.parse(states.find((s) => s?.as_of)?.as_of || "") || nowMs,
    };
  }

  return { fetchMonitor, fetchCentralBank, fetchHistory };
};

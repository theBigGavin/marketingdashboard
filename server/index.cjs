/**
 * 市场研究驾驶舱 — 数据代理与静态服务器
 * 聚合: 腾讯行情(A股/港股/美股/汇率) · 腾讯板块榜 · 新浪期货(金银铜油)
 *       新浪个股榜单 · 新浪资金流 · 新浪7x24快讯 · CNBC美债收益率
 */
const http = require("http");
const fs = require("fs");
const path = require("path");
const iconv = require("iconv-lite");
const { execFile } = require("child_process");
const crypto = require("crypto");

// 加载 .env
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

function curlText(url, { referer, timeout = 8000, encoding = "gbk" } = {}) {
  return new Promise((resolve, reject) => {
    const args = ["-s", "--max-time", String(Math.ceil(timeout / 1000)), "-H", `User-Agent: ${UA}`];
    if (referer) args.push("-H", `Referer: ${referer}`);
    args.push(url);
    execFile("curl", args, { maxBuffer: 4 * 1024 * 1024, encoding: "buffer" }, (err, stdout) => {
      if (err) return reject(err);
      resolve(iconv.decode(stdout, encoding));
    });
  });
}

const PORT = process.env.PORT || 3000;
const DIST = path.join(__dirname, "..", "dist");

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

/* ---------------- 基础工具 ---------------- */
async function fetchText(url, { referer, gbk = false, timeout = 8000 } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  try {
    const headers = { "User-Agent": UA, Accept: "*/*" };
    if (referer) headers["Referer"] = referer;
    const resp = await fetch(url, { headers, signal: ctrl.signal });
    const buf = Buffer.from(await resp.arrayBuffer());
    return gbk ? iconv.decode(buf, "gbk") : buf.toString("utf-8");
  } finally {
    clearTimeout(timer);
  }
}

function send(res, code, obj, extra = {}) {
  const body = typeof obj === "string" ? obj : JSON.stringify(obj);
  const headers = {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Cache-Control": "no-store",
    ...extra,
  };
  // extra 中值为 null 的头表示显式移除(用于私有端点不下发 ACAO:*)
  for (const k of Object.keys(headers)) if (headers[k] == null) delete headers[k];
  res.writeHead(code, headers);
  res.end(body);
}

const num = (v) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
};

/* ---------------- 腾讯行情 qt.gtimg.cn ---------------- */
function parseTencentLine(line) {
  const m = line.match(/v_([a-zA-Z0-9_]+)="([^"]*)"/);
  if (!m) return null;
  const symbol = m[1];
  const f = m[2].split("~");
  if (f.length < 40) {
    // 外汇 wh 系列
    if (symbol.startsWith("wh") && f.length > 13) {
      return {
        symbol,
        name: f[1],
        price: num(f[3]),
        change: num(f[12]),
        pct: num(f[13]),
        open: num(f[6]),
        high: num(f[8]),
        low: num(f[9]),
        prev: num(f[3]) - num(f[12]),
        time: f[5],
      };
    }
    return null;
  }
  return {
    symbol,
    name: f[1],
    price: num(f[3]),
    prev: num(f[4]),
    open: num(f[5]),
    vol: num(f[6]),
    time: f[30],
    change: num(f[31]),
    pct: num(f[32]),
    high: num(f[33]),
    low: num(f[34]),
    amount: num(f[37]), // 万元(A股) / 其他市场口径各异
    turnover: num(f[38]),
    pe: num(f[39]),
    amplitude: num(f[43]),
  };
}

async function handleQuotes(codes) {
  const url = `https://qt.gtimg.cn/q=${encodeURIComponent(codes)}`;
  const text = await fetchText(url, { gbk: true });
  const out = {};
  for (const line of text.split(";")) {
    const q = parseTencentLine(line.trim());
    if (q) out[q.symbol] = q;
  }
  // usVIX 腾讯数据已停更，从新浪期货获取实时值覆盖
  if (codes.includes("usVIX") || out.usVIX) {
    try {
      const vixText = await curlText("https://hq.sinajs.cn/list=hf_VX", { referer: "https://finance.sina.com.cn/futures/", timeout: 4000, encoding: "utf-8" });
      const m = vixText.match(/hf_VX="([^"]*)"/);
      if (m) {
        const f = m[1].split(",");
        const price = parseFloat(f[0]);
        const prev = parseFloat(f[7]);
        if (!isNaN(price)) {
          out.usVIX = {
            symbol: "usVIX",
            name: "VIX恐慌指数期货",
            price,
            prev,
            change: +(price - prev).toFixed(4),
            pct: prev ? +(((price - prev) / prev) * 100).toFixed(3) : 0,
            time: `${f[12]} ${f[6]}`,
          };
        }
      }
    } catch { /* keep tencent fallback */ }
  }
  return out;
}

/* ---------------- 腾讯分钟线(指数/个股 日内走势) ---------------- */
async function handleMinute(code) {
  // 美股指数(us*)只有 usMinute 接口返回全日序列, minute/query 只给最后一个点
  const url = code.startsWith("us")
    ? `https://web.ifzq.gtimg.cn/appstock/app/usMinute/query?code=${encodeURIComponent(code)}`
    : `https://ifzq.gtimg.cn/appstock/app/minute/query?code=${encodeURIComponent(code)}`;
  const text = await fetchText(url);
  const json = JSON.parse(text);
  const d = json?.data?.[code];
  const arr = d?.data?.data || [];
  const prec = num(d?.data?.prec || d?.qt?.[code]?.[4] || 0);
  // 返回 "HHMM price vol" -> [分钟索引, 价格]
  const pts = arr.map((s) => {
    const p = s.split(" ");
    return { t: p[0], p: num(p[1]) };
  });
  return { code, prec, points: pts };
}

/* ---------------- 腾讯板块榜(行业 t=01 / 概念 t=02) ---------------- */
async function handleBoards(type, dir, n) {
  const url = `https://ifzq.gtimg.cn/appstock/app/mktHs/rank?l=${encodeURIComponent(n)}&p=1&t=${encodeURIComponent(type)}/averatio&o=${encodeURIComponent(dir)}`;
  const text = await fetchText(url);
  const json = JSON.parse(text);
  return (json?.data || []).map((b) => ({
    code: b.bd_code,
    name: b.bd_name,
    price: num(b.bd_zxj),
    change: num(b.bd_zd),
    pct: num(b.bd_zdf),
    pct5: num(b.bd_zdf5),
    pct20: num(b.bd_zdf20),
    leadCode: b.nzg_code,
    leadName: b.nzg_name,
    leadPrice: num(b.nzg_zxj),
    leadPct: num(b.nzg_zdf),
  }));
}

/* ---------------- 板块成分股(上游单页上限100, 自动翻页) ---------------- */
async function handleBoardStocks(code, dir, n) {
  const want = Math.min(parseInt(n) || 12, 400);
  const map = (s) => ({
    code: s.code,
    name: s.name,
    price: num(s.zxj),
    pct: num(s.zdf),
    turnover: num(s.hsl),
    pe: num(s.pe_ttm),
    speed: num(s.speed),
    circ_mv: num(s.ltsz), // 流通市值(亿)
    total_mv: num(s.zsz),
    amount: num(s.volume) * 100 * num(s.zxj), // 成交量(手)估算成交额(元)
  });
  const out = [];
  for (let offset = 0; out.length < want; offset += 100) {
    const url = `https://proxy.finance.qq.com/cgi/cgi-bin/rank/hs/getBoardRankList?board_code=${encodeURIComponent(code)}&sort_type=PriceRatio&direct=${encodeURIComponent(dir)}&offset=${offset}&count=100`;
    const text = await fetchText(url);
    const json = JSON.parse(text);
    const list = json?.data?.rank_list || [];
    if (!list.length) break;
    out.push(...list.map(map));
    if (list.length < 100) break;
  }
  return out.slice(0, want);
}

/* ---------------- 外盘期货(金银铜油):腾讯主源 + 新浪兜底 ---------------- */
function parseFutures(text) {
  const out = {};
  const re = /(?:hq_str_|v_)(\w+)="([^"]*)"/g;
  let m;
  while ((m = re.exec(text))) {
    const f = m[2].split(",");
    if (f.length < 14 || !f[0]) continue;
    const price = num(f[0]);
    const prevSettle = num(f[7]);
    out[m[1]] = {
      symbol: m[1],
      name: f[13],
      price,
      high: num(f[4]),
      low: num(f[5]),
      open: num(f[8]),
      prev: prevSettle,
      change: +(price - prevSettle).toFixed(4),
      pct: prevSettle ? +(((price - prevSettle) / prevSettle) * 100).toFixed(3) : 0,
      time: `${f[12]} ${f[6]}`,
    };
  }
  return out;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function pickValue(obj, matchers) {
  for (const [key, value] of Object.entries(obj || {})) {
    if (matchers.some((m) => key.includes(m))) return value;
  }
  return undefined;
}

function pickRatioValue(obj) {
  for (const [key, value] of Object.entries(obj || {})) {
    if ((key.includes("/") || key.includes("除以")) && (key.includes("成交额") || key.includes("成交金额"))) return value;
  }
  return pickValue(obj, ["放量倍数", "成交额放量", "成交金额放量"]);
}

function parseMaybeNumber(v) {
  if (v == null || v === "") return undefined;
  const n = parseFloat(String(v).replace(/,/g, ""));
  return Number.isFinite(n) ? n : undefined;
}

function iwencaiErrorFromText(text) {
  const clean = String(text || "").replace(/\s+/g, " ").trim();
  if (clean.includes("次数已用完")) return "IWENCAI_QUOTA_EXHAUSTED: 问财今日次数已用完";
  if (clean.includes("Invalid") || clean.includes("Unauthorized") || clean.includes("鉴权") || clean.includes("权限")) {
    return "IWENCAI_AUTH_FAILED: 问财鉴权失败";
  }
  // 上游原文只记服务端日志, 不回显给客户端
  console.error("[iwencai] non-json response:", clean.slice(0, 160));
  return "IWENCAI_NON_JSON: 问财返回非JSON响应";
}

// 问财返回的列名带查询时日期区间(如 平均成交额[20260715-20260717]), 日期随查询变化, 硬编码会失效
// 按基础列名 + 日期跨度匹配(targetDays 为目标自然日数), 无日期的纯 key 作为兜底
function pickDatedValue(obj, baseNames, targetDays, fallbacks = []) {
  let best;
  let bestDiff = Infinity;
  let plain;
  const day = (s) => Date.parse(`${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`);
  for (const [key, value] of Object.entries(obj || {})) {
    const m = key.match(/^(.+?)\[(\d{8})-(\d{8})\]/);
    if (m && baseNames.includes(m[1])) {
      const span = (day(m[3]) - day(m[2])) / 86400000 + 1;
      const diff = Math.abs(span - targetDays);
      if (diff < bestDiff) { bestDiff = diff; best = value; }
    } else if (!m && fallbacks.some((f) => key.includes(f))) {
      plain = value;
    }
  }
  return best !== undefined ? best : plain;
}

function normalizeIwencaiStock(item) {
  return {
    code: String(item["股票代码"] || item.code || ""),
    name: String(item["股票简称"] || item.name || ""),
    price: parseMaybeNumber(item["最新价"] ?? item.price),
    pct: parseMaybeNumber(item["最新涨跌幅"] ?? pickValue(item, ["涨跌幅"]) ?? item.pct),
    ratio: parseMaybeNumber(pickRatioValue(item)),
    avgAmount3: parseMaybeNumber(pickDatedValue(item, ["平均成交额", "区间日均成交额", "最近3日区间日均成交额"], 3, ["最近3日区间日均成交额", "最近3日平均成交金额", "成交额平均值"])),
    avgAmount20: parseMaybeNumber(pickDatedValue(item, ["平均成交额", "区间日均成交额", "前20日区间日均成交额"], 28, ["前20日区间日均成交额", "前20日平均成交金额"])),
    rangePct5: parseMaybeNumber(pickDatedValue(item, ["涨跌幅"], 5, ["最近5日区间涨跌幅"])),
    raw: item,
  };
}

async function handleMysterySelect(query, limit = "30", page = "1") {
  const apiKey = process.env.IWENCAI_API_KEY;
  // err.status 供路由层回显安全文案(见路由错误处理)
  if (!apiKey) { const e = new Error("问财未配置 API Key(请在 server/.env 配置 IWENCAI_API_KEY)"); e.status = 500; throw e; }
  const base = (process.env.IWENCAI_BASE_URL || "https://openapi.iwencai.com").replace(/\/$/, "");
  const traceId = crypto.randomBytes(32).toString("hex");
  const payload = {
    query,
    page: String(parseInt(page, 10) || 1),
    limit: String(Math.min(Math.max(parseInt(limit, 10) || 30, 1), 80)),
    is_cache: "1",
    expand_index: "true",
  };
  const resp = await fetch(`${base}/v1/query2data`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "X-Claw-Call-Type": "normal",
      "X-Claw-Skill-Id": "hithink-astock-selector",
      "X-Claw-Skill-Version": "1.0.0",
      "X-Claw-Plugin-Id": "none",
      "X-Claw-Plugin-Version": "none",
      "X-Claw-Trace-Id": traceId,
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(15000), // 与其他上游一致, 防止无限挂起
  });
  const text = await resp.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(iwencaiErrorFromText(text));
  }
  if (!resp.ok) {
    const errMsg = typeof json?.error === "string" ? json.error : json?.error?.message || json?.message || `IWENCAI_HTTP_${resp.status}`;
    throw new Error(errMsg);
  }
  const datas = Array.isArray(json.datas) ? json.datas : Array.isArray(json.data) ? json.data : [];
  return {
    query,
    total: Number(json.code_count || datas.length || 0),
    rows: datas.map(normalizeIwencaiStock),
    chunksInfo: json.chunks_info,
  };
}

/* ---------------- 内盘期货(沪金等):新浪 nf_ ---------------- */
function parseSinaDomestic(text) {
  const out = {};
  const re = /hq_str_(nf_\w+)="([^"]*)"/g;
  let m;
  while ((m = re.exec(text))) {
    const f = m[2].split(",");
    if (f.length < 17 || !f[0]) continue;
    const prevSettle = num(f[8]); // f[8]=昨收
    let price = num(f[5]); // 最新价(夜盘可能为0)
    if (!price) {
      const bid = num(f[6]), ask = num(f[7]);
      price = bid && ask ? +((bid + ask) / 2).toFixed(2) : (bid || ask || prevSettle);
    }
    out[m[1]] = {
      symbol: m[1],
      name: f[0],
      price,
      high: num(f[3]),
      low: num(f[4]),
      open: num(f[2]),
      prev: prevSettle,
      change: +(price - prevSettle).toFixed(4),
      pct: prevSettle ? +(((price - prevSettle) / prevSettle) * 100).toFixed(3) : 0,
      time: f[16],
    };
  }
  return out;
}

/* ---------------- 加密货币(Binance 主源 + OKX 兜底, fetch/curl 双通道) ---------------- */
async function fetchJsonAny(urls) {
  let lastErr = new Error("fetch failed");
  for (const url of urls) {
    for (const via of ["fetch", "curl"]) {
      try {
        const text =
          via === "fetch"
            ? await fetchText(url, { referer: "https://www.binance.com/" })
            : await curlText(url, { encoding: "utf-8" });
        return JSON.parse(text);
      } catch (e) {
        lastErr = e;
      }
    }
  }
  throw lastErr;
}

async function fetchBtc() {
  try {
    const j = await fetchJsonAny(["https://api.binance.com/api/v3/ticker/24hr?symbol=BTCUSDT"]);
    return {
      symbol: "BTCUSDT", name: "BTC/USDT", price: num(j.lastPrice), prev: num(j.prevClosePrice),
      open: num(j.openPrice), high: num(j.highPrice), low: num(j.lowPrice),
      change: num(j.priceChange), pct: num(j.priceChangePercent), time: "",
    };
  } catch { /* Binance 不可达时走 OKX */ }
  const j = await fetchJsonAny(["https://www.okx.com/api/v5/market/ticker?instId=BTC-USDT"]);
  const d = j?.data?.[0];
  if (!d) throw new Error("btc blocked");
  const price = num(d.last);
  const prev = num(d.open24h);
  return {
    symbol: "BTCUSDT", name: "BTC/USDT", price, prev,
    open: prev, high: num(d.high24h), low: num(d.low24h),
    change: +(price - prev).toFixed(2),
    pct: prev ? +(((price - prev) / prev) * 100).toFixed(3) : 0,
    time: "",
  };
}

async function handleFutures(list) {
  const codes = String(list || "").split(",").map((s) => s.trim()).filter(Boolean);
  const hf = codes.filter((c) => c.startsWith("hf_"));
  const nf = codes.filter((c) => c.startsWith("nf_"));
  const out = {};
  const jobs = [];
  if (hf.length) {
    jobs.push((async () => {
      // 主源:腾讯(稳定,无WAF)
      try {
        const r = parseFutures(await fetchText(`https://qt.gtimg.cn/q=${hf.join(",")}`, { gbk: true }));
        if (Object.keys(r).length >= Math.min(2, hf.length)) return Object.assign(out, r);
      } catch { /* fallthrough */ }
      // 兜底:新浪
      const url = `https://hq.sinajs.cn/list=${hf.join(",")}`; // 新浪要求逗号不转码
      const opts = { referer: "https://finance.sina.com.cn/futures/quotes/CL.shtml" };
      let r = parseFutures(await curlText(url, opts));
      if (Object.keys(r).length === 0) {
        await sleep(1200);
        r = parseFutures(await curlText(url, opts));
      }
      Object.assign(out, r);
    })());
  }
  if (nf.length) {
    jobs.push((async () => {
      const url = `https://hq.sinajs.cn/list=${nf.join(",")}`;
      const opts = { referer: "https://finance.sina.com.cn/futures/quotes/AU0.shtml" };
      let r = parseSinaDomestic(await curlText(url, opts));
      if (Object.keys(r).length === 0) {
        await sleep(1200);
        r = parseSinaDomestic(await curlText(url, opts));
      }
      // 夜盘期间 hq.sinajs.cn 最新价可能为0,从分钟线接口补实时价格
      for (const code of nf) {
        const item = r[code];
        if (!item || item.price > 0) continue;
        const symbol = code.slice(3);
        try {
          const text = await curlText(
            `https://stock2.finance.sina.com.cn/futures/api/jsonp.php/var%20t=/InnerFuturesNewService.getMinLine?symbol=${symbol}`,
            { referer: `https://finance.sina.com.cn/futures/quotes/${symbol}.shtml`, encoding: "utf-8" }
          );
          const arr = parseJsonp(text);
          if (arr && arr.length && arr[0][1]) {
            const livePrice = num(arr[0][1]);
            if (livePrice > 0) {
              item.price = livePrice;
              item.change = +(livePrice - item.prev).toFixed(4);
              item.pct = item.prev ? +(((livePrice - item.prev) / item.prev) * 100).toFixed(3) : 0;
            }
          }
        } catch { /* minLine 失败就保留现有值 */ }
      }
      Object.assign(out, r);
    })());
  }
  if (codes.includes("BTCUSDT")) {
    jobs.push((async () => {
      try {
        out.BTCUSDT = await fetchBtc();
      } catch { /* BTC 源全挂时不拖垮其他品种 */ }
    })());
  }
  await Promise.all(jobs);
  if (Object.keys(out).length === 0) throw new Error("futures blocked");
  return out;
}

/* ---------------- 大宗商品分钟线 ---------------- */
function parseJsonp(text) {
  const a = text.indexOf("(");
  const b = text.lastIndexOf(")");
  if (a < 0 || b <= a) throw new Error("bad jsonp");
  return JSON.parse(text.slice(a + 1, b));
}

async function handleFutureMinute(code) {
  if (code === "BTCUSDT") {
    try {
      const [klines, ticker] = await Promise.all([
        fetchJsonAny(["https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=1m&limit=240"]),
        fetchJsonAny(["https://api.binance.com/api/v3/ticker/24hr?symbol=BTCUSDT"]),
      ]);
      const pts = klines.map((k) => {
        const d = new Date(k[0]);
        return { t: `${String(d.getHours()).padStart(2, "0")}${String(d.getMinutes()).padStart(2, "0")}`, p: num(k[4]) };
      });
      return { code, prec: num(ticker.prevClosePrice), points: pts };
    } catch { return { code, prec: 0, points: [] }; }
  }
  if (code.startsWith("hf_")) {
    const symbol = code.slice(3);
    const text = await curlText(
      `https://stock2.finance.sina.com.cn/futures/api/jsonp.php/var%20t=/GlobalFuturesService.getGlobalFuturesMinLine?symbol=${symbol}`,
      { referer: `https://finance.sina.com.cn/futures/quotes/${symbol}.shtml`, encoding: "utf-8" }
    );
    const arr = parseJsonp(text)?.minLine_1d || [];
    const pts = arr.filter((f) => String(f[0]).includes(":")).map((f) => ({ t: f[0], p: num(f[1]) }));
    const q = parseFutures(await fetchText(`https://qt.gtimg.cn/q=${code}`, { gbk: true }));
    return { code, prec: q[code]?.prev || 0, points: pts };
  }
  if (code.startsWith("nf_")) {
    const symbol = code.slice(3);
    const referer = `https://finance.sina.com.cn/futures/quotes/${symbol}.shtml`;
    const text = await curlText(
      `https://stock2.finance.sina.com.cn/futures/api/jsonp.php/var%20t=/InnerFuturesNewService.getMinLine?symbol=${symbol}`,
      { referer, encoding: "utf-8" }
    );
    const arr = parseJsonp(text) || [];
    const pts = arr.map((f) => ({ t: f[0], p: num(f[1]) }));
    const q = parseSinaDomestic(await curlText(`https://hq.sinajs.cn/list=${code}`, { referer }));
    return { code, prec: q[code]?.prev || 0, points: pts };
  }
  throw new Error("bad code");
}

/* ---------------- 期货日线K线(新浪 内盘nf_/外盘hf_, 全历史免费) ---------------- */
async function handleFutureDaily(code, n = 400) {
  const isGlobal = code.startsWith("hf_");
  const symbol = code.replace(/^(nf_|hf_)/, "");
  if (!symbol || (!code.startsWith("nf_") && !isGlobal)) throw new Error("bad code");
  const api = isGlobal
    ? `GlobalFuturesService.getGlobalFuturesDailyKLine?symbol=${encodeURIComponent(symbol)}`
    : `InnerFuturesNewService.getDailyKLine?symbol=${encodeURIComponent(symbol)}`;
  const text = await curlText(
    `https://stock2.finance.sina.com.cn/futures/api/jsonp.php/var%20t=/${api}`,
    { referer: `https://finance.sina.com.cn/futures/quotes/${symbol}.shtml`, encoding: "utf-8" }
  );
  const arr = parseJsonp(text) || [];
  // 内盘字段 d/o/h/l/c/v; 外盘 date/open/high/low/close/volume, 归一化
  const pts = arr
    .map((k) => ({
      t: k.d || k.date,
      o: num(k.o ?? k.open),
      h: num(k.h ?? k.high),
      l: num(k.l ?? k.low),
      c: num(k.c ?? k.close),
      v: num(k.v ?? k.volume),
    }))
    .filter((p) => p.t && p.c);
  // 只回最近 n 根(页面最大区间 365d): 全历史传输量 10 倍于所需, 是大 payload 超时的根因
  return { code, points: pts.slice(-n) };
}

/* ---------------- 个股榜单(涨幅/跌幅/热门) — 新浪盘中 + 腾讯盘后双源 ---------------- */
async function rankViaSina(sort, asc, want) {
  const fetchN = Math.min(100, Math.max(want * 3, 60));
  const url = `https://vip.stock.finance.sina.com.cn/quotes_service/api/json_v2.php/Market_Center.getHQNodeData?page=1&num=${fetchN}&sort=${encodeURIComponent(sort)}&asc=${encodeURIComponent(asc)}&node=hs_a&symbol=&_s_r_a=page`;
  const arr = await fetchSinaJson(url);
  if (!Array.isArray(arr)) return [];
  return arr.filter((s) => num(s.trade) > 0).slice(0, want).map((s) => ({
    symbol: s.symbol,
    code: s.code,
    name: s.name,
    price: num(s.trade),
    change: num(s.pricechange),
    pct: num(s.changepercent),
    open: num(s.open),
    high: num(s.high),
    low: num(s.low),
    vol: num(s.volume),
    amount: num(s.amount), // 元
    pe: num(s.per),
    pb: num(s.pb),
    total_mv: num(s.mktcap), // 万元
    circ_mv: num(s.nmc), // 万元
    turnover: num(s.turnoverratio),
    time: s.ticktime,
  }));
}

async function rankViaTencent(sort, asc, want) {
  // 盘后新浪清零,腾讯保留收盘价;涨跌幅字段同样清零(返回0)
  const sortMap = { changepercent: "PriceRatio", amount: "volume", turnoverratio: "PriceRatio" };
  const url = `https://proxy.finance.qq.com/cgi/cgi-bin/rank/hs/getBoardRankList?board_code=aStock&sort_type=${encodeURIComponent(sortMap[sort] || "PriceRatio")}&direct=${asc === "1" ? "up" : "down"}&offset=0&count=${want}`;
  const text = await fetchText(url);
  const json = JSON.parse(text);
  return (json?.data?.rank_list || [])
    .filter((s) => num(s.zxj) > 0)
    .map((s) => ({
      symbol: s.code,
      code: s.code.slice(2),
      name: s.name,
      price: num(s.zxj),
      change: num(s.zd),
      pct: num(s.zdf),
      open: 0, high: 0, low: 0,
      vol: num(s.volume),
      amount: num(s.volume) * 100 * num(s.zxj), // 成交量(手)估算成交额
      pe: num(s.pe_ttm),
      pb: 0,
      total_mv: num(s.zsz) * 10000,
      circ_mv: num(s.ltsz) * 10000,
      turnover: num(s.hsl),
      time: "",
    }));
}

async function handleRank(sort, asc, n) {
  const want = parseInt(n) || 30;
  try {
    const rows = await rankViaSina(sort, asc, want);
    if (rows.length) return rows;
  } catch { /* 新浪不可用则走腾讯 */ }
  return rankViaTencent(sort, asc, want);
}

/* ---------------- 新浪个股主力资金流(兜底) ---------------- */
async function handleMoneyFlow(n) {
  const url = `https://vip.stock.finance.sina.com.cn/quotes_service/api/json_v2.php/MoneyFlow.ssl_bkzj_ssggzj?page=1&num=${n}&sort=netamount&asc=0`;
  const arr = await fetchSinaJson(url);
  if (!Array.isArray(arr)) return [];
  return arr.filter((s) => typeof s.name === "string" && s.name.trim()).map((s) => ({
    symbol: s.symbol,
    name: s.name,
    price: num(s.trade),
    pct: +(num(s.changeratio) * 100).toFixed(2),
    amount: num(s.amount),
    netIn: num(s.netamount), // 主力净流入(元)
    netRatio: +(num(s.ratioamount) * 100).toFixed(2),
    r0Net: num(s.r0_net), // 超大单净流入
    turnover: num(s.turnover),
  }));
}

/* ---------------- 个股所属板块(东财): 行业/地域/概念 ---------------- */
/* 东财对突发请求会断连(WAF), 串行队列 + 双节点 + fetch/curl 双通道兜底 */
let emQueue = Promise.resolve();
let emPending = 0; // 排队+执行中的任务数
const EM_QUEUE_MAX = 20;
function emEnqueue(fn) {
  // 队列满直接拒绝, 不再无界排队(err.status 供路由层返回 503)
  if (emPending >= EM_QUEUE_MAX) {
    const err = new Error("busy, retry later");
    err.status = 503;
    return Promise.reject(err);
  }
  emPending++;
  const run = () => fn().finally(() => { emPending--; });
  const p = emQueue.then(run, run);
  emQueue = p.catch(() => {});
  return p;
}

async function handleStockBoards(code) {
  const m = String(code || "").toLowerCase().match(/^(sh|sz|bj)(\d{6})$/);
  if (!m) throw new Error("bad code");
  const market = m[1] === "sh" ? 1 : 0;
  return emEnqueue(async () => {
    let lastErr = new Error("empty stock-boards");
    for (const host of ["push2delay.eastmoney.com", "push2.eastmoney.com"]) {
      const url = `https://${host}/api/qt/stock/get?secid=${market}.${m[2]}&fields=f57,f58,f127,f128,f129`;
      for (const via of ["fetch", "curl"]) {
        try {
          const text =
            via === "fetch"
              ? await fetchText(url, { referer: "https://quote.eastmoney.com/" })
              : await curlText(url, { referer: "https://quote.eastmoney.com/", encoding: "utf-8" });
          const d = JSON.parse(text)?.data;
          if (d) {
            await sleep(60); // 队列节流
            return {
              code: `${m[1]}${m[2]}`,
              industry: d.f127 || "",
              area: d.f128 || "",
              concepts: String(d.f129 || "").split(",").filter(Boolean),
            };
          }
        } catch (e) {
          lastErr = e;
        }
        await sleep(400);
      }
    }
    throw lastErr;
  });
}

/* ---------------- 东财个股资金流(按股查询) + 主力净流入排名 ---------------- */
const emMarketOf = (m) => (m === "sh" ? 1 : 0);
const EM_FS = "m:0+t:6,m:0+t:80,m:1+t:2,m:1+t:23,m:0+t:81+s:2048";

async function emGet(url) {
  let lastErr = new Error("em request failed");
  for (const via of ["fetch", "curl"]) {
    try {
      const text =
        via === "fetch"
          ? await fetchText(url, { referer: "https://quote.eastmoney.com/" })
          : await curlText(url, { referer: "https://quote.eastmoney.com/", encoding: "utf-8" });
      await sleep(60); // 队列节流
      return JSON.parse(text);
    } catch (e) {
      lastErr = e;
      await sleep(400);
    }
  }
  throw lastErr;
}

const emSymbol = (code6) => `${"689".includes(code6[0]) ? "sh" : code6[0] === "4" || code6[0] === "8" ? "bj" : "sz"}${code6}`;

/** 主力净流入排名(clist, f62 降序) */
async function handleMoneyFlowEM(n) {
  return emEnqueue(async () => {
    const fields = "f12,f14,f2,f3,f62,f184,f66,f6,f8";
    const url = `https://push2delay.eastmoney.com/api/qt/clist/get?fid=f62&po=1&pz=${n}&pn=1&np=1&fltt=2&invt=2&fs=${encodeURIComponent(EM_FS)}&fields=${fields}`;
    const diff = (await emGet(url))?.data?.diff || [];
    return diff
      .filter((s) => s.f14 && num(s.f2) > 0)
      .map((s) => ({
        symbol: emSymbol(s.f12),
        name: s.f14,
        price: num(s.f2),
        pct: num(s.f3),
        amount: num(s.f6), // 成交额(元)
        netIn: num(s.f62), // 主力净流入(元)
        netRatio: num(s.f184), // 主力净占比(%)
        r0Net: num(s.f66), // 超大单净流入
        turnover: num(s.f8),
      }));
  });
}

/** 批量个股资金流(ulist 一次最多 50 只, 按 code 30s 缓存) */
async function handleStockFlows(codesParam) {
  const list = String(codesParam || "")
    .toLowerCase()
    .split(",")
    .map((s) => s.trim())
    .filter((s) => /^(sh|sz|bj)\d{6}$/.test(s))
    .slice(0, 150);
  const now = Date.now();
  const out = {};
  const missing = [];
  for (const c of list) {
    const hit = cache.get(`sf:${c}`);
    if (hit && hit.data !== undefined && now - hit.ts < 30000) out[c] = hit.data;
    else missing.push(c);
  }
  if (missing.length) {
    await emEnqueue(async () => {
      for (let i = 0; i < missing.length; i += 50) {
        const chunk = missing.slice(i, i + 50);
        const secids = chunk.map((c) => `${emMarketOf(c.slice(0, 2))}.${c.slice(2)}`).join(",");
        const url = `https://push2delay.eastmoney.com/api/qt/ulist.np/get?secids=${secids}&fields=f12,f62,f184&np=1&fltt=2&invt=2`;
        const diff = (await emGet(url))?.data?.diff || [];
        for (const d of diff) {
          const c = emSymbol(d.f12);
          const rec = { code: c, netIn: num(d.f62), netRatio: num(d.f184) };
          cacheSet(`sf:${c}`, { ts: Date.now(), data: rec, inflight: null, ttl: 30000 });
          out[c] = rec;
        }
      }
    });
  }
  return list.map((c) => out[c]).filter(Boolean);
}

/** 板块实时资金流向图: 流入/流出各取前N/2, 拉取分钟级累计主力净流入 */
async function handleBoardFlow(n) {
  const half = Math.max(3, Math.min(15, Math.floor((parseInt(n) || 20) / 2)));
  return emEnqueue(async () => {
    const pick = async (po) => {
      const url = `https://push2delay.eastmoney.com/api/qt/clist/get?fid=f62&po=${po}&pz=${half}&pn=1&np=1&fltt=2&invt=2&fs=${encodeURIComponent("m:90+t:2")}&fields=f12,f14,f62`;
      return ((await emGet(url))?.data?.diff || []).map((b) => ({
        code: b.f12,
        name: b.f14,
        netIn: num(b.f62),
      }));
    };
    const [ups, downs] = await Promise.all([pick(1), pick(0)]);
    const boards = [...ups, ...downs.filter((d) => !ups.some((u) => u.code === d.code))];
    const out = [];
    for (const b of boards) {
      try {
        const url = `https://push2delay.eastmoney.com/api/qt/stock/fflow/kline/get?secid=90.${b.code}&klt=1&lmt=0&fields1=f1,f2,f3,f7&fields2=f51,f52`;
        const kl = (await emGet(url))?.data?.klines || [];
        out.push({
          ...b,
          points: kl.map((s) => {
            const f = s.split(",");
            return { t: f[0].slice(11, 16), v: num(f[1]) }; // "2026-07-17 09:31" -> "09:31", 累计主力净流入(元)
          }),
        });
      } catch {
        out.push({ ...b, points: [] });
      }
    }
    return out;
  });
}

/* ---------------- 新浪接口(node fetch 被拦时回退 curl) ---------------- */
async function fetchSinaJson(url, { referer } = {}) {
  try {
    const text = await fetchText(url, { referer });
    return JSON.parse(text);
  } catch (e) {
    // node fetch 被新浪 WAF 拦截(返回HTML)时,改走 curl
    const text = await curlText(url, { referer });
    return JSON.parse(text);
  }
}

/* ---------------- 新浪 7x24 快讯 ---------------- */
function parseNewsItem(it) {
  const raw = it.rich_text || "";
  const m = raw.match(/^【(.+?)】([\s\S]*)$/);
  return {
    id: it.id,
    title: m ? m[1] : "",
    content: m ? m[2] : raw,
    time: it.create_time,
  };
}

/* 华尔街见闻快讯(兜底源,全球可达,CORS开放) */
async function fetchWscnNews(size) {
  const url = `https://api-one-wscn.awtmt.com/apiv1/content/lives?channel=global-channel&limit=${Math.min(size, 50)}`;
  const text = await fetchText(url);
  const json = JSON.parse(text);
  const items = json?.data?.items || [];
  const fmt = (sec) => {
    if (!sec) return "";
    const d = new Date(sec * 1000);
    const p = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
  };
  return items
    .filter((it) => it.content_text || it.content)
    .map((it, i) => ({
      id: it.id || it.display_time * 100 + i,
      title: it.title || "",
      content: (it.content_text || it.content || "").replace(/<[^>]+>/g, ""),
      time: fmt(it.display_time),
    }));
}

async function handleNews(page, size) {
  const url = `https://zhibo.sina.com.cn/api/zhibo/feed?page=${encodeURIComponent(page)}&page_size=${encodeURIComponent(size)}&zhibo_id=152&tag_id=0`;
  try {
    const json = await fetchSinaJson(url);
    const list = json?.result?.data?.feed?.list || [];
    if (list.length) return list.map(parseNewsItem);
    throw new Error("empty sina feed");
  } catch {
    return fetchWscnNews(size);
  }
}

/* ---------------- CNBC 美债收益率 ---------------- */
const TREASURY_SYMBOLS = ["US3M", "US6M", "US1Y", "US2Y", "US3Y", "US5Y", "US7Y", "US10Y", "US20Y", "US30Y"];
async function handleTreasuries() {
  const url = `https://quote.cnbc.com/quote-html-webservice/restQuote/symbolType/symbol?symbols=${TREASURY_SYMBOLS.join("|")}&requestMethod=quick&noform=1&partnerId=2&fund=1&output=json`;
  const text = await fetchText(url);
  const json = JSON.parse(text);
  const list = json?.FormattedQuoteResult?.FormattedQuote || [];
  return list
    .filter((q) => q.code === 0 && q.last)
    .map((q) => ({
      symbol: q.symbol,
      name: q.shortName || q.name,
      yield: num(String(q.last).replace("%", "")),
      change: num(q.change),
      time: q.last_time,
    }));
}

/* ---------------- 美债收益率历史曲线(美国财政部官方 CSV) ---------------- */
const TREASURY_CSV_COLS = {
  US3M: "3 Mo", US6M: "6 Mo", US1Y: "1 Yr", US2Y: "2 Yr", US3Y: "3 Yr",
  US5Y: "5 Yr", US7Y: "7 Yr", US10Y: "10 Yr", US20Y: "20 Yr", US30Y: "30 Yr",
};
async function handleTreasuryHistory() {
  const year = new Date().getFullYear();
  const byMonth = new Map(); // "2026-07" -> { date, yields }
  for (const y of [year - 1, year]) {
    const url = `https://home.treasury.gov/resource-center/data-chart-center/interest-rates/daily-treasury-rates.csv/${y}/all?type=daily_treasury_yield_curve&field_tdr_date_value=${y}&_format=csv`;
    const text = await fetchText(url);
    const lines = text.trim().split(/\r?\n/);
    const header = lines[0].split(",").map((h) => h.replace(/"/g, ""));
    const colIdx = Object.fromEntries(TREASURY_SYMBOLS.map((s) => [s, header.indexOf(TREASURY_CSV_COLS[s])]));
    for (const line of lines.slice(1)) {
      const f = line.split(",");
      const m = f[0].match(/(\d{2})\/(\d{2})\/(\d{4})/); // MM/DD/YYYY, 数据按日期降序
      if (!m) continue;
      const key = `${m[3]}-${m[1]}`;
      if (byMonth.has(key)) continue; // 首个命中即该月最后一个交易日
      const yields = {};
      for (const s of TREASURY_SYMBOLS) yields[s] = num(f[colIdx[s]]);
      byMonth.set(key, { date: `${m[3]}-${m[1]}-${m[2]}`, yields });
    }
  }
  return [...byMonth.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .slice(-13)
    .map(([, v]) => v);
}

/* ---------------- TTL 缓存 + 并发合并(防上游限流) ---------------- */
const cache = new Map();
const CACHE_MAX = 2000; // 条目上限, 防止用户输入拼 key 导致无界增长

// 清理过期/失效条目(过期按各条目自身 ttl 判断)
function sweepCache() {
  const now = Date.now();
  for (const [k, v] of cache) {
    if (!v.inflight && (v.data === undefined || now - v.ts > (v.ttl || 60000))) cache.delete(k);
  }
}

// 写缓存: 超限先清过期项, 仍超则按 Map 插入序淘汰最旧条目
function cacheSet(key, entry) {
  if (cache.has(key)) cache.delete(key); // 重插以刷新插入序
  cache.set(key, entry);
  if (cache.size <= CACHE_MAX) return;
  sweepCache();
  while (cache.size > CACHE_MAX) {
    let oldest;
    for (const [k, v] of cache) {
      if (!v.inflight) { oldest = k; break; }
    }
    if (oldest === undefined) break; // 全部在途, 不再淘汰
    cache.delete(oldest);
  }
}

// 定时 sweep, unref 避免阻止进程退出
const cacheSweeper = setInterval(sweepCache, 60000);
cacheSweeper.unref();

async function cached(key, ttl, fn) {
  const now = Date.now();
  const hit = cache.get(key);
  if (hit) {
    if (hit.data !== undefined && now - hit.ts < ttl) return hit.data;
    if (hit.inflight) return hit.inflight;
  }
  const inflight = fn()
    .then((data) => {
      cacheSet(key, { ts: Date.now(), data, inflight: null, ttl });
      return data;
    })
    .catch((e) => {
      const c = cache.get(key);
      cacheSet(key, { ts: c?.ts || 0, data: c?.data, inflight: null, ttl });
      if (c?.data !== undefined) return c.data; // 出错回退到旧数据
      throw e;
    });
  cacheSet(key, { ts: hit?.ts || 0, data: hit?.data, inflight, ttl });
  return inflight;
}

/* ---------------- OpenRouter 大模型 Token 消耗量(厂商聚合) ---------------- */
const OR_KEY = process.env.OPENROUTER_API_KEY || ""; // .env 已在文件顶部统一加载
const OR_DATA_FILE = path.join(__dirname, "data", "openrouter-usage.json");

const VENDOR_MAP = {
  openai: "OpenAI", anthropic: "Anthropic", google: "Google",
  deepseek: "DeepSeek", qwen: "通义千问", minimax: "MiniMax",
  "z-ai": "智谱GLM", moonshotai: "月之暗面", stepfun: "阶跃星辰",
  xiaomi: "小米", tencent: "腾讯", nvidia: "NVIDIA",
  "meta-llama": "Meta", mistralai: "Mistral", cohere: "Cohere", "x-ai": "xAI",
  poolside: "Poolside", meituan: "美团", "nex-agi": "nex-agi",
  inclusionai: "inclusionai", bytedance: "字节跳动", baai: "BAAI",
  perplexity: "Perplexity",
};

function vendorSlug(slug) {
  if (slug === "other") return "其他";
  const p = slug.split("/")[0];
  return VENDOR_MAP[p] || p;
}

const COUNTRY_MAP = {
  "腾讯":"🇨🇳中国","小米":"🇨🇳中国","DeepSeek":"🇨🇳中国","智谱GLM":"🇨🇳中国",
  "月之暗面":"🇨🇳中国","MiniMax":"🇨🇳中国","阶跃星辰":"🇨🇳中国","通义千问":"🇨🇳中国","美团":"🇨🇳中国","nex-agi":"🇨🇳中国","字节跳动":"🇨🇳中国","BAAI":"🇨🇳中国",
  "OpenAI":"🇺🇸美国","Anthropic":"🇺🇸美国","Google":"🇺🇸美国","Meta":"🇺🇸美国",
  "NVIDIA":"🇺🇸美国","xAI":"🇺🇸美国","Cohere":"🇺🇸美国","Poolside":"🇺🇸美国","inclusionai":"🇺🇸美国","Perplexity":"🇺🇸美国",
};

function country(name) { return COUNTRY_MAP[name] || "🌍其他"; }

async function handleOpenRouterUsage() {
  // 读取本地缓存（持久化存储，不断积累）
  let cached = [];
  try { cached = JSON.parse(fs.readFileSync(OR_DATA_FILE, "utf-8") || "[]"); } catch {}
  const cachedDates = new Set(cached.map((r) => r.date));

  // 确定需要拉取的日期范围
  const today = new Date();
  const todayStr = new Date(today - 86400000).toISOString().slice(0, 10); // API 数据至少次日才可用
  let fetchRanges = [];
  const earliest = "2025-01-01";
  if (cached.length === 0) {
    // 首次运行：分段拉取，每段不超过 366 天
    const maxSpan = 200;
    let s = new Date(earliest);
    while (s < today) {
      const e = new Date(s);
      e.setDate(e.getDate() + maxSpan - 1);
      const end = e < today ? e : new Date(today - 86400000);
      fetchRanges.push({ start: s.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) });
      s.setDate(s.getDate() + maxSpan);
    }
  } else {
    // 已有缓存：从最新数据次日开始，补到昨天
    const lastDate = cached.reduce((a, b) => a.date > b.date ? a : b).date;
    const nextDay = new Date(lastDate);
    nextDay.setDate(nextDay.getDate() + 1);
    const start = nextDay.toISOString().slice(0, 10);
    if (start < todayStr) fetchRanges.push({ start, end: todayStr });
  }

  if (fetchRanges.length === 0) return cached;

  try {
    for (const { start, end } of fetchRanges) {
      const url = `https://openrouter.ai/api/v1/datasets/rankings-daily?start_date=${start}&end_date=${end}`;
      const resp = await fetch(url, { headers: { Authorization: `Bearer ${OR_KEY}`, Accept: "application/json" }, signal: AbortSignal.timeout(120000) });
      if (!resp.ok) throw new Error(`HTTP ${resp.status} ${start}~${end}`);
      const body = await resp.json();
      const rows = body?.data || [];

      // 按日期+厂商聚合 token
      const byDV = {};
      for (const r of rows) {
        const dt = r.date, v = vendorSlug(r.model_permaslug);
        if (cachedDates.has(dt)) continue;
        if (!byDV[dt]) byDV[dt] = {};
        byDV[dt][v] = (byDV[dt][v] || 0n) + BigInt(Math.round(Number(r.total_tokens) || 0)); // 上游可能返回浮点/字符串, 直接 BigInt() 会 throw
      }

      for (const [dt, vMap] of Object.entries(byDV)) {
        const total = Object.values(vMap).reduce((a, b) => a + b, 0n);
        const providers = Object.entries(vMap).map(([name, tokens]) => ({
          name, tokens: Number(tokens),
          pct: Number((tokens * 10000n / total)) / 100,
        })).sort((a, b) => b.tokens - a.tokens);
        const byCountry = {};
        for (const p of providers) {
          const c = country(p.name);
          byCountry[c] = (byCountry[c] || 0n) + BigInt(p.tokens);
        }
        const countries = Object.entries(byCountry).map(([name, tokens]) => ({
          name, tokens: Number(tokens),
          pct: Number((tokens * 10000n / total)) / 100,
        })).sort((a, b) => b.tokens - a.tokens);
        cached.push({ date: dt, total: Number(total), providers, countries });
      }
    }

    cached.sort((a, b) => a.date.localeCompare(b.date));
    try {
      fs.mkdirSync(path.dirname(OR_DATA_FILE), { recursive: true });
      await fs.promises.writeFile(OR_DATA_FILE, JSON.stringify(cached)); // 异步写, 不阻塞事件循环
    } catch (e) {
      console.error("[or-usage] save error:", e?.message || e); // 落盘失败不影响主流程
    }
    return cached;
  } catch (e) {
    console.error("[or-usage] fetch error:", e?.message || e);
    if (cached.length) return cached;
    return [{ date: todayStr, total: 0, providers: [], countries: [] }];
  }
}
/* ---------------- 生意社现期对照表(现货价/期货价/基差) + 现货历史积累 ---------------- */
const SPOT_DATA_FILE = path.join(__dirname, "data", "spot-history.json");

// 现货积累按北京时间取日期(商品交易日历)
const bjToday = () => new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10);

// 生意社华为云 HW_CHECK 质询绕过: 质询页 JS 内嵌 cookie 值, 提取后带 cookie 重试
async function fetchSunsir(url, { timeout = 12000 } = {}) {
  const once = (cookie) => {
    const headers = { "User-Agent": UA, Accept: "text/html" };
    if (cookie) headers.Cookie = cookie;
    return fetch(url, { headers, signal: AbortSignal.timeout(timeout) });
  };
  let resp = await once();
  let text = await resp.text();
  if (text.length < 4000 && text.includes("HW_CHECK")) {
    const m = text.match(/=\s*"([0-9a-f]{16,})"/);
    if (m) {
      resp = await once(`HW_CHECK=${m[1]}`);
      text = await resp.text();
    }
  }
  if (text.includes("HW_CHECK") && text.length < 4000) throw new Error("sunsir waf challenge failed");
  return text;
}

function parseSfTable(html) {
  const parts = html.split(/<td colspan="8"[^>]*>([^<]+)<\/td>/i);
  const rows = [];
  for (let i = 1; i < parts.length; i += 2) {
    const exchange = parts[i];
    const body = parts[i + 1] || "";
    const chunks = body.split(/<tr[^>]*bgcolor="#fafdff"[^>]*>/i);
    for (let c = 1; c < chunks.length; c++) {
      let chunk = chunks[c];
      // 嵌套 table 内的 font 值依次为 基差1/基差率1/基差2/基差率2
      const fonts = [...chunk.matchAll(/<font[^>]*>(-?[\d.,]+%?)<\/font>/g)].map((m) => m[1]);
      chunk = chunk.replace(/<table[\s\S]*?<\/table>/g, "");
      const cells = [...chunk.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)]
        .map((m) => m[1].replace(/<[^>]+>/g, "").replace(/&nbsp;/g, "").trim())
        .filter((v) => v !== "");
      if (cells.length < 4 || !cells[0]) continue;
      const basisPct1 = parseFloat(fonts[1]);
      rows.push({
        exchange,
        name: cells[0],
        spot: num(cells[1]),
        contract: cells[2] || "",
        futures: num(cells[3]),
        basis: num(fonts[0]),
        basisPct: Number.isFinite(basisPct1) ? basisPct1 : 0,
      });
    }
  }
  return rows;
}

async function handleSpotTable() {
  const html = await fetchSunsir("https://www.100ppi.com/sf/");
  const dm = html.match(/20\d{2}年\d{1,2}月\d{1,2}日/);
  const date = dm ? dm[0].replace(/[年月]/g, "-").replace("日", "") : new Date().toISOString().slice(0, 10);
  const rows = parseSfTable(html);
  if (!rows.length) throw new Error("sunsir sf table parse empty");
  // 现货价按日积累(与 openrouter-usage 同模式), 供现货趋势线使用
  let history = {};
  try { history = JSON.parse(fs.readFileSync(SPOT_DATA_FILE, "utf-8") || "{}"); } catch {}
  const today = bjToday();
  for (const r of rows) {
    if (!r.spot) continue;
    const arr = history[r.name] || (history[r.name] = []);
    if (arr.length && arr[arr.length - 1].t === today) arr[arr.length - 1].p = r.spot;
    else arr.push({ t: today, p: r.spot });
    if (arr.length > 400) arr.splice(0, arr.length - 400);
  }
  try {
    fs.mkdirSync(path.dirname(SPOT_DATA_FILE), { recursive: true });
    await fs.promises.writeFile(SPOT_DATA_FILE, JSON.stringify(history)); // 异步写
  } catch (e) { console.error("[spot] write history error:", e?.message || e); }
  return { date, rows, history };
}

/* ---------------- 生意社化工现货(报价中心 plist 页, 中位数为代表价) ---------------- */
async function handleChemSpot(id, name) {
  const html = await fetchSunsir(`https://www.100ppi.com/mprice/plist-1-${encodeURIComponent(id)}-1.html`);
  // 行结构: 品名/规格/产地/价格(元/吨)/价格类型/交货地/企业/日期
  const market = []; // 市场价(真实行情)
  const all = [];
  for (const m of html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)) {
    const row = m[1];
    const pm = row.match(/>\s*([\d.]+)\s*元\/吨\s*</);
    if (!pm || !row.includes("p-name")) continue;
    const p = num(pm[1]);
    all.push(p);
    if (row.includes("市场价")) market.push(p);
  }
  if (!all.length) throw new Error("chem spot parse empty");
  // 优先市场价中位数(出厂价多为厂商挂高价); 无市场价则全体中位数
  const pool = market.length ? market : all;
  pool.sort((a, b) => a - b);
  const mid = pool.length >> 1;
  const price = pool.length % 2 ? pool[mid] : +((pool[mid - 1] + pool[mid]) / 2).toFixed(2);
  const dm = html.match(/>(20\d{2}-\d{2}-\d{2})</);
  // 历史积累(与现货表同一文件)
  let history = {};
  try { history = JSON.parse(fs.readFileSync(SPOT_DATA_FILE, "utf-8") || "{}"); } catch {}
  const arr = history[name] || (history[name] = []);
  const today = bjToday();
  if (arr.length && arr[arr.length - 1].t === today) arr[arr.length - 1].p = price;
  else arr.push({ t: today, p: price });
  if (arr.length > 400) arr.splice(0, arr.length - 400);
  try {
    fs.mkdirSync(path.dirname(SPOT_DATA_FILE), { recursive: true });
    await fs.promises.writeFile(SPOT_DATA_FILE, JSON.stringify(history));
  } catch (e) { console.error("[chem-spot] write history error:", e?.message || e); }
  return { id, name, price, quotes: all.length, date: dm ? dm[1] : today, history: arr };
}

/* ---------------- 现货每日定时采集(服务端自驱, 无需前端在线) ---------------- */
// 与前端 src/config/goods.ts 的 CHEM_SPOTS 保持一致
const CHEM_SPOT_SEEDS = [["7250", "碳酸亚乙烯酯"]];

async function collectSpotDaily() {
  try {
    await handleSpotTable();
    console.log("[spot] 定时采集: 现期表完成");
  } catch (e) { console.error("[spot] 定时采集: 现期表失败:", e?.message || e); }
  for (const [id, name] of CHEM_SPOT_SEEDS) {
    try {
      await handleChemSpot(id, name);
      console.log("[spot] 定时采集: 化工现货", name, "完成");
    } catch (e) { console.error("[spot] 定时采集: 化工现货", name, "失败:", e?.message || e); }
  }
}
// 生意社交易日 16:30 更新, 每 4 小时采集一轮保证覆盖; unref 不阻止进程退出
setInterval(collectSpotDaily, 4 * 3600 * 1000).unref();
// 启动 1 分钟后先补一轮(部署当日即有数据)
setTimeout(collectSpotDaily, 60 * 1000).unref();

/* ---------------- 股票搜索(名称/拼音首字母→代码) ---------------- */
async function handleStockSearch(query) {
  if (!query || query.length < 1) return [];
  const url = `https://suggest3.sinajs.cn/suggest/type=&key=${encodeURIComponent(query)}`;
  const resp = await fetch(url, { signal: AbortSignal.timeout(5000) });
  const buf = await resp.arrayBuffer();
  const text = new TextDecoder("gbk").decode(buf);
  const m = text.match(/suggestvalue="([^"]+)"/);
  if (!m) return [];
  // 格式: name,type,code,fullCode,pinyin,...;
  const results = [];
  for (const part of m[1].split(";")) {
    const f = part.split(",");
    if (f.length >= 4 && /^(sh|sz|bj)\d{6}$/.test(f[3])) {
      results.push({ code: f[3], name: f[0], pinyin: f[4] || "" });
    }
  }
  return results.slice(0, 10);
}
/* ------------------------------------------------------------- */

/* ---------------- 产业链股票解析(本地正则,无需LLM) ---------------- */
function handleChainParse(body) {
  const { name = "", content = "" } = body || {};
  const warnings = [];

  if (!content.trim()) {
    return { name, source: "local", segments: [], warnings: ["content is empty"] };
  }

  // 尝试按 iWenCai 段落标题分段: 上游·材料/设备、中游·制造/封测、下游·应用/终端
  const sectionHeaders = [
    { key: "上游", name: "上游·材料/设备", desc: "原材料、设备与零部件等上游环节" },
    { key: "中游", name: "中游·制造/封测", desc: "代工、制造与封测等中游环节" },
    { key: "下游", name: "下游·应用/终端", desc: "应用、终端与整车等下游客群" },
  ];

  // 提取股票代码: 支持 NAME(CODE.SZ) 和 CODE NAME 两种格式
  const stocksFromText = (text) => {
    const results = [];
    const seen = new Set();
    // 给代码加上市场前缀
    const prefixed = (code) => {
      const c = code.replace(/\D/g, "").slice(-6).padStart(6, "0");
      if (/^6/.test(c)) return `sh${c}`;
      if (/^[03]/.test(c)) return `sz${c}`;
      if (/^[489]/.test(c)) return `bj${c}`;
      return c;
    };
    // 格式1: 中文名称（CODE.SH/SZ/BJ）或 中文名称(CODE)
    const re1 = /([\u4e00-\u9fa5]{2,6})[（(]\s*(?:sh|sz|bj)?(\d{6})[^）)]*[）)]/gi;
    let m;
    while ((m = re1.exec(text)) !== null) {
      const code = prefixed(m[2]);
      const key = `${code}:${m[1]}`;
      if (!seen.has(key)) { seen.add(key); results.push({ code, name: m[1] }); }
    }
    // 格式2: CODE.SH/SZ/BJ 中文名称 或 CODE 中文名称
    const re2 = /(?:sh|sz|bj)?(\d{6})\s*([\u4e00-\u9fa5]{2,6})/g;
    while ((m = re2.exec(text)) !== null) {
      const code = prefixed(m[1]);
      const key = `${code}:${m[2]}`;
      if (!seen.has(key)) { seen.add(key); results.push({ code, name: m[2] }); }
    }
    return results;
  };

  // 先按段落标题切分
  const lines = content.split("\n");
  let currentSection = -1; // -1 = 未进入任何段落
  const sectionTexts = ["", "", ""];

  for (const line of lines) {
    const trimmed = line.trim();
    for (let i = 0; i < sectionHeaders.length; i++) {
      if (trimmed.includes(sectionHeaders[i].key) && (trimmed.includes("上游") || trimmed.includes("中游") || trimmed.includes("下游"))) {
        // 检查是否真的是段落标题（包含材料/制造/应用或类似关键词，或只有标题没有股票）
        if (trimmed.length < 20 || !trimmed.match(/[\u4e00-\u9fa5]{2,6}[（(]\s*\d{4}/)) {
          currentSection = i;
          break;
        }
      }
    }
    if (currentSection >= 0 && currentSection < 3) {
      // 跳过标题行本身
      if (!trimmed.includes(sectionHeaders[currentSection].key) || trimmed.length < 15) {
        sectionTexts[currentSection] += "\n" + trimmed;
      }
    }
  }

  // 如果段落切分成功（至少两段有股票），用段落方式
  const segments = sectionHeaders.map((header, i) => {
    const stocks = sectionTexts[i] ? stocksFromText(sectionTexts[i]) : [];
    return { name: header.name, desc: header.desc, stocks: stocks.slice(0, 10) };
  });

  const totalBySections = segments.reduce((s, seg) => s + seg.stocks.length, 0);

  // 段落切分不理想时，回退：全文提取 + 关键词匹配
  if (totalBySections < 3) {
    const allStocks = stocksFromText(content);
    if (allStocks.length === 0) {
      return { name, source: "local", segments: [], warnings: ["未从文本中提取到任何A股股票"] };
    }

    // 按股票名称关键词分配到三段
    const segmentKeywords = [
      { keywords: ["材料", "设备", "原料", "矿产", "化工", "硅", "锂", "稀土", "靶材", "晶圆", "气体", "试剂", "新材", "半导体", "芯片", "元器件", "元件", "部件", "模组"] },
      { keywords: ["代工", "制造", "封测", "组装", "加工", "铸造", "冶炼", "封装", "测试", "PCB", "面板", "光伏", "绿能", "电池", "电芯", "电机", "集成", "系统"] },
      { keywords: ["应用", "终端", "整车", "车企", "汽车", "消费", "手机", "电脑", "服务器", "机器人", "无人机", "储能", "运营", "服务", "互联网", "平台", "AI", "智能", "数据", "软件", "方案", "车"] },
    ];

    const unassigned = [...allStocks];
    const fallbackSegments = segmentKeywords.map((rule) => {
      const stocks = [];
      for (let i = unassigned.length - 1; i >= 0; i--) {
        if (stocks.length >= 10) break;
        if (rule.keywords.some((kw) => unassigned[i].name.includes(kw))) {
          stocks.push(unassigned[i]);
          unassigned.splice(i, 1);
        }
      }
      stocks.reverse();
      return stocks;
    });

    if (unassigned.length > 0 && unassigned.length < allStocks.length) {
      warnings.push(`${unassigned.length} 只股票未能匹配产业链关键词: ${unassigned.map(s => s.name).join("、")}`);
    }

    return {
      name, source: "local",
      segments: sectionHeaders.map((h, i) => ({ name: h.name, desc: h.desc, stocks: fallbackSegments[i] })),
      warnings,
    };
  }

  return { name, source: "local", segments, warnings };
}

/* ---------------- 主机路由表 ---------------- */
const routes = {
  "/api/quotes": async (q) =>
    cached(`quotes:${q.get("codes")}`, 1500, () => handleQuotes(q.get("codes") || "")),
  "/api/minute": async (q) =>
    cached(`minute:${q.get("code")}`, 5000, () => handleMinute(q.get("code") || "sh000001")),
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
    cached(`chem:${q.get("id")}`, 8 * 3600000, () => handleChemSpot(q.get("id") || "", q.get("name") || q.get("id") || "")), // 生意社化工现货, 8h缓存
  "/api/future-minute": async (q) =>
    cached(`fmin:${q.get("code")}`, 60000, () => handleFutureMinute(q.get("code") || "")),
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
  "/api/stock-flow": async (q) =>
    handleStockFlows(q.get("code") || "").then((rows) => rows[0] || Promise.reject(new Error("empty stock-flow"))),
  "/api/stock-flows": async (q) => handleStockFlows(q.get("codes") || ""),
  "/api/board-flow": async (q) => cached(`bf:${q.get("n")}`, 120000, () => handleBoardFlow(q.get("n") || "20")),
  "/api/stock-boards": async (q) =>
    cached(`sb:${q.get("code")}`, 24 * 3600 * 1000, () => handleStockBoards(q.get("code") || "")),
  "/api/news": async (q) =>
    cached(`news:${q.get("page")}:${q.get("size")}`, 8000, () =>
      handleNews(q.get("page") || "1", q.get("size") || "40")
    ),
  "/api/treasuries": async () => cached("treasuries", 30000, () => handleTreasuries()),
  "/api/treasury-history": async () => cached("treasury-history", 6 * 3600 * 1000, () => handleTreasuryHistory()),
  "/api/health": async () => ({ status: "up", ts: Date.now(), cache: cache.size }),
  "/api/openrouter-usage": async () => cached("or-usage", 3600000, () => handleOpenRouterUsage()), // 1h cache
  "/api/mystery-select": async (q) =>
    cached(`ms:${q.get("query")}:${q.get("limit")}:${q.get("page")}`, 60000, () =>
      handleMysterySelect(q.get("query") || "", q.get("limit") || "30", q.get("page") || "1")
    ),
  "/api/stock-search": async (q) =>
    cached(`ssearch:${q.get("q")}`, 5000, () => handleStockSearch(q.get("q") || "")), // 前端击键触发, 短缓存防新浪WAF
  "/api/chain-parse": async (_q, body) => handleChainParse(body || {}),
};

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

/* ---------------- 私有 API key 端点的同源防护 ---------------- */
const PROTECTED_ROUTES = new Set(["/api/mystery-select", "/api/openrouter-usage"]);

// 带 Origin/Referer 时其 host 必须与请求 Host 一致; 都不带(curl/同源导航)则放行
function isSameOrigin(req) {
  const host = req.headers.host;
  if (!host) return true;
  for (const h of [req.headers.origin, req.headers.referer]) {
    if (!h) continue;
    try {
      if (new URL(h).host !== host) return false;
    } catch {
      return false;
    }
  }
  return true;
}

// 受保护端点不下发 ACAO:*; 同源且带 Origin 时反射该 Origin
function corsHeadersFor(req, pathname) {
  if (!PROTECTED_ROUTES.has(pathname)) return {};
  const origin = req.headers.origin;
  return { "Access-Control-Allow-Origin": origin && isSameOrigin(req) ? origin : null };
}

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
    if (routes[u.pathname]) {
      const cors = corsHeadersFor(req, u.pathname);
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
          try { body = JSON.parse(r.buf.toString()); } catch { body = {}; }
        }
        const data = await routes[u.pathname](u.searchParams, body);
        send(res, 200, { ok: true, data, ts: Date.now() }, cors);
      } catch (e) {
        // 内部细节只记日志; err.status 由可预期的业务错误(如队列满)携带, 其 message 可安全回显
        console.error("[api]", u.pathname, "error:", e?.message || e);
        send(res, e?.status || 502, { ok: false, error: e?.status ? e.message : "upstream error" }, cors);
      }
      return;
    }
    // /api/ 下未命中的路由返回 404 JSON, 不走 SPA fallback
    if (u.pathname.startsWith("/api/")) {
      send(res, 404, { ok: false, error: "not found" });
      return;
    }
    // 静态资源 + SPA fallback
    let p = decodeURIComponent(u.pathname);
    if (p === "/") p = "/index.html";
    const file = path.join(DIST, path.normalize(p));
    if (file !== DIST && !file.startsWith(DIST + path.sep)) {
      send(res, 403, { ok: false });
      return;
    }
    fs.readFile(file, (err, buf) => {
      if (err) {
        fs.readFile(path.join(DIST, "index.html"), (e2, html) => {
          if (e2) return send(res, 404, { ok: false });
          res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "X-Content-Type-Options": "nosniff" });
          res.end(html);
        });
        return;
      }
      res.writeHead(200, {
        "Content-Type": MIME[path.extname(file).toLowerCase()] || "application/octet-stream",
        "Cache-Control": file.includes("/assets/") ? "public, max-age=31536000, immutable" : "no-cache",
        "X-Content-Type-Options": "nosniff",
      });
      res.end(buf);
    });
  } catch (e) {
    console.error("[server] error:", e?.message || e);
    send(res, 500, { ok: false, error: "internal error" });
  }
});

server.listen(PORT, () => console.log(`[market-cockpit] listening on :${PORT}`));

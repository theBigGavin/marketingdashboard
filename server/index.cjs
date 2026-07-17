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
  res.writeHead(code, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Cache-Control": "no-store",
    ...extra,
  });
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
  const url = `https://ifzq.gtimg.cn/appstock/app/mktHs/rank?l=${n}&p=1&t=${type}/averatio&o=${dir}`;
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
    const url = `https://proxy.finance.qq.com/cgi/cgi-bin/rank/hs/getBoardRankList?board_code=${encodeURIComponent(code)}&sort_type=PriceRatio&direct=${dir}&offset=${offset}&count=100`;
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

/* ---------------- 内盘期货(沪金等):新浪 nf_ ---------------- */
function parseSinaDomestic(text) {
  const out = {};
  const re = /hq_str_(nf_\w+)="([^"]*)"/g;
  let m;
  while ((m = re.exec(text))) {
    const f = m[2].split(",");
    if (f.length < 17 || !f[0]) continue;
    const price = num(f[5]);
    const prevSettle = num(f[9]);
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
    const [klines, ticker] = await Promise.all([
      fetchJsonAny(["https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=1m&limit=240"]),
      fetchJsonAny(["https://api.binance.com/api/v3/ticker/24hr?symbol=BTCUSDT"]),
    ]);
    const pts = klines.map((k) => {
      const d = new Date(k[0]);
      return { t: `${String(d.getHours()).padStart(2, "0")}${String(d.getMinutes()).padStart(2, "0")}`, p: num(k[4]) };
    });
    return { code, prec: num(ticker.prevClosePrice), points: pts };
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

/* ---------------- 个股榜单(涨幅/跌幅/热门) — 新浪盘中 + 腾讯盘后双源 ---------------- */
async function rankViaSina(sort, asc, want) {
  const fetchN = Math.min(100, Math.max(want * 3, 60));
  const url = `https://vip.stock.finance.sina.com.cn/quotes_service/api/json_v2.php/Market_Center.getHQNodeData?page=1&num=${fetchN}&sort=${sort}&asc=${asc}&node=hs_a&symbol=&_s_r_a=page`;
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
  const url = `https://proxy.finance.qq.com/cgi/cgi-bin/rank/hs/getBoardRankList?board_code=aStock&sort_type=${sortMap[sort] || "PriceRatio"}&direct=${asc === "1" ? "up" : "down"}&offset=0&count=${want}`;
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
function emEnqueue(fn) {
  const p = emQueue.then(fn, fn);
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
          cache.set(`sf:${c}`, { ts: Date.now(), data: rec, inflight: null });
          out[c] = rec;
        }
      }
    });
  }
  return list.map((c) => out[c]).filter(Boolean);
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
  const url = `https://zhibo.sina.com.cn/api/zhibo/feed?page=${page}&page_size=${size}&zhibo_id=152&tag_id=0`;
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
async function cached(key, ttl, fn) {
  const now = Date.now();
  const hit = cache.get(key);
  if (hit) {
    if (hit.data !== undefined && now - hit.ts < ttl) return hit.data;
    if (hit.inflight) return hit.inflight;
  }
  const inflight = fn()
    .then((data) => {
      cache.set(key, { ts: Date.now(), data, inflight: null });
      return data;
    })
    .catch((e) => {
      const c = cache.get(key);
      cache.set(key, { ts: c?.ts || 0, data: c?.data, inflight: null });
      if (c?.data !== undefined) return c.data; // 出错回退到旧数据
      throw e;
    });
  cache.set(key, { ts: hit?.ts || 0, data: hit?.data, inflight });
  return inflight;
}

/* ---------------- 路由 ---------------- */
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
    cached(`futures:${q.get("list")}`, 15000, () => handleFutures(q.get("list") || "hf_GC,hf_XAU,hf_SI,hf_CAD,hf_CL,nf_AU0,BTCUSDT")),
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
  "/api/stock-boards": async (q) =>
    cached(`sb:${q.get("code")}`, 24 * 3600 * 1000, () => handleStockBoards(q.get("code") || "")),
  "/api/news": async (q) =>
    cached(`news:${q.get("page")}:${q.get("size")}`, 8000, () =>
      handleNews(q.get("page") || "1", q.get("size") || "40")
    ),
  "/api/treasuries": async () => cached("treasuries", 30000, () => handleTreasuries()),
  "/api/treasury-history": async () => cached("treasury-history", 6 * 3600 * 1000, () => handleTreasuryHistory()),
  "/api/health": async () => ({ status: "up", ts: Date.now(), cache: cache.size }),
};

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".mp4": "video/mp4",
};

const server = http.createServer(async (req, res) => {
  try {
    const u = new URL(req.url, "http://localhost");
    if (routes[u.pathname]) {
      try {
        const data = await routes[u.pathname](u.searchParams);
        send(res, 200, { ok: true, data, ts: Date.now() });
      } catch (e) {
        send(res, 502, { ok: false, error: String(e.message || e) });
      }
      return;
    }
    // 静态资源 + SPA fallback
    let p = decodeURIComponent(u.pathname);
    if (p === "/") p = "/index.html";
    const file = path.join(DIST, path.normalize(p));
    if (!file.startsWith(DIST)) {
      send(res, 403, { ok: false });
      return;
    }
    fs.readFile(file, (err, buf) => {
      if (err) {
        fs.readFile(path.join(DIST, "index.html"), (e2, html) => {
          if (e2) return send(res, 404, { ok: false });
          res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
          res.end(html);
        });
        return;
      }
      res.writeHead(200, {
        "Content-Type": MIME[path.extname(file).toLowerCase()] || "application/octet-stream",
        "Cache-Control": file.includes("/assets/") ? "public, max-age=31536000, immutable" : "no-cache",
      });
      res.end(buf);
    });
  } catch (e) {
    send(res, 500, { ok: false, error: String(e.message || e) });
  }
});

server.listen(PORT, () => console.log(`[market-cockpit] listening on :${PORT}`));

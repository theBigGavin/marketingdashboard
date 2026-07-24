/** 数据 API 客户端
 *  优先走本站 Node 代理(聚合新浪/CNBC 等无跨域源);
 *  代理不可用时,腾讯系接口(qt.gtimg.cn / ifzq.gtimg.cn,天然 CORS)由浏览器直连兜底。
 */

import { usePolling } from "@/hooks/usePolling";

export interface Quote {
  symbol: string;
  name: string;
  price: number;
  prev: number;
  open: number;
  high: number;
  low: number;
  change: number;
  pct: number;
  amount: number; // 万元
  turnover: number;
  time: string;
}

export interface FutureQuote {
  symbol: string;
  name: string;
  price: number;
  prev: number;
  open: number;
  high: number;
  low: number;
  change: number;
  pct: number;
  time: string;
}

export interface Board {
  code: string;
  name: string;
  price: number;
  change: number;
  pct: number;
  pct5: number;
  pct20: number;
  leadCode: string;
  leadName: string;
  leadPrice: number;
  leadPct: number;
}

export interface BoardStock {
  code: string;
  name: string;
  price: number;
  pct: number;
  turnover: number;
  pe: number;
  speed: number;
  circ_mv: number;
  amount: number; // 元(估算)
}

export interface RankStock {
  symbol: string;
  code: string;
  name: string;
  price: number;
  change: number;
  pct: number;
  amount: number; // 元
  turnover: number;
  pe: number;
  circ_mv: number; // 万元
  time: string;
}

export interface FlowStock {
  symbol: string;
  name: string;
  price: number;
  pct: number;
  amount: number;
  netIn: number; // 元
  netRatio: number;
  r0Net: number;
  turnover: number;
}

/** 个股所属板块(行业/地域/概念) */
export interface StockBoards {
  code: string;
  industry: string;
  area: string;
  concepts: string[];
}

/** 个股资金流(东财, 主力净流入/净占比) */
export interface StockFlow {
  code: string;
  netIn: number; // 主力净流入(元)
  netRatio: number; // 主力净占比(%)
  date?: string;
  close?: number;
  pct?: number;
}

/** 板块资金流向曲线(分钟级累计主力净流入) */
export interface BoardFlow {
  code: string;
  name: string;
  netIn: number; // 元
  points: { t: string; v: number }[];
}

export interface NewsItem {
  id: number;
  title: string;
  content: string;
  time: string;
}

export interface Treasury {
  symbol: string;
  name: string;
  yield: number;
  change: number;
  time: string;
}

/** 月度历史收益率曲线快照(财政部官方口径) */
export interface TreasuryCurvePoint {
  date: string; // 该月最后一个交易日
  yields: Record<string, number>; // US3M..US30Y -> 收益率(%)
}

export interface OrUsagePoint {
  date: string;
  name: string;
  tokens: number;
  pct: number;
}

export interface OrUsageDay {
  date: string;
  total: number;
  providers: OrUsagePoint[];
  countries: OrUsagePoint[];
}

/** iWenCai 搜索结果(问财选股) */
export interface MysteryStock {
  code: string;
  name: string;
  price?: number;
  pct?: number;
  ratio?: number;
  avgAmount3?: number;
  avgAmount20?: number;
  rangePct5?: number;
  raw?: Record<string, unknown>;
}

export interface MysteryResult {
  query: string;
  total: number;
  rows: MysteryStock[];
  chunksInfo?: Record<string, unknown>;
}

export interface MinuteData {
  code: string;
  prec: number;
  points: { t: string; p: number }[];
}

/** 期货日线K线(归一化) */
export interface DailyBar {
  t: string; // "2026-07-23"
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

export interface FutureDaily {
  code: string;
  points: DailyBar[];
}

/** 生意社现期对照行 */
export interface SpotRow {
  exchange: string;
  name: string;
  spot: number;
  contract: string;
  futures: number;
  basis: number;
  basisPct: number;
}

export interface SpotTable {
  date: string;
  rows: SpotRow[];
  /** 按品种名积累的现货日度历史 */
  history: Record<string, { t: string; p: number }[]>;
}

/** 生意社化工现货(报价中心) */
export interface ChemSpot {
  id: string;
  name: string;
  price: number;
  quotes: number;
  date: string;
  history: { t: string; p: number }[];
}

/** 股票搜索(名称/拼音首字母→代码) */
export interface StockSearchResult {
  code: string;
  name: string;
  pinyin: string;
}

const num = (v: unknown) => {
  const n = parseFloat(String(v));
  return Number.isFinite(n) ? n : 0;
};

async function get<T>(path: string): Promise<T> {
  const r = await fetch(path, { signal: AbortSignal.timeout(10000) });
  const j = await r.json().catch(() => null);
  if (!r.ok) throw new Error(j?.error || `HTTP ${r.status}`);
  if (!j?.ok) throw new Error(j?.error || "api error");
  return j.data as T;
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const r = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10000),
  });
  const j = await r.json().catch(() => null);
  if (!r.ok) throw new Error(j?.error || `HTTP ${r.status}`);
  if (!j?.ok) throw new Error(j?.error || "api error");
  return j.data as T;
}

/** 大宗商品浏览器直连兜底:腾讯 hf_ 外盘期货(CORS 开放) */
function parseFuturesText(text: string): Record<string, FutureQuote> {
  const out: Record<string, FutureQuote> = {};
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

/** 内盘期货(沪金等 nf_)直连解析: 字段布局与外盘 hf_ 不同, 与服务端 parseSinaDomestic 对齐 */
function parseDomesticFuturesText(text: string): Record<string, FutureQuote> {
  const out: Record<string, FutureQuote> = {};
  const re = /(?:hq_str_|v_)(nf_\w+)="([^"]*)"/g;
  let m;
  while ((m = re.exec(text))) {
    const f = m[2].split(",");
    if (f.length < 17 || !f[0]) continue;
    const prevSettle = num(f[8]); // f[8]=昨结算
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

async function directFutures(): Promise<Record<string, FutureQuote>> {
  const out: Record<string, FutureQuote> = {};
  // 外盘 hf_: 纽约金/银/铜/油 + 伦敦金(腾讯直连, CORS 开放)
  const r = await fetch(`https://qt.gtimg.cn/q=hf_GC,hf_SI,hf_CAD,hf_CL,hf_XAU`);
  const text = new TextDecoder("gbk").decode(await r.arrayBuffer());
  Object.assign(out, parseFuturesText(text));
  // 内盘 nf_: 沪金(同一接口, 字段布局不同)
  try {
    const rn = await fetch(`https://qt.gtimg.cn/q=nf_AU0`);
    const textN = new TextDecoder("gbk").decode(await rn.arrayBuffer());
    Object.assign(out, parseDomesticFuturesText(textN));
  } catch { /* 忽略内盘直连失败 */ }
  // BTC(Binance 开放 CORS)
  try {
    const j = await (await fetch(`https://api.binance.com/api/v3/ticker/24hr?symbol=BTCUSDT`)).json();
    out.BTCUSDT = {
      symbol: "BTCUSDT", name: "BTC/USDT", price: num(j.lastPrice), prev: num(j.prevClosePrice),
      open: num(j.openPrice), high: num(j.highPrice), low: num(j.lowPrice),
      change: num(j.priceChange), pct: num(j.priceChangePercent), time: "",
    };
  } catch { /* 忽略 BTC 直连失败 */ }
  return out;
}

/* ---------- 浏览器直连腾讯(兜底) ---------- */

function parseTencent(text: string): Record<string, Quote> {
  const out: Record<string, Quote> = {};
  for (const line of text.split(";")) {
    const m = line.match(/v_([a-zA-Z0-9_]+)="([^"]*)"/);
    if (!m) continue;
    const symbol = m[1];
    const f = m[2].split("~");
    if (symbol.startsWith("wh") && f.length > 13) {
      out[symbol] = {
        symbol, name: f[1], price: num(f[3]), change: num(f[12]), pct: num(f[13]),
        open: num(f[6]), high: num(f[8]), low: num(f[9]), prev: num(f[3]) - num(f[12]),
        amount: 0, turnover: 0, time: f[5],
      };
    } else if (f.length >= 40) {
      out[symbol] = {
        symbol, name: f[1], price: num(f[3]), prev: num(f[4]), open: num(f[5]),
        change: num(f[31]), pct: num(f[32]), high: num(f[33]), low: num(f[34]),
        amount: num(f[37]), turnover: num(f[38]), time: f[30],
      };
    }
  }
  return out;
}

async function directQuotes(codes: string[]): Promise<Record<string, Quote>> {
  const r = await fetch(`https://qt.gtimg.cn/q=${codes.join(",")}`);
  const text = new TextDecoder("gbk").decode(await r.arrayBuffer());
  return parseTencent(text);
}

function mapBoards(list: Record<string, string>[]): Board[] {
  return (list || []).map((b) => ({
    code: b.bd_code, name: b.bd_name, price: num(b.bd_zxj), change: num(b.bd_zd),
    pct: num(b.bd_zdf), pct5: num(b.bd_zdf5), pct20: num(b.bd_zdf20),
    leadCode: b.nzg_code, leadName: b.nzg_name, leadPrice: num(b.nzg_zxj), leadPct: num(b.nzg_zdf),
  }));
}

async function directBoards(type: "01" | "02", dir: 0 | 1, n: number): Promise<Board[]> {
  const r = await fetch(`https://ifzq.gtimg.cn/appstock/app/mktHs/rank?l=${n}&p=1&t=${type}/averatio&o=${dir}`);
  const j = await r.json();
  return mapBoards(j?.data || []);
}

async function directMinute(code: string): Promise<MinuteData> {
  const r = await fetch(`https://ifzq.gtimg.cn/appstock/app/minute/query?code=${code}`);
  const j = await r.json();
  const d = j?.data?.[code];
  const arr: string[] = d?.data?.data || [];
  return {
    code,
    prec: num(d?.data?.prec || d?.qt?.[code]?.[4] || 0),
    points: arr.map((s) => {
      const p = s.split(" ");
      return { t: p[0], p: num(p[1]) };
    }),
  };
}

/** 服务端优先,失败时浏览器直连兜底 */
async function withFallback<T>(serverFn: () => Promise<T>, directFn?: () => Promise<T>): Promise<T> {
  try {
    return await serverFn();
  } catch (e) {
    if (directFn) return directFn();
    throw e;
  }
}

/** 快讯浏览器直连兜底:华尔街见闻(CORS 开放,全球可达) */
interface WscnItem {
  id?: number;
  title?: string;
  content?: string;
  content_text?: string;
  display_time?: number;
}

async function directNews(size: number): Promise<NewsItem[]> {
  const r = await fetch(
    `https://api-one-wscn.awtmt.com/apiv1/content/lives?channel=global-channel&limit=${Math.min(size, 50)}`
  );
  const j = await r.json();
  const items: WscnItem[] = j?.data?.items || [];
  const fmt = (sec?: number) => {
    if (!sec) return "";
    const d = new Date(sec * 1000);
    const p = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
  };
  return items
    .filter((it) => it.content_text || it.content)
    .map((it, i) => ({
      id: it.id || (it.display_time || 0) * 100 + i,
      title: it.title || "",
      content: (it.content_text || it.content || "").replace(/<[^>]+>/g, ""),
      time: fmt(it.display_time),
    }));
}

/** 个股资金流批量聚合: 60ms 窗口内的 stockFlow 调用合并为一次 /api/stock-flows 请求
 *  (避免每个 QuoteRow 各发一条请求, 把东财队列打爆) */
const flowLoader = (() => {
  let queue: { code: string; resolve: (v: StockFlow | null) => void }[] = [];
  let timer: ReturnType<typeof setTimeout> | null = null;
  return (code: string): Promise<StockFlow | null> =>
    new Promise((resolve) => {
      queue.push({ code, resolve });
      if (timer) return;
      timer = setTimeout(async () => {
        const batch = queue;
        queue = [];
        timer = null;
        const codes = [...new Set(batch.map((b) => b.code))];
        try {
          const rows = await get<StockFlow[]>(`/api/stock-flows?codes=${codes.join(",")}`);
          const map = new Map(rows.map((r) => [r.code, r]));
          for (const b of batch) b.resolve(map.get(b.code) ?? null);
        } catch {
          for (const b of batch) b.resolve(null);
        }
      }, 60);
    });
})();

export const api = {
  quotes: (codes: string[]) =>
    withFallback(() => get<Record<string, Quote>>(`/api/quotes?codes=${codes.join(",")}`), () => directQuotes(codes)),
  minute: (code: string) =>
    withFallback(() => get<MinuteData>(`/api/minute?code=${code}`), () => directMinute(code)),
  boards: (type: "01" | "02", dir: 0 | 1 = 0, n = 30) =>
    withFallback(() => get<Board[]>(`/api/boards?type=${type}&dir=${dir}&n=${n}`), () => directBoards(type, dir, n)),
  boardStocks: (code: string, n = 12) => get<BoardStock[]>(`/api/board-stocks?code=${encodeURIComponent(code)}&n=${n}`),
  futures: async () => {
    // 服务端获取期货, 浏览器直连 Binance 补 BTC
    const data = await withFallback(
      () => get<Record<string, FutureQuote>>(`/api/futures`),
      () => directFutures()
    );
    if (!data.BTCUSDT) {
      try {
        const j = await (await fetch("https://api.binance.com/api/v3/ticker/24hr?symbol=BTCUSDT")).json();
        data.BTCUSDT = {
          symbol: "BTCUSDT", name: "BTC/USDT", price: num(j.lastPrice), prev: num(j.prevClosePrice),
          open: num(j.openPrice), high: num(j.highPrice), low: num(j.lowPrice),
          change: num(j.priceChange), pct: num(j.priceChangePercent), time: "",
        };
      } catch { /* 浏览器直连也失败则放弃 */ }
    }
    return data;
  },
  rank: (sort: "changepercent" | "amount" | "turnoverratio", asc: 0 | 1, n = 30) =>
    get<RankStock[]>(`/api/rank?sort=${sort}&asc=${asc}&n=${n}`),
  moneyflow: (n = 15) => get<FlowStock[]>(`/api/moneyflow?n=${n}`),
  stockBoards: (code: string) => get<StockBoards>(`/api/stock-boards?code=${encodeURIComponent(code)}`),
  stockFlow: (code: string) => flowLoader(code),
  futureMinute: (code: string) => get<MinuteData>(`/api/future-minute?code=${encodeURIComponent(code)}`),
  futureDaily: (code: string) => get<FutureDaily>(`/api/future-daily?code=${encodeURIComponent(code)}`),
  /** 批量期货实时报价(商品价格页全品种; 无浏览器直连兜底, 依赖服务端) */
  futuresBatch: (codes: string[]) =>
    get<Record<string, FutureQuote>>(`/api/futures?list=${codes.map(encodeURIComponent).join(",")}`),
  boardFlow: (n = 20) => get<BoardFlow[]>(`/api/board-flow?n=${n}`),
  news: (size = 60) => withFallback(() => get<NewsItem[]>(`/api/news?size=${size}`), () => directNews(size)),
  treasuries: () => get<Treasury[]>(`/api/treasuries`),
  treasuryHistory: () => get<TreasuryCurvePoint[]>(`/api/treasury-history`),
  openRouterUsage: () => get<OrUsageDay[]>(`/api/openrouter-usage`),
  mysterySelect: (query: string, limit = 30, refresh = false) =>
    get<MysteryResult>(`/api/mystery-select?query=${encodeURIComponent(query)}&limit=${limit}${refresh ? "&refresh=1" : ""}`),
  parseChain: (name: string, content: string) =>
    post<{ name: string; source: string; segments: { name: string; desc: string; stocks: { code: string; name: string }[] }[]; warnings?: string[] }>(`/api/chain-parse`, { name, content }),
  stockSearch: (q: string) => get<StockSearchResult[]>(`/api/stock-search?q=${encodeURIComponent(q)}`),
  spotTable: () => get<SpotTable>(`/api/spot-table`),
  chemSpot: (id: string, name: string) =>
    get<ChemSpot>(`/api/chem-spot?id=${encodeURIComponent(id)}&name=${encodeURIComponent(name)}`),
};

/** OpenRouter 用量轮询(1 小时) */
export function useOpenRouterUsage() {
  return usePolling(() => api.openRouterUsage(), 3600000);
}

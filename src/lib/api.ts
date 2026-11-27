/** 数据 API 客户端
 *  优先走本站 Node 代理(聚合新浪/CNBC 等无跨域源);
 *  代理不可用时,腾讯系接口(qt.gtimg.cn / ifzq.gtimg.cn,天然 CORS)由浏览器直连兜底。
 */

import { usePolling } from "@/hooks/usePolling";
import { num } from "./format";
import { POLL } from "@/lib/intervals";
import { quoteUrl, tencentMinuteUrl, tencentRankUrl } from "./tencent-urls";

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
  /** 数据源标注: "eastmoney" 正常分时 / "tencent-spot" 东财失败降级腾讯实时价 / "unavailable" 无可用源 */
  source?: string;
  /** 降级标志: 上游分时不可用, 前端显示占位提示(最新价+日涨跌仍正常, 不伪造曲线) */
  degraded?: boolean;
  /** 降级时携带的腾讯 spot 快照(最新价/日涨跌/时间) */
  price?: number;
  change?: number;
  pct?: number;
  time?: string;
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

/** 单公司一期主指标(东财 F10 归一化) */
export interface FinanceReport {
  label: string;
  date: string;
  revenue: number;
  netProfit: number;
  revenueYoY: number;
  profitYoY: number;
  roe: number;
  grossMargin: number;
  netMargin: number;
  debtRatio: number;
  roic: number;
  eps: number;
  ocfPerShare: number;
}

export interface FinanceMain {
  name: string;
  industry: string;
  /** 主营构成(最新报告期, 按产品/行业, 收入 Top 8): 收入/利润占比 + 毛利率 */
  mainop: { name: string; income: number; incomeRatio: number; profit: number; profitRatio: number; margin: number }[];
  /** 主营构成全历史(按报告期, 每期 Top 6 段) — 供趋势堆叠柱 */
  mainopHistory: { date: string; segments: { name: string; income: number; profit: number; margin: number }[] }[];
  /** 资产负债表(最新报告期) */
  balance: { totalLiabilities: number; accountsReceivable: number };
  /** 现金流量(最新报告期): 经营净额 / 资本开支 / 自由现金流 */
  cash: { operate: number; capex: number; free: number };
  reports: FinanceReport[];
}

export interface FinBoardStock {
  code: string;
  name: string;
  industry: string;
  netProfit: number;
  profitYoY: number;
  revenueYoY: number;
  roe: number;
  eps: number;
}

export interface FinIndustry {
  name: string;
  netProfit: number;
  count: number;
  yoy: number;
}

export interface FinCalendarItem {
  date: string;
  code: string;
  name: string;
  period: string;
}

export interface FinanceBoard {
  period: string;
  /** 该报告期已披露公司总数 */
  disclosed?: number;
  stocks: FinBoardStock[];
  industries: FinIndustry[];
  calendar: FinCalendarItem[];
}

export interface FinForecastItem {
  date: string;
  code: string;
  name: string;
  type: string;
  profitLow: number;
  profitHigh: number;
  yoyLow: number;
  yoyHigh: number;
}

export interface FinanceForecast {
  period: string;
  stats: { good: number; bad: number; neutral: number };
  items: FinForecastItem[];
}

/** AbortSignal.timeout 兼容封装(Safari <16 无此静态方法, 旧设备直接抛 TypeError) */
function timeoutSignal(ms: number): AbortSignal {
  if (typeof AbortSignal.timeout === "function") return AbortSignal.timeout(ms);
  const ctrl = new AbortController();
  setTimeout(() => ctrl.abort(), ms);
  return ctrl.signal;
}

/** 本地桌面壳注入的 API 前缀(通过 ?apiBase= 传入), 默认空 = 同源 */
const API_BASE = new URLSearchParams(window.location.search).get("apiBase") ?? "";

// 仅复用同地址的在途 GET：React StrictMode 重挂载或多个面板同时请求时不重复打接口；
// 完成后立即移除，不缓存结果，后续轮询始终获取新数据。
const inflightGets = new Map<string, Promise<unknown>>();

async function get<T>(path: string): Promise<T> {
  const url = `${API_BASE}${path}`;
  const pending = inflightGets.get(url);
  if (pending) return pending as Promise<T>;

  const request = (async () => {
    const r = await fetch(url, { signal: timeoutSignal(10000) });
    const j = await r.json().catch(() => null);
    if (!r.ok) throw new Error(j?.error || `HTTP ${r.status}`);
    if (!j?.ok) throw new Error(j?.error || "api error");
    return j.data as T;
  })();
  inflightGets.set(url, request);
  try {
    return await request;
  } finally {
    if (inflightGets.get(url) === request) inflightGets.delete(url);
  }
}

/** 响应信封: 服务端在上游全挂时会降级返回上次成功数据并置 stale=true(带 asof 时间戳),
 *  数组类端点的 data 无法携带字段, 新鲜度只在信封上 → 需要标记的调用方用 getEnvelope() */
export interface ApiEnvelope<T> {
  data: T;
  stale: boolean;
  asof: number | null;
  source: string | null;
  partial?: boolean;
}

async function getEnvelope<T>(path: string): Promise<ApiEnvelope<T>> {
  const r = await fetch(`${API_BASE}${path}`, { signal: timeoutSignal(10000) });
  const j = await r.json().catch(() => null);
  if (!r.ok) throw new Error(j?.error || `HTTP ${r.status}`);
  if (!j?.ok) throw new Error(j?.error || "api error");
  return {
    data: j.data as T,
    stale: !!j.stale,
    asof: j.asof ?? null,
    source: j.source ?? null,
    partial: !!j.partial,
  };
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const r = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: timeoutSignal(10000),
  });
  const j = await r.json().catch(() => null);
  if (!r.ok) throw new Error(j?.error || `HTTP ${r.status}`);
  if (!j?.ok) throw new Error(j?.error || "api error");
  return j.data as T;
}

/* ---------- 浏览器直连腾讯(兜底) ---------- */

function parseTencent(text: string): Record<string, Quote> {
  const out: Record<string, Quote> = Object.create(null); // 上游 symbol 作 key, 防 __proto__ 污染
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

// 浏览器直连兜底节流: 服务端不可达时(每 5s 轮询一次), 同 key 5s 内不重复直连上游,
// 把 N 个客户端的裸连风暴压回"单用户轮询量级"(与服务端 TTL 缓存对齐的客户端侧防护)
const directCooldown = new Map<string, number>();
const DIRECT_COOLDOWN_MS = 5000;
function throttleDirect(key: string): boolean {
  const now = Date.now();
  const last = directCooldown.get(key) || 0;
  if (now - last < DIRECT_COOLDOWN_MS) return true;
  directCooldown.set(key, now);
  return false;
}

async function directQuotes(codes: string[]): Promise<Record<string, Quote>> {
  const fresh = codes.filter((c) => !throttleDirect(`q:${c}`));
  if (!fresh.length) return {};
  const r = await fetch(quoteUrl(fresh));
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
  if (throttleDirect(`b:${type}:${dir}`)) return [];
  const r = await fetch(tencentRankUrl(n, type, dir));
  const j = await r.json();
  return mapBoards(j?.data || []);
}

async function directMinute(code: string): Promise<MinuteData> {
  if (throttleDirect(`m:${code}`)) return { code, prec: 0, points: [] };
  const r = await fetch(tencentMinuteUrl(code));
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
  if (throttleDirect("news")) return [];
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
  /** 批量分钟线: N 个 code → 1 次 HTTP 往返(内部仍各自缓存), 上限 30 个 */
  batchMinute: (codes: string[]) =>
    get<Record<string, MinuteData | null>>(`/api/batch-minute?codes=${codes.slice(0, 30).join(",")}`),
  boards: (type: "01" | "02", dir: 0 | 1 = 0, n = 30) =>
    withFallback(() => get<Board[]>(`/api/boards?type=${type}&dir=${dir}&n=${n}`), () => directBoards(type, dir, n)),
  boardStocks: (code: string, n = 12) => get<BoardStock[]>(`/api/board-stocks?code=${encodeURIComponent(code)}&n=${n}`),
  rank: (sort: "changepercent" | "amount" | "turnoverratio", asc: 0 | 1, n = 30) =>
    get<RankStock[]>(`/api/rank?sort=${sort}&asc=${asc}&n=${n}`),
  moneyflow: (n = 15) => get<FlowStock[]>(`/api/moneyflow?n=${n}`),
  /** 板块成分股主力净流入排行(东财 fs=b:板块代码, f62 降序) */
  boardMoneyflow: (code: string, n = 15) => get<FlowStock[]>(`/api/board-moneyflow?code=${encodeURIComponent(code)}&n=${n}`),
  stockBoards: (code: string) => get<StockBoards>(`/api/stock-boards?code=${encodeURIComponent(code)}`),
  stockFlow: (code: string) => flowLoader(code),
  batchFutureMinute: (codes: string[]) =>
    get<Record<string, MinuteData | null>>(`/api/batch-fmin?codes=${codes.slice(0, 20).join(",")}`),
  futureDaily: (code: string) => get<FutureDaily>(`/api/future-daily?code=${encodeURIComponent(code)}`),
  futuresBatch: (codes: string[]) =>
    get<Record<string, FutureQuote>>(`/api/futures?list=${codes.map(encodeURIComponent).join(",")}`),
  boardFlow: (n = 20) => getEnvelope<BoardFlow[]>(`/api/board-flow?n=${n}`),
  news: (size = 60) => withFallback(() => get<NewsItem[]>(`/api/news?size=${size}`), () => directNews(size)),
  treasuries: () => get<Treasury[]>(`/api/treasuries`),
  treasuryHistory: () => get<TreasuryCurvePoint[]>(`/api/treasury-history`),
  openRouterUsage: () => get<OrUsageDay[]>(`/api/openrouter-usage`),
  mysterySelect: (query: string, limit = 30, opts: { refresh?: boolean } = {}) =>
    get<MysteryResult>(`/api/mystery-select?query=${encodeURIComponent(query)}&limit=${limit}${opts.refresh ? "&refresh=1" : ""}`),
  parseChain: (name: string, content: string) =>
    post<{ name: string; source: string; segments: { name: string; desc: string; stocks: { code: string; name: string }[] }[]; warnings?: string[] }>(`/api/chain-parse`, { name, content }),
  stockSearch: (q: string) => get<StockSearchResult[]>(`/api/stock-search?q=${encodeURIComponent(q)}`),
  spotTable: () => get<SpotTable>(`/api/spot-table`),
  chemSpot: (id: string, name: string) =>
    get<ChemSpot>(`/api/chem-spot?id=${encodeURIComponent(id)}&name=${encodeURIComponent(name)}`),
  financeMain: (code: string) => get<FinanceMain>(`/api/finance-main?code=${encodeURIComponent(code)}`),
  financeBoard: (period = "") => get<FinanceBoard>(`/api/finance-board${period ? `?period=${encodeURIComponent(period)}` : ""}`),
  financeForecast: (period = "") => get<FinanceForecast>(`/api/finance-forecast${period ? `?period=${encodeURIComponent(period)}` : ""}`),
  /** Artificial Analysis 全模型定价(free 层, 24h 服务端缓存 + 每日快照) */
  aaModels: () => get<AaModelsResp>(`/api/aa-models`),
  /** traktoken 支出指数(60 天指数 + 降价事件) */
  spendIndex: () => get<SpendIndexResp>(`/api/spend-index`),
  /** AI 基础设施资本出清与复合 ROI(2022-2035 历史+预测) */
  aiInfra: () => get<AiInfraResp>(`/api/ai-infra`),
  /** 黄金观察: 聚合 8 面板字段，本地资产优先，缺失时真实在线源回退。 */
  gold: () => get<GoldResp>(`/api/gold`),
  /** 黄金历史序列: days=1|7|30(本地文件或 XAUS 在线序列降采样) */
  goldHistory: (days: 1 | 7 | 30) => get<GoldHistoryResp>(`/api/gold/history?days=${days}`),
};

/* ---------------- 黄金观察(25, /gold 页面) ---------------- */

export interface GoldPrice {
  /** USD/oz */
  usd: number | null;
  /** CNY/oz(gold-api 直接给, 无需汇率反推) */
  cny: number | null;
  /** CNY/g = CNY/oz ÷ 31.1035 */
  cnyPerG: number | null;
  ts: string | null;
  /** 换算降级说明(如 "CNY 报价缺失…") */
  note: string;
  /** 日内涨跌幅%(gold-monitor 轻量采样) */
  changePct: number | null;
  intradayNote: string;
}

export interface GoldTreasury {
  date: string | null;
  fetchedAt: string | null;
  /** 期限 -> 收益率%: 1M..30Y */
  yields: Record<string, number>;
}

export interface GoldRealCurve {
  date: string | null;
  nominal_rates: Record<string, number> | null;
  breakeven_rates: Record<string, number> | null;
  /** 已过滤 |x|<50 脏值(坑#15) */
  real_rates: Record<string, number>;
}

export interface GoldInflation {
  headlines: { CPI: { value?: number; date: string; yoy_pct: number }; [k: string]: { value?: number; date: string; yoy_pct: number } } | null;
  breakeven_inflation: Record<string, number> | null;
}

export interface GoldFed {
  date: string | null;
  effectiveRate: number | null;
  fetchedAt: string | null;
}

export interface GoldNews {
  title: string;
  url: string;
  source: string;
  publishedAt?: string | null;
}

export interface GoldCbTx {
  country: string;
  /** 交易归属月 YYYY-MM */
  ym: string;
  tonnes: number;
  notes: string;
}

export interface GoldCbTop {
  country: string;
  date: string;
  tonnes: number;
}

export interface GoldSourceState {
  status: "ok" | "partial" | "unavailable" | "stale";
  /** 稳定机器原因码；前端映射为中文，不直接展示内部路径。 */
  reason: string | null;
  asof: number | null;
}

export interface GoldResp {
  status: "ok" | "partial" | "unavailable";
  reason: string | null;
  stale: boolean;
  asof: number | null;
  sources: { monitor: GoldSourceState; centralBank: GoldSourceState };
  fetched_at: string | null;
  gold: GoldPrice | null;
  treasury: GoldTreasury | null;
  real_curve: GoldRealCurve | null;
  inflation: GoldInflation | null;
  fed: GoldFed | null;
  news: GoldNews[];
  central_bank: { transactions: GoldCbTx[]; top10: GoldCbTop[] };
  source: "gold-monitor" | "online" | "hybrid";
  /** 可读来源列表；各面板另用 providers 标注自己的真实来源。 */
  provider: string;
  providers: { gold?: string | null; treasury?: string | null; macro?: string | null; news?: string | null; centralBank?: string | null };
}

export interface GoldHistoryResp {
  status: "ok" | "empty" | "unavailable";
  reason: string | null;
  stale: boolean;
  asof: number | null;
  days: number;
  points: { t: string; p: number }[];
  count: number;
  source: string;
  provider?: string;
}

/** OpenRouter 用量轮询(1 小时) */
export function useOpenRouterUsage() {
  return usePolling(() => api.openRouterUsage(), POLL.AA_MODELS);
}

/* ---------------- 大模型定价(Artificial Analysis + traktoken) ---------------- */

export interface AaModel {
  slug: string;
  name: string;
  vendor: string;
  release: string;
  /** 智能指数(AA 口径) */
  intel: number | null;
  /** 每百万 token 输入价(USD) */
  input: number | null;
  /** 每百万 token 输出价(USD) */
  output: number | null;
  cacheHit: number | null;
  /** 完成实际基准任务的总成本(USD, 性价比指标) */
  taskCost: number | null;
}

export interface AaModelsResp {
  models: AaModel[];
  history: Record<string, { name: string; vendor: string; points: { t: string; i: number | null; o: number | null; task: number | null }[] }>;
  source: string;
}

export interface SpendIndexResp {
  points: {
    date: string;
    ttsi: number | null;
    pct: number | null;
    indexPoint: number | null;
    closed: number | null;
    open: number | null;
    premium: number | null;
  }[];
  events: { date: string; text: string }[];
  source: string;
}

/* ---------------- AI 基础设施资本出清与复合 ROI ---------------- */

export interface AiInfraPoint {
  year: number;
  capexB: number;
  depB: number;
  pricePerM: number;
  costPerM: number;
  grid: number;
  revenueB: number;
  roiPct: number;
  /** true=历史实测, false=预测 */
  actual: boolean;
}

export interface AiInfraResp {
  generatedAt: string;
  series: AiInfraPoint[];
  sources: {
    sec: { ok: boolean; byCompany?: { name: string; capex: Record<string, number> }[]; err?: string };
    token: { ok: boolean; marketInputPerM?: number | null; frontierInputPerM?: number | null; vendorCount?: number; err?: string };
    ppi: { ok: boolean; trend?: string; yoy12m?: number; err?: string };
  };
  notes: string[];
}

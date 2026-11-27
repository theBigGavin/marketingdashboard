import { createContext, useContext, useMemo, useState } from "react";
import { DashboardHeader } from "@/components/dash/DashboardHeader";
import {
  DashboardLayout,
  type PanelRowDef,
} from "@/components/dash/DashboardLayout";
import { Panel, type PanelZoomProps } from "@/components/dash/Panel";
import { usePolling } from "@/hooks/usePolling";
import { useElementSize } from "@/hooks/useElementSize";
import { useFullscreen } from "@/hooks/useFullscreen";
import { api, type GoldResp } from "@/lib/api";
import { TNUM, clsChg, bgChg, fmtPct } from "@/lib/format";
import { POLL } from "@/lib/intervals";
import {
  TrendingUp, Landmark, Percent, Newspaper, Activity, Gem, Coins, Wallet,
} from "lucide-react";
const GOLD = "#f5c542";
const GOLD_DIM = "#b45309";

/** 页面级共享黄金聚合查询：7 个面板消费同一份数据，不再各自轮询 /api/gold。 */
const GoldSummaryCtx = createContext<{ data: GoldResp | null; error: string | null }>({ data: null, error: null });
function useGoldSummary() {
  return useContext(GoldSummaryCtx);
}

const GOLD_REASONS: Record<string, string> = {
  DATA_DIR_NOT_FOUND: "本地目录不存在，且在线回退暂不可用",
  DATA_DIR_UNREADABLE: "本地目录无法读取，且在线回退暂不可用",
  DATA_FILE_NOT_FOUND: "本地尚未生成数据文件，且在线回退暂不可用",
  DATA_FILE_INVALID: "本地最新数据文件无法解析，且在线回退暂不可用",
  DB_NOT_FOUND: "本地央行数据库不存在，且在线储备回退暂不可用",
  DB_UNAVAILABLE: "本地央行数据库无法读取，且在线储备回退暂不可用",
  HISTORY_WINDOW_EMPTY: "所选时间窗口内没有历史数据点",
  HISTORY_INSUFFICIENT_POINTS: "所选时间窗口内历史数据点不足",
  UPSTREAM_STALE: "上游正在提供最近可用快照，并非实时更新",
  ONLINE_UNAVAILABLE: "在线数据源故障，当前展示最近成功快照",
  ONLINE_HISTORY_UNAVAILABLE: "在线历史源故障，当前展示最近成功快照",
  ONLINE_SNAPSHOT_PARTIAL: "部分字段来自最近成功快照",
  ONLINE_SPOT_UNAVAILABLE: "在线金价源暂不可用",
  ONLINE_TREASURY_UNAVAILABLE: "美国财政部收益率源暂不可用",
  ONLINE_FRED_UNAVAILABLE: "FRED 宏观数据源暂不可用",
  ONLINE_NEWS_UNAVAILABLE: "新闻 RSS 源暂不可用",
};

/** 空态必须区分传输失败、来源缺失与真实空窗口，绝不伪造曲线/硬编码死值。 */
function GoldEmpty({ what, reason, error }: { what: string; reason?: string | null; error?: string | null }) {
  const detail = error
    ? "黄金接口请求失败"
    : reason
      ? GOLD_REASONS[reason] || "黄金数据源暂不可用"
      : "本地资产与在线回退均未返回数据";
  return (
    <div className="flex h-full min-h-[80px] items-center justify-center px-3 text-center text-body leading-relaxed text-db-faint">
      <span>{what}数据暂不可用，{detail}，恢复后自动显示</span>
    </div>
  );
}

/** 时间戳角标：来源与快照状态分开标注，不能把在线回退伪装成本地管道。 */
function GoldStamp({ text, stale = false, source = null }: { text: string | null | undefined; stale?: boolean; source?: string | null }) {
  if (!text && !stale && !source) return null;
  return (
    <span className={`text-caption ${stale ? "text-amber-500/80" : "text-db-faint"}`} style={TNUM}>
      {stale ? "非实时快照" : source}{text ? ` · ${text}` : ""}
    </span>
  );
}

/** 读取 --tv-zoom(放大态坐标修正): 坐标→索引换算一律除 z(营销dashboard-ui skill 4 面板先例) */
function tvZoom(el: Element | null): number {
  if (!el) return 1;
  const z = parseFloat(getComputedStyle(el).getPropertyValue("--tv-zoom") || "1");
  return Number.isFinite(z) && z > 0 ? z : 1;
}

/* ================= 面板 1: 金价实时(hero) ================= */

function GoldHeroPanel({ className = "", ...zoomProps }: { className?: string } & PanelZoomProps) {
  const { data, error } = useGoldSummary();
  const g = data?.gold ?? null;

  return (
    <Panel className={className} {...zoomProps} title="金价实时" icon={<Coins size={14} />} accent={GOLD}
      right={<GoldStamp stale={data?.sources.monitor.status === "stale"} source={data?.providers.gold || "gold-monitor 管道"} text={g?.ts ? new Date(g.ts).toLocaleString("zh-CN", { hour12: false }) : data?.fetched_at || null} />}>
      <div className="flex h-full flex-col p-2.5">
        {!g ? (
          <GoldEmpty reason={data?.reason} error={error} what={error ? "金价" : "金价"} />
        ) : (
          <>
            {/* 主价: USD/oz */}
            <div className="flex items-baseline gap-2">
              <span className="text-meta text-db-muted">USD/oz</span>
              <span className="text-display font-bold leading-none" style={{ ...TNUM, color: g.usd != null ? "#fef3c7" : "#64748b" }}>
                {g.usd != null ? g.usd.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "——"}
              </span>
              {g.changePct != null && (
                <span className={`rounded px-1.5 py-0.5 text-body font-semibold ${bgChg(g.changePct)}`} style={TNUM}>
                  {fmtPct(g.changePct)}
                </span>
              )}
            </div>
            {/* 涨跌说明 */}
            {g.intradayNote && <div className="mt-0.5 text-caption text-db-faint">{g.intradayNote}</div>}

            {/* CNY 换算(双价) */}
            <div className="mt-2 grid grid-cols-2 gap-2">
              <div className="rounded border border-db-border/30 bg-db-subtle/20 px-2 py-1.5">
                <div className="text-meta text-db-muted">CNY/g（克价）</div>
                <div className="text-metric-lg font-semibold" style={{ ...TNUM, color: g.cnyPerG != null ? "#fde68a" : "#64748b" }}>
                  {g.cnyPerG != null ? `¥${g.cnyPerG.toFixed(2)}` : "——"}
                </div>
              </div>
              <div className="rounded border border-db-border/30 bg-db-subtle/20 px-2 py-1.5">
                <div className="text-meta text-db-muted">CNY/oz</div>
                <div className="text-metric-lg font-semibold" style={{ ...TNUM, color: g.cny != null ? "#fde68a" : "#64748b" }}>
                  {g.cny != null ? `¥${g.cny.toLocaleString("zh-CN", { maximumFractionDigits: 0 })}` : "——"}
                </div>
              </div>
            </div>
            {g.note && <div className="mt-1 text-caption text-amber-600/90">{g.note}</div>}
          </>
        )}
      </div>
    </Panel>
  );
}

/* ================= 面板 2: 金价走势(手写 SVG, Tab 1|7|30) ================= */

const TREND_TABS: { days: 1 | 7 | 30; label: string }[] = [
  { days: 1, label: "24H" },
  { days: 7, label: "7D" },
  { days: 30, label: "30D" },
];

function GoldTrendPanel({ className = "", ...zoomProps }: { className?: string } & PanelZoomProps) {
  const [days, setDays] = useState<1 | 7 | 30>(7);
  const { data, error } = usePolling(() => api.goldHistory(days), POLL.MINUTE, [days]);
  const { ref: boxRef, size } = useElementSize();
  const [hover, setHover] = useState<number | null>(null);

  const chart = useMemo(() => {
    const pts = data?.points ?? [];
    if (pts.length < 2) return null;
    const { w: W, h: H } = size;
    const PL = 44, PR = 12, PT = 8, PB = 18; // padding
    const iw = W - PL - PR, ih = H - PT - PB;
    if (iw < 40 || ih < 20) return null;
    const prices = pts.map((p) => p.p);
    const min = Math.min(...prices), max = Math.max(...prices);
    const pad = Math.max((max - min) * 0.08, 1);
    const lo = min - pad, hi = max + pad;
    const X = (i: number) => PL + (i / (pts.length - 1)) * iw;
    const Y = (v: number) => PT + (1 - (v - lo) / (hi - lo)) * ih;
    const line = pts.map((p, i) => `${X(i).toFixed(2)},${Y(p.p).toFixed(2)}`).join(" ");
    const area = `${line} L${X(pts.length - 1).toFixed(2)},${(PT + ih).toFixed(2)} L${PL},${(PT + ih).toFixed(2)} Z`;
    return { pts, X, Y, lo, hi, line, area, PL, PR, PT, PB, iw, ih, W };
  }, [data, size]);

  const hInfo = useMemo(() => {
    if (!chart || hover == null) return null;
    const p = chart.pts[hover];
    if (!p) return null;
    return { t: p.t, p: p.p, x: chart.X(hover), y: chart.Y(p.p) };
  }, [chart, hover]);

  return (
    <Panel className={className} {...zoomProps} title="金价走势" icon={<TrendingUp size={14} />} accent={GOLD}
      right={
        <div className="flex items-center gap-0.5">
          {data?.stale && <span className="mr-1 text-caption text-amber-500/80">缓存快照</span>}
          {TREND_TABS.map((t) => (
            <button
              key={t.days}
              type="button"
              onClick={() => setDays(t.days)}
              className={`rounded px-1.5 py-0.5 text-meta transition-colors ${
                days === t.days ? "bg-gold/15 font-semibold text-gold-soft" : "text-db-muted hover:text-db-secondary"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      }>
      <div className="flex h-full flex-col p-2.5">
        {!chart ? (
          <GoldEmpty reason={data?.reason} error={error} what={error ? "金价走势" : "金价走势"} />
        ) : (
          <>
            <div ref={boxRef} className="min-h-0 flex-1">
              <svg
                width={chart.W ?? size.w}
                height={size.h}
                className="block"
                onMouseMove={(e) => {
                  const z = tvZoom(e.currentTarget);
                  const rect = e.currentTarget.getBoundingClientRect();
                  const x = (e.clientX - rect.left) / z;
                  const i = Math.round(((x - chart.PL) / chart.iw) * (chart.pts.length - 1));
                  setHover(Math.max(0, Math.min(chart.pts.length - 1, i)));
                }}
                onMouseLeave={() => setHover(null)}
              >
                {/* 网格线(3 条水平) */}
                {[0.25, 0.5, 0.75].map((f) => {
                  const v = chart.hi - f * (chart.hi - chart.lo);
                  const y = chart.Y(v);
                  return (
                    <g key={f}>
                      <line x1={chart.PL} y1={y} x2={chart.W - chart.PR} y2={y} stroke="#1e293b" strokeWidth={1} />
                      <text x={chart.PL - 4} y={y + 3} fontSize={9} fill="#64748b" textAnchor="end" style={TNUM}>
                        {v >= 1000 ? v.toFixed(0) : v.toFixed(1)}
                      </text>
                    </g>
                  );
                })}
                {/* 面积 + 折线 */}
                <path d={chart.area} fill={GOLD} opacity={0.08} stroke="none" />
                <polyline points={chart.line} fill="none" stroke={GOLD} strokeWidth={1.8} strokeLinejoin="round" strokeLinecap="round" />
                {/* 首尾端点 */}
                <circle cx={chart.X(0)} cy={chart.Y(chart.pts[0].p)} r={2.5} fill={GOLD} />
                <circle cx={chart.X(chart.pts.length - 1)} cy={chart.Y(chart.pts[chart.pts.length - 1].p)} r={3} fill={GOLD} stroke="#0c1320" strokeWidth={1} />
                {/* 首尾价格标注 */}
                <text x={chart.X(0)} y={chart.Y(chart.pts[0].p) - 6} fontSize={9} fill="#94a3b8" style={TNUM}>
                  {chart.pts[0].p.toFixed(0)}
                </text>
                <text x={chart.X(chart.pts.length - 1)} y={chart.Y(chart.pts[chart.pts.length - 1].p) - 6} fontSize={9} fill="#fde68a" textAnchor="end" style={TNUM}>
                  {chart.pts[chart.pts.length - 1].p.toFixed(0)}
                </text>
                {/* hover 十字线 + tooltip */}
                {hInfo && (
                  <g>
                    <line x1={hInfo.x} y1={chart.PT} x2={hInfo.x} y2={chart.PT + chart.ih} stroke="#f5c542" strokeWidth={1} strokeDasharray="3 2" opacity={0.6} />
                    <circle cx={hInfo.x} cy={hInfo.y} r={3.5} fill={GOLD} stroke="#0c1320" strokeWidth={1.5} />
                    <g transform={`translate(${Math.min(Math.max(hInfo.x - 55, 0), chart.W - 130)},${Math.max(chart.PT, hInfo.y - 42)})`}>
                      <rect width={130} height={34} rx={4} fill="#0f172a" stroke="#f5c54255" />
                      <text x={8} y={14} fontSize={9} fill="#94a3b8">
                        {new Date(hInfo.t).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false })}
                      </text>
                      <text x={8} y={27} fontSize={11} fontWeight={600} fill="#fde68a" style={TNUM}>
                        ${hInfo.p.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                      </text>
                    </g>
                  </g>
                )}
              </svg>
            </div>
            {/* 时间范围与真实采样口径 */}
            <div className="mt-1 shrink-0 text-caption text-db-faint">
              {data?.source === "xaus"
                ? days === 1 ? "近 24 小时 · 5min 采样" : days === 7 ? "近 7 天 · 日线 + 5min 日内" : "近 30 天 · 日线 + 日内"
                : days === 1 ? "近 24 小时 · 本地采样" : days === 7 ? "近 7 天 · 本地采样" : "近 30 天 · 本地降采样"}
              {" "}· 共 {data?.count ?? chart?.pts.length} 点 · {data?.provider || "gold-monitor"}
            </div>
          </>
        )}
      </div>
    </Panel>
  );
}

/* ================= 面板 3: 美债收益率曲线(手写 SVG) ================= */

/** 美债期限显示顺序(live 源 10 个期限) */
const TENOR_ORDER = ["1M", "3M", "6M", "1Y", "2Y", "3Y", "5Y", "7Y", "10Y", "20Y", "30Y"];

function GoldYieldCurvePanel({ className = "", ...zoomProps }: { className?: string } & PanelZoomProps) {
  const { data, error } = useGoldSummary();
  const y = data?.treasury?.yields ?? null;
  const nominal = data?.real_curve?.nominal_rates ?? null; // 月度历史名义(期限键 1/2/5/10/20/30)
  const { ref: boxRef, size } = useElementSize();
  const yv = y ?? {}; // 渲染用非空别名(chart 非空时必有数据)

  const chart = useMemo(() => {
    if (!y) return null;
    const tenors = TENOR_ORDER.filter((t) => y[t] != null);
    if (tenors.length < 3) return null;
    const { w: W, h: H } = size;
    const PL = 40, PR = 14, PT = 10, PB = 20;
    const iw = W - PL - PR, ih = H - PT - PB;
    if (iw < 60 || ih < 20) return null;
    const all = [...tenors.map((t) => y[t]), ...(nominal ? Object.values(nominal) : [])].filter(Number.isFinite) as number[];
    const lo = Math.min(...all) - 0.15, hi = Math.max(...all) + 0.15;
    const X = (i: number) => PL + (i / (tenors.length - 1)) * iw;
    const Y = (v: number) => PT + (1 - (v - lo) / (hi - lo)) * ih;
    const live = tenors.map((t, i) => `${X(i).toFixed(2)},${Y(y[t]).toFixed(2)}`).join(" ");
    // 月度历史名义曲线(键 1/2/5/10/20/30 年, 对齐到最近 live 期限索引)
    const NOM_KEY: Record<string, string> = { "1": "1Y", "2": "2Y", "5": "5Y", "10": "10Y", "20": "20Y", "30": "30Y" };
    const nomPts: { i: number; v: number }[] = [];
    if (nominal) {
      for (const [k, v] of Object.entries(nominal)) {
        const t = NOM_KEY[k];
        if (!t || v == null || !Number.isFinite(v)) continue;
        const i = tenors.indexOf(t);
        if (i >= 0) nomPts.push({ i, v });
      }
    }
    const nom = nomPts.map((p) => `${X(p.i).toFixed(2)},${Y(p.v).toFixed(2)}`).join(" ");
    return { tenors, X, Y, lo, hi, live, nom, nomPts, PL, PR, PT, PB, iw, ih, W, H };
  }, [y, nominal, size]);

  const spread10y2y = useMemo(() => {
    if (!y) return null;
    const t10 = y["10Y"], t2 = y["2Y"];
    if (t10 == null || t2 == null) return null;
    return (t10 - t2) * 100; // bp
  }, [y]);

  return (
    <Panel className={className} {...zoomProps} title="美债收益率曲线" icon={<Activity size={14} />} accent={GOLD}
      right={
        spread10y2y != null ? (
          <span className={`text-meta font-semibold ${clsChg(spread10y2y)}`} style={TNUM}>
            10Y−2Y {spread10y2y > 0 ? "+" : ""}{spread10y2y.toFixed(0)}bp
          </span>
        ) : (
          <GoldStamp stale={data?.sources.monitor.status === "stale"} source={data?.providers.treasury || "gold-monitor"} text={data?.treasury?.date || null} />
        )
      }>
      <div className="flex h-full flex-col p-2.5">
        {!chart ? (
          <GoldEmpty reason={data?.reason} error={error} what={error ? "美债收益率" : "美债收益率"} />
        ) : (
          <>
            <div ref={boxRef} className="min-h-0 flex-1">
              <svg width={chart.W} height={size.h} className="block">
                {[0.25, 0.5, 0.75].map((f) => {
                  const v = chart.hi - f * (chart.hi - chart.lo);
                  const yy = chart.Y(v);
                  return (
                    <g key={f}>
                      <line x1={chart.PL} y1={yy} x2={chart.W - chart.PR} y2={yy} stroke="#1e293b" strokeWidth={1} />
                      <text x={chart.PL - 4} y={yy + 3} fontSize={9} fill="#64748b" textAnchor="end" style={TNUM}>{v.toFixed(2)}</text>
                    </g>
                  );
                })}
                {/* 月度历史名义(虚线, 对比口径) */}
                {chart.nomPts.length >= 2 && (
                  <polyline points={chart.nom} fill="none" stroke="#64748b" strokeWidth={1.2} strokeDasharray="4 3" />
                )}
                {/* live 曲线 */}
                <polyline points={chart.live} fill="none" stroke={GOLD} strokeWidth={2} strokeLinejoin="round" />
                {chart.tenors.map((t, i) => {
                  const v = yv[t];
                  if (v == null) return null;
                  const isEnd = i === 0 || i === chart.tenors.length - 1;
                  return (
                    <g key={t}>
                      <circle cx={chart.X(i)} cy={chart.Y(v)} r={isEnd ? 3 : 2} fill="#0c1320" stroke={GOLD} strokeWidth={1.5} />
                      <text x={chart.X(i)} y={chart.H - 6} fontSize={8.5} fill="#94a3b8" textAnchor="middle">{t}</text>
                      {/* 端点标签(用户要求) */}
                      {isEnd && (
                        <text x={chart.X(i)} y={chart.Y(v) - (i === 0 ? 7 : 9)} fontSize={9} fontWeight={600}
                          fill="#fde68a" textAnchor={i === 0 ? "start" : "end"} style={TNUM}>{v.toFixed(2)}%</text>
                      )}
                    </g>
                  );
                })}
              </svg>
            </div>
            <div className="mt-1 flex shrink-0 flex-wrap items-center gap-x-3 gap-y-0.5 text-caption text-db-muted">
              <span className="flex items-center gap-1">
                <i className="inline-block h-[2px] w-3 rounded" style={{ background: GOLD }} /> 最新曲线（{data?.providers.treasury || "gold-monitor"}）
              </span>
              {chart.nomPts.length >= 2 && (
                <span className="flex items-center gap-1">
                  <i className="inline-block h-0 w-3 border-t border-dashed border-slate-500" /> 名义曲线（对比）
                </span>
              )}
              <span className="ml-auto text-db-faint">{data?.treasury?.date || ""}</span>
            </div>
          </>
        )}
      </div>
    </Panel>
  );
}

/* ================= 面板 4: 实际利率(手写 SVG, 已过滤脏值) ================= */

function GoldRealRatePanel({ className = "", ...zoomProps }: { className?: string } & PanelZoomProps) {
  const { data, error } = useGoldSummary();
  const real = data?.real_curve?.real_rates ?? null;
  const be = data?.real_curve?.breakeven_rates ?? null;
  const { ref: boxRef, size } = useElementSize();
  const rvMap = real ?? {}; // 渲染用非空别名(chart 非空时必有数据)

  const chart = useMemo(() => {
    if (!real) return null;
    // 数值排序，避免字典序把 10/20/30 排到 5/7 前面。
    const keys = [...new Set([...Object.keys(real), ...(be ? Object.keys(be) : [])])].sort((a, b) => Number(a) - Number(b));
    if (keys.length < 2) return null;
    const { w: W, h: H } = size;
    const PL = 40, PR = 14, PT = 10, PB = 20;
    const iw = W - PL - PR, ih = H - PT - PB;
    if (iw < 60 || ih < 20) return null;
    const vals = [
      ...keys.map((k) => real[k]).filter((v): v is number => v != null),
      ...(be ? keys.map((k) => be[k]).filter((v): v is number => v != null) : []),
    ];
    if (!vals.length) return null;
    const lo = Math.min(...vals) - 0.25, hi = Math.max(...vals) + 0.25;
    const X = (i: number) => PL + (i / (keys.length - 1)) * iw;
    const Y = (v: number) => PT + (1 - (v - lo) / (hi - lo)) * ih;
    const realPts = keys.map((k, i) => (real[k] != null ? `${X(i).toFixed(2)},${Y(real[k]).toFixed(2)}` : null)).filter(Boolean) as string[];
    const bePts = be ? keys.map((k, i) => (be[k] != null ? `${X(i).toFixed(2)},${Y(be[k]).toFixed(2)}` : null)).filter(Boolean) as string[] : [];
    return { keys, X, Y, lo, hi, realPts, bePts, PL, PR, PT, PB, iw, ih, W, H };
  }, [real, be, size]);

  return (
    <Panel className={className} {...zoomProps} title="实际利率与盈亏平衡" icon={<Percent size={14} />} accent={GOLD}
      right={<GoldStamp stale={data?.sources.monitor.status === "stale"} source={data?.providers.treasury || "gold-monitor"} text={data?.real_curve?.date ? `曲线日期 ${data.real_curve.date}` : null} />}>
      <div className="flex h-full flex-col p-2.5">
        {!chart ? (
          <GoldEmpty reason={data?.reason} error={error} what={error ? "实际利率" : "实际利率"} />
        ) : (
          <>
            <div ref={boxRef} className="min-h-0 flex-1">
              <svg width={chart.W} height={size.h} className="block">
                {[0.25, 0.5, 0.75].map((f) => {
                  const v = chart.hi - f * (chart.hi - chart.lo);
                  const yy = chart.Y(v);
                  return (
                    <g key={f}>
                      <line x1={chart.PL} y1={yy} x2={chart.W - chart.PR} y2={yy} stroke="#1e293b" strokeWidth={1} />
                      <text x={chart.PL - 4} y={yy + 3} fontSize={9} fill="#64748b" textAnchor="end" style={TNUM}>{v.toFixed(1)}</text>
                    </g>
                  );
                })}
                {chart.realPts.length >= 2 && (
                  <polyline points={chart.realPts.join(" ")} fill="none" stroke={GOLD} strokeWidth={2} strokeLinejoin="round" />
                )}
                {chart.bePts.length >= 2 && (
                  <polyline points={chart.bePts.join(" ")} fill="none" stroke="#60a5fa" strokeWidth={1.5} strokeDasharray="4 3" />
                )}
                {chart.keys.map((k, i) => {
                  const rv = rvMap[k];
                  if (rv == null) return null;
                  return (
                    <g key={k}>
                      <circle cx={chart.X(i)} cy={chart.Y(rv)} r={2.5} fill="#0c1320" stroke={GOLD} strokeWidth={1.5} />
                      <text x={chart.X(i)} y={chart.H - 6} fontSize={8.5} fill="#94a3b8" textAnchor="middle">{k}Y</text>
                    </g>
                  );
                })}
                {/* 端点标签 */}
                {rvMap[chart.keys[0]] != null && (
                  <text x={chart.X(0)} y={chart.Y(rvMap[chart.keys[0]]) - 7} fontSize={9} fontWeight={600} fill="#fde68a" style={TNUM}>
                    {rvMap[chart.keys[0]].toFixed(2)}%
                  </text>
                )}
                {rvMap[chart.keys[chart.keys.length - 1]] != null && (
                  <text x={chart.X(chart.keys.length - 1)} y={chart.Y(rvMap[chart.keys[chart.keys.length - 1]]) - 7} fontSize={9} fontWeight={600} fill="#fde68a" textAnchor="end" style={TNUM}>
                    {rvMap[chart.keys[chart.keys.length - 1]].toFixed(2)}%
                  </text>
                )}
              </svg>
            </div>
            <div className="mt-1 flex shrink-0 flex-wrap items-center gap-x-3 gap-y-0.5 text-caption text-db-muted">
              <span className="flex items-center gap-1">
                <i className="inline-block h-[2px] w-3 rounded" style={{ background: GOLD }} /> 实际利率
              </span>
              {chart.bePts.length >= 2 && (
                <span className="flex items-center gap-1">
                  <i className="inline-block h-0 w-3 border-t border-dashed border-blue-400" /> 盈亏平衡通胀
                </span>
              )}
              <span className="ml-auto text-db-faint">脏值已过滤(|x|&lt;50)</span>
            </div>
          </>
        )}
      </div>
    </Panel>
  );
}

/* ================= 面板 5: 央行购金动态 ================= */

function GoldCbTxPanel({ className = "", ...zoomProps }: { className?: string } & PanelZoomProps) {
  const { data, error } = useGoldSummary();

  const bars = useMemo(() => {
    const txs = data?.central_bank?.transactions ?? [];
    if (!txs.length) return [];
    const max = Math.max(...txs.map((t) => Math.abs(t.tonnes)), 1);
    // 百分比宽度(基于 flex-1 条形容器), 不再用 W-90 像素估算 —— 像素估算在窄容器下
    // bar+数字标签必然挤出容器(实测溢出 28px), 百分比让 bar 永远 ≤ 可用空间
    return txs.map((t) => ({
      ...t,
      pct: (Math.abs(t.tonnes) / max) * 100,
    }));
  }, [data]);

  return (
    <Panel className={className} {...zoomProps} title="央行储备变动" icon={<Landmark size={14} />} accent={GOLD}
      right={<span className={`text-caption ${data?.sources.centralBank.status === "stale" ? "text-amber-500/80" : "text-db-faint"}`}>{data?.sources.centralBank.status === "stale" ? "延迟/缓存 · " : ""}{data?.providers.centralBank?.includes("XAUS") ? "近期 · 较上期储备变化" : "近 3 月 · WGC 月度统计"}</span>}>
      <div className="flex h-full flex-col p-2.5">
        {!bars.length ? (
          <GoldEmpty reason={data?.sources.centralBank.reason ?? data?.reason} error={error} what={error ? "央行购金" : "央行购金"} />
        ) : (
          <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto pr-1">
            {bars.map((t) => {
              const pos = t.tonnes >= 0;
              return (
                <div key={`${t.ym}|${t.country}`} className="flex items-center gap-2">
                  <div className="w-[72px] shrink-0 leading-tight">
                    <div className="truncate text-body text-db-primary">{t.country}</div>
                    <div className="text-caption text-db-faint" style={TNUM}>{t.ym}</div>
                  </div>
                  {/* bar 占剩余空间(min-w-0 可压缩), 数字列 shrink-0 恒可见 —— 任何宽度不溢出 */}
                  <div className="flex min-w-0 flex-1 items-center">
                    <div className="min-w-0 flex-1">
                      {/* 柱(增持正/减持负, 涨红跌绿: 增持=红/减持=绿) */}
                      <div
                        className="h-[14px] rounded-sm"
                        style={{
                          width: `${Math.max(t.pct, 1)}%`,
                          background: pos ? "linear-gradient(90deg,#f43f5e66,#f43f5e)" : "linear-gradient(90deg,#34d39966,#34d399)",
                          opacity: 0.85,
                        }}
                      />
                    </div>
                    <span className={`ml-1.5 shrink-0 text-body font-semibold ${pos ? "text-rose-300" : "text-emerald-300"}`} style={TNUM}>
                      {pos ? "+" : ""}{t.tonnes.toFixed(1)}t
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Panel>
  );
}

/* ================= 面板 6: 央行储备 TOP10(水平条形, CSS flex) ================= */

function GoldCbTopPanel({ className = "", ...zoomProps }: { className?: string } & PanelZoomProps) {
  const { data, error } = useGoldSummary();

  const rows = useMemo(() => {
    const top = data?.central_bank?.top10 ?? [];
    if (!top.length) return [];
    const max = top[0]?.tonnes || 1;
    return top.map((t) => ({ ...t, pct: (t.tonnes / max) * 100 }));
  }, [data]);

  return (
    <Panel className={className} {...zoomProps} title="央行黄金储备 TOP10" icon={<Wallet size={14} />} accent={GOLD}
      right={<span className={`text-caption ${data?.sources.centralBank.status === "stale" ? "text-amber-500/80" : "text-db-faint"}`}>{data?.sources.centralBank.status === "stale" ? "延迟/缓存 · " : ""}吨 · {data?.providers.centralBank || "最新快照"}</span>}>
      <div className="flex h-full flex-col p-2.5">
        {!rows.length ? (
          <GoldEmpty reason={data?.sources.centralBank.reason ?? data?.reason} error={error} what={error ? "央行储备" : "央行储备"} />
        ) : (
          <div className="flex min-h-0 flex-1 flex-col justify-center gap-1.5 overflow-y-auto pr-1">
            {rows.map((r) => (
              <div key={r.country} className="flex items-center gap-2">
                <div className="w-[68px] shrink-0 truncate text-body text-db-primary">{r.country}</div>
                <div className="h-[12px] flex-1 overflow-hidden rounded-sm bg-db-subtle/60">
                  {/* 水平条形(CSS flex, 参考 gold-monitor 柱图) */}
                  <div className="h-full rounded-sm" style={{ width: `${Math.max(r.pct, 1)}%`, background: `linear-gradient(90deg, ${GOLD_DIM}, ${GOLD})` }} />
                </div>
                <div className="w-[64px] shrink-0 text-right text-body font-semibold text-db-secondary" style={TNUM}>
                  {r.tonnes.toLocaleString("zh-CN", { maximumFractionDigits: 0 })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Panel>
  );
}

/* ================= 面板 7: 通胀与 Fed(指标卡网格) ================= */

function GoldInflationPanel({ className = "", ...zoomProps }: { className?: string } & PanelZoomProps) {
  const { data, error } = useGoldSummary();
  const heads = data?.inflation?.headlines ?? null;
  const be = data?.inflation?.breakeven_inflation ?? null;
  const fed = data?.fed ?? null;

  const cpi = heads?.CPI;
  const core = heads?.["Core CPI"];
  const be10 = be?.["10Y"] ?? be?.["10"] ?? null;

  const cards: { label: string; value: string; sub: string; cls: string }[] = [];
  if (cpi) cards.push({ label: "CPI 同比", value: `${cpi.yoy_pct.toFixed(2)}%`, sub: cpi.date || "", cls: "text-rose-300" });
  if (core) cards.push({ label: "核心 CPI 同比", value: `${core.yoy_pct.toFixed(2)}%`, sub: core.date || "", cls: "text-rose-300" });
  if (be10 != null) cards.push({ label: "盈亏平衡通胀 10Y", value: `${be10.toFixed(2)}%`, sub: "市场通胀预期", cls: "text-sky-300" });
  if (fed?.effectiveRate != null) cards.push({ label: "联邦基金利率(实际)", value: `${fed.effectiveRate.toFixed(2)}%`, sub: fed.date || "", cls: "text-amber-300" });

  return (
    <Panel className={className} {...zoomProps} title="通胀与 Fed" icon={<Gem size={14} />} accent={GOLD}
      right={<GoldStamp stale={data?.sources.monitor.status === "stale"} source={data?.providers.macro || "gold-monitor"} text={fed?.fetchedAt ? `Fed ${fed.fetchedAt.slice(0, 16).replace("T", " ")}` : null} />}>
      <div className="flex h-full flex-col p-2.5">
        {!cards.length ? (
          <GoldEmpty reason={data?.reason} error={error} what={error ? "通胀与 Fed" : "通胀与 Fed"} />
        ) : (
          <div className="grid flex-1 grid-cols-2 gap-2">
            {cards.map((c) => (
              <div key={c.label} className="flex flex-col justify-center rounded border border-db-border/30 bg-db-subtle/20 px-2.5 py-2">
                <div className="text-meta text-db-muted">{c.label}</div>
                <div className={`text-display-sm font-bold leading-tight ${c.cls}`} style={TNUM}>{c.value}</div>
                <div className="text-caption text-db-faint">{c.sub}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Panel>
  );
}

/* ================= 面板 8: 黄金新闻 ================= */

function GoldNewsPanel({ className = "", ...zoomProps }: { className?: string } & PanelZoomProps) {
  const { data, error } = useGoldSummary();
  const news = data?.news ?? [];

  return (
    <Panel className={className} {...zoomProps} title="黄金相关新闻" icon={<Newspaper size={14} />} accent={GOLD}
      right={<span className={`text-caption ${data?.sources.monitor.status === "stale" ? "text-amber-500/80" : "text-db-faint"}`}>{data?.sources.monitor.status === "stale" ? "非实时快照 · " : ""}最多 8 条 · {data?.providers.news || "RSS"}</span>}>
      <div className="flex h-full flex-col p-2.5">
        {!news.length ? (
          <GoldEmpty reason={data?.reason} error={error} what={error ? "黄金新闻" : "黄金新闻"} />
        ) : (
          <div className="flex min-h-0 flex-1 flex-col justify-center gap-1 overflow-y-auto pr-1">
            {news.map((n, i) => (
              <a
                key={`${n.url || i}`}
                href={n.url || "#"}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex items-start gap-2 rounded px-1.5 py-1 transition-colors hover:bg-db-subtle/40"
              >
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: GOLD }} />
                <span className="min-w-0 flex-1">
                  {/* 长标题不 truncate(用户要求 flex-wrap 换行) */}
                  <span className="block text-body leading-snug text-db-secondary group-hover:text-gold-soft">{n.title}</span>
                  {(n.source || n.publishedAt) && <span className="mt-0.5 block text-caption text-db-faint">{n.source}{n.publishedAt ? ` · ${new Date(n.publishedAt).toLocaleDateString("zh-CN", { month: "2-digit", day: "2-digit" })}` : ""}</span>}
                </span>
              </a>
            ))}
          </div>
        )}
      </div>
    </Panel>
  );
}

/* ================= 布局(3 行: 2+3+3, 庄子拍板) =================
 * 行1: hero + trend(保持原宽度比 0.34/0.66)
 * 行2: cbtx + cbtop + news(购金 + 新闻聚合, 约 0.34/0.33/0.33)
 * 行3: yield + real + inflation(利率宏观线, 约 0.34/0.33/0.33)
 * defaultH 总和 1.0 铺满视口; mobileH 保持各面板原值 */

const PANEL_ROWS: PanelRowDef[] = [
  {
    defaultH: 0.33,
    panels: [
      { id: "gold-hero", component: GoldHeroPanel, defaultW: 0.34, mobileH: "h-[220px]" },
      { id: "gold-trend", component: GoldTrendPanel, defaultW: 0.66, mobileH: "h-[340px]" },
    ],
  },
  {
    defaultH: 0.33,
    panels: [
      { id: "gold-cbtx", component: GoldCbTxPanel, defaultW: 0.34, mobileH: "h-[300px]" },
      { id: "gold-cbtop", component: GoldCbTopPanel, defaultW: 0.33, mobileH: "h-[300px]" },
      { id: "gold-news", component: GoldNewsPanel, defaultW: 0.33, mobileH: "h-[320px]" },
    ],
  },
  {
    defaultH: 0.34,
    panels: [
      { id: "gold-yield", component: GoldYieldCurvePanel, defaultW: 0.34, mobileH: "h-[300px]" },
      { id: "gold-real", component: GoldRealRatePanel, defaultW: 0.33, mobileH: "h-[300px]" },
      { id: "gold-inflation", component: GoldInflationPanel, defaultW: 0.33, mobileH: "h-[260px]" },
    ],
  },
];

export default function GoldDashboard() {
  const { isFullscreen, toggle } = useFullscreen();
  const { data, error } = usePolling(() => api.gold(), POLL.MINUTE);
  const summary = useMemo(() => ({ data, error }), [data, error]);

  return (
    <div className="flex min-h-screen flex-col bg-db-canvas text-db-primary lg:h-screen lg:overflow-hidden">
      <DashboardHeader
        title="黄金观察"
        subtitle="GOLD WATCH"
        accent="gold"
        tagline="金价实时 · 走势 · 美债收益率 · 实际利率 · 央行购金 · 通胀与 Fed · 黄金新闻"
        linkTo="/"
        linkLabel="市场驾驶舱"
        linkBack
        links={[
          { to: "/", label: "市场驾驶舱" },
          { to: "/goods", label: "商品价格" },
          { to: "/ai", label: "AI 观察" },
          { to: "/fin", label: "财报窗口" },
        ]}
        isFullscreen={isFullscreen}
        onToggleFullscreen={toggle}
      />
      <GoldSummaryCtx.Provider value={summary}>
        <DashboardLayout rows={PANEL_ROWS} pageKey="gold" />
      </GoldSummaryCtx.Provider>
    </div>
  );
}

import { memo, useMemo, useState, type MouseEvent } from "react";
import { Bell, Gauge, Table2, TrendingUp } from "lucide-react";
import { Panel, type PanelZoomProps } from "./Panel";
import { AsyncContent } from "./SharedUI";
import { useRetryPolling } from "@/hooks/useRetryPolling";
import { useElementSize } from "@/hooks/useElementSize";
import { api, type AaModel, type SpendIndexResp } from "@/lib/api";
import { TNUM } from "@/lib/format";
import { POLL } from "@/lib/intervals";
import { GRID, AXIS, CROSSHAIR, SERIES, CHART_BG, TOOLTIP_BG } from "@/lib/colors";

// 厂商分类色板(已验证: 深色 #070b12 表面, CVD ΔE≥8; 按模型数取前 8, 其余归"其他")
const VENDOR_COLORS = ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181", "#008300", "#9085e9", "#e66767"];

const fmtUsd = (v: number | null) =>
  v == null ? "—" : v >= 1000 ? `$${(v / 1000).toFixed(1)}k` : v >= 100 ? `$${v.toFixed(0)}` : v >= 10 ? `$${v.toFixed(1)}` : `$${v.toFixed(2)}`;

/** 厂商按模型数取前 8(固定色相顺序, 不随排序变化) */
function vendorsOf(aa: { models: AaModel[] } | null): string[] {
  if (!aa) return [];
  const cnt = new Map<string, number>();
  for (const m of aa.models) cnt.set(m.vendor, (cnt.get(m.vendor) || 0) + 1);
  return [...cnt.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([v]) => v);
}

/* ================ 趋势: 加权/闭源/开源三线(同 $/M 单轴, 悬停十字线) ================ */
const TREND_SERIES = [
  { key: "ttsi", label: "全市场加权", color: "#9085e9", width: 2 },
  { key: "closed", label: "闭源前沿", color: "#d95926", width: 1.5 },
  { key: "open", label: "开源权重", color: "#199e70", width: 1.5 },
] as const;

function TtsiChart({ points }: { points: SpendIndexResp["points"] }) {
  // 紧凑网格下绘图区可能恰为 60px；禁用默认阈值，避免一直使用 400×260 初始尺寸。
  const { ref, size } = useElementSize(0);
  const [hover, setHover] = useState<number | null>(null);
  const W = size.w;
  const H = size.h;
  const PAD = { l: 38, r: 10, t: 8, b: 18 };
  const n = points.length;
  if (W < 120 || n < 2) return <div ref={ref} className="h-full w-full" />;

  const allVals = points.flatMap((p) => [p.ttsi, p.closed, p.open]).filter((v): v is number => v != null);
  const yMin = 0; // 纵轴从 0 起, 呈现绝对价格水位
  const yMax = Math.max(Math.ceil(Math.max(...allVals)), 1);
  const x = (i: number) => PAD.l + (i / (n - 1)) * (W - PAD.l - PAD.r);
  const y = (v: number) => PAD.t + (1 - (v - yMin) / (yMax - yMin || 1)) * (H - PAD.t - PAD.b);

  // 断点处理: 空值断开路径段
  const buildPath = (key: "ttsi" | "closed" | "open") => {
    let d = "";
    let started = false;
    points.forEach((p, i) => {
      const v = p[key];
      if (v == null) { started = false; return; }
      d += `${started ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
      started = true;
    });
    return d;
  };
  const path = buildPath("ttsi");
  const area = path ? `${path} L${x(n - 1).toFixed(1)},${H - PAD.b} L${x(0).toFixed(1)},${H - PAD.b} Z` : "";
  // 整齐 Y 刻度(步长 1/2/5)
  const step = yMax <= 5 ? 1 : yMax <= 10 ? 2 : 5;
  const ticks: number[] = [];
  for (let t = 0; t <= yMax; t += step) ticks.push(t);
  const hp = hover != null ? points[hover] : null;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div ref={ref} className="relative min-h-0 flex-1 overflow-hidden">
        <svg width={W} height={H} className="block" onMouseMove={(e) => {
          const z = parseFloat(getComputedStyle(e.currentTarget).getPropertyValue("--tv-zoom") || "1") || 1;
          const i = Math.round((((e.nativeEvent.offsetX / z) - PAD.l) / (W - PAD.l - PAD.r)) * (n - 1));
          setHover(Math.max(0, Math.min(n - 1, i)));
        }} onMouseLeave={() => setHover(null)}>
          <defs>
            <linearGradient id="ttsi-grad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#9085e9" stopOpacity={0.15} />
              <stop offset="100%" stopColor="#9085e9" stopOpacity={0} />
            </linearGradient>
          </defs>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} stroke={GRID} strokeWidth={1} />
              <text x={PAD.l - 4} y={y(t) + 3} textAnchor="end" fontSize={9} fill={AXIS}>{`$${t.toFixed(0)}`}</text>
            </g>
          ))}
          <text x={PAD.l} y={H - 4} fontSize={9} fill={AXIS}>{points[0].date}</text>
          <text x={W - PAD.r} y={H - 4} textAnchor="end" fontSize={9} fill={AXIS}>{points[n - 1].date}</text>
          {path && <path d={area} fill="url(#ttsi-grad)" stroke="none" />}
          {TREND_SERIES.map((s) => (
            <path key={s.key} d={buildPath(s.key)} fill="none" stroke={s.color} strokeWidth={s.width} strokeLinejoin="round" />
          ))}
          {hp && hover != null && hp.ttsi != null && (
            <g>
              <line x1={x(hover)} x2={x(hover)} y1={PAD.t} y2={H - PAD.b} stroke={AXIS} strokeWidth={1} strokeDasharray="3 3" />
              <circle cx={x(hover)} cy={y(hp.ttsi)} r={3} fill="#9085e9" stroke={CHART_BG} strokeWidth={1.5} />
            </g>
          )}
        </svg>
        {hp && hover != null && (
          <div
            className="pointer-events-none absolute top-1 z-10 rounded border border-db-border/60 px-2 py-1 text-caption leading-4 shadow"
            style={{ left: Math.min(x(hover) + 8, W - 130), background: TOOLTIP_BG + "F2" }}
          >
            <div className="font-semibold text-db-primary">{hp.date}</div>
            <div style={TNUM}><span className="text-violet-300">加权</span> {fmtUsd(hp.ttsi)}{hp.pct != null && <span className={hp.pct >= 0 ? "text-rose-400" : "text-emerald-400"}> {hp.pct >= 0 ? "+" : ""}{hp.pct}%</span>}</div>
            <div style={TNUM}><span className="text-model-closed">闭源</span> {fmtUsd(hp.closed)} · <span className="text-model-open">开源</span> {fmtUsd(hp.open)}</div>
            <div style={TNUM}>点位 {hp.indexPoint ?? "—"} · 溢价 {hp.premium ?? "—"}×</div>
          </div>
        )}
      </div>
      {/* 图例: 三系列固定色相 */}
      <div className="flex flex-wrap items-center gap-3 pt-0.5">
        {TREND_SERIES.map((s) => (
          <span key={s.key} className="flex items-center gap-1 text-caption text-db-muted">
            <span className="h-[2px] w-3 rounded-full" style={{ background: s.color }} />
            {s.label}
          </span>
        ))}
        <span className="ml-auto text-caption text-db-faint">$/M tokens</span>
      </div>
    </div>
  );
}

const RANGES = [
  { key: "30d", label: "30d", n: 30 },
  { key: "90d", label: "90d", n: 90 },
  { key: "180d", label: "180d", n: 180 },
  { key: "all", label: "全部", n: Infinity },
] as const;

export const TtsiTrendPanel = memo(function TtsiTrendPanel({ className = "", ...zoomProps }: { className?: string } & PanelZoomProps) {
  const [range, setRange] = useState<(typeof RANGES)[number]["key"]>("all");
  const { data: si, loading, error, retry } = useRetryPolling(() => api.spendIndex(), POLL.AA_MODELS);
  const points = useMemo(() => (si ? si.points.slice(-RANGES.find((r) => r.key === range)!.n) : []), [si, range]);
  const last = points[points.length - 1];
  return (
    <Panel
      className={className}
      {...zoomProps}
      title="LLM 价格趋势"
      icon={<TrendingUp size={14} />}
      accent={SERIES[5]}
      right={
        <div className="flex items-center gap-1">
          {RANGES.map((r) => (
            <button
              key={r.key}
              onClick={() => setRange(r.key)}
              className={`rounded px-1.5 py-0.5 text-meta font-medium transition-colors ${range === r.key ? "bg-violet-500/20 text-violet-300" : "text-db-muted hover:text-db-secondary"}`}
            >
              {r.label}
            </button>
          ))}
        </div>
      }
    >
      <div className="flex h-full flex-col p-2 pt-1">
        <AsyncContent loading={loading} error={error} empty={false} onRetry={retry}>
          {si && (
            <div className="flex h-full min-h-0 flex-col gap-1">
              <div className="flex items-baseline gap-3 px-0.5 text-meta text-db-tertiary">
                <span>最新 <b className="text-subtitle text-violet-300" style={TNUM}>{fmtUsd(last?.ttsi ?? null)}</b>/M</span>
                <span>指数点位 <b className="text-db-primary" style={TNUM}>{last?.indexPoint ?? "—"}</b></span>
                <span>前沿溢价 <b className="text-db-primary" style={TNUM}>{last?.premium ?? "—"}×</b></span>
              </div>
              <div className="min-h-0 flex-1">
                <TtsiChart points={points} />
              </div>
              <div className="text-caption text-db-faint">数据: {si.source} · {si.points.length} 天 · 模型级价格历史自今日积累</div>
            </div>
          )}
        </AsyncContent>
      </div>
    </Panel>
  );
});

/* ================ 事件: 降价/份额变动流 ================ */
export const EventPanel = memo(function EventPanel({ className = "", ...zoomProps }: { className?: string } & PanelZoomProps) {
  const { data: si, loading, error, retry } = useRetryPolling(() => api.spendIndex(), POLL.AA_MODELS);
  const events = si?.events ?? [];
  return (
    <Panel className={className} {...zoomProps} title="模型降价事件" icon={<Bell size={14} />} accent={SERIES[3]}
      right={<span className="text-caption text-db-muted">{events.length} 条</span>}>
      <div className="flex h-full flex-col p-2 pt-1">
        <AsyncContent loading={loading} error={error} empty={false} onRetry={retry}>
          {events.length === 0 ? (
            <div className="flex h-full items-center justify-center text-meta text-db-faint">暂无价格事件</div>
          ) : (
            <div className="min-h-0 flex-1 space-y-1 overflow-y-auto">
              {events.map((e, i) => (
                <div key={i} className="flex items-center gap-2 rounded px-1.5 py-1 text-meta transition-colors hover:bg-db-subtle/40">
                  <span className="shrink-0 rounded bg-db-border/50 px-1 py-px text-caption text-db-tertiary" style={TNUM}>{e.date}</span>
                  <span className="text-db-secondary">{e.text}</span>
                </div>
              ))}
            </div>
          )}
        </AsyncContent>
      </div>
    </Panel>
  );
});

/* ================ 价格表: 智能/输入/输出/任务成本 四列可排 ================ */
function PriceTable({ models }: { models: AaModel[] }) {
  const [sortKey, setSortKey] = useState<"intel" | "input" | "output" | "taskCost">("intel");
  const [dir, setDir] = useState<1 | -1>(-1);
  const rows = useMemo(() => {
    const list = models.filter((m) => m.output != null || m.input != null);
    return [...list].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      return (av - bv) * dir;
    });
  }, [models, sortKey, dir]);
  const head = (key: typeof sortKey, label: string) => (
    <th
      onClick={() => { if (sortKey === key) setDir((d) => (d === -1 ? 1 : -1)); else { setSortKey(key); setDir(-1); } }}
      className={`cursor-pointer select-none px-1 py-1 text-right text-caption font-medium ${sortKey === key ? "text-violet-300" : "text-db-muted hover:text-db-secondary"}`}
    >
      {label}{sortKey === key ? (dir === -1 ? " ↓" : " ↑") : ""}
    </th>
  );
  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <table className="w-full text-meta">
        <thead className="sticky top-0 z-10" style={{ background: CHART_BG }}>
          <tr>
            <th className="px-1 py-1 text-left text-caption font-medium text-db-muted">模型</th>
            {head("intel", "智能")}
            {head("input", "输入$")}
            {head("output", "输出$")}
            {head("taskCost", "任务成本")}
          </tr>
        </thead>
        <tbody>
          {rows.map((m) => (
            <tr key={m.slug} className="border-t border-db-subtle/50 hover:bg-db-subtle/30">
              <td className="max-w-[150px] px-1 py-[3px]">
                <div className="truncate text-db-primary">{m.name}</div>
                <div className="truncate text-caption text-db-muted">{m.vendor}</div>
              </td>
              <td className="px-1 text-right text-db-secondary" style={TNUM}>{m.intel != null ? m.intel.toFixed(1) : "—"}</td>
              <td className="px-1 text-right text-db-tertiary" style={TNUM}>{fmtUsd(m.input)}</td>
              <td className="px-1 text-right font-semibold text-db-primary" style={TNUM}>{fmtUsd(m.output)}</td>
              <td className="px-1 text-right text-db-tertiary" style={TNUM}>{fmtUsd(m.taskCost)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export const ModelPricePanel = memo(function ModelPricePanel({ className = "", ...zoomProps }: { className?: string } & PanelZoomProps) {
  const { data: aa, loading, error, retry } = useRetryPolling(() => api.aaModels(), POLL.AA_MODELS);
  return (
    <Panel className={className} {...zoomProps} title="大模型价格表" icon={<Table2 size={14} />} accent={SERIES[2]}
      right={<span className="text-caption text-db-muted">{aa ? aa.models.filter((m) => m.output != null || m.input != null).length : "—"} 个</span>}>
      <div className="flex h-full flex-col p-2 pt-1">
        <AsyncContent loading={loading} error={error} empty={false} onRetry={retry}>
          {aa && <PriceTable models={aa.models} />}
        </AsyncContent>
        <div className="pt-1 text-right text-caption text-db-faint">{aa?.source ?? ""}</div>
      </div>
    </Panel>
  );
});

/* ================ 性价比: 智能指数 × 任务成本散点(对数轴, 厂商着色) ================ */
function ValueScatter({ models, vendors }: { models: AaModel[]; vendors: string[] }) {
  const { ref, size } = useElementSize();
  const [hover, setHover] = useState<AaModel | null>(null);
  const W = size.w;
  const H = size.h;
  const PAD = { l: 46, r: 10, t: 8, b: 18 };
  // 横轴恒为智能指数(intel), 与价格表同源同口径 — intel 缺失时(AA API 上游不可用)显示空态提示, 不悄悄换轴
  const pts = useMemo(() => models.filter((m) => m.intel != null && m.taskCost != null && m.taskCost > 0), [models]);
  if (W < 120) return <div ref={ref} className="h-full w-full" />;
  if (pts.length === 0)
    return (
      <div ref={ref} className="flex h-full w-full flex-col items-center justify-center gap-1 text-db-muted">
        <div className="text-body">智能指数数据暂不可用</div>
        <div className="text-caption">AA API 上游限流, 恢复后自动显示</div>
      </div>
    );

  const xMin = Math.min(...pts.map((p) => p.intel!)) * 0.95;
  const xMax = Math.max(...pts.map((p) => p.intel!)) * 1.05;
  const yMinLog = Math.log10(Math.min(...pts.map((p) => p.taskCost!)));
  const yMaxLog = Math.log10(Math.max(...pts.map((p) => p.taskCost!)));
  const x = (v: number) => PAD.l + ((v - xMin) / (xMax - xMin)) * (W - PAD.l - PAD.r);
  const y = (v: number) => PAD.t + (1 - (Math.log10(v) - yMinLog) / (yMaxLog - yMinLog || 1)) * (H - PAD.t - PAD.b);
  const colorOf = (m: AaModel) => {
    const i = vendors.indexOf(m.vendor);
    return i >= 0 ? VENDOR_COLORS[i] : CROSSHAIR;
  };
  const yTicks: number[] = [];
  for (let k = Math.ceil(yMinLog); k <= Math.floor(yMaxLog); k++) yTicks.push(10 ** k);
  const xTicks = [0, 1, 2, 3].map((i) => xMin + ((xMax - xMin) * i) / 3);

  const onMove = (e: MouseEvent<SVGSVGElement>) => {
    const z = parseFloat(getComputedStyle(e.currentTarget).getPropertyValue("--tv-zoom") || "1") || 1;
    const mx = e.nativeEvent.offsetX / z;
    const my = e.nativeEvent.offsetY / z;
    let best: AaModel | null = null;
    let bestD = 25;
    for (const p of pts) {
      const d = Math.hypot(x(p.intel!) - mx, y(p.taskCost!) - my);
      if (d < bestD) { bestD = d; best = p; }
    }
    setHover(best);
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* ref 绑在 flex-1 容器上: size.h 仅含 SVG 绘图区, 排除底部图例行, 避免图例遮横轴 */}
      <div ref={ref} className="relative min-h-0 flex-1">
        <svg width={W} height={H} className="block" onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
          {xTicks.map((t, i) => (
            <g key={`x${i}`}>
              <line x1={x(t)} x2={x(t)} y1={PAD.t} y2={H - PAD.b} stroke={GRID} strokeWidth={1} />
              <text x={x(t)} y={H - 6} textAnchor="middle" fontSize={9} fill={AXIS}>{t.toFixed(0)}</text>
            </g>
          ))}
          {yTicks.map((t) => (
            <g key={t}>
              <line x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} stroke={GRID} strokeWidth={1} />
              <text x={PAD.l - 4} y={y(t) + 3} textAnchor="end" fontSize={9} fill={AXIS}>{t >= 1 ? `$${t}` : `$${t.toFixed(2)}`}</text>
            </g>
          ))}
          {pts.map((p) => (
            <circle key={p.slug} cx={x(p.intel!)} cy={y(p.taskCost!)} r={hover === p ? 5 : 4} fill={colorOf(p)} fillOpacity={hover === p ? 1 : 0.85} stroke={hover === p ? "#fff" : "none"} strokeWidth={hover === p ? 1 : 0} />
          ))}
        </svg>
        {hover && (
          <div className="pointer-events-none absolute left-2 top-1 z-10 rounded border border-db-border/60 px-2 py-1 text-caption leading-4 shadow" style={{ background: TOOLTIP_BG + "F2" }}>
            <div className="font-semibold text-db-primary">{hover.name}</div>
            <div className="text-db-muted">{hover.vendor}</div>
            <div style={TNUM}>智能 {hover.intel?.toFixed(1)} · 任务成本 <b style={{ color: colorOf(hover) }}>{fmtUsd(hover.taskCost)}</b></div>
          </div>
        )}
      </div>
      <div className="flex flex-wrap gap-x-2.5 gap-y-0.5 pt-1">
        {vendors.map((v, i) => (
          <span key={v} className="flex items-center gap-1 text-caption text-db-muted">
            <span className="h-2 w-2 rounded-full" style={{ background: VENDOR_COLORS[i] }} />
            {v}
          </span>
        ))}
        <span className="flex items-center gap-1 text-caption text-db-muted">
          <span className="h-2 w-2 rounded-full" style={{ background: CROSSHAIR }} />其他
        </span>
      </div>
    </div>
  );
}

export const ValueScatterPanel = memo(function ValueScatterPanel({ className = "", ...zoomProps }: { className?: string } & PanelZoomProps) {
  const { data: aa, loading, error, retry } = useRetryPolling(() => api.aaModels(), POLL.AA_MODELS);
  const vendors = useMemo(() => vendorsOf(aa), [aa]);
  return (
    <Panel className={className} {...zoomProps} title="智能 × 任务成本" icon={<Gauge size={14} />} accent={SERIES[6]}
      right={<span className="text-caption text-db-muted">{aa ? aa.models.filter((m) => m.intel != null && m.taskCost != null).length : "—"} 个</span>}>
      <div className="flex h-full flex-col p-2 pt-1">
        <AsyncContent loading={loading} error={error} empty={false} onRetry={retry}>
          {aa && <ValueScatter models={aa.models} vendors={vendors} />}
        </AsyncContent>
        <div className="pt-1 text-right text-caption text-db-faint">{aa?.source ?? ""}</div>
      </div>
    </Panel>
  );
});

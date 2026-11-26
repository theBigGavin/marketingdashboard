import { useMemo } from "react";
import { Panel, type PanelZoomProps } from "./Panel";
import { usePolling } from "@/hooks/usePolling";
import { Landmark } from "lucide-react";
import { useSharedPolling } from "@/hooks/useSharedPolling";
import { api, type Treasury } from "@/lib/api";
import { clsChg } from "@/lib/format";
import { POLL } from "@/lib/intervals";
import { useElementSize } from "@/hooks/useElementSize";

const ORDER = ["US3M", "US6M", "US1Y", "US2Y", "US3Y", "US5Y", "US7Y", "US10Y", "US20Y", "US30Y"];
const LABEL: Record<string, string> = {
  US3M: "3月", US6M: "6月", US1Y: "1年", US2Y: "2年", US3Y: "3年",
  US5Y: "5年", US7Y: "7年", US10Y: "10年", US20Y: "20年", US30Y: "30年",
};
/** 高亮年份配色(关键利率周期: 2001互联网泡沫 / 2006加息顶点 / 2011扭曲操作 / 2016低利率 / 2021零利率 / 2023倒挂峰值 / 2025 / 2026当前) */
const HIGHLIGHT_COLORS: Record<string, string> = {
  "2001": "#f472b6",
  "2006": "#fb923c",
  "2011": "#fbbf24",
  "2016": "#a3e635",
  "2021": "#34d399",
  "2023": "#22d3ee",
  "2025": "#818cf8",
  "2026": "#fb7185",
};

/** 美债收益率曲线 */
export function TreasuryPanel({ className = "", ...zoomProps }: { className?: string } & PanelZoomProps) {
  const { data, error } = useSharedPolling("treasuries", () => api.treasuries(), POLL.TREASURY_LIVE); // 与顶部跑马灯共享
  const { data: hist } = usePolling(() => api.treasuryHistory(), POLL.TREASURY);

  // 容器实际像素尺寸 — SVG 坐标按真实尺寸计算, 避免 viewBox 拉伸导致文字变形
  const { ref: boxRef, size } = useElementSize();

  const rows = useMemo(
    () => (data ? ORDER.map((s) => data.find((d) => d.symbol === s)).filter(Boolean) as Treasury[] : []),
    [data]
  );

  // 只看与当前月份相同的历史月份(如 7 月 → 历年 7 月), 避免百余条曲线糊成一片
  const currentMonth = String(new Date().getMonth() + 1).padStart(2, "0");

  /** 历史同期月度曲线(与 ORDER 对齐的收益率序列) */
  const histCurves = useMemo(
    () =>
      (hist || [])
        .filter((h) => h.date.slice(5, 7) === currentMonth)
        .map((h) => ({
          date: h.date,
          ys: ORDER.map((s) => h.yields[s]).filter((v) => Number.isFinite(v) && v > 0),
        }))
        .filter((c) => c.ys.length === ORDER.length),
    [hist, currentMonth]
  );

  /** 高亮年份曲线 / 其余年份作底色 */
  const { highlights, backgrounds } = useMemo(() => {
    const hi: ({ date: string; ys: number[] } & { color: string })[] = [];
    const bg: { date: string; ys: number[] }[] = [];
    for (const c of histCurves) {
      const color = HIGHLIGHT_COLORS[c.date.slice(0, 4)];
      if (color) hi.push({ ...c, color });
      else bg.push(c);
    }
    return { highlights: hi, backgrounds: bg };
  }, [histCurves]);

  const curve = useMemo(() => {
    if (rows.length < 3) return null;
    const { w: W, h: H } = size;
    const ys = [...rows.map((r) => r.yield), ...histCurves.flatMap((c) => c.ys)];
    const min = Math.min(...ys) - 0.06;
    const max = Math.max(...ys) + 0.06;
    const X = (i: number) => 34 + (i / (rows.length - 1)) * (W - 46);
    const Y = (v: number) => 10 + (1 - (v - min) / (max - min)) * (H - 40);
    const pts = rows.map((r, i) => `${X(i)},${Y(r.yield)}`);
    const line = (cys: number[]) => cys.map((v, i) => `${X(i)},${Y(v)}`).join(" ");
    return { W, H, pts, X, Y, min, max, line };
  }, [rows, histCurves, size]);

  const y2 = rows.find((r) => r.symbol === "US2Y");
  const y10 = rows.find((r) => r.symbol === "US10Y");
  const m3 = rows.find((r) => r.symbol === "US3M");
  const spread2s10s = y2 && y10 ? (y10.yield - y2.yield) * 100 : null; // bp
  const spread3m10y = m3 && y10 ? (y10.yield - m3.yield) * 100 : null;

  return (
    <Panel className={className} {...zoomProps} title="美债国债市场" icon={<Landmark size={14} />} accent="#a78bfa"
      right={<span className="text-meta text-db-muted">CNBC · 60s</span>}>
      <div className="flex h-full flex-col p-2.5">
        {/* 利差指标 */}
        <div className="mb-2 grid grid-cols-3 gap-2">
          <div className="rounded border border-db-border/30 bg-db-subtle/20 px-2 py-1">
            <div className="text-meta text-db-muted">10Y 收益率</div>
            <div className="text-metric-sm font-semibold text-violet-300" style={{ fontVariantNumeric: "tabular-nums" }}>
              {y10 ? `${y10.yield.toFixed(3)}%` : "——"}
            </div>
          </div>
          <div className="rounded border border-db-border/30 bg-db-subtle/20 px-2 py-1">
            <div className="text-meta text-db-muted">2s10s 利差</div>
            <div className={`text-metric-sm font-semibold ${spread2s10s != null ? clsChg(spread2s10s) : "text-db-muted"}`} style={{ fontVariantNumeric: "tabular-nums" }}>
              {spread2s10s != null ? `${spread2s10s > 0 ? "+" : ""}${spread2s10s.toFixed(1)}bp` : "——"}
            </div>
          </div>
          <div className="rounded border border-db-border/30 bg-db-subtle/20 px-2 py-1">
            <div className="text-meta text-db-muted">3M-10Y {spread3m10y != null && spread3m10y < 0 ? "(倒挂)" : ""}</div>
            <div className={`text-metric-sm font-semibold ${spread3m10y != null ? clsChg(spread3m10y) : "text-db-muted"}`} style={{ fontVariantNumeric: "tabular-nums" }}>
              {spread3m10y != null ? `${spread3m10y > 0 ? "+" : ""}${spread3m10y.toFixed(1)}bp` : "——"}
            </div>
          </div>
        </div>

        {/* 收益率曲线(叠加历史同期曲线) */}
        {highlights.length > 0 && (
          <div className="mb-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-micro leading-none text-db-muted">
            {highlights.map((m) => (
              <span key={m.date} className="flex items-center gap-1">
                <i className="inline-block h-[2px] w-2.5 rounded" style={{ background: m.color }} />
                {m.date.slice(0, 4)}
              </span>
            ))}
            <span className="flex items-center gap-1">
              <i className="inline-block h-[2px] w-2.5 rounded" style={{ background: "#c4b5fd" }} />
              当前
            </span>
            <span className="ml-auto text-db-faint">历年{Number(currentMonth)}月曲线 · 财政部存档</span>
          </div>
        )}
        <div ref={boxRef} className="min-h-[110px] flex-1">
          {curve ? (
            <svg width={curve.W} height={curve.H} className="block">
              {[0.25, 0.5, 0.75].map((f) => {
                const yv = curve.max - f * (curve.max - curve.min);
                const py = curve.Y(yv);
                return (
                  <g key={f}>
                    <line x1={34} y1={py} x2={curve.W - 12} y2={py} stroke="#1e293b" strokeWidth={1} />
                    <text x={4} y={py + 3} fontSize={9} fill="#64748b">{yv.toFixed(2)}</text>
                  </g>
                );
              })}
              {/* 历史同期曲线(底层, 未高亮年份) */}
              {backgrounds.map((c) => (
                <polyline key={c.date} points={curve.line(c.ys)} fill="none"
                  stroke="#475569" strokeOpacity={0.3} strokeWidth={1} strokeLinejoin="round" />
              ))}
              {/* 高亮年份(颜色见图例) */}
              {highlights.map((m) => (
                <polyline key={m.date} points={curve.line(m.ys)} fill="none"
                  stroke={m.color} strokeOpacity={0.85} strokeWidth={1.5} strokeLinejoin="round" />
              ))}
              {/* 当前实时曲线(顶层) */}
              <polyline points={curve.pts.join(" ")} fill="none" stroke="#c4b5fd" strokeWidth={2.5} strokeLinejoin="round" />
              {rows.map((r, i) => (
                <g key={r.symbol}>
                  <circle cx={curve.X(i)} cy={curve.Y(r.yield)} r={r.symbol === "US10Y" ? 4 : 2.5}
                    fill="#0c1320" stroke={r.symbol === "US10Y" ? "#c4b5fd" : "#a78bfa"} strokeWidth={1.5} />
                  <text x={curve.X(i)} y={curve.H - 16} fontSize={9} fill="#94a3b8" textAnchor="middle">{LABEL[r.symbol]}</text>
                  <text x={curve.X(i)} y={curve.Y(r.yield) - 7} fontSize={9} fontWeight={600}
                    fill={r.symbol === "US10Y" ? "#c4b5fd" : "#94a3b8"} textAnchor="middle">{r.yield.toFixed(2)}</text>
                </g>
              ))}
            </svg>
          ) : (
            <div className="flex h-full items-center justify-center text-body text-db-faint">
              {error ? <span className="text-rose-400/80">美债数据源连接失败,自动重试中…</span> : "收益率曲线加载中…"}
            </div>
          )}
        </div>

        {/* 各期限列表 */}
        <div className="mt-2 flex shrink-0 flex-wrap content-start gap-x-4 gap-y-1 border-t border-db-border/30 pt-2">
          {rows.map((r) => (
            <span key={r.symbol} className="text-meta" style={{ fontVariantNumeric: "tabular-nums" }}>
              <span className="text-db-muted">{LABEL[r.symbol]} </span>
              <span className="text-db-secondary">{r.yield.toFixed(3)}</span>
              <span className={clsChg(r.change)}> {r.change > 0 ? "+" : ""}{r.change.toFixed(3)}</span>
            </span>
          ))}
        </div>
      </div>
    </Panel>
  );
}

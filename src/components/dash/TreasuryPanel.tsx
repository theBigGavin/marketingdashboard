import { useEffect, useMemo, useRef, useState } from "react";
import { Panel, type PanelZoomProps } from "./Panel";
import { usePolling } from "@/hooks/usePolling";
import { api, type Treasury } from "@/lib/api";
import { clsChg } from "@/lib/format";

const ORDER = ["US3M", "US6M", "US1Y", "US2Y", "US3Y", "US5Y", "US7Y", "US10Y", "US20Y", "US30Y"];
const LABEL: Record<string, string> = {
  US3M: "3月", US6M: "6月", US1Y: "1年", US2Y: "2年", US3Y: "3年",
  US5Y: "5年", US7Y: "7年", US10Y: "10年", US20Y: "20年", US30Y: "30年",
};
/** 里程碑历史曲线配色: 最早 / 中间 / 最近 */
const MILE_COLORS = ["#60a5fa", "#fbbf24", "#fb7185"];

/** 美债收益率曲线 */
export function TreasuryPanel({ className = "", ...zoomProps }: { className?: string } & PanelZoomProps) {
  const { data, error } = usePolling(() => api.treasuries(), 60000);
  const { data: hist } = usePolling(() => api.treasuryHistory(), 3600000);

  // 容器实际像素尺寸 — SVG 坐标按真实尺寸计算, 避免 viewBox 拉伸导致文字变形
  const boxRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 560, h: 130 });
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const r = entries[0].contentRect;
      if (r.width > 40 && r.height > 40) setSize({ w: r.width, h: r.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const rows = useMemo(
    () => (data ? ORDER.map((s) => data.find((d) => d.symbol === s)).filter(Boolean) as Treasury[] : []),
    [data]
  );

  /** 历史月度曲线(与 ORDER 对齐的收益率序列) */
  const histCurves = useMemo(
    () =>
      (hist || []).map((h) => ({
        date: h.date,
        ys: ORDER.map((s) => h.yields[s]).filter((v) => Number.isFinite(v) && v > 0),
      })).filter((c) => c.ys.length === ORDER.length),
    [hist]
  );

  /** 里程碑曲线: 最早 / 中间 / 最近月份 */
  const milestones = useMemo(() => {
    const n = histCurves.length;
    if (!n) return [];
    const idxs = [...new Set([0, Math.floor((n - 1) / 2), n - 1])];
    return idxs.map((i, k) => ({ ...histCurves[i], color: MILE_COLORS[k] }));
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
    <Panel className={className} {...zoomProps} title="美债国债市场" icon="◧" accent="#a78bfa"
      right={<span className="text-[10px] text-slate-500">CNBC · 60s</span>}>
      <div className="flex h-full flex-col p-2.5">
        {/* 利差指标 */}
        <div className="mb-2 grid grid-cols-3 gap-2">
          <div className="rounded border border-slate-700/30 bg-slate-800/20 px-2 py-1">
            <div className="text-[10px] text-slate-500">10Y 收益率</div>
            <div className="text-[16px] font-bold text-violet-300" style={{ fontVariantNumeric: "tabular-nums" }}>
              {y10 ? `${y10.yield.toFixed(3)}%` : "——"}
            </div>
          </div>
          <div className="rounded border border-slate-700/30 bg-slate-800/20 px-2 py-1">
            <div className="text-[10px] text-slate-500">2s10s 利差</div>
            <div className={`text-[16px] font-bold ${spread2s10s != null ? clsChg(spread2s10s) : "text-slate-500"}`} style={{ fontVariantNumeric: "tabular-nums" }}>
              {spread2s10s != null ? `${spread2s10s > 0 ? "+" : ""}${spread2s10s.toFixed(1)}bp` : "——"}
            </div>
          </div>
          <div className="rounded border border-slate-700/30 bg-slate-800/20 px-2 py-1">
            <div className="text-[10px] text-slate-500">3M-10Y {spread3m10y != null && spread3m10y < 0 ? "(倒挂)" : ""}</div>
            <div className={`text-[16px] font-bold ${spread3m10y != null ? clsChg(spread3m10y) : "text-slate-500"}`} style={{ fontVariantNumeric: "tabular-nums" }}>
              {spread3m10y != null ? `${spread3m10y > 0 ? "+" : ""}${spread3m10y.toFixed(1)}bp` : "——"}
            </div>
          </div>
        </div>

        {/* 收益率曲线(叠加历史月度曲线) */}
        {milestones.length > 0 && (
          <div className="mb-0.5 flex items-center gap-2 text-[8px] leading-none text-slate-500">
            {milestones.map((m) => (
              <span key={m.date} className="flex items-center gap-1">
                <i className="inline-block h-[2px] w-2.5 rounded" style={{ background: m.color }} />
                {m.date.slice(0, 7)}
              </span>
            ))}
            <span className="flex items-center gap-1">
              <i className="inline-block h-[2px] w-2.5 rounded" style={{ background: "#c4b5fd" }} />
              当前
            </span>
            <span className="ml-auto text-slate-600">历史为月末曲线 · 财政部</span>
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
              {/* 历史月度曲线(底层) */}
              {histCurves.map((c) => (
                <polyline key={c.date} points={curve.line(c.ys)} fill="none"
                  stroke="#475569" strokeOpacity={0.35} strokeWidth={1} strokeLinejoin="round" />
              ))}
              {/* 里程碑月份(高亮,颜色见图例) */}
              {milestones.map((m) => (
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
            <div className="flex h-full items-center justify-center text-[11px] text-slate-600">
              {error ? <span className="text-rose-400/80">美债数据源连接失败,自动重试中…</span> : "收益率曲线加载中…"}
            </div>
          )}
        </div>

        {/* 各期限列表 */}
        <div className="mt-2 flex shrink-0 flex-wrap content-start gap-x-4 gap-y-1 border-t border-slate-700/30 pt-2">
          {rows.map((r) => (
            <span key={r.symbol} className="text-[10px]" style={{ fontVariantNumeric: "tabular-nums" }}>
              <span className="text-slate-500">{LABEL[r.symbol]} </span>
              <span className="text-slate-300">{r.yield.toFixed(3)}</span>
              <span className={clsChg(r.change)}> {r.change > 0 ? "+" : ""}{r.change.toFixed(3)}</span>
            </span>
          ))}
        </div>
      </div>
    </Panel>
  );
}

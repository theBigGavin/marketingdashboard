import { useEffect, useMemo, useRef, useState } from "react";
import type { BoardFlow } from "@/lib/api";

const TNUM = { fontVariantNumeric: "tabular-nums" } as const;

/** 流入红色系 / 流出绿色系(按排名渐变) */
const REDS = ["#fb7185", "#f43f5e", "#fca5a5", "#fb923c", "#fdba74", "#e11d48", "#fecdd3", "#fda4af", "#fcd34d", "#fbbf24"];
const GREENS = ["#34d399", "#10b981", "#6ee7b7", "#059669", "#a7f3d0", "#4ade80", "#22c55e", "#86efac", "#16a34a", "#15803d"];

const X_TICKS: [number, string][] = [
  [0, "09:30"],
  [59, "10:30"],
  [119, "11:30"],
  [120, "13:00"],
  [179, "14:00"],
  [239, "15:00"],
];

/** 板块实时资金流向图(分钟级累计主力净流入, 东财口径)
 *  progress: 0..1 播放进度(重放用), 1 = 全天 */
export function BoardFlowChart({ flows, progress = 1 }: { flows: BoardFlow[]; progress?: number }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 400, h: 300 });
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const r = entries[0].contentRect;
      if (r.width > 60 && r.height > 60) setSize({ w: r.width, h: r.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const chart = useMemo(() => {
    const series = flows.filter((f) => f.points.length > 2);
    if (!series.length) return null;
    const { w: W, h: H } = size;
    const labelW = 86;
    const n = Math.max(...series.map((s) => s.points.length));
    // 重放进度: 只绘制前 idx 个点
    const idx = Math.max(1, Math.min(n - 1, Math.floor(progress * (n - 1))));
    const allV = series.flatMap((s) => s.points.map((p) => p.v));
    let min = Math.min(...allV, 0);
    let max = Math.max(...allV, 0);
    const pad = (max - min) * 0.04 || 1;
    min -= pad;
    max += pad;
    const X = (i: number) => 34 + (i / Math.max(n - 1, 1)) * (W - 34 - labelW - 6);
    const Y = (v: number) => 8 + (1 - (v - min) / (max - min)) * (H - 26);
    // 颜色: 流入侧按名次取红, 流出侧取绿
    let ri = 0;
    let gi = 0;
    const lines = series.map((s) => {
      const color = s.netIn >= 0 ? REDS[ri++ % REDS.length] : GREENS[gi++ % GREENS.length];
      const seg = s.points.slice(0, idx + 1);
      const pts = seg.map((p, i) => `${X(i).toFixed(1)},${Y(p.v).toFixed(1)}`).join(" ");
      const last = seg[seg.length - 1];
      return { s, color, pts, lastY: Y(last.v), lastV: last.v, lastT: last.t };
    });
    // 端点标签去重叠: 按 y 排序后推开(最小间距 11px)
    const labels = [...lines]
      .sort((a, b) => a.lastY - b.lastY)
      .map((l) => ({ line: l, labelY: l.lastY }));
    let prevY = -Infinity;
    for (const l of labels) {
      l.labelY = Math.max(l.labelY, prevY + 11);
      prevY = l.labelY;
    }
    const overflow = labels.length ? labels[labels.length - 1].labelY - (H - 18) : 0;
    if (overflow > 0) for (const l of labels) l.labelY -= overflow;
    // Y 刻度: 4 档
    const ticks = [0.2, 0.4, 0.6, 0.8].map((f) => {
      const v = max - f * (max - min);
      return { v, y: Y(v) };
    });
    return { W, H, X, Y, min, max, lines, labels, ticks, labelW, idx, cursorT: series[0].points[idx].t };
  }, [flows, size, progress]);

  return (
    <div ref={boxRef} className="h-full min-h-0 w-full">
      {chart ? (
        <svg width={chart.W} height={chart.H} className="block">
          {/* 网格与零轴 */}
          {chart.ticks.map((t, i) => (
            <g key={i}>
              <line x1={34} y1={t.y} x2={chart.W - chart.labelW - 6} y2={t.y} stroke="#1e293b" strokeWidth={1} />
              <text x={4} y={t.y + 3} fontSize={9} fill="#64748b" style={TNUM}>{(t.v / 1e8).toFixed(0)}亿</text>
            </g>
          ))}
          <line x1={34} y1={chart.Y(0)} x2={chart.W - chart.labelW - 6} y2={chart.Y(0)} stroke="#334155" strokeWidth={1} />
          {/* 时间刻度 */}
          {X_TICKS.map(([i, t]) => (
            <text key={t} x={chart.X(i)} y={chart.H - 8} fontSize={8} fill="#475569" textAnchor="middle">{t}</text>
          ))}
          {/* 板块曲线 */}
          {chart.lines.map((l) => (
            <polyline key={l.s.code} points={l.pts} fill="none" stroke={l.color} strokeWidth={1.4} strokeLinejoin="round" />
          ))}
          {/* 端点标签 */}
          {chart.labels.map((l) => (
            <g key={l.line.s.code}>
              <line x1={chart.W - chart.labelW - 6} y1={l.line.lastY} x2={chart.W - chart.labelW} y2={l.labelY} stroke={l.line.color} strokeWidth={0.6} strokeOpacity={0.5} />
              <text x={chart.W - chart.labelW + 2} y={l.labelY + 3} fontSize={8.5} fill={l.line.color} style={TNUM}>
                {l.line.s.name} {l.line.lastV >= 0 ? "+" : ""}{(l.line.lastV / 1e8).toFixed(0)}
              </text>
            </g>
          ))}
        </svg>
      ) : (
        <div className="flex h-full items-center justify-center text-[11px] text-slate-600">板块资金流加载中…</div>
      )}
    </div>
  );
}

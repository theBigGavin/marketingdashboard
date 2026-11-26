import { useMemo, useState } from "react";
import type { BoardFlow } from "@/lib/api";
import { TNUM } from "@/lib/format";
import { useElementSize } from "@/hooks/useElementSize";
import { GRID, ZERO, AXIS, CROSSHAIR, FLAT } from "@/lib/colors";

/** 流入红色系 / 流出绿色系(按排名渐变) */
const REDS = ["#fb7185", "#f43f5e", "#fca5a5", "#fb923c", "#fdba74", "#e11d48", "#fecdd3", "#fda4af", "#fcd34d", "#fbbf24"];
const GREENS = ["#34d399", "#10b981", "#6ee7b7", "#059669", "#a7f3d0", "#4ade80", "#22c55e", "#86efac", "#16a34a", "#15803d"];

// 午休压缩点上下午刻度相邻, 用两端锚定防重叠; 首尾刻度防出界
const X_TICKS: [number, string, "start" | "middle" | "end"][] = [
  [0, "09:30", "middle"],
  [59, "10:30", "middle"],
  [119, "11:30", "end"],
  [120, "13:00", "start"],
  [179, "14:00", "middle"],
  [239, "15:00", "end"],
];

/** 端点标签模式预留的右侧标签宽度 */
const END_LABEL_W = 86;

/** 绘图区左边距(Y 轴"亿"刻度标签宽) */
const PLOT_LEFT = 34;
/** 绘图区右缘相对 labelW 区域的收进(grid/零轴/标线共用) */
const PLOT_INSET = 6;
/** Y 轴刻度文本横坐标(贴左缘) */
const AXIS_TEXT_X = 4;

/** 板块实时资金流向图(分钟级累计主力净流入, 东财口径)
 *  progress: 0..1 播放进度(重放用), 1 = 全天
 *  labelMode: "end" 端点标签+标线(默认) / "legend" 图下方图例 */
export function BoardFlowChart({ flows, progress = 1, labelMode = "end", selected, onSelect }: {
  flows: BoardFlow[];
  progress?: number;
  labelMode?: "end" | "legend";
  /** 受控选中板块 code(undefined = 图表自管理; 传入 null/值 = 外部(资金流向面板)为唯一真源) */
  selected?: string | null;
  onSelect?: (sel: { code: string; name: string } | null) => void;
}) {
  const { ref: boxRef, size } = useElementSize();
  // 点击选中的板块 code(null = 全部显示); 受控模式(selected 已提供)时以外部为准
  const [internalSel, setInternalSel] = useState<string | null>(null);
  const sel = selected !== undefined ? selected : internalSel;
  const toggle = (code: string, name: string) => {
    const next = sel === code ? null : code;
    if (selected !== undefined) {
      onSelect?.(next === null ? null : { code, name });
    } else {
      setInternalSel(next);
    }
  };
  // 图例最大高度: 用实测像素值而非百分比(百分比在 Panel body flex-1 不确定高度链中解析失效,
  // 导致图例不限制高度、内容溢出滚动条)
  const legendMaxH = labelMode === "legend" ? Math.max(Math.round((size?.h ?? 0) * 0.45), 48) : 0;

  const chart = useMemo(() => {
    const series = flows.filter((f) => f.points.length > 2);
    if (!series.length) return null;
    const { w: W, h: H } = size;
    // 图例模式: SVG flex-1 吃掉剩余空间(永不空白), 图例内容自适应高度(上限 45% 容器高)。
    // viewBox 高度用 60% 基准, preserveAspectRatio=none 拉伸填充, 图例多时轻微拉伸可接受
    const chartH = labelMode === "legend" ? Math.max(Math.round(H * 0.6), 80) : Math.max(H, 80);
    const labelW = labelMode === "end" ? END_LABEL_W : 0;
    const n = Math.max(...series.map((s) => s.points.length));
    // 重放进度: 只绘制前 idx 个点
    const idx = Math.max(1, Math.min(n - 1, Math.floor(progress * (n - 1))));
    // 纵坐标按当前已播放的数据动态缩放,播放结束时再切回全天范围
    const visiblePoints = series.flatMap((s) => (progress < 1 ? s.points.slice(0, idx + 1) : s.points));
    const visibleV = visiblePoints.map((p) => p.v);
    let min = Math.min(...visibleV, 0);
    let max = Math.max(...visibleV, 0);
    const pad = (max - min) * 0.04 || 1;
    min -= pad;
    max += pad;
    const X = (i: number) => PLOT_LEFT + (i / Math.max(n - 1, 1)) * (W - 40 - labelW);
    const Y = (v: number) => 8 + (1 - (v - min) / (max - min)) * (chartH - 26);
    // 颜色: 流入侧按名次取红, 流出侧取绿
    let ri = 0;
    let gi = 0;
    const lines = series.map((s) => {
      const color = s.netIn >= 0 ? REDS[ri++ % REDS.length] : GREENS[gi++ % GREENS.length];
      const seg = s.points.slice(0, idx + 1);
      const pts = seg.map((p, i) => `${X(i).toFixed(1)},${Y(p.v).toFixed(1)}`).join(" ");
      const last = seg[seg.length - 1];
      return { s, color, pts, lastY: Y(last.v), lastV: last.v };
    });
    // Y 刻度: 4 档
    const ticks = [0.2, 0.4, 0.6, 0.8].map((f) => {
      const v = max - f * (max - min);
      return { v, y: Y(v) };
    });
    // 端点标签(end 模式): 按 y 排序后在可视区内均匀分布, 间距不足自动压缩, 不被裁剪
    let labels: { line: (typeof lines)[number]; labelY: number }[] = [];
    if (labelMode === "end") {
      labels = [...lines].sort((a, b) => a.lastY - b.lastY).map((l) => ({ line: l, labelY: l.lastY }));
      const TOP = 10, BOTTOM = chartH - 18;
      const gap = labels.length > 1 ? Math.min(11, (BOTTOM - TOP) / (labels.length - 1)) : 11;
      let sy = Math.max(labels.length ? labels[0].labelY : TOP, TOP);
      sy = Math.min(sy, BOTTOM - gap * (labels.length - 1));
      sy = Math.max(sy, TOP);
      for (const l of labels) { l.labelY = sy; sy += gap; }
    }
    return { W, chartH, labelW, X, Y, lines, labels, ticks, idx, cursorT: (series.find((s) => s.points.length > idx)?.points[idx])?.t ?? "" };
  }, [flows, size, progress, labelMode]);

  return (
    <div ref={boxRef} className="flex h-full min-h-0 w-full flex-col">
      {chart ? (
        <>
          <svg width="100%" className="block min-h-0 w-full flex-1" viewBox={`0 0 ${chart.W} ${chart.chartH}`} preserveAspectRatio="none">
            {/* 网格与零轴 */}
            {chart.ticks.map((t, i) => (
              <g key={i}>
                <line x1={PLOT_LEFT} y1={t.y} x2={chart.W - chart.labelW - PLOT_INSET} y2={t.y} stroke={GRID} strokeWidth={1} />
                <text x={AXIS_TEXT_X} y={t.y + 3} fontSize={9} fill={CROSSHAIR} style={TNUM}>{(t.v / 1e8).toFixed(0)}亿</text>
              </g>
            ))}
            <line x1={PLOT_LEFT} y1={chart.Y(0)} x2={chart.W - chart.labelW - PLOT_INSET} y2={chart.Y(0)} stroke={ZERO} strokeWidth={1} />
            {/* 时间刻度 */}
            {X_TICKS.map(([i, t, anchor]) => (
              <text key={t} x={chart.X(i)} y={chart.chartH - 8} fontSize={8} fill={AXIS} textAnchor={anchor}>{t}</text>
            ))}
            {/* 板块曲线: 选中高亮, 未选中淡化; 透明加宽命中区承载点击 */}
            {chart.lines.map((l) => {
              const active = sel == null || sel === l.s.code;
              return (
                <g key={l.s.code}>
                  <polyline
                    points={l.pts}
                    fill="none"
                    stroke={l.color}
                    strokeWidth={active ? 1.4 : 0.7}
                    strokeOpacity={active ? 1 : 0.18}
                    strokeLinejoin="round"
                  />
                  <polyline
                    points={l.pts}
                    fill="none"
                    stroke="transparent"
                    strokeWidth={12}
                    strokeLinejoin="round"
                    style={{ cursor: "pointer" }}
                    onClick={(e) => { e.stopPropagation(); toggle(l.s.code, l.s.name); }}
                  />
                </g>
              );
            })}
            {/* 端点标签 + 标线(end 模式): 可点击选中, 未选中淡化 */}
            {labelMode === "end" &&
              chart.labels.map((l) => {
                const active = sel == null || sel === l.line.s.code;
                return (
                  <g key={l.line.s.code} opacity={active ? 1 : 0.2} style={{ cursor: "pointer" }} onClick={(e) => { e.stopPropagation(); toggle(l.line.s.code, l.line.s.name); }}>
                    <line x1={chart.W - chart.labelW - PLOT_INSET} y1={l.line.lastY} x2={chart.W - chart.labelW} y2={l.labelY} stroke={l.line.color} strokeWidth={active ? 0.8 : 0.5} strokeOpacity={0.5} />
                    <text x={chart.W - chart.labelW + 2} y={l.labelY + 3} fontSize={active ? 9 : 8.5} fill={l.line.color} style={TNUM} fontWeight={active ? 600 : 400}>
                      {l.line.s.name} {l.line.lastV >= 0 ? "+" : ""}{(l.line.lastV / 1e8).toFixed(0)}
                    </text>
                  </g>
                );
              })}
            {/* 时间游标 */}
            {progress < 1 && (
              <g>
                <line
                  x1={chart.X(chart.idx)}
                  y1={8}
                  x2={chart.X(chart.idx)}
                  y2={chart.chartH - 18}
                  stroke={FLAT}
                  strokeWidth={1}
                  strokeDasharray="3 3"
                />
                <text x={chart.X(chart.idx)} y={8} fontSize={8} fill="#e2e8f0" textAnchor="middle" style={TNUM}>
                  {chart.cursorT}
                </text>
              </g>
            )}
          </svg>
          {/* 图例(legend 模式): 色块 + 板块名 + 净额; 高度自适应内容, 上限 45% 容器高(超出滚动) */}
          {labelMode === "legend" && (
            <div
              className="mt-1 flex shrink-0 flex-wrap content-start gap-x-3 gap-y-1 overflow-y-auto px-1"
              style={{ maxHeight: legendMaxH }}
            >
              {chart.lines.map((l) => (
                <span
                  key={l.s.code}
                  className="flex cursor-pointer items-center gap-1 text-caption leading-none"
                  style={{ opacity: sel == null || sel === l.s.code ? 1 : 0.3 }}
                  onClick={() => toggle(l.s.code, l.s.name)}
                >
                  <span className="h-[5px] w-[10px] shrink-0 rounded-sm" style={{ background: l.color }} />
                  <span className="shrink-0 text-db-tertiary">{l.s.name}</span>
                  <span className="font-semibold" style={{ color: l.color, fontVariantNumeric: "tabular-nums" }}>
                    {l.lastV >= 0 ? "+" : ""}{(l.lastV / 1e8).toFixed(0)}
                  </span>
                </span>
              ))}
            </div>
          )}
        </>
      ) : (
        <div className="flex h-full items-center justify-center text-body text-db-faint">板块资金流加载中…</div>
      )}
    </div>
  );
}

import { useMemo, useState } from "react";
import { Building2 } from "lucide-react";
import { Panel, type PanelZoomProps } from "../Panel";
import { useFinBoard } from "./useFinData";
// (data via useFinBoard)
import { useFin } from "./FinContext";
import { PeriodTabs } from "./PeriodTabs";
import { TNUM, fmtYi } from "./utils";
import { useElementSize } from "@/hooks/useElementSize";
import { AsyncContent, TabBar } from "../SharedUI";
import { GRID, AXIS, FLAT, SERIES, UP, DOWN } from "@/lib/colors";

const NAME_W = 64; // 行业名列宽
const LABEL_W = 92; // 条右端双值预留
const AXIS_H = 16; // 底部金额刻度

interface TMItem {
  name: string;
  v: number;
  yoy: number;
}
interface TMRect extends TMItem {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** squarified 树状图布局: 面积∝v, 长宽比尽量接近1 */
function layoutTreemap(items: TMItem[], X: number, Y: number, W: number, H: number): TMRect[] {
  const total = items.reduce((s, d) => s + d.v, 0);
  if (total <= 0 || W <= 0 || H <= 0) return [];
  const scale = (W * H) / total;
  const out: TMRect[] = [];
  let x = X;
  let y = Y;
  let w = W;
  let h = H;
  let row: TMItem[] = [];
  let i = 0;
  const worst = (r: TMItem[], side: number) => {
    const s = r.reduce((a, d) => a + d.v * scale, 0);
    let mx = 0;
    for (const d of r) {
      const a = d.v * scale;
      mx = Math.max(mx, Math.max((side * side * a) / (s * s), (s * s) / (side * side * a)));
    }
    return mx;
  };
  const layoutRow = (r: TMItem[]) => {
    const s = r.reduce((a, d) => a + d.v * scale, 0);
    if (w >= h) {
      const rw = s / h;
      let cy = y;
      for (const d of r) {
        const dh = (d.v * scale) / rw;
        out.push({ ...d, x, y: cy, w: rw, h: dh });
        cy += dh;
      }
      x += rw;
      w -= rw;
    } else {
      const rh = s / w;
      let cx = x;
      for (const d of r) {
        const dw = (d.v * scale) / rh;
        out.push({ ...d, x: cx, y, w: dw, h: rh });
        cx += dw;
      }
      y += rh;
      h -= rh;
    }
  };
  while (i < items.length) {
    const side = Math.min(w, h);
    const next = items[i];
    if (row.length === 0 || worst([...row, next], side) <= worst(row, side)) {
      row.push(next);
      i++;
    } else {
      layoutRow(row);
      row = [];
    }
  }
  if (row.length) layoutRow(row);
  return out;
}

/** 行业盈利榜 TOP15: 条形矩阵(默认, 对数压缩, 条色=同比) / 树状图(线框化, 面积∝净利) 可切换 */
export function FinIndustryPanel({ className = "", ...zoomProps }: { className?: string } & PanelZoomProps) {
  const { period } = useFin();
  const { data, error, loading, retry } = useFinBoard(period);
  const [hover, setHover] = useState(-1);
  const [mode, setMode] = useState<"bar" | "tree">("tree");

  const { ref: boxRef, size } = useElementSize();

  const list = useMemo(() => (data?.industries ?? []).filter((d) => d.netProfit > 0).slice(0, 15), [data]);

  const chart = useMemo(() => {
    if (!list.length || mode !== "bar") return null;
    const { w: W, h: H } = size;
    const rowH = Math.min(16, (H - AXIS_H) / list.length);
    const barW = W - NAME_W - LABEL_W - 12;
    // 对数压缩防头部挤出
    const maxLog = Math.log10(Math.max(...list.map((d) => d.netProfit), 1));
    const X = (v: number) => NAME_W + (Math.log10(Math.max(v, 1)) / maxLog) * barW;
    // 底部 3 档金额刻度(自动取整百亿)
    const maxV = Math.max(...list.map((d) => d.netProfit));
    const step = Math.max(Math.ceil(maxV / 3 / 1e10) * 1e10, 1e10); // 1e10 = 百亿
    const ticks = [step, step * 2, step * 3].filter((v) => v <= maxV * 1.05);
    return { list, W, H, rowH, X, ticks };
  }, [list, mode, size]);

  const tree = useMemo(() => {
    if (!list.length || mode !== "tree") return null;
    const { w: W, h: H } = size;
    const items = list.map((d) => ({ name: d.name, v: d.netProfit, yoy: d.yoy }));
    return { W, H, rects: layoutTreemap(items, 1, 1, W - 2, H - 2) };
  }, [list, mode, size]);

  const empty = !list.length;

  return (
    <Panel
      className={className}
      {...zoomProps}
      title="行业盈利榜"
      icon={<Building2 size={14} />}
      accent={SERIES[3]}
      right={
        !empty && (
          <div className="flex items-center gap-2 text-meta">
            <PeriodTabs />
            <span className="h-3 w-px bg-db-border" />
            <TabBar
              tabs={[{ key: "bar" as const, label: "条形" }, { key: "tree" as const, label: "树状" }]}
              active={mode}
              onChange={setMode}
              accent="cyan"
              size="xs"
            />
            {data?.disclosed != null && (
              <span className="text-caption text-db-muted" style={TNUM}>
                已披露{data.disclosed}家
              </span>
            )}
          </div>
        )
      }
    >
      <AsyncContent loading={loading} error={error} empty={empty} emptyMessage="当前非财报密集披露期" onRetry={retry} skeletonRows={12}>
        <div ref={boxRef} className="h-full min-h-0">
          {tree && (
            <svg width={tree.W} height={tree.H} className="block">
              {tree.rects.map((r, i) => {
                // 线框化: 色块 fill 12% + 1px 同色 40% 描边, 消除实色平涂
                const color = r.yoy >= 0 ? UP : DOWN;
                // 文字自适应: 按格宽/格高算可容纳字数, 窄格缩字截断不整格留白;
                // 高窄格(横排放不下)文字竖排
                const charW = 5.9; // 9.5px 中文字符平均宽
                const trunc = (s: string, n: number) => (s.length <= n ? s : n >= 3 ? `${s.slice(0, n - 1)}…` : s.slice(0, n));
                const vertical = r.w < 26 && r.h >= 44 && r.w >= 12;
                const showName = vertical || (r.w >= 26 && r.h >= 15);
                const showVal = !vertical && r.w >= 56 && r.h >= 38;
                return (
                  <g key={r.name} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(-1)}>
                    <rect
                      x={r.x}
                      y={r.y}
                      width={Math.max(r.w - 1, 0)}
                      height={Math.max(r.h - 1, 0)}
                      rx={2}
                      fill={color}
                      fillOpacity={0.12}
                      stroke={color}
                      strokeOpacity={0.4}
                      strokeWidth={1}
                    />
                    {hover === i && (
                      <rect x={r.x} y={r.y} width={Math.max(r.w - 1, 0)} height={Math.max(r.h - 1, 0)} rx={2} fill="#ffffff" opacity={0.08} />
                    )}
                    {showName && !vertical && (
                      <text x={r.x + 4} y={r.y + 12} fontSize={9.5} fill="#e2e8f0" fontWeight={600}>
                        {trunc(r.name, Math.max(1, Math.floor((r.w - 8) / charW)))}
                      </text>
                    )}
                    {vertical && (
                      <text
                        x={r.x + r.w / 2}
                        y={r.y + r.h / 2}
                        transform={`rotate(90 ${r.x + r.w / 2} ${r.y + r.h / 2})`}
                        textAnchor="middle"
                        fontSize={8.5}
                        fill="#e2e8f0"
                        fontWeight={600}
                      >
                        {trunc(r.name, Math.max(1, Math.floor((r.h - 8) / charW)))}
                      </text>
                    )}
                    {showVal && (
                      <text x={r.x + 4} y={r.y + 23} fontSize={8.5} fill={FLAT} style={TNUM}>
                        {fmtYi(r.v)}
                        <tspan fill={color} dx={3}>
                          {r.yoy > 0 ? "+" : ""}
                          {r.yoy.toFixed(1)}%
                        </tspan>
                      </text>
                    )}
                  </g>
                );
              })}
            </svg>
          )}
          {chart && (
            <svg width={chart.W} height={chart.H} className="block">
              {/* 底部金额刻度 + 网格线 */}
              {chart.ticks.map((v) => (
                <g key={v}>
                  <line x1={chart.X(v)} y1={4} x2={chart.X(v)} y2={chart.H - AXIS_H} stroke={GRID} strokeWidth={1} />
                  <text x={chart.X(v)} y={chart.H - 5} fontSize={8} fill={AXIS} textAnchor="middle" style={TNUM}>
                    {(v / 1e8).toLocaleString("zh-CN", { maximumFractionDigits: 0 })}亿
                  </text>
                </g>
              ))}
              {chart.list.map((d, i) => {
                const y = i * chart.rowH;
                const up = d.yoy >= 0;
                const color = up ? UP : DOWN;
                const bw = Math.max(chart.X(d.netProfit) - NAME_W, 2);
                const bh = Math.min(9, chart.rowH - 5);
                return (
                  <g key={d.name} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(-1)}>
                    {hover === i && <rect x={0} y={y} width={chart.W} height={chart.rowH} fill={GRID} opacity={0.5} />}
                    <text x={4} y={y + chart.rowH / 2 + 3} fontSize={9} fill={FLAT}>
                      {d.name.length > 6 ? d.name.slice(0, 6) : d.name}
                    </text>
                    {/* 条: fill 25% + 1px 同色 60% 描边; 负同比行 40% 透明 + 虚线描边 */}
                    <rect
                      x={NAME_W}
                      y={y + (chart.rowH - bh) / 2}
                      width={bw}
                      height={bh}
                      rx={1.5}
                      fill={color}
                      fillOpacity={0.25}
                      stroke={color}
                      strokeWidth={1}
                      strokeOpacity={0.6}
                      strokeDasharray={up ? undefined : "2 2"}
                      opacity={up ? 1 : 0.4}
                    />
                    <text x={NAME_W + bw + 4} y={y + chart.rowH / 2 + 3} fontSize={8.5} style={TNUM}>
                      <tspan fill="#cbd5e1">{fmtYi(d.netProfit)} </tspan>
                      <tspan fill={color}>
                        {d.yoy > 0 ? "+" : ""}
                        {d.yoy.toFixed(1)}%
                      </tspan>
                    </text>
                  </g>
                );
              })}
            </svg>
          )}
        </div>
      </AsyncContent>
    </Panel>
  );
}

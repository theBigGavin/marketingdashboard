import { useMemo, useState } from "react";
import { GitCompare } from "lucide-react";
import { Panel, type PanelZoomProps } from "../Panel";
import { useFin } from "./FinContext";
import { useFinBoard, useFinMain } from "./useFinData";
import { TNUM, fmtYi } from "./utils";
import { clsChg, fmtPct } from "@/lib/format";
import { useElementSize } from "@/hooks/useElementSize";
import { AsyncContent, TabBar } from "../SharedUI";
import { computePeerComparison, prevPeriodFn, type PeerMetric } from "./peer-math";

type Mode = "table" | "radar";
const MODE_TABS: { key: Mode; label: string }[] = [
  { key: "radar", label: "雷达" },
  { key: "table", label: "表格" },
];

/** 数值比较条: 公司值 vs 行业均值, 相对宽度指示 */
function CmpBar({ val, avg }: { val: number; avg: number }) {
  const max = Math.max(val, avg, 1);
  const vw = Math.max((val / max) * 100, 2);
  const aw = Math.max((avg / max) * 100, 2);
  const vCls = val >= avg ? "bg-rose-400/70" : "bg-emerald-400/70";
  return (
    <div className="flex h-[3px] w-full gap-[1px]">
      <div className={vCls} style={{ width: `${vw}%`, transition: "width 0.3s" }} />
      <div className="h-full flex-1 rounded-r bg-slate-600/40" style={{ width: `${aw}%` }}>
        <div className="h-full w-full rounded-r bg-amber-400/20" />
      </div>
    </div>
  );
}

interface MetricText {
  companyStr: string;
  peerStr: string;
  rankStr: string;
  colorCls?: string;
}

/** 渲染层格式化: 裸数值 → 展示字符串(净利/增速/ROE/EPS 各自格式, 与重构前输出一致) */
function formatMetric(m: PeerMetric, count: number): MetricText {
  const rankStr = m.rank != null ? `${m.rank}/${count}` : "—";
  switch (m.key) {
    case "np":
      return { companyStr: fmtYi(m.companyVal), peerStr: m.peerAvg == null ? "—" : fmtYi(m.peerAvg), rankStr };
    case "py":
    case "ry":
      return { companyStr: fmtPct(m.companyVal, 1), peerStr: m.peerAvg == null ? "—" : fmtPct(m.peerAvg, 1), rankStr, colorCls: clsChg(m.companyVal) };
    case "roe":
      return { companyStr: `${m.companyVal.toFixed(1)}%`, peerStr: m.peerAvg == null ? "—" : `${m.peerAvg.toFixed(1)}%`, rankStr };
    case "eps":
      return { companyStr: m.companyVal.toFixed(2), peerStr: m.peerAvg == null ? "—" : m.peerAvg.toFixed(2), rankStr };
  }
}

/** 同行对比: 表格(公司指标 vs 行业均值/排名) + 雷达图 */
export function FinPeerPanel({ className = "", ...zoomProps }: { className?: string } & PanelZoomProps) {
  const [mode, setMode] = useState<Mode>("radar");
  const { company, period } = useFin();

  const { data: board, error: boardErr, loading: boardLoading, retry: retryBoard } = useFinBoard(period);
  // 降级期: 当前期 peer 太少时用上一期全市场数据做同业对比
  const prevPeriod = prevPeriodFn(period);
  const { data: prevBoard, loading: prevLoading } = useFinBoard(prevPeriod);
  const { data: finData, error: finErr, loading: finLoading, retry: retryMain } = useFinMain(company.code);

  const loading = boardLoading || finLoading || prevLoading;
  const error = boardErr || finErr;
  const retry = () => { retryBoard(); retryMain(); };

  const peerData = useMemo(
    () => computePeerComparison(board, prevBoard, finData, company.code, company.name),
    [board, prevBoard, finData, company.code, company.name]
  );

  // 雷达图数据: 归一化 0-1 值来自纯函数, 顶点标注字符串在渲染层拼装
  const radarData = useMemo(() => {
    if (!peerData?.radar.length) return null;
    return peerData.radar.map((axis, i) => {
      const f = formatMetric(peerData.metrics[i], peerData.count);
      return { label: axis.label, company: axis.company, peer: axis.peer, companyStr: f.companyStr, peerStr: f.peerStr };
    });
  }, [peerData]);

  const hasPeer = peerData && peerData.industry;

  return (
    <Panel
      className={className}
      {...zoomProps}
      title="同业对比"
      icon={<GitCompare size={14} />}
      accent="#a78bfa"
      right={
        <TabBar tabs={MODE_TABS} active={mode} onChange={setMode} accent="violet" />
      }
    >
      {!company.code ? (
        <div className="flex h-full items-center justify-center text-body text-db-faint">
          ← 从榜单选入公司
        </div>
      ) : (
        <AsyncContent loading={loading} error={error} empty={!hasPeer || !peerData || !finData} emptyMessage="未找到该公司行业信息" onRetry={retry}>
          {peerData && finData && (mode === "table" ? (
        <div className="flex h-full min-h-0 flex-col">
          {/* 行业头部 */}
          <div className="flex shrink-0 items-center gap-2 border-b border-db-subtle/60 px-2 py-1">
            <span className="text-body font-semibold text-violet-300">{peerData.industry}</span>
            <span className="text-caption text-db-muted">
              共 {peerData.count} 家
              {peerData.inBoard && !peerData.usePrev && peerData.count > 0 ? " · 排名第" : ""}
            </span>
            {!peerData.inBoard && (
              <span className="text-micro text-amber-400/70">(未入榜,仅对比均值)</span>
            )}
            {peerData.usePrev && (
              <span className="text-micro text-amber-400/70">(当期样本不足,引用上期全市场数据)</span>
            )}
          </div>
          {/* 表头 */}
          <div className="flex shrink-0 items-center gap-2 border-b border-db-subtle/60 px-2 py-0.5 text-caption text-db-muted">
            <span className="w-[48px] shrink-0">指标</span>
            <span className="min-w-0 flex-1 text-right">{finData.name.length > 6 ? finData.name.slice(0, 6) : finData.name}</span>
            <span className="w-[52px] shrink-0 text-right">行业均值</span>
            <span className="w-[36px] shrink-0 text-right">排名</span>
          </div>
          {/* 行 */}
          <div className="min-h-0 flex-1 overflow-y-auto py-0.5">
            {peerData.metrics.map((m, i) => {
              const f = formatMetric(m, peerData.count);
              return (
                <div key={m.label} className="flex flex-col border-b border-db-subtle/60 px-2 py-1 hover:bg-db-subtle/40">
                  <div className="flex items-center gap-2">
                    <span className="w-[48px] shrink-0 text-meta text-db-tertiary">{m.label}</span>
                    <span className={`min-w-0 flex-1 text-right text-body font-semibold ${f.colorCls ?? "text-db-primary"}`} style={TNUM}>
                      {f.companyStr}
                    </span>
                    <span className="w-[52px] shrink-0 text-right text-meta text-db-muted" style={TNUM}>
                      {f.peerStr}
                    </span>
                    <span className="w-[36px] shrink-0 text-right text-caption text-db-tertiary" style={TNUM}>
                      {f.rankStr}
                    </span>
                  </div>
                  {/* 比较底条 */}
                  {i < peerData.metrics.length - 1 && (
                    <div className="mt-0.5 px-0">
                      <CmpBar val={Math.abs(m.barVal)} avg={Math.abs(m.barAvg)} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ) : radarData ? (
        <RadarChart axes={radarData} companyName={finData!.name} />
      ) : null)}
        </AsyncContent>
      )}
    </Panel>
  );
}

/** 雷达图: SVG 多边形 + 轴标签, 自适应面板大小 */
function RadarChart({ axes, companyName }: { axes: { label: string; company: number; peer: number; companyStr: string; peerStr: string }[]; companyName: string }) {
  const n = axes.length;
  const { ref: boxRef, size } = useElementSize();

  if (n < 3) return <div className="flex h-full items-center justify-center text-body text-db-faint">需要至少 3 项指标</div>;

  const { w: W, h: H } = size;
  const padding = 28;
  const legendH = 20;
  const plotH = H - legendH;
  const CX = W / 2;
  const CY = (plotH - padding) / 2 + padding * 0.6;
  const R = Math.min(CX - padding, CY - padding, (plotH - padding * 2) / 2) * 0.85; // 略缩 85%, 给顶点数值/轴标签留空间
  const levels = 5;
  const fontSize = Math.max(9, Math.min(12, R / 8));

  const angle = (i: number) => (Math.PI * 2 * i) / n - Math.PI / 2;
  const pt = (i: number, r: number) => ({
    x: CX + r * Math.cos(angle(i)),
    y: CY + r * Math.sin(angle(i)),
  });

  const grids = Array.from({ length: levels }, (_, li) => {
    const r = ((li + 1) / levels) * R;
    return axes.map((_, i) => pt(i, r));
  });

  const companyPts = axes.map((a, i) => pt(i, a.company * R));
  const peerPts = axes.map((a, i) => pt(i, a.peer * R));
  const labelR = R + Math.max(32, fontSize * 2.6); // 文字与雷达图外环保持距离

  return (
    <div ref={boxRef} className="flex h-full min-h-0 flex-col items-center justify-center">
      <svg width={W} height={plotH} className="block">
        {grids.map((ring, li) => (
          <polygon
            key={li}
            points={ring.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ")}
            fill="none"
            stroke="#1e293b"
            strokeWidth={1}
          />
        ))}
        {axes.map((_, i) => {
          const outer = pt(i, R);
          return <line key={i} x1={CX} y1={CY} x2={outer.x} y2={outer.y} stroke="#1e293b" strokeWidth={1} />;
        })}
        <polygon
          points={peerPts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ")}
          fill="#fbbf24"
          fillOpacity={0.08}
          stroke="#fbbf24"
          strokeWidth={1}
          strokeDasharray="3 2"
        />
        <polygon
          points={companyPts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ")}
          fill="#a78bfa"
          fillOpacity={0.15}
          stroke="#a78bfa"
          strokeWidth={1.5}
        />
        {/* 轴端点: 文字描述 + 下方数值(公司紫/均值琥珀), 数值不占用雷达图内部 */}
        {axes.map((a, i) => {
          const outer = pt(i, labelR);
          const nameY = outer.y + fontSize * 0.35;
          return (
            <g key={i}>
              <text x={outer.x} y={nameY} fontSize={fontSize} fill="#94a3b8" textAnchor="middle" style={TNUM}>
                {a.label}
              </text>
              <text x={outer.x} y={nameY + fontSize * 1.05} fontSize={fontSize * 0.88} fill="#a78bfa" textAnchor="middle" style={TNUM}>
                {a.companyStr}
              </text>
              {a.peerStr !== "—" && (
                <text x={outer.x} y={nameY + fontSize * 2.1} fontSize={fontSize * 0.88} fill="#fbbf24" textAnchor="middle" style={TNUM}>
                  {a.peerStr}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <div className="flex shrink-0 items-center gap-4 text-meta" style={{ height: legendH }}>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-3 rounded-sm bg-violet-400/40" />
          <span className="text-db-tertiary">
            {companyName.length > 6 ? companyName.slice(0, 6) : companyName}
          </span>
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-3 rounded-sm border border-amber-400/50 bg-amber-400/10" />
          <span className="text-db-muted">行业均值</span>
        </span>
      </div>
    </div>
  );
}

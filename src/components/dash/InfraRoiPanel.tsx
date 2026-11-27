import { memo, useMemo, useRef, useState } from "react";
import { Activity } from "lucide-react";
import { Panel, type PanelZoomProps } from "./Panel";
import { api } from "@/lib/api";
import { useRetryPolling } from "@/hooks/useRetryPolling";
import { POLL } from "@/lib/intervals";
import { seriesPath } from "./infra-chart-math";

const fmtM = (v: number) => (v >= 1e3 ? `${(v / 1e3).toFixed(1)}k` : v >= 100 ? `${Math.round(v)}` : v >= 1 ? `${v.toFixed(1)}` : v.toFixed(3));

/** 单图多轴剪刀差: 左轴(log) 成本vs售价 + 右轴 ROI + CapEx/电网(常显) */
export const InfraRoiPanel = memo(function InfraRoiPanel({ className, panelId, isZoomed, onToggleZoom }: PanelZoomProps & { className?: string }) {
  const { data, error, loading, retry } = useRetryPolling(() => api.aiInfra(), POLL.AA_MODELS);
  const svgRef = useRef<SVGSVGElement>(null);
  const [size, setSize] = useState({ w: 400, h: 240 });
  const [hover, setHover] = useState<number | null>(null);

  // ResizeObserver(复用 OpenRouterPanel 模式)
  const ro = useRef<ResizeObserver | null>(null);
  const observe = (el: HTMLDivElement) => {
    if (!el) return;
    if (ro.current) ro.current.disconnect();
    ro.current = new ResizeObserver((entries) => {
      const r = entries[0].contentRect;
      if (r.width > 60 && r.height > 60) setSize({ w: r.width, h: r.height });
    });
    ro.current.observe(el);
  };

  const chart = useMemo(() => {
    if (!data?.series?.length || size.w < 120 || size.h < 60) return null;
    const pts = data.series;
    const n = pts.length;
    // 左轴(log): 成本+售价 合并域
    const leftVals = pts.flatMap((p) => [p.costPerM, p.pricePerM]).filter((v): v is number => v != null && Number.isFinite(v) && v > 0);
    const leftLo = Math.min(...leftVals) * 0.5, leftHi = Math.max(...leftVals) * 1.2;
    // 右轴: ROI 域(-100..+10)
    const roiVals = pts.map((p) => p.roiPct);
    // 右轴封顶 +100%(>100% 的 ROI 图上封顶显示, tooltip 给真实值 — 避免 288% 压扁其他线)
    const rightLo = Math.min(-90, Math.min(...roiVals) * 1.1), rightHi = Math.max(10, Math.min(100, Math.max(...roiVals) * 1.1));

    const PL = 40, PR = 44, PT = 8, PB = 22;
    const iw = size.w - PL - PR, ih = size.h - PT - PB;
    const X = (i: number) => PL + (i / Math.max(n - 1, 1)) * iw;
    const lY = (v: number) => PT + ih - ((Math.log(Math.max(v, leftLo)) - Math.log(leftLo)) / (Math.log(leftHi) - Math.log(leftLo))) * ih;
    const rY = (v: number) => { const raw = PT + ih - ((v - rightLo) / (rightHi - rightLo)) * ih; return Math.max(PT - 1, Math.min(PT + ih + 1, raw)); };

    // log 左轴刻度
    const lTicks: number[] = [];
    for (let m = 0.001; m <= leftHi * 1.1; m *= 10) { for (const s of [1, 2, 5]) { const v = m * s; if (v >= leftLo && v <= leftHi) lTicks.push(v); } }
    // 右轴刻度
    const rTicks: number[] = [];
    for (let i = 0; i <= 4; i++) rTicks.push(+(rightLo + ((rightHi - rightLo) / 4) * i).toFixed(1));

    const costPath = seriesPath(pts, "costPerM", X, lY);
    const pricePath = seriesPath(pts, "pricePerM", X, lY);
    const roiPath = seriesPath(pts, "roiPct", X, rY);
    // capex/grid 量纲远超 ROI 轴域, 各自独立 min-max 归一化映射(形状保留, 数值见 tooltip)
    const capVals = pts.map((p) => p.capexB);
    const capLo = Math.min(...capVals) * 0.9, capHi = Math.max(...capVals) * 1.05;
    const capY = (v: number) => PT + ih - ((v - capLo) / (capHi - capLo)) * ih;
    const gridVals = pts.map((p) => p.grid);
    const gridLo = Math.min(...gridVals) * 0.9, gridHi = Math.max(...gridVals) * 1.05;
    const gridY = (v: number) => PT + ih - ((v - gridLo) / (gridHi - gridLo)) * ih;
    const capexPath = seriesPath(pts, "capexB", X, capY);
    const gridPath = seriesPath(pts, "grid", X, gridY);

    const xLabels: { label: string; x: number }[] = [];
    for (let i = 0; i < n; i += Math.max(1, Math.floor(n / 8))) xLabels.push({ label: String(pts[i].year), x: X(i) });

    return { pts, PL, PR, PT, PB, X, lY, rY, lTicks, rTicks, costPath, pricePath, roiPath, capexPath, gridPath, xLabels, leftLo, leftHi, rightLo, rightHi };
  }, [data, size]);

  if (loading) return (
    <Panel title="AI 基础设施资本出清与复合 ROI" icon={<Activity size={14} />} accent="#fbbf24" className={className} panelId={panelId} isZoomed={isZoomed} onToggleZoom={onToggleZoom}>
      <div className="flex h-full items-center justify-center text-body text-db-faint">加载中…</div>
    </Panel>
  );
  if (error) return (
    <Panel title="AI 基础设施资本出清与复合 ROI" icon={<Activity size={14} />} accent="#fbbf24" className={className} panelId={panelId} isZoomed={isZoomed} onToggleZoom={onToggleZoom}>
      <div className="flex h-full flex-col items-center justify-center gap-2 text-body text-red-400">
        <span>数据异常: {error}</span>
        <button onClick={retry} className="rounded border border-slate-600 px-2 py-0.5 text-db-secondary hover:bg-db-border/50">重试</button>
      </div>
    </Panel>
  );

  const last = chart ? chart.pts[chart.pts.length - 1] : null;

  return (
    <Panel
      title="AI 基础设施资本出清与复合 ROI"
      icon={<Activity size={14} />}
      accent="#fbbf24"
      className={className}
      panelId={panelId}
      isZoomed={isZoomed}
      onToggleZoom={onToggleZoom}
    >
      <div className="flex h-full flex-col p-2 pt-1">
        {/* 图例 + 剪刀差状态 */}
        <div className="flex shrink-0 flex-wrap items-center gap-x-2.5 gap-y-0.5 pb-1 text-caption">
          <span className="flex items-center gap-1"><span className="inline-block h-[3px] w-3.5 rounded bg-infra-price" />售价 <span className="text-db-faint">($/M)</span></span>
          <span className="flex items-center gap-1"><span className="inline-block h-[3px] w-3.5 rounded bg-infra-cost" />生产成本 <span className="text-db-faint">($/M)</span></span>
          <span className="flex items-center gap-1"><span className="inline-block h-[3px] w-3.5 rounded bg-infra-roi" />AI专项ROI <span className="text-db-faint">(右轴%)</span></span>
          <span className="flex items-center gap-1"><span className="inline-block h-[3px] w-3.5 rounded bg-infra-capex" />CapEx <span className="text-db-faint">($B, 归一)</span></span>
          <span className="flex items-center gap-1"><span className="inline-block h-[3px] w-3.5 rounded bg-infra-grid" />电网 <span className="text-db-faint">(指数, 归一)</span></span>
          <span className="ml-auto text-db-faint">历史 2022-2026 · 预测 2027-2035</span>
        </div>
        {/* 主图 */}
        <div ref={observe} className="relative min-h-0 flex-1">
          {chart && (
            <svg
              ref={svgRef}
              width={size.w} height={size.h}
              className="block"
              style={{ overflow: "visible" }}
              onMouseLeave={() => setHover(null)}
              onMouseMove={(e) => {
                const rect = svgRef.current?.getBoundingClientRect();
                if (!rect) return;
                // CSS zoom 浮层(TV放大): 坐标需按 zoom 逆变换回逻辑坐标
                const z = parseFloat(getComputedStyle(e.currentTarget).getPropertyValue("--tv-zoom") || "1") || 1;
                const n = chart.pts.length;
                const i = Math.round((((e.clientX - rect.left) / z - chart.PL) / (size.w - chart.PL - chart.PR)) * (n - 1));
                setHover(i >= 0 && i < n ? i : null);
              }}
            >
              {/* 网格 */}
              {chart.lTicks.map((t) => <line key={`l${t}`} x1={chart.PL} y1={chart.lY(t)} x2={size.w - chart.PR} y2={chart.lY(t)} stroke="#1e293b" strokeWidth={0.5} />)}
              {chart.rTicks.map((t) => <line key={`r${t}`} x1={chart.PL} y1={chart.rY(t)} x2={size.w - chart.PR} y2={chart.rY(t)} stroke="rgba(148,163,184,0.08)" strokeWidth={0.5} strokeDasharray="2 3" />)}
              {/* 预测区分隔线: 2026(实际)与2027(预测)之间 — X(4.5) */}
              <line x1={chart.X(4.5)} y1={chart.PT} x2={chart.X(4.5)} y2={size.h - chart.PB} stroke="rgba(251,191,36,0.35)" strokeWidth={0.8} strokeDasharray="4 3" />
              <text x={chart.X(5)} y={chart.PT + 7} fill="#fbbf24" fontSize={8} fontFamily="monospace" opacity={0.7}>预测→</text>
              {/* 十字准线 */}
              {hover != null && <line x1={chart.X(hover)} y1={chart.PT} x2={chart.X(hover)} y2={size.h - chart.PB} stroke="rgba(148,163,184,0.5)" strokeWidth={0.8} />}
              {/* 预测虚线 */}
              <path d={chart.costPath.forecast} fill="none" stroke="#fb7185" strokeWidth={1.4} strokeDasharray="4 3" opacity={0.8} />
              <path d={chart.pricePath.forecast} fill="none" stroke="#38bdf8" strokeWidth={1.4} strokeDasharray="4 3" opacity={0.8} />
              <path d={chart.roiPath.forecast} fill="none" stroke="#a78bfa" strokeWidth={1.2} strokeDasharray="4 3" opacity={0.8} />
              {chart.capexPath && <path d={chart.capexPath.forecast} fill="none" stroke="#fbbf24" strokeWidth={1.1} strokeDasharray="4 3" opacity={0.8} />}
              {chart.gridPath && <path d={chart.gridPath.forecast} fill="none" stroke="#34d399" strokeWidth={1.1} strokeDasharray="4 3" opacity={0.8} />}
              {/* 历史实线 */}
              <path d={chart.costPath.actual} fill="none" stroke="#fb7185" strokeWidth={1.6} />
              <path d={chart.pricePath.actual} fill="none" stroke="#38bdf8" strokeWidth={1.6} />
              <path d={chart.roiPath.actual} fill="none" stroke="#a78bfa" strokeWidth={1.4} />
              {chart.capexPath && <path d={chart.capexPath.actual} fill="none" stroke="#fbbf24" strokeWidth={1.3} />}
              {chart.gridPath && <path d={chart.gridPath.actual} fill="none" stroke="#34d399" strokeWidth={1.3} />}
              {/* 历史→预测连接段(填补拆段断口) */}
              <path d={chart.costPath.bridge} fill="none" stroke="#fb7185" strokeWidth={1.2} strokeDasharray="2 2" />
              <path d={chart.pricePath.bridge} fill="none" stroke="#38bdf8" strokeWidth={1.2} strokeDasharray="2 2" />
              <path d={chart.roiPath.bridge} fill="none" stroke="#a78bfa" strokeWidth={1.1} strokeDasharray="2 2" />
              {chart.capexPath && <path d={chart.capexPath.bridge} fill="none" stroke="#fbbf24" strokeWidth={1.1} strokeDasharray="2 2" />}
              {chart.gridPath && <path d={chart.gridPath.bridge} fill="none" stroke="#34d399" strokeWidth={1.1} strokeDasharray="2 2" />}
              {/* 轴标签 */}
              {chart.lTicks.map((t) => <text key={`lt${t}`} x={chart.PL - 4} y={chart.lY(t) + 3} textAnchor="end" fill="#64748b" fontSize={8} fontFamily="monospace">{fmtM(t)}</text>)}
              {chart.rTicks.map((t) => <text key={`rt${t}`} x={size.w - chart.PR + 4} y={chart.rY(t) + 3} textAnchor="start" fill="#475569" fontSize={8} fontFamily="monospace">{t}</text>)}
              {chart.xLabels.map((xl, i) => <text key={`x${i}`} x={xl.x} y={size.h - 8} textAnchor="middle" fill="#94a3b8" fontSize={9} fontFamily="monospace">{xl.label}</text>)}
              {/* hover 点 */}
              {hover != null && <circle cx={chart.X(hover)} cy={chart.lY(chart.pts[hover].pricePerM)} r={2.5} fill="#38bdf8" />}
            </svg>
          )}
          {/* tooltip */}
          {hover != null && chart && (
            <div
              className="pointer-events-none absolute z-10 min-w-[150px] rounded border border-db-border/60 bg-db-overlay/95 p-1.5 shadow-[0_4px_16px_rgba(0,0,0,0.5)]"
              style={{ left: Math.min(Math.max(chart.X(hover) - 75, 4), size.w - 165), top: 4 }}
            >
              <div className="mb-1 flex items-baseline justify-between gap-3 text-meta">
                <span className="font-semibold text-db-primary">{chart.pts[hover].year}{!chart.pts[hover].actual && <span className="ml-1 text-micro text-amber-400">预测</span>}</span>
              </div>
              <div className="space-y-px text-caption leading-3">
                <div className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-infra-price" /><span className="w-14 text-db-tertiary">售价</span><span className="ml-auto font-mono text-db-primary">${chart.pts[hover].pricePerM}/M</span></div>
                <div className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-infra-cost" /><span className="w-14 text-db-tertiary">成本</span><span className="ml-auto font-mono text-db-primary">${chart.pts[hover].costPerM}/M</span></div>
                <div className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-infra-roi" /><span className="w-14 text-db-tertiary">ROI</span><span className={`ml-auto font-mono ${chart.pts[hover].roiPct >= 0 ? "text-emerald-400" : "text-red-400"}`}>{chart.pts[hover].roiPct}%</span></div>
                <div className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-infra-capex" /><span className="w-14 text-db-tertiary">CapEx</span><span className="ml-auto font-mono text-db-primary">${chart.pts[hover].capexB}B</span></div>
                <div className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-infra-grid" /><span className="w-14 text-db-tertiary">电网</span><span className="ml-auto font-mono text-db-primary">{chart.pts[hover].grid}</span></div>
              </div>
            </div>
          )}
        </div>
        {/* 底部状态行 */}
        <div className="flex items-center justify-between pt-1 text-caption text-db-faint">
          <span>{last ? `ROI ${last.roiPct}% · CapEx $${last.capexB}B · 售价/成本 ${last.pricePerM}/${last.costPerM}$/M` : "—"}</span>
          <span>数据: SEC/OpenRouter/FRED · 预测=模型假设</span>
        </div>
      </div>
    </Panel>
  );
});

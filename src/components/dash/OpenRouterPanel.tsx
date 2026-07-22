import { useEffect, useMemo, useRef, useState } from "react";
import { Panel, type PanelZoomProps } from "./Panel";
import { useOpenRouterUsage } from "@/lib/api";
import type { OrUsageDay } from "@/lib/api";

function fmtT(t: number): string {
  if (t >= 1e12) return (t / 1e12).toFixed(1) + "T";
  if (t >= 1e9) return (t / 1e9).toFixed(1) + "B";
  if (t >= 1e6) return (t / 1e6).toFixed(1) + "M";
  return String(t);
}

const VENDOR_COLORS: Record<string, string> = [
  "#4e79a7", "#f28e2b", "#e15759", "#76b7b2", "#59a14f",
  "#edc948", "#b07aa1", "#ff9da7", "#9c755f", "#bab0ac",
  "#86bcb6", "#d4a6c8", "#f1ce63", "#a0cbe8", "#e377c2",
  "#7f7f7f",
].reduce((m, c, i) => {
  const names = ["腾讯", "小米", "DeepSeek", "Anthropic", "Google", "OpenAI", "智谱GLM", "月之暗面", "MiniMax", "阶跃星辰", "NVIDIA", "Mistral", "Meta", "xAI", "Cohere"];
  if (i < names.length) m[names[i]] = c;
  return m;
}, {} as Record<string, string>);
VENDOR_COLORS["其他"] = "#64748b";
VENDOR_COLORS["🇨🇳中国"] = "#ef4444";
VENDOR_COLORS["🇺🇸美国"] = "#3b82f6";
VENDOR_COLORS["🌍其他"] = "#64748b";

function smoothPath(pts: { x: number; y: number }[]): string {
  if (pts.length < 2) return "";
  const fmt = (n: number) => n.toFixed(1);
  let d = `M${fmt(pts[0].x)},${fmt(pts[0].y)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
    const t = 0.3;
    d += `C${fmt(p1.x + (p2.x - p0.x) * t)},${fmt(p1.y + (p2.y - p0.y) * t)} ${fmt(p2.x - (p3.x - p1.x) * t)},${fmt(p2.y - (p3.y - p1.y) * t)} ${fmt(p2.x)},${fmt(p2.y)}`;
  }
  return d;
}

const TOP_N = 15;

function Chart({ allDays, days, mode }: { allDays: OrUsageDay[]; days: OrUsageDay[]; mode: "vendor" | "country" }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 400, h: 200 });
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
    if (!days || days.length < 2) return null;
    const { w: W, h: H } = size;
    const ch = H - 36, PL = 50, PR = 18, PT = 8, PB = 24;
    const iw = W - PL - PR, ih = ch - PT - PB;
    if (iw < 40 || ih < 20) return null;
    const n = days.length;

    // decide which data source to use
    const source = mode === "country" ? "countries" : "providers";

    // get top names from allDays
    const cum: Record<string, number> = {};
    for (const d of allDays)
      for (const p of d[source]) cum[p.name] = (cum[p.name] || 0) + p.tokens;
    const topNames = Object.keys(cum).filter((v) => v !== "其他").sort((a, b) => cum[b] - cum[a]);

    if (mode === "vendor") {
      // vendor mode: top N + other
      const topV = topNames.slice(0, TOP_N);
      const topSet = new Set(topV);
      const stacked = days.map((d) => {
        const m: Record<string, number> = {};
        let other = 0;
        for (const p of d[source])
          if (topSet.has(p.name)) m[p.name] = p.tokens;
          else other += p.tokens;
        return { date: d.date, total: d.total, m, other };
      });

      const allVals = stacked.flatMap((s) => [s.total, ...Object.values(s.m), s.other]);
      let lo = Math.min(...allVals) * 0.92, hi = Math.max(...allVals) * 1.08;
      if (hi - lo < 1) { hi = lo + 1 || 1; lo = 0; }
      const X = (i: number) => PL + (i / Math.max(n - 1, 1)) * iw;
      const Y = (v: number) => PT + ih - ((v - lo) / (hi - lo)) * ih;
      const ord = [...topV, "其他"];

      const areas = ord.map((v) => {
        const top: { x: number; y: number }[] = [], bot: { x: number; y: number }[] = [];
        for (let i = 0; i < n; i++) {
          const s = stacked[i];
          let b = 0;
          for (const o of ord) { if (o === v) break; b += o === "其他" ? s.other : (s.m[o] || 0); }
          const val = v === "其他" ? s.other : (s.m[v] || 0);
          top.push({ x: X(i), y: Y(b + val) });
          bot.push({ x: X(i), y: Y(b) });
        }
        return { name: v, d: smoothPath(top) + smoothPath([...bot].reverse()).replace(/^M/, "L") + "Z" };
      });

      const yTicks: { v: number; y: number }[] = [];
      for (let i = 0; i <= 4; i++) yTicks.push({ v: lo + ((hi - lo) / 4) * i, y: Y(lo + ((hi - lo) / 4) * i) });
      const xStep = Math.max(1, Math.floor(n / 6));
      const xLabels: { label: string; x: number }[] = [];
      for (let i = 0; i < n; i += xStep) xLabels.push({ label: days[i].date.slice(5), x: X(i) });
      const lastX = X(n - 1);
      if (!xLabels.length || xLabels[xLabels.length - 1].x < lastX - 20) xLabels.push({ label: days[n - 1].date.slice(5), x: lastX });
      const last = stacked[n - 1].total, first = stacked[0].total, chg = last - first;
      const avg7 = stacked.slice(-7).reduce((s, d) => s + d.total, 0) / Math.min(7, n);
      return { W, H, PL, PR, PT, PB, areas, yTicks, xLabels, last, chg, avg7 };
    } else {
      // country mode: all countries (China, US, Other)
      const stacked = days.map((d) => {
        const m: Record<string, number> = {};
        let other = 0;
        for (const p of d[source]) {
          if (topNames.includes(p.name)) m[p.name] = p.tokens;
          else other += p.tokens;
        }
        return { date: d.date, total: d.total, m, other };
      });

      const allVals = stacked.flatMap((s) => [s.total, ...Object.values(s.m), s.other]);
      let lo = Math.min(...allVals) * 0.92, hi = Math.max(...allVals) * 1.08;
      if (hi - lo < 1) { hi = lo + 1 || 1; lo = 0; }
      const X = (i: number) => PL + (i / Math.max(n - 1, 1)) * iw;
      const Y = (v: number) => PT + ih - ((v - lo) / (hi - lo)) * ih;
      const ord = [...topNames, "其他"];

      const areas = ord.map((v) => {
        const top: { x: number; y: number }[] = [], bot: { x: number; y: number }[] = [];
        for (let i = 0; i < n; i++) {
          const s = stacked[i];
          let b = 0;
          for (const o of ord) { if (o === v) break; b += o === "其他" ? s.other : (s.m[o] || 0); }
          const val = v === "其他" ? s.other : (s.m[v] || 0);
          top.push({ x: X(i), y: Y(b + val) });
          bot.push({ x: X(i), y: Y(b) });
        }
        return { name: v, d: smoothPath(top) + smoothPath([...bot].reverse()).replace(/^M/, "L") + "Z" };
      });

      const yTicks: { v: number; y: number }[] = [];
      for (let i = 0; i <= 4; i++) yTicks.push({ v: lo + ((hi - lo) / 4) * i, y: Y(lo + ((hi - lo) / 4) * i) });
      const xStep = Math.max(1, Math.floor(n / 6));
      const xLabels: { label: string; x: number }[] = [];
      for (let i = 0; i < n; i += xStep) xLabels.push({ label: days[i].date.slice(5), x: X(i) });
      const lastX = X(n - 1);
      if (!xLabels.length || xLabels[xLabels.length - 1].x < lastX - 20) xLabels.push({ label: days[n - 1].date.slice(5), x: lastX });
      const last = stacked[n - 1].total, first = stacked[0].total, chg = last - first;
      const avg7 = stacked.slice(-7).reduce((s, d) => s + d.total, 0) / Math.min(7, n);
      return { W, H, PL, PR, PT, PB, areas, yTicks, xLabels, last, chg, avg7 };
    }
  }, [days, allDays, size, mode]);

  if (!chart) return <div className="flex h-full items-center justify-center text-[11px] text-slate-600">暂无数据</div>;

  return (
    <div ref={boxRef} className="flex h-full min-h-0 w-full flex-col">
      <div className="flex shrink-0 flex-wrap gap-x-3 gap-y-0.5 pb-1 text-[9px]">
        {chart.areas.map((a) => (
          <span key={a.name} className="flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded-full" style={{ background: VENDOR_COLORS[a.name] || "#64748b" }} />
            {a.name}
          </span>
        ))}
      </div>
      <div className="flex shrink-0 items-baseline gap-3 pb-1 text-[10px]">
        <span className="font-semibold text-slate-200">{fmtT(chart.last)}</span>
        <span className={chart.chg >= 0 ? "text-emerald-400" : "text-red-400"}>
          {chart.chg >= 0 ? "↑" : "↓"} {Math.abs(chart.chg) / 1e12 > 0.01 ? fmtT(Math.abs(chart.chg)) : "0"}
        </span>
        <span className="text-slate-500">近7日均 {fmtT(Math.round(chart.avg7))}/日</span>
      </div>
      <svg width={chart.W} height={chart.H - 36} className="block flex-1">
        {chart.yTicks.map((t, i) => (
          <line key={i} x1={chart.PL} y1={t.y} x2={chart.W - chart.PR} y2={t.y} stroke="#1e293b" strokeWidth={0.5} />
        ))}
        {chart.areas.map((a) => (
          <path key={a.name} d={a.d} fill={VENDOR_COLORS[a.name] || "#64748b"} />
        ))}
        {chart.xLabels.map((xl, i) => (
          <text key={i} x={xl.x} y={chart.H - 12} textAnchor="middle" fill="#475569" fontSize={8} fontFamily="monospace">{xl.label}</text>
        ))}
        {chart.yTicks.map((t, i) => (
          <text key={`y${i}`} x={chart.PL - 4} y={t.y + 3} textAnchor="end" fill="#64748b" fontSize={8} fontFamily="monospace">{fmtT(Math.round(t.v))}</text>
        ))}
      </svg>
    </div>
  );
}

export function OpenRouterPanel({ className, panelId, isZoomed, onToggleZoom }: PanelZoomProps & { className?: string }) {
  const [range, setRange] = useState<"7d" | "14d" | "30d">("7d");
  const [mode, setMode] = useState<"vendor" | "country">("vendor");
  const { data, loading, error } = useOpenRouterUsage();

  const sliced = useMemo(() => {
    if (!data || data.length === 0) return [];
    const n = range === "7d" ? 7 : range === "14d" ? 14 : 30;
    return data.slice(-n);
  }, [data, range]);

  return (
    <Panel
      title="公有云大模型 Token 消耗"
      icon="⟁"
      accent="#a78bfa"
      className={className}
      panelId={panelId}
      isZoomed={isZoomed}
      onToggleZoom={onToggleZoom}
      right={
        <div className="flex gap-1">
          <div className="mr-1 flex gap-0.5 rounded border border-slate-700/60 p-0.5 text-[10px]">
            <button onClick={() => setMode("vendor")} className={`rounded px-1.5 py-0.5 transition-colors ${mode === "vendor" ? "bg-violet-500/20 text-violet-300" : "text-slate-500 hover:text-slate-300"}`}>厂商</button>
            <button onClick={() => setMode("country")} className={`rounded px-1.5 py-0.5 transition-colors ${mode === "country" ? "bg-violet-500/20 text-violet-300" : "text-slate-500 hover:text-slate-300"}`}>中美</button>
          </div>
          {(["7d", "14d", "30d"] as const).map((r) => (
            <button key={r} onClick={() => setRange(r)} className={`rounded px-1.5 py-0.5 text-[10px] font-medium transition-colors ${range === r ? "bg-violet-500/20 text-violet-300" : "text-slate-500 hover:text-slate-300"}`}>{r}</button>
          ))}
        </div>
      }
    >
      <div className="flex h-full flex-col p-2 pt-1">
        {loading ? (
          <div className="flex h-full items-center justify-center text-[11px] text-slate-600">加载中…</div>
        ) : error ? (
          <div className="flex h-full items-center justify-center text-[11px] text-red-400">数据异常: {error}</div>
        ) : (
          <div className="min-h-0 flex-1">
            <Chart allDays={data || []} days={sliced} mode={mode} />
          </div>
        )}
        <div className="flex items-center justify-between pt-1 text-[9px] text-slate-600">
          <span>数据: OpenRouter Rankings API</span>
          <span>日更新</span>
        </div>
      </div>
    </Panel>
  );
}

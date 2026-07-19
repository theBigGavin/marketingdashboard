import { useEffect, useMemo, useState } from "react";
import type { ComponentType } from "react";
import { Routes, Route } from "react-router";
import { Github, Maximize2, Minimize2 } from "lucide-react";
import { TickerTape, type TapeItem } from "@/components/dash/TickerTape";
import { Logo } from "@/components/Logo";
import { IndexPanel } from "@/components/dash/IndexPanel";
import { CommodityPanel } from "@/components/dash/CommodityPanel";
import { TreasuryPanel } from "@/components/dash/TreasuryPanel";
import { SectorPanel } from "@/components/dash/SectorPanel";
import { MoneyFlowPanel } from "@/components/dash/MoneyFlowPanel";
import { RankPanel } from "@/components/dash/RankPanel";
import { BoardFlowPanel } from "@/components/dash/BoardFlowPanel";
import { NewsPanel } from "@/components/dash/NewsPanel";
import { ChainPanel } from "@/components/dash/ChainPanel";
import { WatchlistPanel } from "@/components/dash/WatchlistPanel";
import { type PanelZoomProps } from "@/components/dash/Panel";
import { usePolling } from "@/hooks/usePolling";
import { useFullscreen } from "@/hooks/useFullscreen";
import { usePanelZoom } from "@/hooks/usePanelZoom";
import { api } from "@/lib/api";
import { INDICES, FOREX, COMMODITIES } from "@/config/dashboard";

function useClock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(t);
  }, []);
  return now;
}

function Header({ isFullscreen, onToggleFullscreen }: { isFullscreen: boolean; onToggleFullscreen: () => void }) {
  const now = useClock();
  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  const ss = String(now.getSeconds()).padStart(2, "0");
  const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const week = ["日", "一", "二", "三", "四", "五", "六"][now.getDay()];

  return (
    <header className="titlebar flex h-9 shrink-0 items-center gap-3 border-b border-slate-700/50 bg-gradient-to-r from-[#0a1424] via-[#0c1320] to-[#0a1424]">
      <div className="flex items-center gap-2.5">
        <Logo size={22} className="rounded-[6px] shadow-[0_0_12px_rgba(34,211,238,0.45)]" />
        <h1 className="text-[13px] font-bold tracking-wider text-slate-100">
          市场研究驾驶舱
          <span className="ml-2 text-[8px] font-medium tracking-[0.2em] text-cyan-500/80">MARKET RESEARCH COCKPIT</span>
        </h1>
      </div>
      <div className="mx-1 h-4 w-px bg-slate-700" />
      <div className="hidden items-center gap-3 text-[10px] text-slate-500 lg:flex">
        <span>沪深港美 · 大宗 · 美债 · 板块 · 资金流 · 快讯 · 产业链</span>
      </div>
      <div className="ml-auto flex items-center gap-3">
        <span className="flex items-center gap-1.5 text-[10px] text-emerald-400">
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
          </span>
          实时行情
        </span>
        <span className="hidden text-[10px] text-slate-400 md:inline" style={{ fontVariantNumeric: "tabular-nums" }}>
          {dateStr} 星期{week}
        </span>
        <span className="rounded border border-slate-700/60 bg-slate-800/40 px-2 py-px font-mono text-[12px] font-bold text-cyan-300">
          {hh}:{mm}<span className="text-cyan-600">:{ss}</span>
        </span>
        <a
          href="https://github.com/theBigGavin/marketingdashboard"
          target="_blank"
          rel="noopener noreferrer"
          title="GitHub 仓库"
          className="flex h-[22px] w-[22px] items-center justify-center rounded border border-slate-700/60 bg-slate-800/40 text-slate-400 transition-colors hover:border-cyan-500/60 hover:text-cyan-300"
        >
          <Github size={12} />
        </a>
        <button
          onClick={onToggleFullscreen}
          title={isFullscreen ? "退出全屏" : "全屏显示"}
          className="flex h-[22px] w-[22px] items-center justify-center rounded border border-slate-700/60 bg-slate-800/40 text-slate-400 transition-colors hover:border-cyan-500/60 hover:text-cyan-300"
        >
          {isFullscreen ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
        </button>
      </div>
    </header>
  );
}

function Tape() {
  const codes = useMemo(() => [...INDICES.map((i) => i.code), ...FOREX.map((i) => i.code)], []);
  const { data: quotes } = usePolling(() => api.quotes(codes), 5000);
  const { data: futures } = usePolling(() => api.futures(), 10000);
  const { data: treasuries } = usePolling(() => api.treasuries(), 60000);

  const items: TapeItem[] = useMemo(() => {
    const list: TapeItem[] = [];
    for (const d of [...INDICES, ...FOREX]) {
      const q = quotes?.[d.code];
      if (q) list.push({ key: d.code, label: d.label, price: q.price, pct: q.pct });
    }
    for (const c of COMMODITIES) {
      const q = futures?.[c.code];
      if (q) list.push({ key: c.code, label: c.label, price: q.price, pct: q.pct });
    }
    for (const sym of ["US10Y", "US2Y"]) {
      const t = treasuries?.find((x) => x.symbol === sym);
      if (t)
        list.push({
          key: sym,
          label: `美债${sym.replace("US", "")}收益率`,
          price: t.yield,
          pct: (t.change / t.yield) * 100,
          digits: 3,
        });
    }
    return list;
  }, [quotes, futures, treasuries]);

  if (items.length === 0) return <div className="h-7 border-b border-slate-700/40 bg-[#0a101c]" />;
  return <TickerTape items={items} />;
}

type PanelRowDef = {
  defaultH: number;
  panels: { id: string; component: ComponentType<{ className?: string } & PanelZoomProps>; defaultW: number; mobileH: string }[];
};

const PANEL_ROWS: PanelRowDef[] = [
  {
    defaultH: 0.30,
    panels: [
      { id: "index", component: IndexPanel, defaultW: 0.25, mobileH: "h-[560px]" },
      { id: "sector", component: SectorPanel, defaultW: 0.4167, mobileH: "h-[560px]" },
      { id: "news", component: NewsPanel, defaultW: 0.3333, mobileH: "h-[560px]" },
    ],
  },
  {
    defaultH: 0.34,
    panels: [
      { id: "boardFlow", component: BoardFlowPanel, defaultW: 0.2, mobileH: "h-[340px]" },
      { id: "moneyFlow", component: MoneyFlowPanel, defaultW: 0.2, mobileH: "h-[340px]" },
      { id: "rank", component: RankPanel, defaultW: 0.2, mobileH: "h-[340px]" },
      { id: "commodity", component: CommodityPanel, defaultW: 0.2, mobileH: "h-[300px]" },
      { id: "treasury", component: TreasuryPanel, defaultW: 0.2, mobileH: "h-[340px]" },
    ],
  },
  {
    defaultH: 0.36,
    panels: [
      { id: "watchlist", component: WatchlistPanel, defaultW: 0.25, mobileH: "h-[400px]" },
      { id: "chain", component: ChainPanel, defaultW: 0.75, mobileH: "h-[560px]" },
    ],
  },
];

function Dashboard() {
  const { isFullscreen, toggle } = useFullscreen();
  const { isZoomed, toggle: toggleZoom, layout } = usePanelZoom(PANEL_ROWS);

  return (
    <div className="flex min-h-screen flex-col bg-[#070b12] text-slate-200 lg:h-screen lg:overflow-hidden">
      <Header isFullscreen={isFullscreen} onToggleFullscreen={toggle} />
      <Tape />
      {/* 一屏式大屏:三行布局,行高与列宽按缩放状态动态分配 */}
      <main className="flex min-h-0 flex-1 flex-col gap-1 p-1">
        {PANEL_ROWS.map((row, rowIdx) => (
          <div
            key={rowIdx}
            className="flex min-h-0 flex-col gap-1 transition-all duration-300 lg:h-[var(--row-h)] lg:flex-row"
            style={{ "--row-h": `${layout.rowHeights[rowIdx] * 100}%` } as React.CSSProperties}
          >
            {row.panels.map((panel, panelIdx) => {
              const PanelComponent = panel.component;
              return (
                <div
                  key={panel.id}
                  className={`min-h-0 w-full transition-all duration-300 ${panel.mobileH} lg:h-full lg:w-[var(--panel-w)]`}
                  style={{ "--panel-w": `${layout.rowWidths[rowIdx][panelIdx] * 100}%` } as React.CSSProperties}
                >
                  <PanelComponent
                    className="h-full"
                    panelId={panel.id}
                    isZoomed={isZoomed(panel.id)}
                    onToggleZoom={toggleZoom}
                  />
                </div>
              );
            })}
          </div>
        ))}
      </main>
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Dashboard />} />
    </Routes>
  );
}

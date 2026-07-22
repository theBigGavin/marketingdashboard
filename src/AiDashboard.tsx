import { useEffect, useState } from "react";
import type { ComponentType } from "react";
import { Link } from "react-router";
import { Maximize2, Minimize2, ArrowLeft } from "lucide-react";
import { Logo } from "@/components/Logo";
import { OpenRouterPanel } from "@/components/dash/OpenRouterPanel";
import { type PanelZoomProps } from "@/components/dash/Panel";
import { useFullscreen } from "@/hooks/useFullscreen";
import { usePanelZoom } from "@/hooks/usePanelZoom";

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
          人工智能行业驾驶舱
          <span className="ml-2 text-[8px] font-medium tracking-[0.2em] text-violet-500/80">AI INDUSTRY COCKPIT</span>
        </h1>
      </div>
      <div className="mx-1 h-4 w-px bg-slate-700" />
      <div className="hidden items-center gap-3 text-[10px] text-slate-500 lg:flex">
        <span>AI Token 消耗 · 模型排名 · 厂商份额</span>
      </div>
      <div className="ml-auto flex items-center gap-3">
        <Link
          to="/"
          className="flex items-center gap-1 rounded border border-slate-700/60 bg-slate-800/40 px-2 py-1 text-[10px] text-slate-400 transition-colors hover:border-cyan-500/60 hover:text-cyan-300"
        >
          <ArrowLeft size={10} />
          市场驾驶舱
        </Link>
        <span className="hidden text-[10px] text-slate-400 md:inline" style={{ fontVariantNumeric: "tabular-nums" }}>
          {dateStr} 星期{week}
        </span>
        <span className="rounded border border-slate-700/60 bg-slate-800/40 px-2 py-px font-mono text-[12px] font-bold text-cyan-300">
          {hh}:{mm}<span className="text-cyan-600">:{ss}</span>
        </span>
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

type PanelRowDef = {
  defaultH: number;
  panels: { id: string; component: ComponentType<{ className?: string } & PanelZoomProps>; defaultW: number; mobileH: string }[];
};

const PANEL_ROWS: PanelRowDef[] = [
  {
    defaultH: 0.5,
    panels: [
      { id: "openrouter", component: OpenRouterPanel, defaultW: 0.5, mobileH: "h-[500px]" },
    ],
  },
];

export default function AiDashboard() {
  const { isFullscreen, toggle } = useFullscreen();
  const { isZoomed, toggle: toggleZoom, layout } = usePanelZoom(PANEL_ROWS);

  return (
    <div className="flex min-h-screen flex-col bg-[#070b12] text-slate-200 lg:h-screen lg:overflow-hidden">
      <Header isFullscreen={isFullscreen} onToggleFullscreen={toggle} />
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

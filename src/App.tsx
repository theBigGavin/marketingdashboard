import { useMemo } from "react";
import { Routes, Route } from "react-router";
import { TickerTape, type TapeItem } from "@/components/dash/TickerTape";
import { DashboardHeader } from "@/components/dash/DashboardHeader";
import { DashboardLayout, type PanelRowDef } from "@/components/dash/DashboardLayout";
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
import AiDashboard from "./AiDashboard";
import GoodsDashboard from "./GoodsDashboard";
import { usePolling } from "@/hooks/usePolling";
import { useSharedPolling } from "@/hooks/useSharedPolling";
import { useFullscreen } from "@/hooks/useFullscreen";
import { api } from "@/lib/api";
import { INDICES, FOREX, COMMODITIES } from "@/config/dashboard";

function Tape() {
  const codes = useMemo(() => [...INDICES.map((i) => i.code), ...FOREX.map((i) => i.code)], []);
  // 与 IndexPanel 共享同 key 轮询, 避免重复请求
  const { data: quotes } = useSharedPolling(`quotes:${codes.join(",")}`, () => api.quotes(codes), 5000);
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
      { id: "watchlist", component: WatchlistPanel, defaultW: 0.2222, mobileH: "h-[400px]" },
      { id: "chain", component: ChainPanel, defaultW: 0.7778, mobileH: "h-[560px]" },
    ],
  },
];

function Dashboard() {
  const { isFullscreen, toggle } = useFullscreen();

  return (
    <div className="flex min-h-screen flex-col bg-[#070b12] text-slate-200 lg:h-screen lg:overflow-hidden">
      <DashboardHeader
        title="市场研究驾驶舱"
        subtitle="MARKET RESEARCH COCKPIT"
        accent="cyan"
        tagline="沪深港美 · 大宗 · 美债 · 板块 · 资金流 · 快讯 · 产业链"
        linkTo="/ai"
        linkLabel="AI 驾驶舱"
        links={[{ to: "/goods", label: "商品价格" }, { to: "/ai", label: "AI 驾驶舱" }]}
        live
        githubUrl="https://github.com/theBigGavin/marketingdashboard"
        isFullscreen={isFullscreen}
        onToggleFullscreen={toggle}
      />
      <Tape />
      <DashboardLayout rows={PANEL_ROWS} />
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Dashboard />} />
      <Route path="/ai" element={<AiDashboard />} />
      <Route path="/goods" element={<GoodsDashboard />} />
    </Routes>
  );
}

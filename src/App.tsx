import { useEffect, useMemo, useState } from "react";
import { Routes, Route } from "react-router";
import { TickerTape, type TapeItem } from "@/components/dash/TickerTape";
import { IndexPanel } from "@/components/dash/IndexPanel";
import { CommodityPanel } from "@/components/dash/CommodityPanel";
import { TreasuryPanel } from "@/components/dash/TreasuryPanel";
import { SectorPanel } from "@/components/dash/SectorPanel";
import { MoneyFlowPanel } from "@/components/dash/MoneyFlowPanel";
import { RankPanel } from "@/components/dash/RankPanel";
import { NewsPanel } from "@/components/dash/NewsPanel";
import { ChainPanel } from "@/components/dash/ChainPanel";
import { WatchlistPanel } from "@/components/dash/WatchlistPanel";
import { usePolling } from "@/hooks/usePolling";
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

function Header() {
  const now = useClock();
  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  const ss = String(now.getSeconds()).padStart(2, "0");
  const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const week = ["日", "一", "二", "三", "四", "五", "六"][now.getDay()];

  return (
    <header className="flex h-9 shrink-0 items-center gap-3 border-b border-slate-700/50 bg-gradient-to-r from-[#0a1424] via-[#0c1320] to-[#0a1424] px-3">
      <div className="flex items-center gap-2.5">
        <div className="flex h-5.5 w-5.5 items-center justify-center rounded bg-gradient-to-br from-cyan-400 to-blue-600 text-[12px] font-black text-white shadow-[0_0_12px_rgba(34,211,238,0.45)]" style={{ height: 22, width: 22 }}>
          驾
        </div>
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
        <span className="rounded border border-slate-700/60 bg-slate-800/40 px-2 py-px text-[12px] font-bold text-cyan-300" style={{ fontVariantNumeric: "tabular-nums" }}>
          {hh}:{mm}<span className="text-cyan-600">:{ss}</span>
        </span>
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

function Dashboard() {
  return (
    <div className="flex min-h-screen flex-col bg-[#070b12] text-slate-200 lg:h-screen lg:overflow-hidden">
      <Header />
      <Tape />
      {/* 一屏式大屏:三行网格,行高按比例分配 */}
      <main className="grid min-h-0 flex-1 gap-1.5 p-1.5 lg:grid-rows-[30fr_34fr_36fr]">
        {/* 第一行:指数 / 板块 / 快讯 */}
        <div className="grid min-h-0 grid-cols-12 gap-1.5">
          <IndexPanel className="col-span-12 lg:col-span-3" />
          <SectorPanel className="col-span-12 h-[560px] lg:h-auto lg:col-span-5" />
          <NewsPanel className="col-span-12 h-[560px] lg:h-auto lg:col-span-4" />
        </div>
        {/* 第二行:美债 / 榜单 / 资金流 / 大宗 */}
        <div className="grid min-h-0 grid-cols-12 gap-1.5">
          <TreasuryPanel className="col-span-12 h-[340px] lg:h-auto lg:col-span-3" />
          <RankPanel className="col-span-12 h-[340px] lg:h-auto lg:col-span-3" />
          <MoneyFlowPanel className="col-span-12 h-[340px] lg:h-auto lg:col-span-3" />
          <CommodityPanel className="col-span-12 h-[300px] lg:h-auto lg:col-span-3" />
        </div>
        {/* 第三行:自选股 / 产业链 */}
        <div className="grid min-h-0 grid-cols-12 gap-1.5">
          <WatchlistPanel className="col-span-12 h-[400px] lg:h-auto lg:col-span-3" />
          <ChainPanel className="col-span-12 h-[560px] lg:h-auto lg:col-span-9" />
        </div>
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

import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { Navigate, Routes, Route } from "react-router";
import { TickerTape, type TapeItem } from "@/components/dash/TickerTape";
import { DashboardHeader } from "@/components/dash/DashboardHeader";
import { StarHint } from "@/components/dash/StarHint";
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
import LoginPage from "./pages/LoginPage";
import { hostingEnabled, hostingToken } from "@/lib/hosting";
import { HostingContext, useHosting } from "@/lib/hosting-context";
import { useSharedPolling } from "@/hooks/useSharedPolling";
import { useQuotes } from "@/lib/market";
import { useFullscreen } from "@/hooks/useFullscreen";
import { api } from "@/lib/api";
import { POLL } from "@/lib/intervals";
import { INDICES, FOREX, COMMODITIES } from "@/config/dashboard";

// 非首页按路由拆包，避免 AI、黄金、财报与 Pro 页面进入首屏主包。
const AiDashboard = lazy(() => import("./AiDashboard"));
const GoodsDashboard = lazy(() => import("./GoodsDashboard"));
const FinDashboard = lazy(() => import("./FinDashboard"));
const GoldDashboard = lazy(() => import("./GoldDashboard"));
const ProLanding = lazy(() => import("./ProLanding"));

function Tape() {
  const codes = useMemo(() => [...INDICES.map((i) => i.code), ...FOREX.map((i) => i.code)], []);
  const futureCodes = useMemo(() => COMMODITIES.map((c) => c.code), []);
  // 指数与期货报价: 统一报价中心(与全站所有面板同帧)
  const quotes = useQuotes(codes);
  const futures = useQuotes(futureCodes);
  const { data: treasuries } = useSharedPolling("treasuries", () => api.treasuries(), POLL.TREASURY_LIVE);

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
          pct: t.yield ? (t.change / t.yield) * 100 : 0, // yield 缺失(接口异常归一为 0)时不产生 Infinity%
          digits: 3,
        });
    }
    return list;
  }, [quotes, futures, treasuries]);

  if (items.length === 0) return <div className="h-7 border-b border-db-border/40 bg-db-ticker" />;
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
  const hosting = useHosting();
  // 托管模式: 过滤 Pro 入口(保留 商品价格/AI 观察/黄金观察/财报窗口); 开源模式: 原样含 Pro(零回归)
  const links = useMemo(() => {
    const base = [
      { to: "/goods", label: "商品价格" },
      { to: "/gold", label: "黄金观察" },
      { to: "/ai", label: "AI 观察" },
      { to: "/fin", label: "财报窗口" },
    ];
    return hosting ? base : [...base, { to: "/pro", label: "Pro" }];
  }, [hosting]);

  return (
    <div className="flex min-h-screen flex-col bg-db-canvas text-db-primary lg:h-screen lg:overflow-hidden">
      <DashboardHeader
        title="市场研究驾驶舱"
        subtitle="MARKET RESEARCH COCKPIT"
        accent="cyan"
        tagline="沪深港美 · 大宗 · 美债 · 板块 · 资金流 · 快讯 · 产业链"
        linkTo="/ai"
        linkLabel="AI 观察"
        links={links}
        live
        githubUrl="https://github.com/theBigGavin/marketingdashboard"
        isFullscreen={isFullscreen}
        onToggleFullscreen={toggle}
      />
      <Tape />
      <StarHint githubUrl="https://github.com/theBigGavin/marketingdashboard" />
      <DashboardLayout rows={PANEL_ROWS} />
    </div>
  );
}

/** 托管模式上下文: HostingGate 探测结果(enabled) 复用同一次探测, 供 Dashboard/路由消费
 *  (定义在 src/lib/hosting-context.ts, 独立模块避免 AiDashboard ↔ App 循环依赖) */

function AppRoutes() {
  const hosting = useHosting();
  return (
    <Routes>
      <Route path="/" element={<Dashboard />} />
      <Route path="/ai" element={<AiDashboard />} />
      <Route path="/goods" element={<GoodsDashboard />} />
      <Route path="/gold" element={<GoldDashboard />} />
      <Route path="/fin" element={<FinDashboard />} />
      <Route path="/pro" element={hosting ? <Navigate to="/" replace /> : <ProLanding />} />
    </Routes>
  );
}

export default function App() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center bg-db-canvas text-db-muted">页面加载中…</div>}>
      <HostingGate>
        <AppRoutes />
      </HostingGate>
    </Suspense>
  );
}

/**
 * 托管版登录墙（运行时探测 /api/hosting/config）:
 * - 开源模式(端点 404): 直接渲染 children, 行为与以往完全一致(零回归)
 * - 托管模式(端点 enabled=true): 有 token → children(看板); 无 token → 登录页
 */
function HostingGate({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<"checking" | "open" | "login">("checking");
  const [hosting, setHosting] = useState(false);
  useEffect(() => {
    let alive = true;
    (async () => {
      let enabled = false;
      try { enabled = await hostingEnabled(); } catch { enabled = false; }
      if (!alive) return;
      setHosting(enabled);
      if (!enabled) { setState("open"); return; }
      setState(hostingToken() ? "open" : "login");
    })();
    return () => { alive = false; };
  }, []);
  // 托管模式(探测 enabled=true): index.html 静态 footer(id=mrd-foot) 无业务价值 → 移除;
  // 开源模式(enabled=false): 不动 DOM, 与以往完全一致(零回归)
  useEffect(() => {
    if (hosting) document.getElementById("mrd-foot")?.remove();
  }, [hosting]);
  if (state === "checking") {
    return <div className="flex min-h-screen items-center justify-center bg-db-canvas text-db-muted">加载中…</div>;
  }
  if (state === "login") {
    return <LoginPage onAuthed={() => setState("open")} />;
  }
  return <HostingContext.Provider value={hosting}>{children}</HostingContext.Provider>;
}

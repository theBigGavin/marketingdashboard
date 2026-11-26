import { useEffect, useState } from "react";
import { DashboardHeader } from "@/components/dash/DashboardHeader";
import { AiGrid } from "@/components/dash/AiGrid";
import { OpenRouterPanel } from "@/components/dash/OpenRouterPanel";
import { TtsiTrendPanel, EventPanel, ModelPricePanel, ValueScatterPanel } from "@/components/dash/ModelCostPanel";
import { InfraRoiPanel } from "@/components/dash/InfraRoiPanel";
import { useFullscreen } from "@/hooks/useFullscreen";
import { hostingAiQuota, type HostingAiQuota } from "@/lib/hosting";
import { useHosting } from "@/lib/hosting-context";

// 3×4 网格: Token 消耗(openrouter)与投资回报(ai-infra)各占 2×2, 其余 1×1
const CELLS = [
  {
    id: "openrouter",
    component: OpenRouterPanel,
    area: "lg:col-start-1 lg:row-start-1 lg:col-span-2 lg:row-span-2",
    mobileH: "h-[360px]",
  },
  { id: "ttsi-trend", component: TtsiTrendPanel, area: "lg:col-start-3 lg:row-start-1", mobileH: "h-[380px]" },
  { id: "price-events", component: EventPanel, area: "lg:col-start-3 lg:row-start-2", mobileH: "h-[380px]" },
  {
    id: "ai-infra",
    component: InfraRoiPanel,
    area: "lg:col-start-1 lg:row-start-3 lg:col-span-2 lg:row-span-2",
    mobileH: "h-[340px]",
  },
  { id: "price-table", component: ModelPricePanel, area: "lg:col-start-3 lg:row-start-3", mobileH: "h-[380px]" },
  { id: "value-scatter", component: ValueScatterPanel, area: "lg:col-start-3 lg:row-start-4", mobileH: "h-[380px]" },
];

/**
 * 本租户 AI 额度条(0819-c P1-1, host 版): 托管模式下页面顶部低调渲染
 * 「本租户 AI 额度：今日 N 次 · 已用 M」。开源模式不渲染(零变化);
 * 加载失败静默隐藏(不阻塞面板)。文案中性: 不出 Pro/价格/付费字样。
 */
function QuotaBar() {
  const hosting = useHosting();
  const [quota, setQuota] = useState<HostingAiQuota | null>(null);
  useEffect(() => {
    if (!hosting) return;
    let alive = true;
    hostingAiQuota()
      .then((q) => { if (alive) setQuota(q); })
      .catch(() => { /* 加载失败静默隐藏, 不阻塞面板 */ });
    return () => { alive = false; };
  }, [hosting]);
  if (!hosting || !quota) return null;
  return (
    <div className="flex items-center justify-between border-b border-db-border/40 bg-db-ticker px-4 py-1.5 text-xs text-db-tertiary">
      <span>本租户 AI 额度：今日 {quota.limit} 次 · 已用 {quota.used}</span>
    </div>
  );
}

export default function AiDashboard() {
  const { isFullscreen, toggle } = useFullscreen();

  return (
    <div className="flex min-h-screen flex-col bg-db-canvas text-db-primary lg:h-screen lg:overflow-hidden">
      <DashboardHeader
        title="人工智能行业观察"
        subtitle="AI INDUSTRY WATCH"
        accent="violet"
        tagline="AI Token 消耗 · 模型排名 · 厂商份额"
        linkTo="/"
        linkLabel="市场驾驶舱"
        linkBack
        links={[
          { to: "/", label: "市场驾驶舱" },
          { to: "/goods", label: "商品价格" },
          { to: "/gold", label: "黄金观察" },
          { to: "/fin", label: "财报窗口" },
        ]}
        isFullscreen={isFullscreen}
        onToggleFullscreen={toggle}
      />
      <QuotaBar />
      <AiGrid cells={CELLS} />
    </div>
  );
}

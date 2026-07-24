import { DashboardHeader } from "@/components/dash/DashboardHeader";
import { DashboardLayout, type PanelRowDef } from "@/components/dash/DashboardLayout";
import { GoodsTrendPanel } from "@/components/dash/GoodsTrendPanel";
import { SpotPanel } from "@/components/dash/SpotPanel";
import { BasisPanel } from "@/components/dash/BasisPanel";
import type { PanelZoomProps } from "@/components/dash/Panel";
import { useFullscreen } from "@/hooks/useFullscreen";
import { GOODS_GROUPS, type GoodsGroupId } from "@/config/goods";

/** 为每个品种组生成稳定引用的面板组件(避免每次渲染重建导致面板状态重置) */
function makeTrendPanel(group: GoodsGroupId) {
  const g = GOODS_GROUPS.find((x) => x.id === group)!;
  return function TrendPanel(props: { className?: string } & PanelZoomProps) {
    return <GoodsTrendPanel group={group} title={g.name} accent={g.accent} {...props} />;
  };
}

const PmPanel = makeTrendPanel("pm");
const BmPanel = makeTrendPanel("bm");
const FerPanel = makeTrendPanel("fer");
const ChemPanel = makeTrendPanel("chem");
const AgriPanel = makeTrendPanel("agri");
const IntlPanel = makeTrendPanel("intl");

const PANEL_ROWS: PanelRowDef[] = [
  {
    defaultH: 0.37,
    panels: [
      { id: "goods-pm", component: PmPanel, defaultW: 1 / 3, mobileH: "h-[340px]" },
      { id: "goods-bm", component: BmPanel, defaultW: 1 / 3, mobileH: "h-[340px]" },
      { id: "goods-fer", component: FerPanel, defaultW: 1 / 3, mobileH: "h-[340px]" },
    ],
  },
  {
    defaultH: 0.37,
    panels: [
      { id: "goods-chem", component: ChemPanel, defaultW: 1 / 3, mobileH: "h-[340px]" },
      { id: "goods-agri", component: AgriPanel, defaultW: 1 / 3, mobileH: "h-[340px]" },
      { id: "goods-intl", component: IntlPanel, defaultW: 1 / 3, mobileH: "h-[340px]" },
    ],
  },
  {
    defaultH: 0.26,
    panels: [
      { id: "goods-spot", component: SpotPanel, defaultW: 0.5, mobileH: "h-[340px]" },
      { id: "goods-basis", component: BasisPanel, defaultW: 0.5, mobileH: "h-[340px]" },
    ],
  },
];

export default function GoodsDashboard() {
  const { isFullscreen, toggle } = useFullscreen();

  return (
    <div className="flex min-h-screen flex-col bg-[#070b12] text-slate-200 lg:h-screen lg:overflow-hidden">
      <DashboardHeader
        title="商品价格"
        subtitle="COMMODITY PRICES"
        accent="cyan"
        tagline="期货主力日线趋势 · 现货报价 · 现期基差"
        linkTo="/"
        linkLabel="市场驾驶舱"
        linkBack
        isFullscreen={isFullscreen}
        onToggleFullscreen={toggle}
      />
      <DashboardLayout rows={PANEL_ROWS} />
    </div>
  );
}

import { DashboardHeader } from "@/components/dash/DashboardHeader";
import { DashboardLayout, type PanelRowDef } from "@/components/dash/DashboardLayout";
import { OpenRouterPanel } from "@/components/dash/OpenRouterPanel";
import { useFullscreen } from "@/hooks/useFullscreen";

const PANEL_ROWS: PanelRowDef[] = [
  {
    defaultH: 1.0,
    panels: [{ id: "openrouter", component: OpenRouterPanel, defaultW: 1.0, mobileH: "h-[500px]" }],
  },
];

export default function AiDashboard() {
  const { isFullscreen, toggle } = useFullscreen();

  return (
    <div className="flex min-h-screen flex-col bg-[#070b12] text-slate-200 lg:h-screen lg:overflow-hidden">
      <DashboardHeader
        title="人工智能行业驾驶舱"
        subtitle="AI INDUSTRY COCKPIT"
        accent="violet"
        tagline="AI Token 消耗 · 模型排名 · 厂商份额"
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

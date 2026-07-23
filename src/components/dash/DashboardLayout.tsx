import type { ComponentType } from "react";
import { type PanelZoomProps } from "@/components/dash/Panel";
import { usePanelZoom } from "@/hooks/usePanelZoom";

export type PanelRowDef = {
  defaultH: number;
  panels: { id: string; component: ComponentType<{ className?: string } & PanelZoomProps>; defaultW: number; mobileH: string }[];
};

/** 一屏式大屏: 行高与列宽按缩放状态动态分配 */
export function DashboardLayout({ rows }: { rows: PanelRowDef[] }) {
  const { isZoomed, toggle: toggleZoom, layout } = usePanelZoom(rows);

  return (
    <main className="flex min-h-0 flex-1 flex-col gap-1 p-1">
      {rows.map((row, rowIdx) => (
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
  );
}

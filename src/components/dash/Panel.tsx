import { useState, type ReactNode } from "react";
import { ZoomIn, ZoomOut } from "lucide-react";
import { isTv } from "@/lib/tv";
import { ZoomCtx } from "./ZoomCtx";

export interface PanelZoomProps {
  panelId?: string;
  isZoomed?: boolean;
  onToggleZoom?: (id: string) => void;
}

interface PanelProps extends PanelZoomProps {
  title: string;
  icon?: ReactNode;
  right?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  accent?: string;
}

/** 驾驶舱面板容器 — 终端风格 */
export function Panel({
  title,
  icon,
  right,
  children,
  className = "",
  bodyClassName = "",
  accent = "#38bdf8",
  panelId,
  isZoomed = false,
  onToggleZoom,
}: PanelProps) {
  // TV: 放大 = 全屏浮层(兄弟面板尺寸不变, 零重排; 老电视GPU上整屏reflow是缩放卡顿主因)
  const tvOverlay = isTv && isZoomed;
  // 记录放大前的原始尺寸(state, 带相等守卫防循环), 浮层用 CSS zoom 按同比例放大内容
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const measureRef = (el: HTMLElement | null) => {
    if (el && !isZoomed && el.offsetWidth > 0) {
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      setNatural((prev) => (prev && Math.abs(prev.w - w) < 2 && Math.abs(prev.h - h) < 2 ? prev : { w, h }));
    }
  };
  // 老WebView缩放渲染下 fixed 的 bottom/right 锚的是布局视口(可能大于可视区域, 底边溢出屏幕),
  // 用实测可视区域给定宽高
  const zoom = tvOverlay
    ? Math.max(1, Math.min(natural ? Math.min((window.innerWidth - 48) / natural.w, (window.innerHeight - 48) / natural.h) : 2, 3))
    : 1;
  const overlayStyle = tvOverlay
    ? (() => {
        const w = window.innerWidth - 48;
        const h = window.innerHeight - 48;
        const k = natural ? Math.min(w / natural.w, h / natural.h) : 2;
        const z = Math.max(1, Math.min(k, 3));
        // zoom 会连元素自身盒模型一起放大, 宽高与偏移都按 1/z 预缩, 渲染后恰为 (24,24) w×h
        return {
          position: "fixed" as const, left: 24 / z, top: 24 / z, width: w / z, height: h / z, zIndex: 60, zoom: z,
          // 供内部组件换算事件坐标: getBoundingClientRect 在 zoom 下返回缩放后几何, 需除以 z
          "--tv-zoom": String(z),
        } as React.CSSProperties;
      })()
    : undefined;
  return (
    <>
      {tvOverlay && <div className="fixed left-0 right-0 top-0 bottom-0 z-[55] bg-black/70" />}
      <section
        ref={measureRef}
        style={overlayStyle}
        className={`flex min-h-0 flex-col rounded-md border bg-db-panel/90 shadow-[0_0_24px_rgba(0,0,0,0.35)] backdrop-blur transition-all duration-300 ${
          isZoomed ? "border-cyan-500/50 shadow-[0_0_32px_rgba(34,211,238,0.18)]" : "border-db-border/40"
        } ${tvOverlay ? "bg-db-panel" : ""} ${className}`}
      {...(isTv && panelId && onToggleZoom
        ? {
            // TV 模式: 面板整体可聚焦, OK 键 = 放大(还原仅通过缩小按钮/返回键)
            // 放大态点击面板组件 = 执行组件原始操作, 不再触发缩小(防止误触还原)
            // data-tv-zoomed 供 TV 壳 App 返回键识别并还原已放大面板
            "data-tv-focusable": true,
            "data-tv-zoomed": isZoomed || undefined,
            "data-panel-id": panelId,
            tabIndex: -1,
            onClick: (e: React.MouseEvent) => {
              // 非放大态: 点击面板任意处(含内部按钮/链接)一律放大全屏 — 与其他页一致
              if (!isZoomed) {
                // 表单控件保持原生交互(输入/选择不放大), 其余(按钮/链接/列表/SVG)都放大
                if ((e.target as HTMLElement).closest("input, select, textarea")) return;
                onToggleZoom(panelId);
                return;
              }
              // 放大态: 点击面板组件执行原始操作(按钮/链接/列表选择), 空白区域不缩小(仅缩小按钮可还原)
              if ((e.target as HTMLElement).closest("button, a, input, select, textarea")) return;
            },
            onTouchStart: tvOverlay
              ? (e: React.TouchEvent) => {
                  const t = e.touches[0];
                  if (t) (e.currentTarget as HTMLElement).dataset.tvSwipe = `${t.clientX},${t.clientY}`;
                }
              : undefined,
            onTouchEnd: tvOverlay
              ? (e: React.TouchEvent) => {
                  const el = e.currentTarget as HTMLElement;
                  const xy = (el.dataset.tvSwipe || "").split(",").map(Number);
                  delete el.dataset.tvSwipe;
                  if (xy.length < 2 || !xy[0]) return;
                  const t = e.changedTouches[0];
                  const dx = t.clientX - xy[0];
                  const dy = t.clientY - xy[1];
                  // 主导方向判断: |dx|>60 且水平分量 > 垂直分量(上下滑动/斜向滑动不触发)
                  if (Math.abs(dx) < 60 || Math.abs(dx) <= Math.abs(dy)) return;
                  // 触屏左右滑动切换相邻面板(放大态)
                  const ids = Array.from(document.querySelectorAll<HTMLElement>("section[data-tv-focusable][data-panel-id]"))
                    .map((s) => s.dataset.panelId || "");
                  const i = ids.indexOf(panelId);
                  if (i < 0) return;
                  const next = ids[(i + (dx < 0 ? 1 : ids.length - 1)) % ids.length];
                  if (next && next !== panelId) onToggleZoom(next);
                }
              : undefined,
          }
        : {})}
    >
      <ZoomCtx.Provider value={zoom}>
        <header className="flex h-8 shrink-0 items-center gap-2 border-b border-db-border/40 px-2.5">
          <span className="inline-block h-3.5 w-1 shrink-0 rounded-sm" style={{ background: accent }} />
          {icon && <span className="shrink-0" style={{ color: accent, display: "inline-flex", alignItems: "center" }}>{icon}</span>}
          {/* min-w-0 + truncate: 长标题收缩省略, 不再把右侧控件挤出面板 */}
          <h2 className="min-w-0 flex-1 truncate text-panel-title font-semibold tracking-wide text-db-primary">{title}</h2>
          <div className="flex shrink-0 items-center gap-2">
            {right}
            {panelId && onToggleZoom && (
              <button
                type="button"
                onClick={() => onToggleZoom(panelId)}
                title={isZoomed ? "缩小" : "放大"}
                className={`flex h-[22px] w-[22px] items-center justify-center rounded border transition-colors ${
                  isZoomed
                    ? "border-cyan-500/60 bg-cyan-500/10 text-cyan-300"
                    : "border-db-border/60 bg-db-subtle/40 text-db-tertiary hover:border-cyan-500/60 hover:text-cyan-300"
                }`}
              >
                {isZoomed ? <ZoomOut size={12} /> : <ZoomIn size={12} />}
              </button>
            )}
          </div>
        </header>
        <div className={`min-h-0 flex-1 ${bodyClassName}`}>{children}</div>
      </ZoomCtx.Provider>
      </section>
    </>
  );
}

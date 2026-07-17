import type { ReactNode } from "react";

interface PanelProps {
  title: string;
  icon?: string;
  right?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  accent?: string;
}

/** 驾驶舱面板容器 — 终端风格 */
export function Panel({ title, icon, right, children, className = "", bodyClassName = "", accent = "#38bdf8" }: PanelProps) {
  return (
    <section
      className={`flex min-h-0 flex-col rounded-md border border-slate-700/40 bg-[#0c1320]/90 shadow-[0_0_24px_rgba(0,0,0,0.35)] backdrop-blur ${className}`}
    >
      <header className="flex h-8 shrink-0 items-center gap-2 border-b border-slate-700/40 px-2.5">
        <span className="inline-block h-3.5 w-1 rounded-sm" style={{ background: accent }} />
        {icon && <span className="text-[13px] leading-none" style={{ color: accent }}>{icon}</span>}
        <h2 className="text-[13px] font-semibold tracking-wide text-slate-200">{title}</h2>
        <div className="ml-auto flex items-center gap-2">{right}</div>
      </header>
      <div className={`min-h-0 flex-1 ${bodyClassName}`}>{children}</div>
    </section>
  );
}

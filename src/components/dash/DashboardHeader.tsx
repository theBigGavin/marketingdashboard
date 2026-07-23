import { Link } from "react-router";
import { ArrowLeft, Github, Maximize2, Minimize2 } from "lucide-react";
import { Logo } from "@/components/Logo";
import { useClock } from "@/hooks/useClock";

type Accent = "cyan" | "violet";

const SUBTITLE_CLASS: Record<Accent, string> = {
  cyan: "text-cyan-500/80",
  violet: "text-violet-500/80",
};

/** 导航链接的 hover 色取与副标题相反的强调色 */
const LINK_HOVER_CLASS: Record<Accent, string> = {
  cyan: "hover:border-violet-500/60 hover:text-violet-300",
  violet: "hover:border-cyan-500/60 hover:text-cyan-300",
};

export function DashboardHeader({
  title,
  subtitle,
  accent,
  tagline,
  linkTo,
  linkLabel,
  linkBack = false,
  live = false,
  githubUrl,
  isFullscreen,
  onToggleFullscreen,
}: {
  title: string;
  subtitle: string;
  accent: Accent;
  tagline: string;
  linkTo: string;
  linkLabel: string;
  /** 链接前是否带返回箭头 */
  linkBack?: boolean;
  /** 是否显示"实时行情"指示灯 */
  live?: boolean;
  /** 传入则显示 GitHub 仓库按钮 */
  githubUrl?: string;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
}) {
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
          {title}
          <span className={`ml-2 text-[8px] font-medium tracking-[0.2em] ${SUBTITLE_CLASS[accent]}`}>{subtitle}</span>
        </h1>
      </div>
      <div className="mx-1 h-4 w-px bg-slate-700" />
      <div className="hidden items-center gap-3 text-[10px] text-slate-500 lg:flex">
        <span>{tagline}</span>
      </div>
      <div className="ml-auto flex items-center gap-3">
        <Link
          to={linkTo}
          className={`flex items-center gap-1 rounded border border-slate-700/60 bg-slate-800/40 px-2 py-1 text-[10px] text-slate-400 transition-colors ${LINK_HOVER_CLASS[accent]}`}
        >
          {linkBack && <ArrowLeft size={10} />}
          {linkLabel}
        </Link>
        {live && (
          <span className="flex items-center gap-1.5 text-[10px] text-emerald-400">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
            </span>
            实时行情
          </span>
        )}
        <span className="hidden text-[10px] text-slate-400 md:inline" style={{ fontVariantNumeric: "tabular-nums" }}>
          {dateStr} 星期{week}
        </span>
        <span className="rounded border border-slate-700/60 bg-slate-800/40 px-2 py-px font-mono text-[12px] font-bold text-cyan-300">
          {hh}:{mm}<span className="text-cyan-600">:{ss}</span>
        </span>
        {githubUrl && (
          <a
            href={githubUrl}
            target="_blank"
            rel="noopener noreferrer"
            title="GitHub 仓库"
            className="flex h-[22px] w-[22px] items-center justify-center rounded border border-slate-700/60 bg-slate-800/40 text-slate-400 transition-colors hover:border-cyan-500/60 hover:text-cyan-300"
          >
            <Github size={12} />
          </a>
        )}
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

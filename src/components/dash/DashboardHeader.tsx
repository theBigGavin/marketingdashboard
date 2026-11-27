import { useEffect, useState } from "react";
import { Link } from "react-router";
import { ArrowLeft, Github, Maximize2, Minimize2 } from "lucide-react";
import { Logo } from "@/components/Logo";
import { useClock } from "@/hooks/useClock";
import { isTv } from "@/lib/tv";

type Accent = "cyan" | "violet" | "gold";

const SUBTITLE_CLASS: Record<Accent, string> = {
  cyan: "text-cyan-500/80",
  violet: "text-violet-500/80",
  gold: "text-gold/80",
};

/** 导航链接的 hover 色取与副标题相反的强调色 */
const LINK_HOVER_CLASS: Record<Accent, string> = {
  cyan: "hover:border-violet-500/60 hover:text-violet-300",
  violet: "hover:border-cyan-500/60 hover:text-cyan-300",
  gold: "hover:border-gold/60 hover:text-gold-soft",
};

export function DashboardHeader({
  title,
  subtitle,
  accent,
  tagline,
  linkTo,
  linkLabel,
  links,
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
  /** 多个导航链接(传入时替代单个 linkTo/linkLabel, linkBack 仅作用于首个) */
  links?: { to: string; label: string }[];
  /** 链接前是否带返回箭头 */
  linkBack?: boolean;
  /** 是否显示"实时行情"指示灯 */
  live?: boolean;
  /** 传入则显示 GitHub 仓库按钮 */
  githubUrl?: string;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
}) {
  const now = useClock(isTv ? 60000 : 1000); // TV 弱 GPU: 每秒重绘整个 Header 代价高, 降到每分钟
  const [stars, setStars] = useState<number | null>(null);
  useEffect(() => {
    // GitHub star 数: 走自家 /api/repo-stats (1h 缓存, 防 GitHub API 限流); 失败静默隐藏
    let alive = true;
    fetch("/api/repo-stats")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const s = d?.data?.stars ?? d?.stars;
        if (alive && typeof s === "number" && s > 0) setStars(s);
      })
      .catch(() => {});
    return () => { alive = false; };
  }, []);
  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  const ss = String(now.getSeconds()).padStart(2, "0");
  const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const week = ["日", "一", "二", "三", "四", "五", "六"][now.getDay()];

  return (
    <header className="titlebar flex h-9 shrink-0 items-center gap-3 border-b border-db-border/50 bg-gradient-to-r from-db-header via-db-panel to-db-header">
      <div className="flex items-center gap-2.5">
        <Logo size={22} className="rounded-[6px] shadow-[0_0_12px_rgba(34,211,238,0.45)]" />
        <h1 className="text-subtitle font-bold tracking-wider text-db-strong">
          {title}
          <span className={`ml-2 text-micro font-medium tracking-[0.2em] ${SUBTITLE_CLASS[accent]}`}>{subtitle}</span>
        </h1>
      </div>
      <div className="mx-1 h-4 w-px bg-db-border" />
      <div className="hidden items-center gap-3 text-meta text-db-muted lg:flex">
        <span>{tagline}</span>
      </div>
      <div className="ml-auto flex items-center gap-3">
        {(links ?? [{ to: linkTo, label: linkLabel }]).map((l, i) => (
          <Link
            key={l.to}
            to={l.to}
            {...(isTv ? { "data-tv-focusable": true, tabIndex: -1 } : {})}
            className={`flex items-center gap-1 rounded border border-db-border/60 bg-db-subtle/40 px-2 py-1 text-meta text-db-tertiary transition-colors ${LINK_HOVER_CLASS[accent]}`}
          >
            {linkBack && i === 0 && <ArrowLeft size={10} />}
            {l.label}
          </Link>
        ))}
        {live && (
          <span className="flex items-center gap-1.5 text-meta text-emerald-400">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
            </span>
            实时行情
          </span>
        )}
        <span className="hidden text-meta text-db-tertiary md:inline" style={{ fontVariantNumeric: "tabular-nums" }}>
          {dateStr} 星期{week}
        </span>
        <span className="rounded border border-db-border/60 bg-db-subtle/40 px-2 py-px font-mono text-panel-title font-bold text-cyan-300">
          {hh}:{mm}{isTv ? "" : <span className="text-cyan-600">:{ss}</span>}
        </span>
        {githubUrl && (
          <a
            href={githubUrl}
            target="_blank"
            rel="noopener noreferrer"
            title={`GitHub 仓库${stars ? ` · ${stars} stars` : ""}`}
            className="flex h-[22px] items-center gap-1 rounded border border-db-border/60 bg-db-subtle/40 px-1.5 text-db-tertiary transition-colors hover:border-cyan-500/60 hover:text-cyan-300"
          >
            <Github size={12} />
            {stars !== null && (
              <span className="font-mono text-meta font-bold tabular-nums text-db-secondary">
                {stars}
              </span>
            )}
          </a>
        )}
        <button
          onClick={onToggleFullscreen}
          title={isFullscreen ? "退出全屏" : "全屏显示"}
          className="flex h-[22px] w-[22px] items-center justify-center rounded border border-db-border/60 bg-db-subtle/40 text-db-tertiary transition-colors hover:border-cyan-500/60 hover:text-cyan-300"
        >
          {isFullscreen ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
        </button>
      </div>
    </header>
  );
}

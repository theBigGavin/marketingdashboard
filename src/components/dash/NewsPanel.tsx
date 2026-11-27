import { useEffect, useMemo, useRef, useState } from "react";
import { Rss } from "lucide-react";
import { Panel, type PanelZoomProps } from "./Panel";
import { useSharedPolling } from "@/hooks/useSharedPolling";
import { api, type NewsItem } from "@/lib/api";
import { POLL } from "@/lib/intervals";
import { fmtTime } from "@/lib/format";
import { isTv } from "@/lib/tv";
import { MACRO_KEYWORDS, CHAINS } from "@/config/dashboard";
import { AsyncContent } from "./SharedUI";

/** 快讯关键词打标 */
function tagOf(item: NewsItem): { label: string; color: string } | null {
  const text = `${item.title}${item.content}`;
  for (const c of CHAINS) {
    if (c.keywords.some((k) => text.includes(k))) return { label: c.name, color: "#22d3ee" };
  }
  if (MACRO_KEYWORDS.some((k) => text.includes(k))) return { label: "宏观", color: "#fbbf24" };
  if (/央行|降准|降息|MLF|LPR/.test(text)) return { label: "政策", color: "#fbbf24" };
  return null;
}

function NewsRow({ item, isNew }: { item: NewsItem; isNew: boolean }) {
  const tag = tagOf(item);
  return (
    <article className={`rounded border-l-2 px-2.5 py-2 transition-colors ${isNew ? "border-cyan-400 bg-cyan-500/5" : "border-db-border/50 hover:bg-db-subtle/30"}`}>
      <div className="flex items-center gap-2">
        <span className="text-meta text-db-muted" style={{ fontVariantNumeric: "tabular-nums" }}>{fmtTime(item.time)}</span>
        {tag && (
          <span className="rounded-sm px-1 py-px text-caption" style={{ background: `${tag.color}22`, color: tag.color }}>
            {tag.label}
          </span>
        )}
        {isNew && <span className="rounded-sm bg-cyan-500/20 px-1 py-px text-caption text-cyan-300">NEW</span>}
      </div>
      {item.title && <h3 className="mt-1 text-panel-title font-semibold leading-5 text-db-primary">{item.title}</h3>}
      <p className={`mt-0.5 text-body leading-[1.55] text-db-tertiary ${item.title ? "line-clamp-2" : ""}`}>{item.content}</p>
    </article>
  );
}

/** 7x24 实时快讯 */
export function NewsPanel({ className = "", ...zoomProps }: { className?: string } & PanelZoomProps) {
  const { data, error } = useSharedPolling<NewsItem[]>("news:60", () => api.news(60), POLL.NEWS);
  const [newIds, setNewIds] = useState<Set<number>>(new Set());
  const seenRef = useRef<Set<number>>(new Set());
  const [autoScroll, setAutoScroll] = useState(true);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!data) return;
    const fresh = data.filter((d) => !seenRef.current.has(d.id)).map((d) => d.id);
    if (seenRef.current.size > 0 && fresh.length) {
      setNewIds(new Set(fresh));
      if (autoScroll) boxRef.current?.scrollTo({ top: 0, behavior: "smooth" });
    }
    data.forEach((d) => seenRef.current.add(d.id));
  }, [data, autoScroll]);

  const todayCount = useMemo(() => data?.length ?? 0, [data]);

  return (
    <Panel
      className={className}
      {...zoomProps}
      title="实时热点 · 7×24 快讯"
      icon={<Rss size={14} />}
      accent="#f472b6"
      right={
        <label className="flex cursor-pointer items-center gap-1.5 text-meta text-db-tertiary">
          <input type="checkbox" checked={autoScroll} onChange={(e) => setAutoScroll(e.target.checked)} className="accent-cyan-400" />
          自动滚动 · {todayCount}条
        </label>
      }
    >
      <div ref={boxRef} className="h-full space-y-1 overflow-y-auto scroll-smooth p-1.5">
        {/* TV 弱 GPU: 滚动层全量光栅化, 60条压到25条 */}
        <AsyncContent loading={!data && !error} error={error || null} empty={false} onRetry={() => {}}>
          {(isTv ? data?.slice(0, 25) : data)?.map((item) => <NewsRow key={item.id} item={item} isNew={newIds.has(item.id)} />)}
        </AsyncContent>
      </div>
    </Panel>
  );
}

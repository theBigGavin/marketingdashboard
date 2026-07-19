import { useMemo, useState } from "react";
import { Panel, type PanelZoomProps } from "./Panel";
import { QuoteRow } from "./QuoteRow";
import { usePolling } from "@/hooks/usePolling";
import { api, type Quote } from "@/lib/api";
import { canonBoardName, unionBoards } from "@/lib/boards";
import { CHAINS } from "@/config/dashboard";
import { clsChg, fmtPct, fmtTime, fmtWan } from "@/lib/format";

const TNUM = { fontVariantNumeric: "tabular-nums" } as const;

function StockCell({ code, name, tag, q }: { code: string; name: string; tag?: string; q?: Quote }) {
  return (
    <QuoteRow
      code={code}
      name={name}
      tag={tag}
      price={q?.price}
      pct={q?.pct}
      amount={q && q.amount > 0 ? fmtWan(q.amount) : undefined}
      turnover={q && q.turnover > 0 ? `${q.turnover.toFixed(1)}%` : undefined}
      spark
      boards
      flow
      variant="card"
    />
  );
}

/** 产业链上下游全景 */
export function ChainPanel({ className = "", ...zoomProps }: { className?: string } & PanelZoomProps) {
  const [chainId, setChainId] = useState(CHAINS[0].id);
  const chain = CHAINS.find((c) => c.id === chainId)!;

  const codes = useMemo(() => chain.segments.flatMap((s) => s.stocks.map((x) => x.code)), [chain]);
  const { data: quotes } = usePolling(() => api.quotes(codes), 8000, [chainId]);
  const { data: news } = usePolling(() => api.news(60), 20000);
  // 行业+概念双口径合并榜单(适配层统一归一化)
  const { data: boards } = usePolling(() => unionBoards(40), 25000);

  const chainNews = useMemo(() => {
    if (!news) return [];
    return news.filter((n) => chain.keywords.some((k) => `${n.title}${n.content}`.includes(k))).slice(0, 10);
  }, [news, chain]);

  /** 与产业链关联的板块热度(行业/概念双口径,归一化名称匹配) */
  const relatedBoards = useMemo(() => {
    if (!boards) return [];
    const keys = chain.keywords.map(canonBoardName);
    return boards
      .filter((b) => keys.some((k) => b.cname.includes(k) || k.includes(b.cname)))
      .sort((a, b) => b.pct - a.pct)
      .slice(0, 8);
  }, [boards, chain]);

  return (
    <Panel
      className={className}
      {...zoomProps}
      title="产业链上下游全景"
      icon="⛓"
      accent="#34d399"
      right={
        <div className="flex items-center gap-1">
          {CHAINS.map((c) => (
            <button
              key={c.id}
              onClick={() => setChainId(c.id)}
              className={`rounded px-2 py-0.5 text-[11px] transition-colors ${
                chainId === c.id ? "bg-emerald-500/20 font-semibold text-emerald-300" : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <span className="mr-1 opacity-70">{c.icon}</span>{c.name}
            </button>
          ))}
        </div>
      }
    >
      <div className="flex h-full min-h-0">
        {/* 上中下游三段 */}
        <div className="grid min-w-0 flex-1 grid-cols-3 gap-2 p-2" style={{ gridTemplateRows: "1fr auto" }}>
          {chain.segments.map((seg, si) => (
            <div key={seg.name} className="flex min-h-0 flex-col">
              <div className="mb-1.5 flex items-center gap-1.5">
                <span className={`flex h-4.5 w-4.5 items-center justify-center rounded text-[10px] font-bold ${
                  si === 0 ? "bg-sky-500/20 text-sky-300" : si === 1 ? "bg-violet-500/20 text-violet-300" : "bg-amber-500/20 text-amber-300"
                }`} style={{ height: 18, width: 18 }}>
                  {["上", "中", "下"][si]}
                </span>
                <div className="min-w-0">
                  <span className="text-[11px] font-semibold text-slate-200">{seg.name}</span>
                  <span className="ml-1.5 hidden text-[9px] text-slate-500 xl:inline">{seg.desc}</span>
                </div>
              </div>
              <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto">
                {seg.stocks.map((st) => (
                  <StockCell key={st.code} code={st.code} name={st.name} tag={st.tag} q={quotes?.[st.code]} />
                ))}
              </div>
            </div>
          ))}
          {/* 关联板块热度 */}
          {relatedBoards.length > 0 && (
            <div className="col-span-3 rounded border border-slate-700/25 bg-slate-800/10 px-2.5 py-1.5">
              <span className="mr-3 text-[10px] font-semibold text-slate-400">关联板块热度</span>
              <span className="inline-flex flex-wrap gap-x-4 gap-y-0.5">
                {relatedBoards.map((b) => (
                  <span key={b.code} className="text-[10px]" style={TNUM}>
                    <span
                      className={`mr-1 rounded-sm px-1 py-px text-[8px] ${
                        b.kind === "industry" ? "bg-cyan-500/15 text-cyan-400" : "bg-violet-500/15 text-violet-400"
                      }`}
                    >
                      {b.kind === "industry" ? "行业" : "概念"}
                    </span>
                    <span className="text-slate-300">{b.name}</span>
                    <span className={`ml-1 font-semibold ${clsChg(b.pct)}`}>{fmtPct(b.pct)}</span>
                    <span className="ml-1 text-[9px] text-slate-600">{b.leadName}</span>
                  </span>
                ))}
              </span>
            </div>
          )}
        </div>

        {/* 右侧:关键技术 + 行业快讯 */}
        <div className="flex w-[300px] shrink-0 flex-col border-l border-slate-700/40">
          <div className="border-b border-slate-700/40 p-2">
            <div className="mb-1 text-[10px] font-semibold text-slate-300">行业关键技术</div>
            <div className="flex flex-wrap gap-1">
              {chain.tech.map((t) => (
                <span key={t} className="rounded border border-emerald-500/25 bg-emerald-500/10 px-1.5 py-px text-[9px] text-emerald-300">
                  {t}
                </span>
              ))}
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
            <div className="mb-1 px-0.5 text-[10px] font-semibold text-slate-300">
              行业热点新闻 <span className="ml-1 text-[9px] font-normal text-slate-500">关键词匹配 · {chainNews.length}条</span>
            </div>
            <div className="space-y-0.5">
              {chainNews.map((n) => (
                <div key={n.id} className="rounded px-1.5 py-1 hover:bg-slate-800/40">
                  <div className="text-[9px] text-slate-500" style={TNUM}>{fmtTime(n.time)}</div>
                  <div className="mt-0.5 text-[10px] leading-[1.5] text-slate-300 line-clamp-2">
                    {n.title ? <span className="font-semibold text-slate-200">{n.title} </span> : null}
                    {n.content}
                  </div>
                </div>
              ))}
              {news && chainNews.length === 0 && (
                <div className="p-4 text-center text-[10px] text-slate-600">当前快讯流中暂无该产业链相关新闻</div>
              )}
              {!news && <div className="p-4 text-center text-[10px] text-slate-600">加载中…</div>}
            </div>
          </div>
        </div>
      </div>
    </Panel>
  );
}

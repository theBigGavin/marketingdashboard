import { useMemo, useState } from "react";
import { Panel, type PanelZoomProps } from "./Panel";
import { QuoteRow } from "./QuoteRow";
import { usePolling } from "@/hooks/usePolling";
import { api, type MysteryStock, type Quote } from "@/lib/api";
import { canonBoardName, unionBoards } from "@/lib/boards";
import { CHAINS } from "@/config/dashboard";
import type { ChainStock } from "@/config/dashboard";
import { clsChg, fmtPct, fmtTime, fmtWan } from "@/lib/format";

const TNUM = { fontVariantNumeric: "tabular-nums" } as const;
const CHAIN_OVERRIDES_KEY = "market-dashboard.chain-overrides.v2";

function loadJson<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try { const raw = window.localStorage.getItem(key); return raw ? JSON.parse(raw) as T : fallback; } catch { return fallback; }
}
function saveJson(key: string, value: unknown) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, JSON.stringify(value));
}

function marketCode(code: string) {
  const raw = String(code || "").trim().toLowerCase();
  if (/^(hk|us)/.test(raw)) return "";
  const c = raw.replace(/\D/g, "").slice(-6).padStart(6, "0");
  if (!c || c === "000000") return "";
  if (/^6/.test(c)) return `sh${c}`;
  if (/^[03]/.test(c)) return `sz${c}`;
  if (/^[489]/.test(c)) return `bj${c}`;
  return c;
}
function toChainStock(row: MysteryStock, tag: string): ChainStock | null {
  const code = marketCode(row.code);
  if (!code) return null;
  return { code, name: row.name, tag };
}

function StockCell({ code, name, tag, q }: { code: string; name: string; tag?: string; q?: Quote }) {
  return (
    <QuoteRow code={code} name={name} tag={tag}
      price={q?.price} pct={q?.pct}
      amount={q && q.amount > 0 ? fmtWan(q.amount) : undefined}
      turnover={q && q.turnover > 0 ? `${q.turnover.toFixed(1)}%` : undefined}
      spark boards flow variant="card" />
  );
}

export function ChainPanel({ className = "", ...zoomProps }: { className?: string } & PanelZoomProps) {
  const [chainId, setChainId] = useState(CHAINS[0].id);
  const [refreshTick, setRefreshTick] = useState(0);
  const [chainOverrides, setChainOverrides] = useState<Record<string, { segments: { stocks: ChainStock[] }[] }>>(() => loadJson(CHAIN_OVERRIDES_KEY, {}));
  const [editor, setEditor] = useState<{ mode: "add" | "update"; name: string; content: string } | null>(null);
  const [parseState, setParseState] = useState<{ loading: boolean; error: string; warnings: string[] }>({ loading: false, error: "", warnings: [] });

  const mergedChains = useMemo(() =>
    CHAINS.map((c) => {
      if (!chainOverrides[c.id]) return c;
      const segments = c.segments.map((seg, si) => {
        const ov = chainOverrides[c.id!].segments[si];
        return { ...seg, stocks: ov?.stocks || seg.stocks };
      });
      return { ...c, segments };
    }), [chainOverrides]
  );
  const chain = mergedChains.find((c) => c.id === chainId) || mergedChains[0];

  const { data: dynamicData } = usePolling(async () => {
    const segments: { name: string; source: string; stocks: ChainStock[] }[] = [];
    for (const seg of chain.segments) {
      const fallback = seg.stocks || [];
      if (!seg.query || refreshTick === 0) { segments.push({ name: seg.name, source: "local", stocks: fallback }); continue; }
      try {
        const result = await api.mysterySelect(seg.query, 36, true);
        const stocks = result.rows.map((row) => toChainStock(row, seg.desc?.split("·")?.[0]?.trim() || seg.name)).filter((s): s is ChainStock => s !== null).slice(0, 10);
        segments.push({ name: seg.name, source: stocks.length > 0 ? "iwencai" : "local", stocks: stocks.length > 0 ? stocks : fallback });
      } catch { segments.push({ name: seg.name, source: "local", stocks: fallback }); }
    }
    return segments;
  }, 30 * 60 * 1000, [chainId, refreshTick]);

  const segmentData = useMemo(() => dynamicData || chain.segments.map((seg) => ({ name: seg.name, source: "local" as const, stocks: seg.stocks || [] })), [dynamicData, chain]);

  const codes = useMemo(() => segmentData.flatMap((s) => s.stocks.map((x) => x.code)), [segmentData]);
  const { data: quotes } = usePolling(() => api.quotes(codes), 8000, [chainId]);
  const { data: news } = usePolling(() => api.news(60), 20000);
  const { data: boards } = usePolling(() => unionBoards(40), 25000);

  const chainNews = useMemo(() => {
    if (!news) return [];
    return news.filter((n) => chain.keywords.some((k) => `${n.title}${n.content}`.includes(k))).slice(0, 10);
  }, [news, chain]);
  const relatedBoards = useMemo(() => {
    if (!boards) return [];
    const keys = chain.keywords.map(canonBoardName);
    return boards.filter((b) => keys.some((k) => b.cname.includes(k) || k.includes(b.cname))).sort((a, b) => b.pct - a.pct).slice(0, 8);
  }, [boards, chain]);

  const submitEditor = async () => {
    if (!editor || parseState.loading) return;
    const name = editor.name.trim(), contentText = editor.content.trim();
    if (!name || !contentText) { setParseState({ loading: false, error: "请填写产业链标题并粘贴问财内容。", warnings: [] }); return; }
    setParseState({ loading: true, error: "", warnings: [] });
    try {
      const parsed = await api.parseChain(name, contentText);
      const segments = chain.segments.map((seg, si) => ({
        ...seg, stocks: parsed.segments[si]?.stocks.map((s) => ({ code: s.code, name: s.name, tag: seg.desc?.split("·")?.[0]?.trim() || seg.name })) || seg.stocks,
      }));
      setChainOverrides((prev) => { const next = { ...prev, [chain.id]: { segments } }; saveJson(CHAIN_OVERRIDES_KEY, next); return next; });
      setRefreshTick((x) => x + 1);
      setParseState({ loading: false, error: "", warnings: parsed.warnings || [] });
      setEditor(null);
    } catch (e) { setParseState({ loading: false, error: String(e instanceof Error ? e.message : e), warnings: [] }); }
  };

  const autoFetchChain = async () => {
    if (!editor || parseState.loading) return;
    if (!chain.segments.some((s) => s.query)) {
      setParseState({ loading: false, error: "该产业链未配置问财查询语", warnings: [] });
      return;
    }
    setParseState({ loading: true, error: "", warnings: [] });
    const lines: string[] = [`${chain.name}产业链\n`];
    let total = 0;
    for (const seg of chain.segments) {
      if (!seg.query) { lines.push(`\n${seg.name}：\n（未配置问财查询语）\n`); continue; }
      try {
        const result = await api.mysterySelect(seg.query, 12, true);
        const rows = result.rows || [];
        if (rows.length === 0) { lines.push(`\n${seg.name}：\n（问财未返回）\n`); continue; }
        const stockText = rows.slice(0, 10).map((r) => `${r.name}（${r.code}）`).join("、");
        lines.push(`\n${seg.name}：\n${stockText}\n`);
        total += Math.min(rows.length, 10);
      } catch { lines.push(`\n${seg.name}：\n（查询失败）\n`); }
    }
    lines.push(`\n核心逻辑：${chain.name}产业链\n数据来源：同花顺问财 | 分段查询`);
    setEditor((cur) => cur && { ...cur, content: lines.join("\n") });
    setParseState({ loading: false, error: "", warnings: [`已从问财获取 ${total} 只股票，按环节分段展示。请核验后点击「整理并保存」`] });
  };

  return (
    <>
      <Panel
        className={className}
        {...zoomProps}
        title="产业链上下游全景"
        icon="⛓"
        accent="#34d399"
        right={
          <div className="flex items-center gap-1">
            {mergedChains.map((c) => (
              <button key={c.id} onClick={() => setChainId(c.id)}
                className={`rounded px-2 py-0.5 text-[11px] transition-colors ${chainId === c.id ? "bg-emerald-500/20 font-semibold text-emerald-300" : "text-slate-400 hover:text-slate-200"}`}>
                <span className="mr-1 opacity-70">{c.icon}</span>{c.name}
              </button>
            ))}
            <button onClick={() => { setParseState({ loading: false, error: "", warnings: [] }); setEditor({ mode: "update", name: chain.name, content: "" }); }}
              className="rounded border border-cyan-500/25 bg-cyan-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-cyan-300 transition hover:border-cyan-400/50 hover:bg-cyan-500/20"
              title="粘贴问财结论，更新当前产业链股票">更新</button>
          </div>
        }
      >
        <div className="flex h-full min-h-0">
          <div className="grid min-w-0 flex-1 grid-cols-3 gap-2 p-2" style={{ gridTemplateRows: "1fr auto" }}>
            {chain.segments.map((seg, si) => {
              const current = segmentData[si];
              const stocks = current?.stocks || seg.stocks || [];
              return (
                <div key={seg.name} className="flex min-h-0 flex-col">
                  <div className="mb-1.5 flex items-center gap-1.5">
                    <span className={`flex h-4.5 w-4.5 items-center justify-center rounded text-[10px] font-bold ${si === 0 ? "bg-sky-500/20 text-sky-300" : si === 1 ? "bg-violet-500/20 text-violet-300" : "bg-amber-500/20 text-amber-300"}`} style={{ height: 18, width: 18 }}>
                      {["上", "中", "下"][si]}
                    </span>
                    <div className="min-w-0">
                      <span className="text-[11px] font-semibold text-slate-200">{seg.name}</span>
                      <span className="ml-1.5 hidden text-[9px] text-slate-500 xl:inline">{seg.desc}</span>
                      {current?.source === "iwencai" && <span className="ml-1 text-[8px] text-emerald-500/60">问财</span>}
                      {chainOverrides[chain.id] && <span className="ml-1 text-[8px] text-cyan-500/60">编辑</span>}
                    </div>
                  </div>
                  <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto">
                    {!dynamicData && seg.query && refreshTick > 0 && <div className="flex h-9 items-center justify-center rounded border border-slate-700/30 bg-slate-800/15 text-[10px] text-slate-500">问财筛选中...</div>}
                    {stocks.map((st) => (<StockCell key={st.code} code={st.code} name={st.name} tag={st.tag} q={quotes?.[st.code]} />))}
                    {dynamicData && stocks.length === 0 && <div className="flex h-9 items-center justify-center rounded border border-slate-700/30 bg-slate-800/15 text-[10px] text-slate-500">暂无匹配股票</div>}
                  </div>
                </div>
              );
            })}
            {relatedBoards.length > 0 && (
              <div className="col-span-3 rounded border border-slate-700/25 bg-slate-800/10 px-2.5 py-1.5">
                <span className="mr-3 text-[10px] font-semibold text-slate-400">关联板块热度</span>
                <span className="inline-flex flex-wrap gap-x-4 gap-y-0.5">
                  {relatedBoards.map((b) => (
                    <span key={b.code} className="text-[10px]" style={TNUM}>
                      <span className={`mr-1 rounded-sm px-1 py-px text-[8px] ${b.kind === "industry" ? "bg-cyan-500/15 text-cyan-400" : "bg-violet-500/15 text-violet-400"}`}>{b.kind === "industry" ? "行业" : "概念"}</span>
                      <span className="text-slate-300">{b.name}</span>
                      <span className={`ml-1 font-semibold ${clsChg(b.pct)}`}>{fmtPct(b.pct)}</span>
                      <span className="ml-1 text-[9px] text-slate-600">{b.leadName}</span>
                    </span>
                  ))}
                </span>
              </div>
            )}
          </div>
          <div className="flex w-[300px] shrink-0 flex-col border-l border-slate-700/40">
            <div className="border-b border-slate-700/40 p-2">
              <div className="mb-1 text-[10px] font-semibold text-slate-300">行业关键技术</div>
              <div className="flex flex-wrap gap-1">{chain.tech.map((t) => (<span key={t} className="rounded border border-emerald-500/25 bg-emerald-500/10 px-1.5 py-px text-[9px] text-emerald-300">{t}</span>))}</div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
              <div className="mb-1 px-0.5 text-[10px] font-semibold text-slate-300">行业热点新闻 <span className="ml-1 text-[9px] font-normal text-slate-500">关键词匹配 · {chainNews.length}条</span></div>
              <div className="space-y-0.5">
                {chainNews.map((n) => (
                  <div key={n.id} className="rounded px-1.5 py-1 hover:bg-slate-800/40">
                    <div className="text-[9px] text-slate-500" style={TNUM}>{fmtTime(n.time)}</div>
                    <div className="mt-0.5 text-[10px] leading-[1.5] text-slate-300 line-clamp-2">
                      {n.title ? <span className="font-semibold text-slate-200">{n.title} </span> : null}{n.content}
                    </div>
                  </div>
                ))}
                {news && chainNews.length === 0 && <div className="p-4 text-center text-[10px] text-slate-600">当前快讯流中暂无该产业链相关新闻</div>}
                {!news && <div className="p-4 text-center text-[10px] text-slate-600">加载中…</div>}
              </div>
            </div>
          </div>
        </div>
      </Panel>

      {editor && (
        <div className="fixed inset-0 z-[75] flex items-center justify-center bg-black/65 p-4 backdrop-blur-sm" role="dialog" aria-modal="true">
          <div className="flex max-h-[86vh] w-[640px] max-w-[96vw] flex-col rounded-md border border-cyan-400/35 bg-[#0a1220] shadow-[0_0_42px_rgba(34,211,238,0.18)]">
            <div className="flex items-center justify-between border-b border-slate-700/45 px-4 py-3">
              <div>
                <div className="text-[16px] font-semibold text-slate-100">更新产业链股票库</div>
                <div className="mt-0.5 text-[12px] text-slate-500">粘贴问财结论，或点击「从问财获取」自动查询。</div>
              </div>
              <button type="button" onClick={() => setEditor(null)} className="rounded px-2 py-1 text-[14px] text-slate-400 transition hover:bg-slate-800 hover:text-slate-100">关闭</button>
            </div>
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
              <label className="block">
                <span className="mb-1 block text-[13px] font-semibold text-slate-300">产业链标题</span>
                <input value={editor.name} readOnly className="h-9 w-full rounded border border-slate-700 bg-slate-950/80 px-3 text-[14px] text-slate-100 outline-none" />
              </label>
              <div className="flex justify-end">
                <button type="button" onClick={autoFetchChain} disabled={parseState.loading}
                  className="rounded border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-[12px] font-semibold text-emerald-300 transition hover:bg-emerald-500/20 disabled:opacity-50">
                  {parseState.loading ? "查询中..." : "从问财获取"}
                </button>
              </div>
              <label className="block">
                <span className="mb-1 block text-[13px] font-semibold text-slate-300">问财结论内容</span>
                <textarea value={editor.content} onChange={(e) => setEditor((cur) => cur && { ...cur, content: e.target.value })}
                  placeholder="从问财获取结果会自动填充到这里，也可以手动粘贴"
                  className="h-[240px] w-full resize-none rounded border border-slate-700 bg-slate-950/80 px-3 py-2 text-[13px] leading-6 text-slate-200 outline-none transition placeholder:text-slate-600 focus:border-cyan-400/70" />
              </label>
              {parseState.error && <div className="rounded border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-[12px] text-rose-300">{parseState.error}</div>}
              {parseState.warnings.map((w, i) => <div key={i} className="rounded border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-[12px] text-amber-300">{w}</div>)}
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-700/45 px-4 py-3">
              <button type="button" onClick={() => setEditor(null)} className="rounded border border-slate-700 px-3 py-1.5 text-[13px] text-slate-300 transition hover:bg-slate-800">取消</button>
              <button type="button" onClick={submitEditor} disabled={parseState.loading}
                className="rounded border border-cyan-400/50 bg-cyan-500/15 px-3 py-1.5 text-[13px] font-semibold text-cyan-200 transition hover:bg-cyan-500/25 disabled:opacity-50">
                {parseState.loading ? "处理中..." : "整理并保存"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

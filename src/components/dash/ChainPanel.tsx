import { useMemo, useState } from "react";
import { Link } from "lucide-react";
import { Panel, type PanelZoomProps } from "./Panel";
import { QuoteRow } from "./QuoteRow";
import { usePolling } from "@/hooks/usePolling";
import { useSharedPolling } from "@/hooks/useSharedPolling";
import { useQuote } from "@/lib/market";
import { api, type MysteryStock, type NewsItem } from "@/lib/api";
import { POLL } from "@/lib/intervals";
import { canonBoardName, unionBoards } from "@/lib/boards";
import { CHAINS } from "@/config/dashboard";
import type { Chain, ChainStock } from "@/config/dashboard";
import { clsChg, fmtPct, fmtTime, fmtTurnover, fmtWan, TNUM } from "@/lib/format";
import { toMarketCode } from "@/lib/code";
import { loadJson, saveJson } from "@/lib/storage";
import { buildChainFromParse, updateChainSegments } from "./chain-utils";
import { ChainEditorDialog } from "./ChainEditorDialog";
import type { ChainEditorState, ChainParseState } from "./ChainEditorDialog";

const CHAIN_OVERRIDES_KEY = "market-dashboard.chain-overrides.v2";
const CUSTOM_CHAINS_KEY = "market-dashboard.custom-chains";
function toChainStock(row: MysteryStock, tag: string): ChainStock | null {
  const code = toMarketCode(row.code);
  if (!code) return null;
  return { code, name: row.name, tag };
}

function StockCell({ code, name, tag }: { code: string; name: string; tag?: string }) {
  // 报价取自统一报价中心(与其他面板同帧)
  const q = useQuote(code);
  return (
    <QuoteRow code={code} name={name} tag={tag}
      amount={q?.amount && q.amount > 0 ? fmtWan(q.amount) : undefined}
      turnover={fmtTurnover(q?.turnover)}
      spark boards flow variant="card" />
  );
}

export function ChainPanel({ className = "", ...zoomProps }: { className?: string } & PanelZoomProps) {
  const [customChains, setCustomChains] = useState<Chain[]>(() => loadJson(CUSTOM_CHAINS_KEY, []));
  const [chainId, setChainId] = useState(CHAINS[0].id);
  const [refreshTick, setRefreshTick] = useState(0);
  const [chainOverrides, setChainOverrides] = useState<Record<string, { segments: { stocks: ChainStock[] }[] }>>(() => loadJson(CHAIN_OVERRIDES_KEY, {}));
  const [editor, setEditor] = useState<ChainEditorState>(null);
  const [parseState, setParseState] = useState<ChainParseState>({ loading: false, error: "", warnings: [] });

  // 合并内置链 + 自定义链（编辑覆盖）
  const mergedChains = useMemo(() =>
    CHAINS.map((c) => {
      if (!chainOverrides[c.id]) return c;
      const segments = c.segments.map((seg, si) => {
        const ov = chainOverrides[c.id].segments[si];
        return { ...seg, stocks: ov?.stocks || seg.stocks };
      });
      return { ...c, segments };
    }), [chainOverrides]
  );
  const allChains = useMemo(() => [...mergedChains, ...customChains], [mergedChains, customChains]);
  const chain = allChains.find((c) => c.id === chainId) || allChains[0];

  const { data: dynamicData } = usePolling(async () => {
    const segments: { name: string; source: string; stocks: ChainStock[] }[] = [];
    for (const seg of chain.segments) {
      const fallback = seg.stocks || [];
      if (!seg.query || refreshTick === 0) { segments.push({ name: seg.name, source: "local", stocks: fallback }); continue; }
      try {
        const result = await api.mysterySelect(seg.query, 36, { refresh: true });
        const stocks = result.rows.map((row) => toChainStock(row, seg.desc?.split("·")?.[0]?.trim() || seg.name)).filter((s): s is ChainStock => s !== null).slice(0, 10);
        segments.push({ name: seg.name, source: stocks.length > 0 ? "iwencai" : "local", stocks: stocks.length > 0 ? stocks : fallback });
      } catch { segments.push({ name: seg.name, source: "local", stocks: fallback }); }
    }
    return { chainId, segments };
  }, 30 * 60 * 1000, [chainId, refreshTick]);

  // 切链期间 dynamicData 仍是上一条链的数据: 仅 chainId 匹配才采用, 否则回退本地静态股票
  const dynMatched = dynamicData?.chainId === chainId;
  const segmentData = useMemo(
    () =>
      (dynMatched && dynamicData ? dynamicData.segments : null) ||
      chain.segments.map((seg) => ({ name: seg.name, source: "local" as const, stocks: seg.stocks || [] })),
    [dynMatched, dynamicData, chain]
  );

  const { data: news } = useSharedPolling<NewsItem[]>("news:60", () => api.news(60), POLL.NEWS);
  const { data: boards } = usePolling(() => unionBoards(40), POLL.CHAIN_BOARDS);

  const chainNews = useMemo(() => {
    if (!news) return [];
    return news.filter((n) => chain.keywords.some((k) => `${n.title}${n.content}`.includes(k))).slice(0, 10);
  }, [news, chain]);
  const relatedBoards = useMemo(() => {
    if (!boards) return [];
    const keys = chain.keywords.map(canonBoardName);
    return boards.filter((b) => keys.some((k) => b.cname.includes(k) || k.includes(b.cname))).sort((a, b) => b.pct - a.pct).slice(0, 8);
  }, [boards, chain]);

  // 编辑保存（更新已有链）
  const submitEditor = async () => {
    if (!editor || parseState.loading) return;
    const name = editor.name.trim(), contentText = editor.content.trim();
    if (!name || !contentText) { setParseState({ loading: false, error: "请填写产业链标题并粘贴问财内容。", warnings: [] }); return; }
    setParseState({ loading: true, error: "", warnings: [] });
    try {
      const parsed = await api.parseChain(name, contentText);
      if (editor.mode === "add") {
        // 创建新自定义链(纯函数)
        const newChain: Chain = buildChainFromParse(name, parsed);
        if (newChain.segments.length === 0) throw new Error("未解析出有效环节，请检查内容格式");
        const next = [...customChains, newChain];
        setCustomChains(next);
        saveJson(CUSTOM_CHAINS_KEY, next);
        setChainId(newChain.id);
        setParseState({ loading: false, error: "", warnings: parsed.warnings || [] });
        setEditor(null);
      } else {
        // 更新已有链的股票(纯函数); 先算 next 再 setState + saveJson(与 add 分支一致, 避免 updater 内副作用)
        const segments = updateChainSegments(chain.segments, parsed);
        const next = { ...chainOverrides, [chain.id]: { segments } };
        setChainOverrides(next);
        saveJson(CHAIN_OVERRIDES_KEY, next);
        setRefreshTick((x) => x + 1);
        setParseState({ loading: false, error: "", warnings: parsed.warnings || [] });
        setEditor(null);
      }
    } catch (e) { setParseState({ loading: false, error: String(e instanceof Error ? e.message : e), warnings: [] }); }
  };

  const autoFetchChain = async () => {
    if (!editor || parseState.loading) return;
    // add 模式: 问财选股只理解简单概念词, 用名称直接查询, 分段由用户人工整理
    if (editor.mode === "add") {
      const base = editor.name.trim().replace(/产业链\s*$/, "");
      if (!base) { setParseState({ loading: false, error: "请先填写产业链名称。", warnings: [] }); return; }
      setParseState({ loading: true, error: "", warnings: [] });
      try {
        const result = await api.mysterySelect(base, 30, { refresh: true });
        const rows = result.rows || [];
        if (rows.length === 0) throw new Error("问财未返回匹配股票，请换个名称或手动粘贴内容");
        const stockText = rows.slice(0, 30).map((r) => `${r.name}（${r.code}）`).join("、");
        setEditor((cur) => cur && { ...cur, content: `${base}产业链\n\n${stockText}\n\n核心逻辑：${base}产业链\n数据来源：同花顺问财` });
        setParseState({ loading: false, error: "", warnings: [`已获取 ${Math.min(rows.length, 30)} 只候选股，请按上游/中游/下游手动分段（参照上方格式示例），再点击「创建并保存」`] });
      } catch (e) {
        setParseState({ loading: false, error: `问财查询失败：${e instanceof Error ? e.message : e}`, warnings: [] });
      }
      return;
    }
    // update 模式: 用各环节配置的查询语分段获取
    if (!chain.segments.some((s) => s.query)) {
      setParseState({ loading: false, error: "该产业链未配置问财查询语", warnings: [] });
      return;
    }
    setParseState({ loading: true, error: "", warnings: [] });
    const lines: string[] = [`${chain.name}产业链\n`];
    let total = 0;
    let firstError = "";
    for (const seg of chain.segments) {
      if (!seg.query) { lines.push(`\n${seg.name}：\n（未配置问财查询语）\n`); continue; }
      try {
        const result = await api.mysterySelect(seg.query, 12, { refresh: true });
        const rows = result.rows || [];
        if (rows.length === 0) { lines.push(`\n${seg.name}：\n（问财未返回）\n`); continue; }
        const stockText = rows.slice(0, 10).map((r) => `${r.name}（${r.code}）`).join("、");
        lines.push(`\n${seg.name}：\n${stockText}\n`);
        total += Math.min(rows.length, 10);
      } catch (e) {
        if (!firstError) firstError = e instanceof Error ? e.message : String(e);
        lines.push(`\n${seg.name}：\n（查询失败）\n`); }
    }
    if (total === 0 && firstError) {
      setParseState({ loading: false, error: `问财查询失败：${firstError}`, warnings: [] });
      return;
    }
    lines.push(`\n核心逻辑：${chain.name}产业链\n数据来源：同花顺问财 | 分段查询`);
    setEditor((cur) => cur && { ...cur, content: lines.join("\n") });
    setParseState({ loading: false, error: "", warnings: [`已从问财获取 ${total} 只股票，按环节分段展示。请核验后点击「整理并保存」`] });
  };

  const deleteCustomChain = (id: string) => {
    const next = customChains.filter((c) => c.id !== id);
    setCustomChains(next);
    saveJson(CUSTOM_CHAINS_KEY, next);
    if (chainId === id) setChainId(allChains[0]?.id || CHAINS[0].id);
  };

  return (
    <>
      <Panel
        className={className}
        {...zoomProps}
        title="产业链上下游全景"
        icon={<Link size={14} />}
        accent="#34d399"
        right={
          <div className="flex items-center gap-1">
            {allChains.map((c) => (
              <div key={c.id} className="group relative">
                <button onClick={() => setChainId(c.id)}
                  className={`rounded px-2 py-0.5 text-body transition-colors ${chainId === c.id ? "bg-emerald-500/20 font-semibold text-emerald-300" : "text-db-tertiary hover:text-db-primary"}`}>
                  <span className="mr-1 opacity-70">{c.icon}</span>{c.name}
                </button>
                {/* 自定义链显示删除按钮 */}
                {c.id.startsWith("custom_") && (
                  <button onClick={() => deleteCustomChain(c.id)}
                    className="absolute -right-1 -top-1 hidden h-3.5 w-3.5 items-center justify-center rounded-full bg-rose-500/80 text-micro leading-none text-white group-hover:flex"
                    title="删除此产业链">&times;</button>
                )}
              </div>
            ))}
            <button onClick={() => { setParseState({ loading: false, error: "", warnings: [] }); setEditor({ mode: "add", name: "", content: "" }); }}
              className="rounded border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 text-meta font-semibold text-emerald-300 transition hover:border-emerald-400/60 hover:bg-emerald-500/20"
              title="添加自定义产业链">+ 添加</button>
            <button onClick={() => { setParseState({ loading: false, error: "", warnings: [] }); setEditor({ mode: "update", name: chain.name, content: "" }); }}
              className="rounded border border-cyan-500/25 bg-cyan-500/10 px-1.5 py-0.5 text-meta font-semibold text-cyan-300 transition hover:border-cyan-400/50 hover:bg-cyan-500/20"
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
                    <span className={`flex h-4.5 w-4.5 items-center justify-center rounded text-meta font-bold ${si === 0 ? "bg-sky-500/20 text-sky-300" : si === 1 ? "bg-violet-500/20 text-violet-300" : "bg-amber-500/20 text-amber-300"}`} style={{ height: 18, width: 18 }}>
                      {["上", "中", "下"][si] || si + 1}
                    </span>
                    <div className="min-w-0">
                      <span className="text-body font-semibold text-db-primary">{seg.name}</span>
                      <span className="ml-1.5 hidden text-caption text-db-muted xl:inline">{seg.desc}</span>
                      {current?.source === "iwencai" && <span className="ml-1 text-micro text-emerald-500/60">问财</span>}
                      {chainOverrides[chain.id] && <span className="ml-1 text-micro text-cyan-500/60">编辑</span>}
                    </div>
                  </div>
                  <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto">
                    {!dynMatched && seg.query && refreshTick > 0 && <div className="flex h-9 items-center justify-center rounded border border-db-border/30 bg-db-subtle/15 text-meta text-db-muted">问财筛选中...</div>}
                    {stocks.map((st) => (<StockCell key={st.code} code={st.code} name={st.name} tag={st.tag} />))}
                    {dynMatched && stocks.length === 0 && <div className="flex h-9 items-center justify-center rounded border border-db-border/30 bg-db-subtle/15 text-meta text-db-muted">暂无匹配股票</div>}
                  </div>
                </div>
              );
            })}
            {relatedBoards.length > 0 && (
              <div className="col-span-3 rounded border border-db-border/25 bg-db-subtle/10 px-2.5 py-1.5">
                <span className="mr-3 text-meta font-semibold text-db-tertiary">关联板块热度</span>
                <span className="inline-flex flex-wrap gap-x-4 gap-y-0.5">
                  {relatedBoards.map((b) => (
                    <span key={b.code} className="text-meta" style={TNUM}>
                      <span className={`mr-1 rounded-sm px-1 py-px text-micro ${b.kind === "industry" ? "bg-cyan-500/15 text-cyan-400" : "bg-violet-500/15 text-violet-400"}`}>{b.kind === "industry" ? "行业" : "概念"}</span>
                      <span className="text-db-secondary">{b.name}</span>
                      <span className={`ml-1 font-semibold ${clsChg(b.pct)}`}>{fmtPct(b.pct)}</span>
                      <span className="ml-1 text-caption text-db-faint">{b.leadName}</span>
                    </span>
                  ))}
                </span>
              </div>
            )}
          </div>
          <div className="flex w-[300px] shrink-0 flex-col border-l border-db-border/40">
            <div className="border-b border-db-border/40 p-2">
              <div className="mb-1 text-meta font-semibold text-db-secondary">行业关键技术</div>
              <div className="flex flex-wrap gap-1">{chain.tech.map((t) => (<span key={t} className="rounded border border-emerald-500/25 bg-emerald-500/10 px-1.5 py-px text-caption text-emerald-300">{t}</span>))}</div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
              <div className="mb-1 px-0.5 text-meta font-semibold text-db-secondary">行业热点新闻 <span className="ml-1 text-caption font-normal text-db-muted">关键词匹配 · {chainNews.length}条</span></div>
              <div className="space-y-0.5">
                {chainNews.map((n) => (
                  <div key={n.id} className="rounded px-1.5 py-1 hover:bg-db-subtle/40">
                    <div className="text-caption text-db-muted" style={TNUM}>{fmtTime(n.time)}</div>
                    <div className="mt-0.5 text-meta leading-[1.5] text-db-secondary line-clamp-2">
                      {n.title ? <span className="font-semibold text-db-primary">{n.title} </span> : null}{n.content}
                    </div>
                  </div>
                ))}
                {news && chainNews.length === 0 && <div className="p-4 text-center text-meta text-db-faint">当前快讯流中暂无该产业链相关新闻</div>}
                {!news && <div className="p-4 text-center text-meta text-db-faint">加载中…</div>}
              </div>
            </div>
          </div>
        </div>
      </Panel>

      {editor && (
        <ChainEditorDialog
          editor={editor}
          parseState={parseState}
          onChange={setEditor}
          onClose={() => setEditor(null)}
          onAutoFetch={autoFetchChain}
          onSubmit={submitEditor}
        />
      )}
    </>
  );
}

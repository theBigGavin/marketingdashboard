import { memo, useCallback, useEffect, useRef, useState } from "react";
import { Star } from "lucide-react";
import { Panel, type PanelZoomProps } from "./Panel";
import { QuoteRow } from "./QuoteRow";
import { useQuote } from "@/lib/market";
import { type StockSearchResult } from "@/lib/api";
import { fmtTurnover, fmtWan } from "@/lib/format";
import { normalizeStockCode } from "@/lib/code";
import { loadJson, saveJson } from "@/lib/storage";
import {
  hostingToken, hostingWatchlist, hostingWatchlistSave,
  loadWatchlistCache, saveWatchlistCache,
} from "@/lib/hosting";
import { useStockSearch } from "@/hooks/useStockSearch";

const LS_KEY = "dash:watchlist";
/** 默认自选: 沪硅产业 / 沪电股份 / 云天化 / 立讯精密 */
const DEFAULT_LIST = ["sh688126", "sz002463", "sh600096", "sz002475"];

function load(): string[] {
  const v = loadJson<string[] | null>(LS_KEY, null);
  if (Array.isArray(v) && v.every((x) => typeof x === "string" && x)) return v;
  return DEFAULT_LIST;
}

/** 自选股行: 报价取自统一报价中心(名称/价格/额/换), memo 让未变化的行跳过重渲染 */
const WatchRow = memo(function WatchRow({
  code, onRemoveCode,
}: {
  code: string;
  onRemoveCode: (code: string) => void;
}) {
  const q = useQuote(code);
  return (
    <QuoteRow
      code={code}
      name={q?.name || code}
      amount={q?.amount && q.amount > 0 ? fmtWan(q.amount) : undefined}
      turnover={fmtTurnover(q?.turnover)}
      spark
      boards
      flow
      onRemove={() => onRemoveCode(code)}
    />
  );
});

/** 自选股 / 持仓面板 — 开源版 localStorage 持久化; 托管版走服务端(按租户隔离) */
export function WatchlistPanel({ className = "", ...zoomProps }: { className?: string } & PanelZoomProps) {
  const [codes, setCodes] = useState<string[]>(load);
  const [invalid, setInvalid] = useState(false);
  // 托管模式(登录态)标志 + 服务端首屏加载完成标志(避免初始覆盖用户本地自选)
  const [hosted, setHosted] = useState<boolean | null>(() => hostingToken() ? null : false);
  const suggestRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const {
    input, setInput, triggerSearch,
    suggestions, showSuggest, setShowSuggest,
    highlightIdx, setHighlightIdx,
    clear, onKeyDown,
  } = useStockSearch();

  // 托管模式: 挂载时从服务端拉取自选(按租户隔离, 不跨租户泄漏)
  // 服务端为准: 有值用服务端值, 空则空列表(不把本地 localStorage 残留写入租户库)
  useEffect(() => {
    if (!hostingToken()) return;
    let alive = true;
    (async () => {
      try {
        const server = await hostingWatchlist();
        if (!alive) return;
        setCodes(Array.isArray(server) ? server : []);
        setHosted(true);
      } catch {
        // 服务端暂不可用: 降级本地缓存, 不阻塞看板
        if (!alive) return;
        const cached = loadWatchlistCache();
        if (cached && cached.length > 0) setCodes(cached);
        setHosted(true);
      }
    })();
    return () => { alive = false; };
  }, []);

  // 持久化: 托管模式 → 服务端(PUT, 按租户隔离); 开源模式 → localStorage
  useEffect(() => {
    if (hosted === null) return;
    if (hosted) {
      hostingWatchlistSave(codes).then((saved) => saveWatchlistCache(saved)).catch(() => {});
    } else {
      saveJson(LS_KEY, codes);
    }
  }, [codes, hosted]);

  const add = (code?: string) => {
    const c = code || normalizeStockCode(input);
    const valid = /^(sh|sz|bj|nq)\d{6}$/.test(c);
    if (!valid) { setInvalid(true); return; }
    setInvalid(false);
    clear();
    setCodes((cs) => (cs.includes(c) ? cs : [...cs, c]));
  };

  const pickSuggestion = (s: StockSearchResult) => {
    add(s.code);
  };

  const removeCode = useCallback((code: string) => {
    setCodes((cs) => cs.filter((c) => c !== code));
  }, []);

  // 点击外部关闭建议
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (suggestRef.current && !suggestRef.current.contains(e.target as Node) &&
          inputRef.current && !inputRef.current.contains(e.target as Node)) {
        setShowSuggest(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [setShowSuggest]);

  return (
    <Panel
      className={className}
      {...zoomProps}
      title="自选股"
      icon={<Star size={14} />}
      accent="#fbbf24"
      right={<span className="text-[10px] text-slate-500">{codes.length}只 · 5s</span>}
    >
      <div className="flex h-full min-h-0 flex-col">
        {/* 添加 */}
        <div className="relative flex shrink-0 gap-1 border-b border-slate-700/30 p-1.5">
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => { setInput(e.target.value); setInvalid(false); triggerSearch(e.target.value); }}
            onKeyDown={(e) => onKeyDown(e, pickSuggestion)}
            onFocus={() => suggestions.length > 0 && setShowSuggest(true)}
            placeholder="代码/名称/拼音, 如 688126 / 茅台 / gzmt"
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={showSuggest}
            aria-controls="watchlist-suggest"
            aria-activedescendant={
              highlightIdx >= 0 && suggestions[highlightIdx]
                ? `watchlist-opt-${suggestions[highlightIdx].code}`
                : undefined
            }
            className={`min-w-0 flex-1 rounded border bg-slate-800/40 px-1.5 py-0.5 text-[11px] text-slate-200 outline-none placeholder:text-slate-600 ${
              invalid ? "border-rose-500/60" : "border-slate-700/50 focus:border-amber-500/50"
            }`}
          />
          <button
            onClick={() => add()}
            className="shrink-0 rounded bg-amber-500/20 px-2 text-[11px] text-amber-300 hover:bg-amber-500/30"
          >
            加
          </button>
          {/* 建议下拉 */}
          {showSuggest && (
            <div
              ref={suggestRef}
              id="watchlist-suggest"
              role="listbox"
              aria-label="股票搜索建议"
              className="absolute left-1.5 right-1.5 top-full z-50 mt-0.5 max-h-52 overflow-y-auto rounded border border-slate-600/50 bg-slate-800 shadow-lg"
            >
              {suggestions.map((s, i) => (
                <button
                  key={s.code}
                  id={`watchlist-opt-${s.code}`}
                  role="option"
                  aria-selected={i === highlightIdx}
                  onMouseDown={(e) => { e.preventDefault(); pickSuggestion(s); }}
                  onMouseEnter={() => setHighlightIdx(i)}
                  className={`flex w-full items-center gap-2 px-2 py-1 text-left text-[11px] transition-colors ${
                    i === highlightIdx ? "bg-amber-500/20 text-amber-200" : "text-slate-300 hover:bg-slate-700/50"
                  }`}
                >
                  <span className="font-medium text-slate-100">{s.name}</span>
                  <span className="text-slate-500">{s.code}</span>
                  {s.pinyin && <span className="ml-auto text-slate-600">{s.pinyin}</span>}
                </button>
              ))}
            </div>
          )}
        </div>
        {/* 列表 */}
        <div className="min-h-0 flex-1 overflow-y-auto p-1">
          {codes.map((code) => (
            <WatchRow key={code} code={code} onRemoveCode={removeCode} />
          ))}
          {codes.length === 0 && (
            <div className="p-4 text-center text-[10px] text-slate-600">列表为空,输入代码/名称/拼音添加自选股</div>
          )}
        </div>
      </div>
    </Panel>
  );
}

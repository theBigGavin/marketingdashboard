import { memo, useCallback, useEffect, useRef, useState } from "react";
import { Panel, type PanelZoomProps } from "./Panel";
import { QuoteRow } from "./QuoteRow";
import { usePolling } from "@/hooks/usePolling";
import { api, type StockSearchResult } from "@/lib/api";
import { fmtWan } from "@/lib/format";

const LS_KEY = "dash:watchlist";
/** 默认自选: 沪硅产业 / 沪电股份 / 云天化 / 立讯精密 */
const DEFAULT_LIST = ["sh688126", "sz002463", "sh600096", "sz002475"];

function load(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(LS_KEY) || "null");
    if (Array.isArray(v) && v.every((x) => typeof x === "string" && x)) return v;
  } catch { /* 忽略损坏数据 */ }
  return DEFAULT_LIST;
}

/** 输入归一化为腾讯代码: 6/9→sh, 0/2/3→sz, 4/8→bj; 已带 sh/sz/bj 前缀则原样 */
function normalizeCode(input: string): string | null {
  const s = input.trim().toLowerCase();
  if (/^(sh|sz|bj)\d{6}$/.test(s)) return s;
  if (/^\d{6}$/.test(s)) {
    const c = s[0];
    if (c === "6" || c === "9") return `sh${s}`;
    if (c === "0" || c === "2" || c === "3") return `sz${s}`;
    if (c === "4" || c === "8") return `bj${s}`;
  }
  return null;
}

/** 自选股行: 原始值 props + 稳定回调, 配合 memo 让未变化的行跳过重渲染 */
const WatchRow = memo(function WatchRow({
  code, name, price, pct, amount, turnover, onRemoveCode,
}: {
  code: string;
  name: string;
  price?: number;
  pct?: number;
  amount?: string;
  turnover?: string;
  onRemoveCode: (code: string) => void;
}) {
  return (
    <QuoteRow
      code={code}
      name={name}
      price={price}
      pct={pct}
      amount={amount}
      turnover={turnover}
      spark
      boards
      flow
      onRemove={() => onRemoveCode(code)}
    />
  );
});

/** 自选股 / 持仓面板 — localStorage 持久化,5s 轮询 */
export function WatchlistPanel({ className = "", ...zoomProps }: { className?: string } & PanelZoomProps) {
  const [codes, setCodes] = useState<string[]>(load);
  const [input, setInput] = useState("");
  const [invalid, setInvalid] = useState(false);
  const [suggestions, setSuggestions] = useState<StockSearchResult[]>([]);
  const [showSuggest, setShowSuggest] = useState(false);
  const [highlightIdx, setHighlightIdx] = useState(-1);
  const suggestRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const { data: quotes } = usePolling(
    () => (codes.length ? api.quotes(codes) : Promise.resolve(null)),
    5000
  );

  useEffect(() => {
    localStorage.setItem(LS_KEY, JSON.stringify(codes));
  }, [codes]);

  // 防抖搜索
  const triggerSearch = (val: string) => {
    clearTimeout(timerRef.current);
    const t = val.trim();
    // 纯数字/代码格式不搜索
    if (/^[\d]{3,6}$/.test(t) || /^(sh|sz|bj)\d{6}$/i.test(t)) {
      setSuggestions([]);
      setShowSuggest(false);
      return;
    }
    if (t.length < 1) { setSuggestions([]); setShowSuggest(false); return; }
    timerRef.current = setTimeout(async () => {
      try {
        const res = await api.stockSearch(t);
        setSuggestions(res);
        setShowSuggest(res.length > 0);
        setHighlightIdx(-1);
      } catch { setSuggestions([]); }
    }, 200);
  };

  const add = (code?: string) => {
    const c = code || normalizeCode(input);
    if (!c) { setInvalid(true); return; }
    setInvalid(false);
    setInput("");
    setSuggestions([]);
    setShowSuggest(false);
    setCodes((cs) => (cs.includes(c) ? cs : [...cs, c]));
  };

  const pickSuggestion = (s: StockSearchResult) => {
    add(s.code);
  };

  const removeCode = useCallback((code: string) => {
    setCodes((cs) => cs.filter((c) => c !== code));
  }, []);

  const onKeyDown = (e: React.KeyboardEvent) => {
    // 中文输入法选词期间的 Enter 不触发添加
    if (e.nativeEvent.isComposing) return;
    if (e.key === "Enter") {
      if (showSuggest && highlightIdx >= 0 && highlightIdx < suggestions.length) {
        pickSuggestion(suggestions[highlightIdx]);
        return;
      }
      add();
      return;
    }
    if (!showSuggest || suggestions.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightIdx((i) => (i + 1) % suggestions.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightIdx((i) => (i <= 0 ? suggestions.length - 1 : i - 1));
    } else if (e.key === "Escape") {
      setShowSuggest(false);
    }
  };

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
  }, []);

  return (
    <Panel
      className={className}
      {...zoomProps}
      title="自选股"
      icon="★"
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
            onKeyDown={onKeyDown}
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
          {codes.map((code) => {
            const q = quotes?.[code];
            return (
              <WatchRow
                key={code}
                code={code}
                name={q?.name || code}
                price={q?.price}
                pct={q?.pct}
                amount={q && q.amount > 0 ? fmtWan(q.amount) : undefined}
                turnover={q && q.turnover > 0 ? `${q.turnover.toFixed(1)}%` : undefined}
                onRemoveCode={removeCode}
              />
            );
          })}
          {codes.length === 0 && (
            <div className="p-4 text-center text-[10px] text-slate-600">列表为空,输入代码/名称/拼音添加自选股</div>
          )}
        </div>
      </div>
    </Panel>
  );
}

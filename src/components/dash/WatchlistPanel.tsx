import { useEffect, useState } from "react";
import { Panel, type PanelZoomProps } from "./Panel";
import { QuoteRow } from "./QuoteRow";
import { usePolling } from "@/hooks/usePolling";
import { api } from "@/lib/api";
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

/** 自选股 / 持仓面板 — localStorage 持久化,5s 轮询 */
export function WatchlistPanel({ className = "", ...zoomProps }: { className?: string } & PanelZoomProps) {
  const [codes, setCodes] = useState<string[]>(load);
  const [input, setInput] = useState("");
  const [invalid, setInvalid] = useState(false);
  const dep = codes.join(",");
  const { data: quotes } = usePolling(
    () => (codes.length ? api.quotes(codes) : Promise.resolve(null)),
    5000,
    [dep]
  );

  useEffect(() => {
    localStorage.setItem(LS_KEY, JSON.stringify(codes));
  }, [codes]);

  const add = () => {
    const code = normalizeCode(input);
    if (!code) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    setInput("");
    setCodes((cs) => (cs.includes(code) ? cs : [...cs, code]));
  };

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
        <div className="flex shrink-0 gap-1 border-b border-slate-700/30 p-1.5">
          <input
            value={input}
            onChange={(e) => { setInput(e.target.value); setInvalid(false); }}
            onKeyDown={(e) => e.key === "Enter" && add()}
            placeholder="代码,如 688126"
            className={`min-w-0 flex-1 rounded border bg-slate-800/40 px-1.5 py-0.5 text-[11px] text-slate-200 outline-none placeholder:text-slate-600 ${
              invalid ? "border-rose-500/60" : "border-slate-700/50 focus:border-amber-500/50"
            }`}
          />
          <button
            onClick={add}
            className="shrink-0 rounded bg-amber-500/20 px-2 text-[11px] text-amber-300 hover:bg-amber-500/30"
          >
            加
          </button>
        </div>
        {/* 列表 */}
        <div className="min-h-0 flex-1 overflow-y-auto p-1">
          {codes.map((code) => {
            const q = quotes?.[code];
            return (
              <QuoteRow
                key={code}
                code={code}
                name={q?.name || code}
                price={q?.price}
                pct={q?.pct}
                amount={q && q.amount > 0 ? fmtWan(q.amount) : undefined}
                turnover={q && q.turnover > 0 ? `${q.turnover.toFixed(1)}%` : undefined}
                spark
                boards
                flow
                onRemove={() => setCodes((cs) => cs.filter((c) => c !== code))}
              />
            );
          })}
          {codes.length === 0 && (
            <div className="p-4 text-center text-[10px] text-slate-600">列表为空,输入代码添加自选股</div>
          )}
        </div>
      </div>
    </Panel>
  );
}

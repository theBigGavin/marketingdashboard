import { useEffect, useRef, useState } from "react";
import { Panel, type PanelZoomProps } from "./Panel";
import { QuoteRow } from "./QuoteRow";
import { usePolling } from "@/hooks/usePolling";
import { api, type Board } from "@/lib/api";
import { clsChg, fmtPct, fmtYuan, hexChg } from "@/lib/format";

type Kind = "01" | "02";

/** 成分股轮播间隔(ms) */
const ROTATE_MS = 10000;

function BoardRow({ b, maxAbs, active, onClick, auto }: { b: Board; maxAbs: number; active: boolean; onClick: () => void; auto?: boolean }) {
  const w = maxAbs > 0 ? Math.min(100, (Math.abs(b.pct) / maxAbs) * 100) : 0;
  const ref = useRef<HTMLButtonElement>(null);
  // 仅手动点击时滚动到可视区域（自动轮播不抢焦点）
  useEffect(() => {
    if (active && !auto) ref.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [active, auto]);
  return (
    <button
      ref={ref}
      onClick={onClick}
      className={`group grid w-full grid-cols-[24px_1fr_76px_96px] items-center gap-2 rounded px-2 py-[5px] text-left transition-colors ${
        active ? "bg-cyan-500/10 ring-1 ring-cyan-500/40" : "hover:bg-slate-800/40"
      }`}
    >
      <span className="text-[10px] text-slate-600">{b.code.slice(-4)}</span>
      <span className="min-w-0">
        <span className="block truncate text-[12px] text-slate-200 group-hover:text-cyan-300">{b.name}</span>
        <span className="mt-0.5 block h-1 rounded-full bg-slate-800">
          <span className="block h-1 rounded-full transition-all" style={{ width: `${w}%`, background: hexChg(b.pct) }} />
        </span>
      </span>
      <span className={`text-right text-[12px] font-semibold ${clsChg(b.pct)}`} style={{ fontVariantNumeric: "tabular-nums" }}>
        {fmtPct(b.pct)}
      </span>
      <span className="truncate text-right text-[11px] text-slate-400">
        {b.leadName} <span className={clsChg(b.leadPct)}>{fmtPct(b.leadPct)}</span>
      </span>
    </button>
  );
}

export function SectorPanel({ className = "", ...zoomProps }: { className?: string } & PanelZoomProps) {
  const [kind, setKind] = useState<Kind>("01");
  const [dir, setDir] = useState<0 | 1>(0);
  const [selected, setSelected] = useState<Board | null>(null);
  const [q, setQ] = useState("");
  // 轮播: 默认开启, 手动点击板块后暂停
  const [auto, setAuto] = useState(true);
  const [idx, setIdx] = useState(0);

  // 全量拉取(行业 124 / 概念 ~800), 前端本地搜索过滤
  const { data: boards, error } = usePolling(() => api.boards(kind, dir, kind === "01" ? 300 : 1000), 15000, [kind, dir]);
  const { data: stocks } = usePolling(
    () => (selected ? api.boardStocks(selected.code, 300) : Promise.resolve(null)),
    15000,
    [selected?.code]
  );

  const filtered = boards?.filter((b) => !q || b.name.includes(q));
  const maxAbs = filtered ? Math.max(...filtered.map((b) => Math.abs(b.pct)), 0.01) : 1;

  // 榜单/搜索变化时回到第一个板块
  useEffect(() => setIdx(0), [kind, dir, q]);
  // 定时推进轮播索引
  useEffect(() => {
    if (!auto || !filtered?.length) return;
    const t = window.setInterval(() => setIdx((i) => i + 1), ROTATE_MS);
    return () => window.clearInterval(t);
  }, [auto, filtered?.length]);
  // 轮播模式下同步选中项
  useEffect(() => {
    if (auto && filtered?.length) setSelected(filtered[idx % filtered.length]);
  }, [auto, idx, filtered]);

  const pick = (b: Board) => {
    setAuto(false);
    setSelected(selected?.code === b.code && !auto ? null : b);
  };

  return (
    <Panel
      className={className}
      {...zoomProps}
      title="市场板块实时热点"
      icon="▤"
      accent="#22d3ee"
      right={
        <div className="flex items-center gap-1 text-[11px]">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="搜索板块"
            className="w-20 rounded border border-slate-700/50 bg-slate-800/40 px-1.5 py-0.5 text-[11px] text-slate-200 outline-none placeholder:text-slate-600 focus:border-cyan-500/50"
          />
          <button
            onClick={() => setAuto((a) => !a)}
            title={auto ? `轮播中(${ROTATE_MS / 1000}s),点击暂停` : "已暂停,点击恢复轮播"}
            className={`rounded px-2 py-0.5 ${auto ? "bg-cyan-500/20 text-cyan-300" : "text-slate-400 hover:text-slate-200"}`}
          >
            轮播
          </button>
          {([["01", "行业"], ["02", "概念"]] as [Kind, string][]).map(([k, label]) => (
            <button
              key={k}
              onClick={() => { setKind(k); setAuto(true); }}
              className={`rounded px-2 py-0.5 ${kind === k ? "bg-cyan-500/20 text-cyan-300" : "text-slate-400 hover:text-slate-200"}`}
            >
              {label}
            </button>
          ))}
          <span className="mx-1 h-3 w-px bg-slate-700" />
          {([0, 1] as const).map((d) => (
            <button
              key={d}
              onClick={() => setDir(d)}
              className={`rounded px-2 py-0.5 ${dir === d ? "bg-cyan-500/20 text-cyan-300" : "text-slate-400 hover:text-slate-200"}`}
            >
              {d === 0 ? "领涨" : "领跌"}
            </button>
          ))}
        </div>
      }
    >
      <div className="flex h-full min-h-0">
        {/* 板块列表 */}
        <div className="min-w-0 flex-1 overflow-y-auto p-1.5">
          <div className="grid grid-cols-[24px_1fr_76px_96px] gap-2 px-2 py-1 text-[10px] text-slate-500">
            <span>代码</span><span>板块 / 强度{filtered ? ` (${filtered.length})` : ""}</span><span className="text-right">涨跌幅</span><span className="text-right">领涨股</span>
          </div>
          {filtered?.map((b) => (
            <BoardRow key={b.code} b={b} maxAbs={maxAbs} active={selected?.code === b.code} auto={auto}
              onClick={() => pick(b)} />
          ))}
          {!filtered && (
            <div className="p-6 text-center text-[11px] text-slate-600">
              {error ? <span className="text-rose-400/80">数据源连接失败,自动重试中…<br />{error}</span> : "板块数据加载中…"}
            </div>
          )}
          {filtered?.length === 0 && (
            <div className="p-6 text-center text-[11px] text-slate-600">无匹配「{q}」的板块</div>
          )}
        </div>

        {/* 成分股侧栏 */}
        {selected && (
          <div className="w-[min(440px,52%)] shrink-0 overflow-y-auto border-l border-slate-700/40 p-2">
            <div className="mb-2 flex items-baseline justify-between">
              <span className="text-[12px] font-semibold text-cyan-300">{selected.name}</span>
              <span className={`text-[12px] font-semibold ${clsChg(selected.pct)}`}>{fmtPct(selected.pct)}</span>
            </div>
            <div className="mb-2 grid grid-cols-2 gap-1 text-[10px] text-slate-500">
              <span>5日 <span className={clsChg(selected.pct5)}>{fmtPct(selected.pct5)}</span></span>
              <span>20日 <span className={clsChg(selected.pct20)}>{fmtPct(selected.pct20)}</span></span>
            </div>
            <div className="space-y-0.5">
              {stocks?.map((s) => (
                <QuoteRow
                  key={s.code}
                  code={s.code}
                  name={s.name}
                  price={s.price}
                  pct={s.pct}
                  amount={s.amount > 0 ? fmtYuan(s.amount) : undefined}
                  turnover={s.turnover > 0 ? `${s.turnover.toFixed(1)}%` : undefined}
                  spark
                  boards
                  flow
                />
              ))}
              {stocks && <div className="px-1.5 pt-1 text-right text-[9px] text-slate-600">全量 {stocks.length} 只成分股</div>}
              {!stocks && <div className="p-4 text-center text-[10px] text-slate-600">成分股加载中…</div>}
            </div>
          </div>
        )}
      </div>
    </Panel>
  );
}

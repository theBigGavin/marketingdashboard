import { useEffect, useMemo, useRef, useState } from "react";
import { Layers } from "lucide-react";
import { Panel, type PanelZoomProps } from "./Panel";
import { QuoteRow } from "./QuoteRow";
import { usePolling } from "@/hooks/usePolling";
import { api, type Board } from "@/lib/api";
import { POLL } from "@/lib/intervals";
import { clsChg, fmtPct, fmtYuan, hexChg } from "@/lib/format";
import { boardScopeSummary, groupBoardsByScope, pctRankNote } from "@/lib/board-taxonomy";
import { isTv } from "@/lib/tv";
import { TabBar } from "./SharedUI";

type Kind = "01" | "02";

const ROTATE_MS = 10000;
// 概念榜近千行, 全量渲染会让千级 DOM 每 15s 重渲染; 截断显示, 搜索可定位完整集合
// TV 弱 GPU: 滚动层是全量光栅化的图层, 进一步压到 40 行
const MAX_BOARD_ROWS = isTv ? 40 : 200;
// 成分股侧栏行数上限: 每个 QuoteRow 带 2 个 Observer + 3 个轮询 hook, 行数直接决定定时器规模
const MAX_STOCK_ROWS = 100;

function BoardRow({ b, maxAbs, active, onClick }: { b: Board; maxAbs: number; active: boolean; onClick: () => void }) {
  const w = maxAbs > 0 ? Math.min(100, (Math.abs(b.pct) / maxAbs) * 100) : 0;
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (active) {
      const activeEl = document.activeElement;
      ref.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
      if (activeEl && activeEl instanceof HTMLElement && activeEl !== ref.current)
        activeEl.focus();
    }
  }, [active]);
  return (
    <button
      ref={ref}
      onClick={onClick}
      className={`group grid w-full grid-cols-[24px_1fr_76px_96px] items-center gap-2 rounded px-2 py-[5px] text-left transition-colors ${
        active ? "bg-cyan-500/10 ring-1 ring-cyan-500/40" : "hover:bg-db-subtle/40"
      }`}
    >
      <span className="text-meta text-db-faint">{b.code.slice(-4)}</span>
      <span className="min-w-0">
        <span className="block truncate text-panel-title text-db-primary group-hover:text-cyan-300">{b.name}</span>
        <span className="mt-0.5 block h-1 rounded-full bg-db-subtle">
          <span className="block h-1 rounded-full transition-all" style={{ width: `${w}%`, background: hexChg(b.pct) }} />
        </span>
      </span>
      <span className={`text-right text-panel-title font-semibold ${clsChg(b.pct)}`} style={{ fontVariantNumeric: "tabular-nums" }}>
        {fmtPct(b.pct)}
      </span>
      <span className="truncate text-right text-body text-db-tertiary">
        {b.leadName} <span className={clsChg(b.leadPct)}>{fmtPct(b.leadPct)}</span>
      </span>
    </button>
  );
}

/** 市场板块实时热点 — 行业(腾讯申万) / 概念 两个 tab。
 *  层级口径统一走 @/lib/board-taxonomy: 榜单先按口径/层级分组渲染, 只在同层内按涨跌幅排序比较,
 *  并在面板顶部写明当前口径/层级与排序方式(避免一级/二级/细分板块被放进同一张榜竞争)。 */
export function SectorPanel({ className = "", ...zoomProps }: { className?: string } & PanelZoomProps) {
  const [kind, setKind] = useState<Kind>("01");
  const [dir, setDir] = useState<0 | 1>(0);
  const [selected, setSelected] = useState<Board | null>(null);
  const [q, setQ] = useState("");
  const [auto, setAuto] = useState(false);
  const [idx, setIdx] = useState(0);

  const { data: boards, error } = usePolling(() => api.boards(kind, dir, kind === "01" ? 300 : 1000), POLL.SECTOR, [kind, dir]);

  const filtered = useMemo(() => boards?.filter((b) => !q || b.name.includes(q)), [boards, q]);
  // 分层: 先按口径/层级分组, 组内才允许按涨跌幅比较(单层级榜单只有 1 组 → 渲染与原先一致);
  // 比较条基准 maxAbs 也按组算, 避免跨层级用同一根标尺
  const { groups, scopeLine } = useMemo(() => {
    if (!filtered) return { groups: null, scopeLine: "" };
    return {
      groups: groupBoardsByScope(filtered).map((g) => ({
        ...g,
        maxAbs: Math.max(...g.items.map((b) => Math.abs(b.pct)), 0.01),
      })),
      scopeLine: boardScopeSummary(filtered),
    };
  }, [filtered]);

  // 榜单/搜索变化时轮播索引归零(render-time 派生态调整)
  const filterKey = `${kind}|${dir}|${q}`;
  const [prevFilterKey, setPrevFilterKey] = useState(filterKey);
  if (prevFilterKey !== filterKey) {
    setPrevFilterKey(filterKey);
    setIdx(0);
  }

  // 定时推进轮播索引
  useEffect(() => {
    if (!auto || !filtered?.length) return;
    const t = window.setInterval(() => setIdx((i) => i + 1), ROTATE_MS);
    return () => window.clearInterval(t);
  }, [auto, filtered?.length]);

  // 当前生效板块: 轮播取索引位; 非轮播保留用户手动选择, 仅当已不在 filtered 中(榜单/搜索变化)才回落到第一
  const activeBoard = useMemo(() => {
    if (!filtered?.length) return null;
    if (auto) return filtered[idx % filtered.length];
    if (selected) {
      const cur = filtered.find((b) => b.code === selected.code);
      if (cur) return cur;
    }
    return filtered[0];
  }, [auto, filtered, idx, selected]);

  const { data: stocks } = usePolling(
    () => (activeBoard ? api.boardStocks(activeBoard.code, MAX_STOCK_ROWS) : Promise.resolve(null)),
    POLL.SECTOR,
    [activeBoard?.code]
  );

  const pick = (b: Board) => {
    setAuto(false);
    setSelected(selected?.code === b.code && !auto ? null : b);
  };

  return (
    <Panel
      className={className}
      {...zoomProps}
      title="市场板块实时热点"
      icon={<Layers size={14} />}
      accent="#22d3ee"
      right={
        <div className="flex items-center gap-1 text-body">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="搜索板块"
            className="w-20 rounded border border-db-border/50 bg-db-subtle/40 px-1.5 py-0.5 text-body text-db-primary outline-none placeholder:text-db-faint focus:border-cyan-500/50"
          />
          <button
            onClick={() => setAuto((a) => !a)}
            title={auto ? `轮播中(${ROTATE_MS / 1000}s),点击暂停` : "已暂停,点击恢复轮播"}
            className={`rounded px-2 py-0.5 ${auto ? "bg-cyan-500/20 text-cyan-300" : "text-db-tertiary hover:text-db-primary"}`}
          >
            轮播
          </button>
          <TabBar
            tabs={[{ key: "01" as Kind, label: "行业" }, { key: "02" as Kind, label: "概念" }]}
            active={kind}
            onChange={(k) => { setKind(k); setAuto(true); }}
            accent="cyan"
            size="xs"
          />
          <span className="mx-1 h-3 w-px bg-db-border" />
          <TabBar
            tabs={[{ key: 0 as const, label: "领涨" }, { key: 1 as const, label: "领跌" }]}
            active={dir}
            onChange={setDir}
            accent="cyan"
            size="xs"
          />
        </div>
      }
    >
      <div className="flex h-full min-h-0">
        {/* 板块列表 */}
        <div className="min-w-0 flex-1 overflow-y-auto p-1.5">
          {/* 口径行: 明确写出榜单口径/层级与排序方式(不跨层级混排, 也不偷改口径) */}
          <div className="px-2 pb-1 text-meta leading-4 text-db-muted">
            <span className="text-db-tertiary">口径 </span>
            <span className="text-db-secondary">{scopeLine || (kind === "01" ? "申万行业" : "概念板块")}</span>
            <span className="mx-1 text-db-border">·</span>
            <span>{pctRankNote(dir)}</span>
            <span className="mx-1 text-db-border">·</span>
            <span>仅同层内比较</span>
          </div>
          <div className="grid grid-cols-[24px_1fr_76px_96px] gap-2 px-2 py-1 text-meta text-db-muted">
            <span>代码</span><span>板块 / 强度{filtered ? ` (${filtered.length})` : ""}</span><span className="text-right">涨跌幅</span><span className="text-right">领涨股</span>
          </div>
          {groups?.map((g) => (
            <div key={g.key}>
              {/* 多层级时才出现分组头; 单层级榜单不额外占位 */}
              {groups.length > 1 && (
                <div className="mx-1 mt-1 rounded bg-db-subtle/60 px-2 py-0.5 text-meta text-cyan-300/90">
                  {g.label} · {g.items.length} 个 · 同层内排序
                </div>
              )}
              {g.items.slice(0, MAX_BOARD_ROWS).map((b) => (
                <BoardRow key={b.code} b={b} maxAbs={g.maxAbs} active={activeBoard?.code === b.code}
                  onClick={() => pick(b)} />
              ))}
              {g.items.length > MAX_BOARD_ROWS && (
                <div className="p-2 text-center text-meta text-db-faint">
                  {g.label}仅显示前 {MAX_BOARD_ROWS} / 共 {g.items.length} 个, 搜索可定位其余
                </div>
              )}
            </div>
          ))}
          {!filtered && (
            <div className="p-6 text-center text-body text-db-faint">
              {error ? <span className="text-rose-400/80">数据源连接失败,自动重试中…<br />{error}</span> : "板块数据加载中…"}
            </div>
          )}
          {filtered?.length === 0 && (
            <div className="p-6 text-center text-body text-db-faint">无匹配「{q}」的板块</div>
          )}
        </div>

        {/* 成分股侧栏 */}
        {activeBoard && (
          <div className="w-[min(440px,52%)] shrink-0 overflow-y-auto border-l border-db-border/40 p-2">
            <div className="mb-2 flex items-baseline justify-between">
              <span className="text-panel-title font-semibold text-cyan-300">{activeBoard.name}</span>
              <span className={`text-panel-title font-semibold ${clsChg(activeBoard.pct)}`}>{fmtPct(activeBoard.pct)}</span>
            </div>
            <div className="mb-2 grid grid-cols-2 gap-1 text-meta text-db-muted">
              <span>5日 <span className={clsChg(activeBoard.pct5)}>{fmtPct(activeBoard.pct5)}</span></span>
              <span>20日 <span className={clsChg(activeBoard.pct20)}>{fmtPct(activeBoard.pct20)}</span></span>
            </div>
            <div className="space-y-0.5">
              {stocks?.map((s) => (
                <QuoteRow
                  key={s.code}
                  code={s.code}
                  name={s.name}
                  amount={s.amount > 0 ? fmtYuan(s.amount) : undefined}
                  turnover={s.turnover > 0 ? `${s.turnover.toFixed(1)}%` : undefined}
                  spark boards flow
                />
              ))}
              {stocks && <div className="px-1.5 pt-1 text-right text-caption text-db-faint">领涨前 {stocks.length} 只成分股</div>}
              {!stocks && <div className="p-4 text-center text-meta text-db-faint">成分股加载中…</div>}
            </div>
          </div>
        )}
      </div>
    </Panel>
  );
}

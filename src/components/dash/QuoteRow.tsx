import { memo, useEffect, useRef, useState } from "react";
import type { ReactNode, RefObject } from "react";
import { Spark } from "./Spark";
import { api, type StockBoards, type StockFlow } from "@/lib/api";
import { POLL } from "@/lib/intervals";
import { useQuote } from "@/lib/market";
import { usePolling } from "@/hooks/usePolling";
import { isTv } from "@/lib/tv";
import { TNUM, clsChg, bgChg, fmtPrice, fmtPct, fmtYuan } from "@/lib/format";
import { RANK_GOLD, RANK_SILVER, RANK_BRONZE, CROSSHAIR } from "@/lib/colors";
import type { QuoteRowProps } from "./QuoteRowTypes";

const COMPACT_WIDTH = 400;
export { COMPACT_WIDTH };

/** 行标签元素: 有 onClick 渲染为 button, 否则 div */
type RowTag = "button" | "div";

/** 主组件预处理后分发到各变体的共享 props */
interface RowSharedProps {
  Tag: RowTag;
  rootRef: RefObject<HTMLElement | null>;
  onClick?: () => void;
  className?: string;
  active?: boolean;
  name: string;
  subtitle?: string;
  sp: { points: { t: string; p: number }[]; prec: number } | null;
  sparkData?: QuoteRowProps["sparkData"];
  sparkNote?: string;
  p: number | undefined;
  pc: number | undefined;
}

/** 变体 1: compact 单行(商品/现货) */
type CompactRowProps = RowSharedProps & {
  variant: "compact";
  basis?: QuoteRowProps["basis"];
  accent?: string;
  badge?: string;
  pct?: number;
};

/** 变体 2: index 布局(全球指数) */
type IndexRowProps = RowSharedProps & {
  badge?: string;
  amount?: string;
};

/** 变体 3: plain + 财务列(extraCols/leadingCols/sparkExtra) */
type FinanceRowProps = RowSharedProps & {
  accent?: string;
  rank?: number;
  badge?: string;
  leadingCols?: QuoteRowProps["leadingCols"];
  extraCols?: QuoteRowProps["extraCols"];
  sparkExtra?: ReactNode;
  onRemove?: () => void;
};

/** 变体 4: plain/card 双行 Grid(个股/商品) */
type PlainGridRowProps = RowSharedProps & {
  variant: "plain" | "card";
  accent?: string;
  rank?: number;
  badge?: string;
  onRemove?: () => void;
  amount?: string;
  turnover?: string;
  fl: StockFlow | null;
  compact: boolean;
  ratioBar: number;
  tag?: string;
  bd: StockBoards | null;
  boards?: boolean;
};

/** 四变体行组件 props 联合 */
export type RowVariantProps = CompactRowProps | IndexRowProps | FinanceRowProps | PlainGridRowProps;

function Stat({ label, value, valueCls = "text-slate-300" }: { label?: string; value: ReactNode; valueCls?: string }) {
  return (
    <span className="flex min-w-0 items-center justify-end gap-1 leading-none">
      {label && <span className="shrink-0 text-[9px] text-slate-600">{label}</span>}
      <span className={`truncate text-[11px] ${valueCls}`} style={TNUM}>
        {value}
      </span>
    </span>
  );
}

/* ================= 变体 1: compact 单行(商品/现货) ================= */
function CompactRow({ basis, Tag, rootRef, onClick, className, active, accent, badge, name, subtitle, sp, sparkData, p, pct }: CompactRowProps) {
  if (basis) {
    return (
      <Tag
        ref={(el: HTMLElement | null) => { rootRef.current = el; }}
        onClick={onClick}
        className={`group grid w-full grid-cols-[72px_minmax(0,1fr)_110px_110px] grid-rows-[20px_16px] items-center gap-x-1 rounded px-2 py-[4px] text-left transition-colors hover:bg-slate-800/40 hover:shadow-[inset_0_0_0_1px_rgba(34,211,238,0.22)] ${active ? "bg-cyan-500/10 ring-1 ring-cyan-500/40" : ""} ${className || ""}`}
      >
        <div className="row-span-2 flex min-w-0 flex-col justify-center gap-1 leading-none">
          <span className="truncate text-[11px] text-slate-200">{name}</span>
          <span className="truncate text-[10px] text-slate-500">{subtitle}</span>
        </div>
        <div className="row-span-2 flex h-full min-w-0 items-center">
          {sp && sp.points.length > 1 && (
            <Spark points={sp.points} prec={sp.prec} width={160} height={20} fluid session={sparkData?.session || "daily"} />
          )}
        </div>
        <span className="col-start-3 row-start-1 flex min-w-0 items-center gap-1 leading-none">
          <span className="shrink-0 text-[9px] text-slate-600">现货</span>
          <span className="truncate text-[11px] font-semibold text-slate-200" style={TNUM}>{fmtPrice(basis.spot)}</span>
        </span>
        <span className="col-start-3 row-start-2 flex min-w-0 items-center gap-1 leading-none">
          <span className="shrink-0 text-[9px] text-slate-600">期货</span>
          <span className="truncate text-[11px] text-slate-400" style={TNUM}>{fmtPrice(basis.futures)}</span>
        </span>
        <span className="col-start-4 row-start-1 flex min-w-0 items-center gap-1 leading-none">
          <span className="shrink-0 text-[9px] text-slate-600">基差</span>
          <span className={`truncate text-[11px] font-semibold ${clsChg(basis.basis)}`} style={TNUM}>{basis.basis > 0 ? "+" : ""}{fmtPrice(basis.basis)}</span>
        </span>
        <span className="col-start-4 row-start-2 flex min-w-0 items-center gap-1 leading-none">
          <span className="shrink-0 text-[9px] text-slate-600">基差率</span>
          <span className={`rounded px-0.5 text-[11px] font-semibold ${bgChg(basis.basisPct)}`} style={TNUM}>{fmtPct(basis.basisPct)}</span>
        </span>
      </Tag>
    );
  }
  return (
    <Tag
      ref={(el: HTMLElement | null) => { rootRef.current = el; }}
      onClick={onClick}
      className={`group flex items-center gap-1.5 w-full rounded px-1 py-[3px] text-left transition-colors hover:bg-slate-800/40 hover:shadow-[inset_0_0_0_1px_rgba(34,211,238,0.22)] ${accent ? "relative" : ""} ${
        active ? "bg-cyan-500/10 ring-1 ring-cyan-500/40" : ""
      } ${className || ""}`}
    >
      {accent && (
        <span aria-hidden className="absolute left-0 top-0 h-full w-[3px] rounded-l" style={{ background: accent, opacity: 0.55 }} />
      )}
      {badge && (
        <span className="w-6 shrink-0 rounded-sm bg-slate-700/50 text-center text-[8px] leading-3 text-slate-400">{badge}</span>
      )}
      <div className="w-[72px] shrink-0 leading-none">
        <div className="truncate text-[11px] text-slate-300">{name}</div>
        {subtitle && <div className="mt-0.5 truncate text-[8px] text-slate-600">{subtitle}</div>}
      </div>
      <span className={`w-[72px] shrink-0 text-right text-[11px] font-semibold ${pct != null ? clsChg(pct) : "text-slate-400"}`} style={TNUM}>
        {p != null ? fmtPrice(p) : "—"}
      </span>
      <span className={`w-[52px] shrink-0 rounded px-0.5 text-right text-[10px] font-semibold ${pct != null ? bgChg(pct) : ""}`} style={TNUM}>
        {pct != null ? fmtPct(pct) : ""}
      </span>
      <span className="min-w-0 flex-1">
        {sp && sp.points.length > 1 ? (
          <Spark points={sp.points} prec={sp.prec} width={120} height={20} fluid emptyLabel="—" session={sparkData?.session || "ashare"} />
        ) : (
          <span className="text-[10px] text-slate-600">——</span>
        )}
      </span>
    </Tag>
  );
}

/* ================= 变体 2: index 布局(全球指数) ================= */
function IndexRow({ Tag, rootRef, onClick, className, active, badge, name, subtitle, sp, sparkData, sparkNote, p, pc, amount }: IndexRowProps) {
  return (
    <Tag
      ref={(el: HTMLElement | null) => { rootRef.current = el; }}
      onClick={onClick}
      className={`group block w-full rounded px-1.5 py-[2px] text-left transition-colors hover:bg-slate-800/40 hover:shadow-[inset_0_0_0_1px_rgba(34,211,238,0.22)] ${
        active ? "bg-cyan-500/10 ring-1 ring-cyan-500/40" : ""
      } ${className || ""}`}
    >
      <div
        className="grid items-center gap-x-1.5"
        style={{
          gridTemplateColumns: "auto 72px minmax(0,1fr) 70px",
          gridTemplateRows: "16px 14px",
        }}
      >
        {badge && (
          <div className="row-span-2 self-center">
            <span className="w-6 shrink-0 rounded-sm bg-slate-700/50 text-center text-[8px] leading-3 text-slate-400">{badge}</span>
          </div>
        )}
        <div className="row-span-2 flex min-w-0 flex-col justify-center gap-1 leading-none">
          <span className="truncate text-[11px] text-slate-200">{name}</span>
          <span className="truncate text-[9px] text-slate-500">{subtitle}</span>
        </div>
        <div className="flex h-[16px] min-w-0 items-center self-center">
          {sp && sp.points.length > 1 ? (
            <Spark points={sp.points} prec={sp.prec} width={120} height={16} fluid emptyLabel="—" session={sparkData?.session || "ashare"} />
          ) : sparkNote ? (
            <span className="truncate text-[10px] text-amber-400/80" title={sparkNote}>{sparkNote}</span>
          ) : (
            <span className="text-[10px] text-slate-600">——</span>
          )}
        </div>
        <span className={`self-center text-right text-[12px] font-bold leading-none ${p != null ? clsChg(p) : "text-slate-600"}`} style={TNUM}>
          {p != null ? fmtPrice(p) : "—"}
        </span>
        <span className="self-center truncate text-right text-[9px] leading-none text-slate-500" style={TNUM}>
          {amount || "—"}
        </span>
        <span className={`self-center justify-self-end rounded px-0.5 text-[10px] font-semibold leading-none ${pc != null ? bgChg(pc) : ""}`} style={TNUM}>
          {pc != null ? fmtPct(pc) : ""}
        </span>
      </div>
    </Tag>
  );
}

/* ================= 变体 3: plain + 财务列(extraCols/leadingCols/sparkExtra) ================= */
function FinanceRow({ Tag, rootRef, onClick, className, active, accent, rank, badge, leadingCols, extraCols, sparkExtra, onRemove, name, subtitle, sp, sparkData, p, pc }: FinanceRowProps) {
  const prefix = (rank != null ? "auto " : "") + (badge ? "auto " : "");
  const lead = leadingCols ? leadingCols.map((c) => `${c.w}px`).join(" ") + " " : "";
  const cols = `${prefix}${lead}72px minmax(0,1fr) 60px ${extraCols ? extraCols.map((c) => `${c.w}px`).join(" ") : ""}${onRemove ? " auto" : ""}`;
  return (
    <Tag
      ref={(el: HTMLElement | null) => { rootRef.current = el; }}
      onClick={onClick}
      className={`group block w-full rounded px-2 py-[4px] text-left transition-colors hover:bg-slate-800/40 hover:shadow-[inset_0_0_0_1px_rgba(34,211,238,0.22)] ${active ? "bg-cyan-500/10 ring-1 ring-cyan-500/40" : ""} ${className || ""}`}
    >
      {accent && (
        <span aria-hidden className="absolute left-0 top-0 h-full w-[3px] rounded-l" style={{ background: accent, opacity: 0.55 }} />
      )}
      <div className="grid items-center gap-x-1" style={{ gridTemplateColumns: cols, gridTemplateRows: "20px 16px" }}>
        {rank != null && (
          <div className="row-span-2 self-center text-[11px] font-bold leading-none" style={{ color: rank <= 3 ? [RANK_GOLD, RANK_SILVER, RANK_BRONZE][rank - 1] : CROSSHAIR, ...TNUM }}>
            {rank}
          </div>
        )}
        {badge && (
          <div className="row-span-2 self-center">
            <span className="w-6 shrink-0 rounded-sm bg-slate-700/50 text-center text-[8px] leading-3 text-slate-400">{badge}</span>
          </div>
        )}
        {leadingCols?.map((c, i) => (
          <div key={i} className="flex min-w-0 items-center gap-1 overflow-hidden whitespace-nowrap leading-none">
            {c.top ?? <span />}
          </div>
        ))}
        <div className="row-span-2 flex min-w-0 flex-col justify-center gap-1 leading-none">
          <span className="truncate text-[11px] text-slate-200">{name}</span>
          <span className="text-[10px] text-slate-500">{subtitle}</span>
        </div>
        <div className="flex h-[20px] min-w-0 items-center self-center">
          {sp && sp.points.length > 1 ? (
            <Spark points={sp.points} prec={sp.prec} width={160} height={20} fluid emptyLabel="—" session={sparkData?.session || "ashare"} />
          ) : (
            <span className="text-[10px] text-slate-600">——</span>
          )}
        </div>
        <Stat label="价" value={p != null ? fmtPrice(p) : "—"} valueCls={`font-semibold ${p != null ? clsChg(p) : "text-slate-600"}`} />
        {extraCols?.map((c, i) => (
          <div key={i} className="flex min-w-0 items-center justify-end gap-1 overflow-hidden whitespace-nowrap leading-none">
            {c.top ?? <span />}
          </div>
        ))}
        {leadingCols?.map((c, i) => (
          <div key={i} className="flex min-w-0 items-center gap-1 overflow-hidden whitespace-nowrap leading-none">
            {c.bottom ?? <span />}
          </div>
        ))}
        <div className="flex h-[16px] min-w-0 items-center justify-between gap-1.5 self-center">{sparkExtra}</div>
        <Stat label="幅" value={pc != null ? fmtPct(pc, 2) : ""} valueCls={`font-semibold ${pc != null ? clsChg(pc) : "text-slate-600"}`} />
        {extraCols?.map((c, i) => (
          <div key={i} className="flex min-w-0 items-center justify-end gap-1 overflow-hidden whitespace-nowrap leading-none">
            {c.bottom ?? <span />}
          </div>
        ))}
        {onRemove && (
          <div className="row-span-2 self-center">
            <button onClick={(e) => { e.stopPropagation(); onRemove(); }} className="text-[10px] leading-none text-slate-600 opacity-0 transition-opacity hover:text-rose-400 group-hover:opacity-100" title="移除">×</button>
          </div>
        )}
      </div>
    </Tag>
  );
}

/* ================= 变体 4: plain/card 双行 Grid(个股/商品) ================= */
function PlainGridRow({ variant, Tag, rootRef, onClick, active, accent, rank, badge, onRemove, name, subtitle, sp, sparkData, p, pc, amount, turnover, fl, compact, ratioBar, tag, bd, boards }: PlainGridRowProps) {
  const hasFlow = Boolean(fl);
  const hasAmount = Boolean(amount);
  const hasTurnover = Boolean(turnover);
  const nameW = variant === "card" ? "56px" : "72px";
  const skin =
    variant === "card"
      ? "border border-slate-700/25 bg-slate-800/15 hover:border-cyan-500/40 hover:bg-slate-800/30"
      : "hover:bg-slate-800/40 hover:shadow-[inset_0_0_0_1px_rgba(34,211,238,0.22)]";

  let gridCols: string;
  let sparkColSpan: number;
  const prefix = (rank != null ? "auto " : "") + (badge ? "auto " : "");
  const suffix = onRemove ? " auto" : "";

  if (hasFlow) {
    gridCols = `${prefix}${nameW} minmax(0,1fr) minmax(0,1fr) ${hasAmount ? "64px" : "0px"} ${variant === "card" ? "54px" : "60px"}${suffix}`;
    sparkColSpan = 2;
  } else if (hasAmount || hasTurnover) {
    gridCols = `${prefix}${nameW} minmax(0,1fr) 64px ${variant === "card" ? "54px" : "60px"}${suffix}`;
    sparkColSpan = 1;
  } else {
    gridCols = `${prefix}${nameW} minmax(0,1fr) 72px 52px${suffix}`;
    sparkColSpan = 3;
  }

  return (
    <Tag
      ref={(el: HTMLElement | null) => { rootRef.current = el; }}
      onClick={onClick}
      className={`group block w-full rounded px-2 py-[4px] text-left transition-colors ${skin} ${
        accent ? "relative" : ""
      } ${active ? "bg-cyan-500/10 ring-1 ring-cyan-500/40" : ""}`}
    >
      {accent && (
        <span aria-hidden className="absolute left-0 top-0 h-full w-[3px] rounded-l" style={{ background: accent, opacity: 0.55 }} />
      )}
      <div
        className="grid items-center gap-x-1"
        style={{
          gridTemplateColumns: gridCols,
          gridTemplateRows: "20px 16px",
        }}
      >
        {rank != null && (
          <div className={`row-span-2 self-center text-[11px] font-bold leading-none ${rank <= 3 ? "text-amber-400" : "text-slate-600"}`} style={TNUM}>
            {rank}
          </div>
        )}
        {badge && (
          <div className="row-span-2 self-center">
            <span className="w-6 shrink-0 rounded-sm bg-slate-700/50 text-center text-[8px] leading-3 text-slate-400">{badge}</span>
          </div>
        )}
        <div className="row-span-2 flex min-w-0 flex-col justify-center gap-1 leading-none">
          <span className="truncate text-[11px] text-slate-200">{name}</span>
          <span className="text-[10px] text-slate-500">{subtitle}</span>
        </div>
        <div className={`flex h-[20px] min-w-0 items-center self-center`} style={{ gridColumn: `span ${sparkColSpan}` }}>
          {sp && sp.points.length > 1 ? (
            <Spark points={sp.points} prec={sp.prec} width={160} height={20} fluid emptyLabel="—" session={sparkData?.session || "ashare"} />
          ) : (
            <span className="text-[10px] text-slate-600">——</span>
          )}
        </div>
        {hasFlow || hasAmount ? (
          hasAmount ? <Stat label="额" value={amount} /> : <div />
        ) : null}
        {hasFlow || hasAmount || hasTurnover ? (
          <Stat label="价" value={p != null ? fmtPrice(p) : "—"} />
        ) : null}
        {onRemove && (
          <div className="row-span-2 self-center">
            <button
              onClick={(e) => { e.stopPropagation(); onRemove(); }}
              className="text-[10px] leading-none text-slate-600 opacity-0 transition-opacity hover:text-rose-400 group-hover:opacity-100"
              title="移除"
            >
              ×
            </button>
          </div>
        )}
        {hasFlow ? (
          <>
            <Stat label={compact ? "净" : "主力净额"} value={fl ? fmtYuan(fl.netIn) : "—"} valueCls={`font-semibold ${fl ? clsChg(fl.netIn) : "text-slate-600"}`} />
            <div className="flex min-w-0 items-center gap-1 overflow-hidden whitespace-nowrap leading-none">
              <span className="shrink-0 text-[9px] text-slate-600">{compact ? "占" : "净占比"}</span>
              <span className="h-1 min-w-0 flex-1 self-center rounded-full bg-slate-800">
                <span className={`block h-1 rounded-full ${fl && fl.netRatio < 0 ? "bg-emerald-400/80" : "bg-rose-400/80"}`} style={{ width: `${ratioBar}%` }} />
              </span>
              <span className={`truncate text-[11px] ${fl ? clsChg(fl.netRatio) : "text-slate-600"}`} style={TNUM}>{fl ? `${fl.netRatio.toFixed(1)}%` : "—"}</span>
            </div>
            {hasTurnover ? <Stat label="换" value={turnover} /> : <div />}
            <Stat label="幅" value={pc != null ? fmtPct(pc, variant === "card" ? 1 : 2) : ""} valueCls={`font-semibold ${pc != null ? clsChg(pc) : "text-slate-600"}`} />
          </>
        ) : hasAmount || hasTurnover ? (
          <>
            <div />
            {hasTurnover ? <Stat label="换" value={turnover} /> : <div />}
            <Stat label="幅" value={pc != null ? fmtPct(pc, variant === "card" ? 1 : 2) : ""} valueCls={`font-semibold ${pc != null ? clsChg(pc) : "text-slate-600"}`} />
          </>
        ) : (
          <>
            <div />
            <Stat label="价" value={p != null ? fmtPrice(p) : "—"} />
            <Stat label="幅" value={pc != null ? fmtPct(pc, 1) : ""} valueCls={`font-semibold ${pc != null ? clsChg(pc) : "text-slate-600"}`} />
          </>
        )}
      </div>
      {(tag || boards) && (
        <div className="mt-0.5 flex h-[13px] min-w-0 items-center gap-1.5 text-[9px] leading-none">
          {tag && (
            <span className="shrink-0 rounded-sm bg-slate-700/40 px-1 py-px text-[8px] text-slate-400">{tag}</span>
          )}
          {boards && bd && (bd.industry || (bd.concepts?.length ?? 0) > 0) && (
            <span className="truncate">
              {bd.industry && <span className="text-cyan-500/80">{bd.industry}</span>}
              {(bd.concepts?.length ?? 0) > 0 && (
                <span className="text-slate-600">
                  {bd.industry ? " · " : ""}
                  {(bd.concepts ?? []).join("/")}
                </span>
              )}
            </span>
          )}
        </div>
      )}
    </Tag>
  );
}

/* ================= 主组件: hooks 预处理 + 变体分发 ================= */
export const QuoteRow = memo(function QuoteRow({
  code, name, price, pct, tag, rank, amount, turnover, spark, boards, flow, variant = "plain", active, onClick, onRemove,
  unit, sparkData, sparkNote, accent, badge, basis, className, extraCols, leadingCols, sparkExtra,
}: QuoteRowProps) {
  // 行宽自适应: 实测宽度决定资金流标签形态(主力净额/净占比 ↔ 净/占)
  // 仅 flow 模式需要; compact 模式无需
  const rootRef = useRef<HTMLElement | null>(null);
  const [rowWidth, setRowWidth] = useState(0);
  useEffect(() => {
    if (!flow) return;
    const el = rootRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => setRowWidth(entries[0].contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, [flow]);
  const compact = rowWidth > 0 && rowWidth < COMPACT_WIDTH;

  const needsVisible = (spark && !sparkData) || boards || flow;
  const [observedVisible, setObservedVisible] = useState(false);
  useEffect(() => {
    // 懒加载依赖就绪(sparkData/boards/flow 到达)后强制可见 — 否则 IO 未触发过的行(面板底部)
    // 会永远 visible=false, 报价订阅禁用 → 价格空态"—"(0820-25 实锤: BTC 行)
    if (isTv || !needsVisible) return;
    const el = rootRef.current;
    if (!el) return;
    const io = new IntersectionObserver((entries) => {
      setObservedVisible(entries.some((e) => e.isIntersecting));
    });
    io.observe(el);
    return () => io.disconnect();
  }, [needsVisible]);
  // TV 与无需懒加载的行直接派生为可见，避免在 effect 中同步 setState。
  const visible = isTv || !needsVisible || observedVisible;

  const hub = useQuote(code, visible);
  const p = hub?.price ?? price;
  const pc = hub?.pct ?? pct;

  const { data: minute } = usePolling(
    () => (spark && !sparkData && visible ? api.minute(code) : Promise.resolve(null)),
    POLL.MINUTE,
    [code, spark, visible, !!sparkData],
    (a, b) => JSON.stringify(a) === JSON.stringify(b)
  );
  const { data: bd } = usePolling(
    () => (boards && visible ? api.stockBoards(code) : Promise.resolve(null)),
    5 * 60 * 1000,
    [code, boards, visible]
  );
  const { data: fl } = usePolling(
    () => (flow && visible ? api.stockFlow(code) : Promise.resolve(null)),
    POLL.STOCK_FLOW,
    [code, flow, visible]
  );

  const sp = sparkData ?? (spark && minute ? { points: minute.points, prec: minute.prec } : null);

  const Tag: RowTag = onClick ? "button" : "div";
  const ratioBar = fl ? Math.min(100, Math.abs(fl.netRatio) * 2) : 0;
  const subtitle = unit ?? code;
  const shared = { Tag, rootRef, onClick, className, active, name, subtitle, sp, sparkData, sparkNote, p, pc };

  if (variant === "compact") {
    return <CompactRow {...shared} variant={variant} basis={basis} accent={accent} badge={badge} pct={pc} />;
  }
  if (variant === "index") {
    return <IndexRow {...shared} badge={badge} amount={amount} />;
  }
  if (variant === "plain" && (extraCols?.length || leadingCols?.length || sparkExtra)) {
    return <FinanceRow {...shared} accent={accent} rank={rank} badge={badge} leadingCols={leadingCols} extraCols={extraCols} sparkExtra={sparkExtra} onRemove={onRemove} />;
  }
  return (
    <PlainGridRow
      {...shared}
      variant={variant}
      accent={accent}
      rank={rank}
      badge={badge}
      onRemove={onRemove}
      amount={amount}
      turnover={turnover}
      fl={fl}
      compact={compact}
      ratioBar={ratioBar}
      tag={tag}
      bd={bd}
      boards={boards}
    />
  );
});

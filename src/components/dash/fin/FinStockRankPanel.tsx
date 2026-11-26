import { useMemo, useState } from "react";
import { BarChart3 } from "lucide-react";
import { Panel, type PanelZoomProps } from "../Panel";
import { useFinBoard } from "./useFinData";
import { type FinBoardStock } from "@/lib/api";
import { fmtPct } from "@/lib/format";
import { useFin } from "./FinContext";
import { PeriodTabs } from "./PeriodTabs";
import { QuoteRow } from "../QuoteRow";
import { TNUM, fmtYi, prefixCode } from "./utils";
import { AsyncContent, TabBar } from "../SharedUI";
import { SERIES, UP, DOWN } from "@/lib/colors";

type Tab = "profit" | "growth";
const TABS: { key: Tab; label: string }[] = [
  { key: "profit", label: "净利额" },
  { key: "growth", label: "增速" },
];

/** 个股盈利榜 TOP20: 净利额 | 增速 双 Tab, 行内相对值底条, 点击载入公司 */
export function FinStockRankPanel({ className = "", ...zoomProps }: { className?: string } & PanelZoomProps) {
  const [tab, setTab] = useState<Tab>("profit");
  const { select, period } = useFin();
  const { data, error, loading, retry } = useFinBoard(period);

  const rows = useMemo(() => {
    const stocks = data?.stocks ?? [];
    if (tab === "profit") return stocks.slice(0, 20);
    // 增速 Tab: 同比降序, 亏损企业(增速失真)置底
    const profit = stocks.filter((s) => s.netProfit > 0).sort((a, b) => b.profitYoY - a.profitYoY);
    const loss = stocks.filter((s) => s.netProfit <= 0);
    return [...profit, ...loss].slice(0, 20);
  }, [data, tab]);

  const maxV = Math.max(...rows.map((s) => (tab === "profit" ? s.netProfit : Math.max(s.profitYoY, 0))), 1);

  return (
    <Panel
      className={className}
      {...zoomProps}
      title="个股盈利榜"
      icon={<BarChart3 size={14} />}
      accent={SERIES[1]}
      right={
        <div className="flex items-center gap-2 text-meta">
          <PeriodTabs />
          <span className="h-3 w-px bg-db-border" />
          <TabBar tabs={TABS} active={tab} onChange={setTab} accent="cyan" />
        </div>
      }
    >
      <AsyncContent loading={loading} error={error} empty={rows.length === 0} emptyMessage="当前非财报密集披露期" onRetry={retry}>
        <div className="h-full overflow-y-auto py-0.5">
          {rows.map((s, i) => (
            <RankRow key={s.code} s={s} rank={i + 1} tab={tab} maxV={maxV} onPick={() => select(prefixCode(s.code), s.name)} />
          ))}
        </div>
      </AsyncContent>
    </Panel>
  );
}

function RankRow({
  s,
  rank,
  tab,
  maxV,
  onPick,
}: {
  s: FinBoardStock;
  rank: number;
  tab: Tab;
  maxV: number;
  onPick: () => void;
}) {
  const barV = tab === "profit" ? Math.max(s.netProfit, 0) : Math.max(s.profitYoY, 0);
  const barColor = tab === "profit" ? UP : s.profitYoY >= 0 ? UP : DOWN;
  const loss = s.netProfit <= 0;
  return (
    <div className="relative w-full">
      {/* 行内相对值底条(4% 透明度, 不拦截点击) */}
      <span className="pointer-events-none absolute bottom-0 left-0 top-0" style={{ width: `${(barV / maxV) * 100}%`, background: barColor, opacity: 0.04 }} />
      <QuoteRow
        variant="plain"
        spark
        code={prefixCode(s.code)}
        name={s.name}
        unit={s.code}
        rank={rank}
        onClick={onPick}
        // 净利额/增速/ROE: 分时图下方一行, 小字标签前置, 组间两端对齐
        sparkExtra={
          tab === "profit" ? (
            <>
              <span className="flex min-w-0 items-center gap-1">
                <span className="shrink-0 text-caption text-db-faint">净利</span>
                <span className="truncate text-body font-semibold text-db-primary" style={TNUM}>{fmtYi(s.netProfit)}</span>
              </span>
              <span className="flex min-w-0 items-center gap-1">
                <span className="shrink-0 text-caption text-db-faint">增速</span>
                <span className={`truncate text-body font-semibold ${s.profitYoY >= 0 ? "text-rose-400" : "text-emerald-400"}`} style={TNUM}>{fmtPct(s.profitYoY, 1)}</span>
              </span>
              <span className="flex min-w-0 items-center gap-1">
                <span className="shrink-0 text-caption text-db-faint">ROE</span>
                <span className="truncate text-body text-db-tertiary" style={TNUM}>{s.roe.toFixed(1)}%</span>
              </span>
            </>
          ) : (
            <>
              <span className="flex min-w-0 items-center gap-1">
                <span className="shrink-0 text-caption text-db-faint">增速</span>
                <span className={`truncate text-body font-semibold ${s.profitYoY >= 0 ? "text-rose-400" : "text-emerald-400"}`} style={TNUM}>{fmtPct(s.profitYoY, 1)}</span>
              </span>
              <span className="flex min-w-0 items-center gap-1">
                <span className="shrink-0 text-caption text-db-faint">净利</span>
                <span className="truncate text-body text-db-tertiary" style={TNUM}>{fmtYi(s.netProfit)}</span>
              </span>
              {loss ? (
                <span className={`truncate text-body ${s.profitYoY > 0 ? "text-amber-400" : "text-emerald-400"}`}>{s.profitYoY > 0 ? "扭亏" : "亏损"}</span>
              ) : (
                <span className="flex min-w-0 items-center gap-1">
                  <span className="shrink-0 text-caption text-db-faint">ROE</span>
                  <span className="truncate text-body text-db-tertiary" style={TNUM}>{s.roe.toFixed(1)}%</span>
                </span>
              )}
            </>
          )
        }
      />
    </div>
  );
}

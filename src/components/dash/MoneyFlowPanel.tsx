import { ArrowLeftRight, X } from "lucide-react";
import { Panel, type PanelZoomProps } from "./Panel";
import { QuoteRow } from "./QuoteRow";
import { usePolling } from "@/hooks/usePolling";
import { api } from "@/lib/api";
import { POLL } from "@/lib/intervals";
import { clsChg, fmtYuan } from "@/lib/format";

/** 实时资金流向 — 个股主力净流入 TOP(东财口径)。
 *  sectorFilter: 点击板块资金流向图选中的板块 → 拉该板块成分股主力净流入排行(东财 fs=b:板块代码) */
export function MoneyFlowPanel({
  className = "",
  sectorFilter = null,
  onClearSector,
  ...zoomProps
}: { className?: string; sectorFilter?: { code: string; name: string } | null; onClearSector?: () => void } & PanelZoomProps) {
  const { data, error } = usePolling(
    () => (sectorFilter ? api.boardMoneyflow(sectorFilter.code, 15) : api.moneyflow(15)),
    POLL.MONEYFLOW,
    [sectorFilter?.code]
  );

  const total = data?.reduce((s, d) => s + d.netIn, 0) ?? 0;

  return (
    <Panel
      className={className}
      {...zoomProps}
      title="主力净流入排行"
      icon={<ArrowLeftRight size={14} />}
      accent="#fb7185"
      right={
        <span className="flex items-center gap-2">
          {sectorFilter && (
            <span className="flex items-center gap-1 rounded bg-rose-500/15 px-1.5 py-0.5 text-meta text-rose-300">
              {sectorFilter.name}
              <button
                type="button"
                onClick={onClearSector}
                title="清除筛选"
                className="rounded hover:text-rose-100"
              >
                <X size={11} />
              </button>
            </span>
          )}
          <span className="text-meta text-db-muted">
            {sectorFilter ? `板块内 ${data?.length ?? 0} 只` : `TOP15 合计`}
            <span className={clsChg(total)}> {fmtYuan(total)}</span>
          </span>
        </span>
      }
    >
      <div className="h-full overflow-y-auto p-1.5">
        <div className="flex items-center justify-between px-2 py-1 text-meta text-db-muted">
          <span>个股 · 主力净额/净占比</span>
          <span>成交额 · 现价</span>
        </div>
        {data?.map((s) => (
          <QuoteRow
            key={s.symbol}
            code={s.symbol}
            name={s.name}
            amount={s.amount > 0 ? fmtYuan(s.amount) : undefined}
            turnover={s.turnover > 0 ? `${s.turnover.toFixed(1)}%` : undefined}
            spark
            boards
            flow
          />
        ))}
        {data && data.length === 0 && sectorFilter && (
          <div className="p-6 text-center text-body text-db-faint">
            该板块暂无成分股主力净流入数据（可能已退市/停牌或无交易）
          </div>
        )}
        {!data && (
          <div className="p-6 text-center text-body text-db-faint">
            {error ? <span className="text-rose-400/80">资金流数据源连接失败,自动重试中…<br />{error}</span> : "资金流数据加载中…"}
          </div>
        )}
      </div>
    </Panel>
  );
}

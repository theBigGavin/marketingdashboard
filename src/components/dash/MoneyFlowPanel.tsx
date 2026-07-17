import { Panel } from "./Panel";
import { QuoteRow } from "./QuoteRow";
import { usePolling } from "@/hooks/usePolling";
import { api } from "@/lib/api";
import { clsChg, fmtYuan } from "@/lib/format";

/** 实时资金流向 — 主力净流入 TOP(东财口径) */
export function MoneyFlowPanel({ className = "" }: { className?: string }) {
  const { data, error } = usePolling(() => api.moneyflow(15), 20000);

  const total = data?.reduce((s, d) => s + d.netIn, 0) ?? 0;

  return (
    <Panel
      className={className}
      title="实时资金流向 · 主力净流入"
      icon="⇄"
      accent="#fb7185"
      right={
        <span className="text-[10px] text-slate-500">
          TOP15 合计 <span className={clsChg(total)}>{fmtYuan(total)}</span>
        </span>
      }
    >
      <div className="h-full overflow-y-auto p-1.5">
        <div className="flex items-center justify-between px-2 py-1 text-[10px] text-slate-500">
          <span>个股 · 主力净额/净占比</span>
          <span>成交额 · 现价</span>
        </div>
        {data?.map((s) => (
          <QuoteRow
            key={s.symbol}
            code={s.symbol}
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
        {!data && (
          <div className="p-6 text-center text-[11px] text-slate-600">
            {error ? <span className="text-rose-400/80">资金流数据源连接失败,自动重试中…<br />{error}</span> : "资金流数据加载中…"}
          </div>
        )}
      </div>
    </Panel>
  );
}

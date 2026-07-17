import { useState } from "react";
import { Panel } from "./Panel";
import { QuoteRow } from "./QuoteRow";
import { usePolling } from "@/hooks/usePolling";
import { api } from "@/lib/api";
import { fmtYuan } from "@/lib/format";

type Tab = "hot" | "up" | "down";
const TABS: { key: Tab; label: string; sort: "amount" | "changepercent"; asc: 0 | 1 }[] = [
  { key: "hot", label: "热门股", sort: "amount", asc: 0 },
  { key: "up", label: "涨幅榜", sort: "changepercent", asc: 0 },
  { key: "down", label: "跌幅榜", sort: "changepercent", asc: 1 },
];

/** 个股榜单:热门(成交额) / 涨幅 / 跌幅 */
export function RankPanel({ className = "" }: { className?: string }) {
  const [tab, setTab] = useState<Tab>("hot");
  const conf = TABS.find((t) => t.key === tab)!;
  const { data, error } = usePolling(() => api.rank(conf.sort, conf.asc, 30), 15000, [tab]);

  return (
    <Panel
      className={className}
      title="个股榜单"
      icon="≣"
      accent="#fbbf24"
      right={
        <div className="flex items-center gap-1 text-[11px]">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`rounded px-2 py-0.5 ${tab === t.key ? "bg-amber-500/20 text-amber-300" : "text-slate-400 hover:text-slate-200"}`}
            >
              {t.label}
            </button>
          ))}
        </div>
      }
    >
      <div className="h-full overflow-y-auto p-1.5">
        <div className="flex items-center justify-between px-2 py-1 text-[10px] text-slate-500">
          <span># 名称</span>
          <span>主力资金 · 成交额 · 现价</span>
        </div>
        {data?.map((s, i) => (
          <QuoteRow
            key={s.symbol}
            code={s.symbol}
            name={s.name}
            price={s.price}
            pct={s.pct}
            rank={i + 1}
            amount={s.amount > 0 ? fmtYuan(s.amount) : undefined}
            turnover={s.turnover > 0 ? `${s.turnover.toFixed(1)}%` : undefined}
            spark
            boards
            flow
          />
        ))}
        {!data && (
          <div className="p-6 text-center text-[11px] text-slate-600">
            {error ? <span className="text-rose-400/80">榜单源连接失败,自动重试中…<br />{error}</span> : "榜单加载中…"}
          </div>
        )}
      </div>
    </Panel>
  );
}

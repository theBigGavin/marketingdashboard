import { useState } from "react";
import { Zap } from "lucide-react";
import { Panel, type PanelZoomProps } from "../Panel";
import { usePolling } from "@/hooks/usePolling";
import { api, type FinForecastItem } from "@/lib/api";
import { POLL } from "@/lib/intervals";
import { TNUM, fmtYi, forecastTone } from "./utils";
import { QuoteRow } from "../QuoteRow";
import { ToneChip } from "../SharedUI";
import { useFin } from "./FinContext";
import { AsyncContent } from "../SharedUI";
import { clsChg, fmtPct } from "@/lib/format";
import { prefixCode } from "./utils";

/** 明细行: 名称+代码 | 报价 | 分时 | [日期 类型徽标 净利区间 同比] — 统一 QuoteRow */
function Row({ it }: { it: FinForecastItem }) {
  const { select } = useFin();
  const tone = forecastTone(it.type);
  const mid = (it.yoyLow + it.yoyHigh) / 2;
  const yoyCls = clsChg(mid);
  return (
    <QuoteRow
      variant="plain"
      spark
      code={prefixCode(it.code)}
      name={it.name}
      unit={it.code}
      onClick={() => select(prefixCode(it.code), it.name)}
      // 预计净利区间 + 同比幅度: 与分时图同列下一行, 小字标签前置, 组间两端对齐
      sparkExtra={
        <>
          <span className="flex min-w-0 items-center gap-1">
            <span className="shrink-0 text-caption text-db-faint">净利</span>
            <span className="truncate text-body text-db-secondary" style={TNUM}>{fmtYi(it.profitLow)}~{fmtYi(it.profitHigh)}</span>
          </span>
          <span className="flex min-w-0 items-center gap-1">
            <span className="shrink-0 text-caption text-db-faint">同比</span>
            <span className={`truncate text-body ${yoyCls}`} style={TNUM}>{fmtPct(it.yoyLow, 1)}~{fmtPct(it.yoyHigh, 1)}</span>
          </span>
        </>
      }
      leadingCols={[
        {
          // 日期 + 趋势 pill 同列第一列(上:日期, 下:类型徽标)
          top: <span className="text-caption text-db-muted" style={TNUM}>{it.date.slice(5)}</span>,
          bottom: (
            <ToneChip tone={tone === "good" ? "rose" : tone === "bad" ? "emerald" : "slate"} dot={it.type === "首亏"}>
              {it.type}
            </ToneChip>
          ),
          w: 40,
        },
      ]}
    />
  );
}

/** 业绩预告: 3px 贴头堆叠统计条(rose/emerald/slate) + 统计数字入标题栏 + 固定列紧凑表(公告日倒序) */
export function FinForecastPanel({ className = "", ...zoomProps }: { className?: string } & PanelZoomProps) {
  const [retry, setRetry] = useState(0);
  const { period } = useFin();
  const { data, error, loading } = usePolling(() => api.financeForecast(period), POLL.FIN, [retry, period]);

  const stats = data?.stats;
  const hasItems = (data?.items.length ?? 0) > 0;
  const total = stats ? stats.good + stats.bad + stats.neutral : 0;

  return (
    <Panel
      className={className}
      {...zoomProps}
      title="业绩预告"
      icon={<Zap size={14} />}
      accent="#fbbf24"
      right={
        stats &&
        hasItems && (
          <div className="flex items-center gap-2 text-meta" style={TNUM}>
            <span className="text-rose-400">预喜 {stats.good}▲</span>
            <span className="text-emerald-400">预悲 {stats.bad}▼</span>
            <span className="text-db-muted">未定 {stats.neutral}</span>
          </div>
        )
      }
    >
      <AsyncContent loading={loading} error={error} empty={!data || !hasItems} emptyMessage="当前非业绩预告密集披露期" onRetry={() => setRetry((r) => r + 1)}>
        {data && hasItems && <div className="flex h-full min-h-0 flex-col">
          {/* 3px 贴头堆叠条: 预喜 rose / 预悲 emerald / 未定 slate */}
          <div className="flex h-[3px] w-full shrink-0">
            {stats!.good > 0 && <div className="h-full bg-rose-400" style={{ width: `${(stats!.good / total) * 100}%` }} />}
            {stats!.bad > 0 && <div className="h-full bg-emerald-400" style={{ width: `${(stats!.bad / total) * 100}%` }} />}
            {stats!.neutral > 0 && (
              <div className="h-full bg-slate-600" style={{ width: `${(stats!.neutral / total) * 100}%` }} />
            )}
          </div>
          {/* 明细表 */}
          <div className="min-h-0 flex-1 overflow-y-auto py-0.5">
            {data.items.map((it) => (
              <Row key={`${it.date}-${it.code}`} it={it} />
            ))}
          </div>
        </div>}
      </AsyncContent>
    </Panel>
  );
}

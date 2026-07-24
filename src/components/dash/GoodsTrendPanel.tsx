import { useMemo, useState } from "react";
import { Panel, type PanelZoomProps } from "./Panel";
import { GoodsRow } from "./GoodsRow";
import { usePolling } from "@/hooks/usePolling";
import { useSharedPolling } from "@/hooks/useSharedPolling";
import { api } from "@/lib/api";
import { ALL_GOODS_SINA, GOODS, type GoodsGroupId } from "@/config/goods";

const RANGES = [30, 90, 180, 365] as const;

interface GoodsTrendPanelProps extends PanelZoomProps {
  group: GoodsGroupId;
  title: string;
  accent: string;
  className?: string;
}

/** 商品期货日线趋势面板: 分组品种行 + 区间切换(30/90/180/365 天) */
export function GoodsTrendPanel({ group, title, accent, className = "", ...zoomProps }: GoodsTrendPanelProps) {
  const [range, setRange] = useState<number>(90);
  const defs = useMemo(() => GOODS.filter((g) => g.group === group), [group]);

  // 全部品种实时报价共享轮询(所有趋势面板同 key, 仅一个请求)
  const { data: quotes } = useSharedPolling(`futures:${ALL_GOODS_SINA.join(",")}`, () => api.futuresBatch(ALL_GOODS_SINA), 30000);

  // 本组品种日线K线(全历史, 前端按区间切片)
  const { data: dailies } = usePolling(
    async () => {
      const rs = await Promise.allSettled(defs.map((g) => api.futureDaily(g.sina)));
      const map: Record<string, { t: string; c: number }[]> = {};
      rs.forEach((r, i) => {
        if (r.status === "fulfilled") map[defs[i].code] = r.value.points.map((p) => ({ t: p.t, c: p.c }));
      });
      return map;
    },
    30 * 60 * 1000,
    [group]
  );

  return (
    <Panel
      className={className}
      {...zoomProps}
      title={title}
      icon="◈"
      accent={accent}
      right={
        <div className="flex items-center gap-1 text-[11px]">
          {RANGES.map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`rounded px-1.5 py-0.5 ${range === r ? "bg-cyan-500/20 text-cyan-300" : "text-slate-400 hover:text-slate-200"}`}
            >
              {r}d
            </button>
          ))}
        </div>
      }
    >
      <div className="flex h-full min-h-0 flex-col divide-y divide-slate-800/60 overflow-y-auto p-1">
        {defs.map((g) => {
          const daily = (dailies?.[g.code] || []).slice(-range);
          const q = quotes?.[g.sina];
          return <GoodsRow key={g.code} name={g.name} unit={g.unit} price={q?.price} pct={q?.pct} daily={daily} />;
        })}
        {!dailies && <div className="p-4 text-center text-[10px] text-slate-600">日线数据加载中…</div>}
      </div>
    </Panel>
  );
}

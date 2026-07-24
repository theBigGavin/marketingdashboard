import { Panel, type PanelZoomProps } from "./Panel";
import { GoodsRow } from "./GoodsRow";
import { useSharedPolling } from "@/hooks/useSharedPolling";
import { api } from "@/lib/api";
import { EXCH_SHORT } from "@/config/goods";

/** 现货价格面板: 生意社当日现货价 + 日涨跌(历史积累计算) + 历史趋势线 */
export function SpotPanel({ className = "", ...zoomProps }: { className?: string } & PanelZoomProps) {
  // 与 BasisPanel 共享同 key 轮询(每小时, 服务端 8h 缓存)
  const { data } = useSharedPolling("spot:table", () => api.spotTable(), 3600000);

  return (
    <Panel
      className={className}
      {...zoomProps}
      title="现货价格"
      icon="◆"
      accent="#f5c542"
      right={<span className="text-[10px] text-slate-500">生意社{data?.date ? ` · ${data.date}` : ""}</span>}
    >
      <div className="flex h-full min-h-0 flex-col divide-y divide-slate-800/60 overflow-y-auto p-1">
        {data?.rows.map((r) => {
          const hist = (data.history[r.name] || []).map((h) => ({ t: h.t, c: h.p }));
          // 日涨跌: 有两天以上历史才显示
          const pct = hist.length > 1 && hist[hist.length - 2].c ? ((hist[hist.length - 1].c - hist[hist.length - 2].c) / hist[hist.length - 2].c) * 100 : undefined;
          return <GoodsRow key={r.name} name={r.name} unit={EXCH_SHORT[r.exchange] || r.exchange} price={r.spot} pct={pct} daily={hist} />;
        })}
        {!data && <div className="p-4 text-center text-[10px] text-slate-600">现货数据加载中…</div>}
      </div>
    </Panel>
  );
}

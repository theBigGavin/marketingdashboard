import { Panel, type PanelZoomProps } from "./Panel";
import { GoodsRow } from "./GoodsRow";
import { usePolling } from "@/hooks/usePolling";
import { useSharedPolling } from "@/hooks/useSharedPolling";
import { api, type ChemSpot } from "@/lib/api";
import { CHEM_SPOTS, EXCH_SHORT } from "@/config/goods";

/** 现货价格面板: 化工现货(生意社报价中心) + 期货品种现货(生意社现期表), 历史逐日积累 */
export function SpotPanel({ className = "", ...zoomProps }: { className?: string } & PanelZoomProps) {
  // 与 BasisPanel 共享同 key 轮询(每小时, 服务端 8h 缓存)
  const { data } = useSharedPolling("spot:table", () => api.spotTable(), 3600000);
  // 化工现货(生意社报价中心 plist 页)
  const { data: chems } = usePolling(
    async () => {
      const rs = await Promise.allSettled(CHEM_SPOTS.map((c) => api.chemSpot(c.id, c.name)));
      return rs.filter((r): r is PromiseFulfilledResult<ChemSpot> => r.status === "fulfilled").map((r) => r.value);
    },
    3600000
  );

  const dailyPct = (hist: { c: number }[]) =>
    hist.length > 1 && hist[hist.length - 2].c
      ? ((hist[hist.length - 1].c - hist[hist.length - 2].c) / hist[hist.length - 2].c) * 100
      : undefined;

  return (
    <Panel
      className={className}
      {...zoomProps}
      title="现货价格"
      icon="◆"
      accent="#f5c542"
      right={<span className="text-[10px] text-slate-500">生意社{data?.date ? ` · ${data.date}` : ""}</span>}
    >
      <div className="flex h-full min-h-0 flex-col overflow-y-auto p-1">
        {chems && chems.length > 0 && (
          <>
            <div className="px-1 pb-0.5 pt-1 text-[9px] font-medium uppercase tracking-widest text-slate-500">化工现货 · 报价中心</div>
            <div className="flex flex-col divide-y divide-slate-800/60">
              {CHEM_SPOTS.map((def) => {
                const c = chems.find((x) => x.id === def.id);
                if (!c) return null;
                const hist = c.history.map((h) => ({ t: h.t, c: h.p }));
                return <GoodsRow key={def.id} name={def.name} unit={def.unit} price={c.price} pct={dailyPct(hist)} daily={hist} />;
              })}
            </div>
          </>
        )}
        <div className="px-1 pb-0.5 pt-1 text-[9px] font-medium uppercase tracking-widest text-slate-500">期货品种现货</div>
        <div className="flex flex-col divide-y divide-slate-800/60">
          {data?.rows.map((r) => {
            const hist = (data.history[r.name] || []).map((h) => ({ t: h.t, c: h.p }));
            return <GoodsRow key={r.name} name={r.name} unit={EXCH_SHORT[r.exchange] || r.exchange} price={r.spot} pct={dailyPct(hist)} daily={hist} />;
          })}
          {!data && <div className="p-4 text-center text-[10px] text-slate-600">现货数据加载中…</div>}
        </div>
      </div>
    </Panel>
  );
}

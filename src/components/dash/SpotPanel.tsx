import { Diamond } from "lucide-react";
import { Panel, type PanelZoomProps } from "./Panel";
import { QuoteRow } from "./QuoteRow";
import { usePolling } from "@/hooks/usePolling";
import { useSharedPolling } from "@/hooks/useSharedPolling";
import { api, type ChemSpot } from "@/lib/api";
import { CHEM_SPOTS, EXCH_SHORT } from "@/config/goods";
import { POLL } from "@/lib/intervals";

/** 现货价格面板: 化工现货(生意社报价中心) + 期货品种现货(生意社现期表), 统一行格式, 历史逐日积累 */
export function SpotPanel({ className = "", ...zoomProps }: { className?: string } & PanelZoomProps) {
  // 与 BasisPanel 共享同 key 轮询(每小时, 服务端 8h 缓存)
  const { data } = useSharedPolling("spot:table", () => api.spotTable(), POLL.SPOT);
  // 化工现货(生意社报价中心 plist 页)
  const { data: chems } = usePolling(
    async () => {
      const rs = await Promise.allSettled(CHEM_SPOTS.map((c) => api.chemSpot(c.id, c.name)));
      return rs.filter((r): r is PromiseFulfilledResult<ChemSpot> => r.status === "fulfilled").map((r) => r.value);
    },
    POLL.SPOT
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
      icon={<Diamond size={14} />}
      accent="#f5c542"
      right={<span className="text-meta text-db-muted">生意社{data?.date ? ` · ${data.date}` : ""}</span>}
    >
      <div className="flex h-full min-h-0 flex-col divide-y divide-db-subtle/60 overflow-y-auto p-1">
        {CHEM_SPOTS.map((def) => {
          const c = chems?.find((x) => x.id === def.id);
          if (!c) return null;
          const hist = c.history.map((h) => ({ t: h.t, c: h.p }));
          return <QuoteRow key={def.id} code="" name={def.name} unit={def.unit} price={c.price} pct={dailyPct(hist)} spark sparkData={hist.length > 1 ? { points: hist.map((h) => ({ t: h.t, p: h.c })), prec: hist[0].c, session: "daily" } : undefined} />;
        })}
        {data?.rows.map((r) => {
          const hist = (data.history[r.name] || []).map((h) => ({ t: h.t, c: h.p }));
          return <QuoteRow key={r.name} code="" name={r.name} unit={EXCH_SHORT[r.exchange] || r.exchange} price={r.spot} pct={dailyPct(hist)} spark sparkData={hist.length > 1 ? { points: hist.map((h) => ({ t: h.t, p: h.c })), prec: hist[0].c, session: "daily" } : undefined} />;
        })}
        {!data && !chems && <div className="p-4 text-center text-meta text-db-faint">现货数据加载中…</div>}
      </div>
    </Panel>
  );
}

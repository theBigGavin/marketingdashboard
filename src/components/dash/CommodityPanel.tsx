import { Panel, type PanelZoomProps } from "./Panel";
import { QuoteRow } from "./QuoteRow";
import { usePolling } from "@/hooks/usePolling";
import { Diamond } from "lucide-react";
import { useQuotes } from "@/lib/market";
import { api, type MinuteData } from "@/lib/api";
import { COMMODITIES } from "@/config/dashboard";

/** 大宗商品纵向紧凑面板:金 / 银 / 铜 / 油 / 沪金 / BTC */
export function CommodityPanel({ className = "", ...zoomProps }: { className?: string } & PanelZoomProps) {
  // 报价: 统一报价中心(与 Tape / 商品页同帧); QuoteRow 内部 useQuote 自行订阅, 此处批量注册确保即时可用
  useQuotes(COMMODITIES.map((c) => c.code));
  const { data: minutes } = usePolling(
    async () => {
      const codes = COMMODITIES.map((c) => c.code);
      const batch = await api.batchFutureMinute(codes);
      const map: Record<string, MinuteData> = {};
      for (const [code, data] of Object.entries(batch)) {
        if (data) map[code] = data;
      }
      return map;
    },
    60000
  );

  return (
    <Panel className={className} {...zoomProps} title="大宗商品" icon={<Diamond size={14} />} accent="#f5c542"
      right={<span className="text-meta text-db-muted">10s</span>}>
      <div className="flex h-full min-h-0 flex-col divide-y divide-db-subtle/60 overflow-y-auto p-1">
        {COMMODITIES.map((c) => {
          const m = minutes?.[c.code];
          return (
            <QuoteRow
              key={c.code}
              code={c.code}
              name={c.label}
              unit={c.unit}
              accent={c.accent}
              spark
              sparkData={m && m.points.length > 1 ? { points: m.points, prec: m.prec, session: "h24" } : undefined}
            />
          );
        })}
      </div>
    </Panel>
  );
}

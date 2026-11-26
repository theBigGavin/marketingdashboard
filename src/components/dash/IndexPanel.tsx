import { Globe } from "lucide-react";
import { Panel, type PanelZoomProps } from "./Panel";
import { QuoteRow } from "./QuoteRow";
import { usePolling } from "@/hooks/usePolling";
import { useQuotes, POLL_MS } from "@/lib/market";
import { api, type MinuteData } from "@/lib/api";
import { INDICES, FOREX } from "@/config/dashboard";
import { fmtWan } from "@/lib/format";

const ALL_CODES = [...INDICES.map((i) => i.code), ...FOREX.map((i) => i.code)];

export function IndexPanel({ className = "", ...zoomProps }: { className?: string } & PanelZoomProps) {
  // 指数报价: 统一报价中心(与 Tape 等所有面板同帧); QuoteRow 内部 useQuote 自行订阅
  const quotes = useQuotes(ALL_CODES);
  const { data: minutes } = usePolling(
    async () => {
      // 全部代码(含 wh 汇率 — 服务端已接东财 USDCNH 分钟序列)
      const batch = await api.batchMinute(ALL_CODES);
      const map: Record<string, MinuteData> = {};
      for (const [code, data] of Object.entries(batch)) {
        if (data) map[code] = data;
      }
      return map;
    },
    // 与报价中心同周期(5s, TV 10s): 报价/分时两波数据同帧刷新, 不再前后脚
    POLL_MS
  );

  const groups = [
    { name: "A股", defs: INDICES.filter((d) => d.region === "CN") },
    { name: "港股 · 美股 · 汇率", defs: [...INDICES.filter((d) => d.region !== "CN"), ...FOREX] },
  ];

  return (
    <Panel className={className} {...zoomProps} title="全球关键指数" icon={<Globe size={14} />} accent="#38bdf8"
      right={<span className="text-meta text-db-muted">5s</span>}>
      <div className="flex h-full flex-col justify-between overflow-y-auto p-1">
        {groups.map((g) => (
          <div key={g.name}>
            <div className="px-1 pb-0.5 pt-1 text-caption font-medium uppercase tracking-widest text-db-muted">{g.name}</div>
            {g.defs.map((d) => {
              const m = minutes?.[d.code];
              const q = quotes?.[d.code];
              // 汇率(wh*)分时降级: 东财限流失败时服务端返回 points:[] + degraded:true,
              // 迷你图置空, 显示诚实占位(最新价+日涨跌仍由报价中心提供, 绝不整卡报错/伪造曲线)
              const fxDegraded = d.code.startsWith("wh") && m != null && (m.degraded || m.points.length <= 1);
              return (
                <QuoteRow
                  key={d.code}
                  variant="index"
                  code={d.code}
                  name={d.label}
                  badge={d.region}
                  // 成交额: 仅非美股有(腾讯口径)
                  amount={q?.amount && d.region !== "US" ? fmtWan(q.amount) : undefined}
                  sparkData={m && m.points.length > 1 ? { points: m.points, prec: m.prec, session: d.region === "CN" ? "ashare" : "h24" } : undefined}
                  sparkNote={fxDegraded ? "分时暂不可用·上游限流" : undefined}
                />
              );
            })}
          </div>
        ))}
      </div>
    </Panel>
  );
}

import { useMemo, useState } from "react";
import { Panel, type PanelZoomProps } from "./Panel";
import { useSharedPolling } from "@/hooks/useSharedPolling";
import { api, type SpotRow } from "@/lib/api";
import { clsChg, fmtPct, fmtPrice } from "@/lib/format";
import { EXCH_SHORT } from "@/config/goods";

const TNUM = { fontVariantNumeric: "tabular-nums" } as const;

type SortKey = "name" | "spot" | "futures" | "basis" | "basisPct";
const COLS: { key: SortKey; label: string; align?: "right" }[] = [
  { key: "name", label: "品种" },
  { key: "spot", label: "现货价", align: "right" },
  { key: "futures", label: "期货价", align: "right" },
  { key: "basis", label: "基差", align: "right" },
  { key: "basisPct", label: "基差率", align: "right" },
];

/** 现期对照表(生意社): 默认按 |基差率| 降序, 点击表头切换排序 */
export function BasisPanel({ className = "", ...zoomProps }: { className?: string } & PanelZoomProps) {
  const { data } = useSharedPolling("spot:table", () => api.spotTable(), 3600000);
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<1 | -1>(-1);

  const rows = useMemo(() => {
    const rs = [...(data?.rows || [])];
    if (!sortKey) rs.sort((a, b) => Math.abs(b.basisPct) - Math.abs(a.basisPct));
    else {
      rs.sort((a, b) => {
        const va = a[sortKey], vb = b[sortKey];
        const cmp = typeof va === "string" ? va.localeCompare(vb as string, "zh") : (va as number) - (vb as number);
        return sortDir * cmp;
      });
    }
    return rs;
  }, [data, sortKey, sortDir]);

  const clickSort = (k: SortKey) => {
    if (sortKey === k) setSortDir((d) => (d === 1 ? -1 : 1));
    else { setSortKey(k); setSortDir(k === "name" ? 1 : -1); }
  };

  return (
    <Panel
      className={className}
      {...zoomProps}
      title="现期对照 · 基差"
      icon="▥"
      accent="#38bdf8"
      right={<span className="text-[10px] text-slate-500">{data ? `${data.rows.length} 品种` : ""}</span>}
    >
      <div className="h-full min-h-0 overflow-y-auto p-1">
        <div className="grid grid-cols-[1fr_76px_76px_64px_64px] gap-1 px-2 py-1 text-[10px] text-slate-500">
          {COLS.map((c) => (
            <button
              key={c.key}
              onClick={() => clickSort(c.key)}
              className={`text-left ${c.align === "right" ? "text-right" : ""} hover:text-slate-300 ${sortKey === c.key ? "text-cyan-300" : ""}`}
            >
              {c.label}{sortKey === c.key ? (sortDir === 1 ? " ↑" : " ↓") : ""}
            </button>
          ))}
        </div>
        {rows.map((r: SpotRow) => (
          <div key={r.name} className="grid grid-cols-[1fr_76px_76px_64px_64px] items-center gap-1 rounded px-2 py-[3px] text-[11px] hover:bg-slate-800/40">
            <span className="min-w-0 truncate text-slate-300">
              {r.name}
              <span className="ml-1 text-[9px] text-slate-600">{EXCH_SHORT[r.exchange] || r.exchange} {r.contract}</span>
            </span>
            <span className="text-right text-slate-200" style={TNUM}>{fmtPrice(r.spot)}</span>
            <span className="text-right text-slate-400" style={TNUM}>{fmtPrice(r.futures)}</span>
            <span className={`text-right font-semibold ${clsChg(r.basis)}`} style={TNUM}>{r.basis > 0 ? "+" : ""}{fmtPrice(r.basis)}</span>
            <span className={`text-right font-semibold ${clsChg(r.basisPct)}`} style={TNUM}>{fmtPct(r.basisPct)}</span>
          </div>
        ))}
        {!data && <div className="p-4 text-center text-[10px] text-slate-600">现期数据加载中…</div>}
      </div>
    </Panel>
  );
}

import { useMemo, useState } from "react";
import { Table } from "lucide-react";
import { Panel, type PanelZoomProps } from "./Panel";
import { QuoteRow } from "./QuoteRow";
import { useSharedPolling } from "@/hooks/useSharedPolling";
import { api, type SpotRow } from "@/lib/api";
import { EXCH_SHORT } from "@/config/goods";
import { POLL } from "@/lib/intervals";

type SortKey = "name" | "spot" | "futures" | "basis" | "basisPct";
/** 表头分组: 每组一列, 点击在该组字段间循环排序 */
const COLS: { keys: SortKey[]; label: string }[] = [
  { keys: ["name"], label: "品种" },
  { keys: ["spot", "futures"], label: "现货·期货" },
  { keys: ["basis", "basisPct"], label: "基差·基差率" },
];

/** 现期对照表(生意社): 默认按 |基差率| 降序, 点击表头分组循环切换字段排序 */
export function BasisPanel({ className = "", ...zoomProps }: { className?: string } & PanelZoomProps) {
  const { data } = useSharedPolling("spot:table", () => api.spotTable(), POLL.SPOT);
  const [colIdx, setColIdx] = useState<number | null>(null);
  const [keyIdx, setKeyIdx] = useState(0);
  const [sortDir, setSortDir] = useState<1 | -1>(-1);

  const sortKey: SortKey | null = colIdx == null ? null : COLS[colIdx].keys[keyIdx];

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

  const clickSort = (i: number) => {
    const grp = COLS[i];
    if (colIdx === i) {
      // 同组: 先循环字段, 到末位后翻转方向
      if (keyIdx < grp.keys.length - 1) setKeyIdx(keyIdx + 1);
      else { setKeyIdx(0); setSortDir((d) => (d === 1 ? -1 : 1)); }
    } else {
      setColIdx(i);
      setKeyIdx(0);
      setSortDir(grp.keys[0] === "name" ? 1 : -1);
    }
  };

  return (
    <Panel
      className={className}
      {...zoomProps}
      title="现期对照 · 基差"
      icon={<Table size={14} />}
      accent="#38bdf8"
      right={<span className="text-meta text-db-muted">{data ? `${data.rows.length} 品种` : ""}</span>}
    >
      <div className="h-full min-h-0 overflow-y-auto p-1">
        <div className="grid grid-cols-[72px_minmax(0,1fr)_110px_110px] gap-1 px-2 py-1 text-meta text-db-muted">
          {COLS.map((c, i) => (
            <button
              key={c.label}
              onClick={() => clickSort(i)}
              className={`text-left hover:text-db-secondary ${colIdx === i ? "text-cyan-300" : ""} ${i > 0 ? "col-start-" + (i + 2) : ""}`}
            >
              {c.label}
              {colIdx === i ? (keyIdx > 0 ? `·${c.keys[keyIdx] === "futures" ? "期货" : c.keys[keyIdx] === "basisPct" ? "基差率" : ""} ` : " ") + (sortDir === 1 ? "↑" : "↓") : ""}
            </button>
          ))}
        </div>
        {rows.map((r: SpotRow) => {
          const hist = (data?.history[r.name] || []).map((h) => ({ t: h.t, c: h.p }));
          return (
            <QuoteRow
              key={r.name}
              code=""
              name={r.name}
              unit={`${EXCH_SHORT[r.exchange] || r.exchange} ${r.contract}`}
              variant="compact"
              basis={{ spot: r.spot, futures: r.futures, basis: r.basis, basisPct: r.basisPct }}
              sparkData={hist.length > 1 ? { points: hist.map((h) => ({ t: h.t, p: h.c })), prec: hist[0].c, session: "daily" } : undefined}
            />
          );
        })}
        {!data && <div className="p-4 text-center text-meta text-db-faint">现期数据加载中…</div>}
      </div>
    </Panel>
  );
}

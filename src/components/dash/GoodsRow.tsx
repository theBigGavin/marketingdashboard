import { memo } from "react";
import { Spark } from "./Spark";
import { bgChg, clsChg, fmtPct, fmtPrice } from "@/lib/format";

const TNUM = { fontVariantNumeric: "tabular-nums" } as const;

export interface GoodsRowProps {
  name: string;
  unit?: string;
  /** 实时价(缺省回退日线末值) */
  price?: number;
  /** 实时涨跌幅(缺省不显示徽标) */
  pct?: number;
  /** 日线序列(已按区间切片, t 为日期) */
  daily: { t: string; c: number }[];
}

/** 商品行: 名称+单位 / 实时价 / 涨跌徽标 / 日线迷你趋势(仿 IndexPanel.IndexRow) */
export const GoodsRow = memo(function GoodsRow({ name, unit, price, pct, daily }: GoodsRowProps) {
  const last = daily.length ? daily[daily.length - 1].c : undefined;
  const p = price ?? last;
  // prec 传区间首日收盘价: 趋势线颜色与虚线基准 = 区间涨跌
  const prec = daily.length > 1 ? daily[0].c : 0;
  return (
    <div className="flex items-center gap-1.5 rounded px-1 py-[3px] transition-colors hover:bg-slate-800/40">
      <div className="w-[72px] shrink-0 leading-none">
        <div className="truncate text-[11px] text-slate-300">{name}</div>
        {unit && <div className="mt-0.5 truncate text-[8px] text-slate-600">{unit}</div>}
      </div>
      <span className={`w-[72px] shrink-0 text-right text-[12px] font-semibold ${pct != null ? clsChg(pct) : "text-slate-400"}`} style={TNUM}>
        {p != null ? fmtPrice(p) : "—"}
      </span>
      <span className={`w-[52px] shrink-0 rounded px-0.5 text-right text-[10px] font-semibold ${pct != null ? bgChg(pct) : ""}`} style={TNUM}>
        {pct != null ? fmtPct(pct) : ""}
      </span>
      <span className="min-w-0 flex-1">
        {daily.length > 1 && <Spark points={daily.map((d) => ({ t: d.t, p: d.c }))} prec={prec} width={120} height={20} fluid session="daily" />}
      </span>
    </div>
  );
});

import { useMemo } from "react";
import { clsChg, fmtPct, fmtPrice } from "@/lib/format";

export interface TapeItem {
  key: string;
  label: string;
  price: number;
  pct: number;
  digits?: number;
}

/** 顶部跑马灯:全球指数 + 大宗 + 美债 */
export function TickerTape({ items }: { items: TapeItem[] }) {
  const content = useMemo(
    () =>
      items.map((it) => (
        <span key={it.key} className="mx-5 inline-flex items-baseline gap-2 whitespace-nowrap">
          <span className="text-slate-400">{it.label}</span>
          <span className="font-semibold text-slate-100" style={{ fontVariantNumeric: "tabular-nums" }}>
            {it.digits === 3 ? it.price.toFixed(3) : fmtPrice(it.price)}
          </span>
          <span className={`${clsChg(it.pct)} font-medium`} style={{ fontVariantNumeric: "tabular-nums" }}>
            {fmtPct(it.pct)}
          </span>
        </span>
      )),
    [items]
  );

  return (
    <div className="ticker-wrap relative h-7 overflow-hidden border-b border-slate-700/40 bg-[#0a101c] text-[11px] leading-7">
      <div className="ticker-track inline-flex items-center will-change-transform">
        <div className="inline-flex">{content}</div>
        <div className="inline-flex" aria-hidden>{content}</div>
      </div>
      <div className="pointer-events-none absolute inset-y-0 left-0 w-16 bg-gradient-to-r from-[#070b12] to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 w-16 bg-gradient-to-l from-[#070b12] to-transparent" />
    </div>
  );
}

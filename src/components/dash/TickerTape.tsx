import { useEffect, useMemo, useRef, useState } from "react";
import { clsChg, fmtPct, fmtPrice } from "@/lib/format";
import { isTv } from "@/lib/tv";

export interface TapeItem {
  key: string;
  label: string;
  price: number;
  pct: number;
  digits?: number;
}

function TapeItemView({ it }: { it: TapeItem }) {
  return (
    <>
      <span className="text-db-tertiary">{it.label}</span>
      <span className="font-semibold text-db-strong" style={{ fontVariantNumeric: "tabular-nums" }}>
        {it.digits === 3 ? it.price.toFixed(3) : fmtPrice(it.price)}
      </span>
      <span className={`${clsChg(it.pct)} font-medium`} style={{ fontVariantNumeric: "tabular-nums" }}>
        {fmtPct(it.pct)}
      </span>
    </>
  );
}

const FLAP_SLOTS = 7;
const FLIP_MS = 5000;

/** TV 翻牌跑马灯: 航班时刻牌式 — 固定7个槽位, 每隔2s由下一个槽位单独翻牌
 *  换成下一条(依次轮转), 只有翻牌槽位的小区域重绘, 弱GPU无压力 */
function FlapTape({ items }: { items: TapeItem[] }) {
  // 每个槽位各自指向 items 下标; 每隔 FLIP_MS 只有一个槽位前进 FLAP_SLOTS 位(内容轮换)
  const [slotIdx, setSlotIdx] = useState<number[]>(() => Array.from({ length: FLAP_SLOTS }, (_, i) => i));
  const turnRef = useRef(0);
  useEffect(() => {
    if (items.length <= FLAP_SLOTS) return;
    const t = window.setInterval(() => {
      const slot = turnRef.current % FLAP_SLOTS;
      turnRef.current += 1;
      setSlotIdx((prev) => prev.map((v, i) => (i === slot ? (v + FLAP_SLOTS) % items.length : v)));
    }, FLIP_MS);
    return () => window.clearInterval(t);
  }, [items.length]);

  // 槽位数不超过条目数, key 带槽位序号: 早期条目数<槽位数时取模会产生重复 key, 污染 reconciliation 出现残留元素
  const n = Math.min(FLAP_SLOTS, items.length);
  const slots = slotIdx.slice(0, n).map((idx, pos) => ({ pos, it: items[idx % items.length] }));

  return (
    <div className="flex h-8 items-center justify-between gap-3 border-b border-db-border/40 bg-db-ticker px-4 text-body">
      {slots.map(({ pos, it }) => (
        // key = 槽位序号 + item.key: 槽位换内容时重挂载, 触发 flap-in 翻牌动画
        <span
          key={`${pos}-${it.key}`}
          className="flap-item inline-flex h-6 min-w-0 flex-1 items-center justify-center gap-4 overflow-hidden whitespace-nowrap rounded border border-db-border/60 bg-db-panel px-2.5 leading-6 shadow-[0_1px_0_rgba(0,0,0,0.4)]"
        >
          <TapeItemView it={it} />
        </span>
      ))}
    </div>
  );
}

/** 顶部跑马灯:全球指数 + 大宗 + 美债(TV 为翻牌模式) */
export function TickerTape({ items }: { items: TapeItem[] }) {
  const content = useMemo(
    () =>
      items.map((it) => (
        <span key={it.key} className="mx-5 inline-flex items-baseline gap-2 whitespace-nowrap">
          <TapeItemView it={it} />
        </span>
      )),
    [items]
  );

  if (isTv) return <FlapTape items={items} />;

  return (
    <div className="ticker-wrap relative h-7 overflow-hidden border-b border-db-border/40 bg-db-ticker text-body leading-7">
      <div className="ticker-track inline-flex items-center will-change-transform">
        <div className="inline-flex">{content}</div>
        <div className="inline-flex" aria-hidden>{content}</div>
      </div>
      <div className="pointer-events-none absolute inset-y-0 left-0 w-16 bg-gradient-to-r from-db-canvas to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 w-16 bg-gradient-to-l from-db-canvas to-transparent" />
    </div>
  );
}

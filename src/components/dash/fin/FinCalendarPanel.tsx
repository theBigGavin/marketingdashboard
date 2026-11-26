import { useMemo, useState } from "react";
import { Panel, type PanelZoomProps } from "../Panel";
import { useFinBoard } from "./useFinData";
import { type FinCalendarItem } from "@/lib/api";
import { useFin } from "./FinContext";
import { AsyncContent } from "../SharedUI";
import { QuoteRow } from "../QuoteRow";
import { CalendarDays, Star } from "lucide-react";
import { TNUM, prefixCode, quarterLabel } from "./utils";
import { useElementSize } from "@/hooks/useElementSize";

const DAY = 86400000;
const STRIP_H = 40; // 顶部柱带总高(柱区 + 8px 刻度行)

const dateKey = (t: number) => {
  const d = new Date(t);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

/** 财报日历: 顶部全宽 21 天柱带(可点选) + 下方双列流式披露清单(可点选公司) */
export function FinCalendarPanel({ className = "", ...zoomProps }: { className?: string } & PanelZoomProps) {
  const [selDate, setSelDate] = useState<string | null>(null);
  const { period } = useFin();
  const { data, error, loading, retry } = useFinBoard(period);
  const { select } = useFin();

  const { ref: boxRef, size } = useElementSize(40);
  const w = size.w;

  const view = useMemo(() => {
    const cal = data?.calendar ?? [];
    const counts = new Map<string, number>();
    for (const it of cal) counts.set(it.date, (counts.get(it.date) ?? 0) + 1);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    // 过去 7 天 + 未来 14 天, 共 21 天柱带
    const PAST = 7;
    const FUTURE = 14;
    const totalDays = PAST + FUTURE;
    const days = Array.from({ length: totalDays }, (_, i) => {
      const offset = i - PAST;
      const key = dateKey(today.getTime() + offset * DAY);
      return { key, offset, count: counts.get(key) ?? 0, past: offset < 0 };
    });
    const todayKey = days[PAST].key;
    const todayIdx = PAST;
    const peak = Math.max(...days.map((d) => d.count), 0);
    const peakKey = days.find((d) => d.count === peak)?.key ?? todayKey;
    // 清单: 优先今天, 其次最近已披露日(往回找), 最后明天
    const byDate = new Map<string, FinCalendarItem[]>();
    for (const it of cal) {
      const arr = byDate.get(it.date) ?? [];
      arr.push(it);
      byDate.set(it.date, arr);
    }
    let listDate = todayKey;
    let listLabel = "今晚披露";
    if (!byDate.has(todayKey)) {
      // 往回找最近有披露的日期
      let found = false;
      for (let i = 1; i <= PAST; i++) {
        const pastKey = dateKey(today.getTime() - i * DAY);
        if (byDate.has(pastKey)) {
          listDate = pastKey;
          listLabel = `${pastKey.slice(5).replace("-", "/")} 已披露`;
          found = true;
          break;
        }
      }
      // 过去没有, 往前找未来
      if (!found) {
        const tmr = dateKey(today.getTime() + DAY);
        listDate = byDate.has(tmr) ? tmr : cal[0]?.date ?? todayKey;
        listLabel = listDate === tmr ? "明日披露" : `${listDate.slice(5).replace("-", "/")} 披露`;
      }
    }
    const heavy = new Set((data?.stocks ?? []).map((s) => s.code)); // 净利 TOP50 视作重磅
    return { days, todayKey, todayIdx, PAST, todayCount: counts.get(todayKey) ?? 0, peak, peakKey, byDate, list: byDate.get(listDate) ?? [], listDate, listLabel, heavy };
  }, [data]);

  // 用户选中日期时覆盖自动选择的清单
  const activeList = selDate ? (view.byDate.get(selDate) ?? []) : view.list;
  const activeListLabel = selDate
    ? (selDate === view.todayKey ? "今晚披露" : selDate < view.todayKey ? `${selDate.slice(5).replace("-", "/")} 已披露` : `${selDate.slice(5).replace("-", "/")} 披露`)
    : view.listLabel;

  const handleBarClick = (key: string) => {
    if (selDate === key) setSelDate(null); // 再次点击取消选择
    else setSelDate(key);
  };

  const W = w;
  const padX = 6;
  const totalDays = view.days.length;
  const slot = (W - padX * 2) / totalDays;
  const bw = Math.max(3, slot * 0.55);
  const baseY = STRIP_H - 10; // 底部 10px 留给 8px 刻度行
  const peak = Math.max(view.peak, 1);

  return (
    <Panel
      className={className}
      {...zoomProps}
      title="财报日历"
      icon={<CalendarDays size={14} />}
      accent="#38bdf8"
      right={
        data && (
          <span className="flex items-center gap-2 text-meta text-db-muted" style={TNUM}>
            <span>
              今日 <span className="font-semibold text-amber-400">{view.todayCount}</span> 家 · 峰值 {view.peak} 家
            </span>
            <span className="flex items-center gap-0.5 text-caption text-db-faint">
              <Star size={9} className="text-amber-400" /> 净利TOP300
            </span>
          </span>
        )
      }
    >
      <AsyncContent loading={loading} error={error} empty={false} onRetry={retry}>
        {data && (
        <div className="flex h-full min-h-0 flex-col">
          {/* 全宽 40px 柱带: 今日 amber 实色 + 柱顶 8px 数字, 未来 cyan/40 */}
          <div ref={boxRef} className="shrink-0">
            <svg width={W} height={STRIP_H} className="block">
              {view.days.map((d, i) => {
                const bh = d.count > 0 ? Math.max(2, (d.count / peak) * (baseY - 12)) : 0;
                const x = padX + i * slot + (slot - bw) / 2;
                const isToday = i === view.todayIdx;
                const isPast = d.past;
                const isSelected = selDate === d.key;
                return (
                  <g
                    key={d.key}
                    style={{ cursor: "pointer" }}
                    onClick={() => handleBarClick(d.key)}
                  >
                    {/* 点击热区: 全 slot 宽 */}
                    <rect
                      x={padX + i * slot}
                      y={0}
                      width={slot}
                      height={baseY}
                      fill="transparent"
                    />
                    {d.count > 0 && (
                      <rect
                        x={x}
                        y={baseY - bh}
                        width={bw}
                        height={bh}
                        rx={1.5}
                        fill={isToday && !selDate ? "#fbbf24" : isPast ? "#64748b" : "#22d3ee"}
                        opacity={isToday && !selDate ? 1 : isPast ? 0.5 : 0.4}
                        stroke={isSelected ? (isToday ? "#fbbf24" : "#e2e8f0") : "none"}
                        strokeWidth={isSelected ? 1 : 0}
                      />
                    )}
                    {/* 无披露日期: hover 时可见细微标记 */}
                    {d.count === 0 && (
                      <rect
                        x={x}
                        y={baseY - 1.5}
                        width={bw}
                        height={1.5}
                        rx={0.5}
                        fill="#334155"
                        opacity={isSelected ? 0.8 : 0}
                      />
                    )}
                    {d.count > 0 && (
                      <text
                        x={x + bw / 2}
                        y={baseY - bh - 2}
                        fontSize={8}
                        fill={isToday && !selDate ? "#fbbf24" : isPast ? "#64748b" : "#475569"}
                        textAnchor="middle"
                        style={TNUM}
                      >
                        {d.count}
                      </text>
                    )}
                    {/* 选中指示: 柱底小圆点 */}
                    {isSelected && (
                      <circle cx={x + bw / 2} cy={baseY + 2} r={2} fill={isToday ? "#fbbf24" : "#e2e8f0"} />
                    )}
                  </g>
                );
              })}
              <line x1={padX} y1={baseY} x2={W - padX} y2={baseY} stroke="#1e293b" strokeWidth={1} />
              {[
                { i: 0, t: "-7d", a: "start" as const },
                { i: view.PAST, t: "今天", a: "middle" as const },
                { i: view.PAST + 7, t: "+7d", a: "middle" as const },
                { i: totalDays - 1, t: "+14d", a: "end" as const },
              ].map(({ i, t, a }) => (
                <text
                  key={t}
                  x={a === "start" ? padX : a === "end" ? W - padX : padX + i * slot + slot / 2}
                  y={STRIP_H - 2}
                  fontSize={8}
                  fill={t === "今天" ? "#fbbf24" : "#475569"}
                  textAnchor={a}
                >
                  {t}
                </text>
              ))}
            </svg>
          </div>
          {/* 双列流式披露清单: 名称 11px / 期 9px / 重磅 ★ amber */}
          <div className="flex shrink-0 items-center gap-1 border-t border-db-subtle/60 px-2 pt-1">
            <span className="text-caption text-amber-400">{activeListLabel}</span>
            {selDate && (
              <button
                onClick={() => setSelDate(null)}
                className="text-micro text-db-muted hover:text-db-secondary"
              >
                × 返回自动
              </button>
            )}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto py-0.5">
            {activeList.length === 0 ? (
              <div className="flex h-full items-center justify-center text-body text-db-faint">
                {selDate ? `${selDate.slice(5).replace("-", "/")} 无披露安排` : "暂无披露安排"}
              </div>
            ) : (
              <div className="flex flex-col">
                {activeList.map((it) => (
                  <QuoteRow
                    key={`${it.date}-${it.code}`}
                    variant="plain"
                    spark
                    code={prefixCode(it.code)}
                    name={it.name}
                    unit={it.code}
                    onClick={() => select(prefixCode(it.code), it.name)}
                    leadingCols={[
                      {
                        // 星标 + 期 第一列(上:重磅★, 下:期)
                        top: view.heavy.has(it.code) ? <Star size={10} className="text-amber-400" /> : <span />,
                        bottom: <span className="text-caption text-db-muted">{quarterLabel(it.period)}</span>,
                        w: 40,
                      },
                    ]}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      )}
      </AsyncContent>
    </Panel>
  );
}

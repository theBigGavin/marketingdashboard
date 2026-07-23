import { memo, useEffect, useRef, useState, type ReactNode } from "react";
import { usePolling } from "@/hooks/usePolling";
import { api } from "@/lib/api";
import { Spark } from "./Spark";
import { clsChg, fmtPct, fmtPrice, fmtYuan } from "@/lib/format";

const TNUM = { fontVariantNumeric: "tabular-nums" } as const;

/** 数据格: 9px 标签 + 11px 数值, flex 垂直居中(高度全行一致) */
function Stat({ label, value, valueCls = "text-slate-300" }: { label?: string; value: ReactNode; valueCls?: string }) {
  return (
    <div className="flex min-w-0 items-center gap-1 overflow-hidden whitespace-nowrap leading-none">
      {label && <span className="shrink-0 text-[9px] text-slate-600">{label}</span>}
      <span className={`truncate text-[11px] ${valueCls}`} style={TNUM}>
        {value}
      </span>
    </div>
  );
}

/** 行宽小于该值时, 资金流标签收缩为单字(净/占) */
const COMPACT_WIDTH = 400;

interface QuoteRowProps {
  /** 腾讯格式代码, 如 sh688126 */
  code: string;
  name: string;
  price?: number;
  pct?: number;
  /** 名称旁徽标(产业链角色等) */
  tag?: string;
  /** 排名序号(1-3 名金色) */
  rank?: number;
  /** 成交额(已格式化文本) */
  amount?: string;
  /** 换手率(已格式化文本) */
  turnover?: string;
  /** 显示分时曲线(60s 轮询) */
  spark?: boolean;
  /** 显示所属行业/概念(5min 重试, 服务端 24h 缓存) */
  boards?: boolean;
  /** 显示主力净额/净占比(东财口径, 30s 轮询) */
  flow?: boolean;
  /** card = 带边框的卡片样式(产业链) */
  variant?: "plain" | "card";
  active?: boolean;
  onClick?: () => void;
  onRemove?: () => void;
}

/** 统一个股行
 *  布局: [排名?] [名称+代码(跨2行)] [分时(跨2列)/主力净额·净占比] [成交额/换手率] [现价/涨跌幅] [删除?]
 *  底部整行: 标签 · 行业 · 概念
 */
export const QuoteRow = memo(function QuoteRow({
  code, name, price, pct, tag, rank, amount, turnover, spark, boards, flow, variant = "plain", active, onClick, onRemove,
}: QuoteRowProps) {
  // 行宽自适应: 实测宽度决定资金流标签形态(主力净额/净占比 ↔ 净/占)
  const rootRef = useRef<HTMLElement | null>(null);
  const [rowWidth, setRowWidth] = useState(0);
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => setRowWidth(entries[0].contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const compact = rowWidth > 0 && rowWidth < COMPACT_WIDTH;

  // 可见性联动轮询: 行在视口内才启动分时/板块/资金流轮询, 离开视口即停, 回到视口恢复
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const io = new IntersectionObserver((entries) => {
      setVisible(entries.some((e) => e.isIntersecting));
    });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const { data: minute } = usePolling(
    () => (spark && visible ? api.minute(code) : Promise.resolve(null)),
    60000,
    [code, spark, visible],
    // 分时数据未变时复用旧引用, 避免 Spark 重算/重渲染
    (a, b) => JSON.stringify(a) === JSON.stringify(b)
  );
  // 服务端 24h 缓存, 前端 5 分钟重试以容忍上游瞬时失败
  const { data: bd } = usePolling(
    () => (boards && visible ? api.stockBoards(code) : Promise.resolve(null)),
    5 * 60 * 1000,
    [code, boards, visible]
  );
  const { data: fl } = usePolling(
    () => (flow && visible ? api.stockFlow(code) : Promise.resolve(null)),
    30000,
    [code, flow, visible]
  );

  const Tag = onClick ? "button" : "div";
  const skin =
    variant === "card"
      ? "border border-slate-700/25 bg-slate-800/15 hover:border-cyan-500/40 hover:bg-slate-800/30"
      : "hover:bg-slate-800/40 hover:shadow-[inset_0_0_0_1px_rgba(34,211,238,0.22)]";

  const ratioBar = fl ? Math.min(100, Math.abs(fl.netRatio) * 2) : 0;

  return (
    <Tag
      ref={(el: HTMLElement | null) => {
        rootRef.current = el;
      }}
      onClick={onClick}
      className={`group block w-full rounded px-2 py-[4px] text-left transition-colors ${skin} ${
        active ? "bg-cyan-500/10 ring-1 ring-cyan-500/40" : ""
      }`}
    >
      <div
        className="grid items-center gap-x-1"
        style={{
          // 名称+代码 / 分时(跨2列) / 成交额 / 现价 固定列宽, 保证各行分时图等宽
          gridTemplateColumns: `${rank != null ? "auto " : ""}${
            variant === "card"
              ? "56px minmax(0,1fr) minmax(0,1fr) 54px 54px"
              : "64px minmax(0,1fr) minmax(0,1fr) 64px 60px"
          }${onRemove ? " auto" : ""}`,
          // 固定两行高: 分时区恒占 20px, 数据区 16px, 各行一致
          gridTemplateRows: "20px 16px",
        }}
      >
        {/* 首列: 排名序号, 跨2行 */}
        {rank != null && (
          <div
            className={`row-span-2 self-center text-[11px] font-bold leading-none ${rank <= 3 ? "text-amber-400" : "text-slate-600"}`}
            style={TNUM}
          >
            {rank}
          </div>
        )}
        {/* 左格: 名称+代码, 跨2行 */}
        <div className="row-span-2 flex min-w-0 flex-col justify-center gap-1 leading-none">
          <span className="truncate text-[12px] text-slate-200">{name}</span>
          <span className="text-[10px] text-slate-500">{code}</span>
        </div>

        {/* 第一行: 分时图(跨2列, 恒占 20px 高度) */}
        <div className="col-span-2 flex h-[20px] min-w-0 items-center self-center">
          {spark && minute && <Spark points={minute.points} prec={minute.prec} width={160} height={20} fluid />}
        </div>
        {/* 第一行: 成交额 / 现价 */}
        {amount ? <Stat label="额" value={amount} /> : <div />}
        <Stat label="价" value={price != null ? fmtPrice(price) : "—"} />
        {/* 末列: 删除按钮, 跨2行 */}
        {onRemove && (
          <div className="row-span-2 self-center">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onRemove();
              }}
              className="text-[10px] leading-none text-slate-600 opacity-0 transition-opacity hover:text-rose-400 group-hover:opacity-100"
              title="移除"
            >
              ×
            </button>
          </div>
        )}

        {/* 第二行: 主力净额 / 净占比(进度条) / 换手率 / 涨跌幅 */}
        {flow ? (
          <Stat
            label={compact ? "净" : "主力净额"}
            value={fl ? fmtYuan(fl.netIn) : "—"}
            valueCls={`font-semibold ${fl ? clsChg(fl.netIn) : "text-slate-600"}`}
          />
        ) : (
          <div />
        )}
        {flow ? (
          <div className="flex min-w-0 items-center gap-1 overflow-hidden whitespace-nowrap leading-none">
            <span className="shrink-0 text-[9px] text-slate-600">{compact ? "占" : "净占比"}</span>
            <span className="h-1 min-w-0 flex-1 self-center rounded-full bg-slate-800">
              <span
                className={`block h-1 rounded-full ${fl && fl.netRatio < 0 ? "bg-emerald-400/80" : "bg-rose-400/80"}`}
                style={{ width: `${ratioBar}%` }}
              />
            </span>
            <span className={`truncate text-[11px] ${fl ? clsChg(fl.netRatio) : "text-slate-600"}`} style={TNUM}>
              {fl ? `${fl.netRatio.toFixed(1)}%` : "—"}
            </span>
          </div>
        ) : (
          <div />
        )}
        {turnover ? <Stat label="换" value={turnover} /> : <div />}
        <Stat
          label="幅"
          value={pct != null ? fmtPct(pct, variant === "card" ? 1 : 2) : ""}
          valueCls={`font-semibold ${pct != null ? clsChg(pct) : "text-slate-600"}`}
        />
      </div>

      {/* 底部整行: 标签 · 行业 · 概念(boards 开启时恒占一行) */}
      {(tag || boards) && (
        <div className="mt-0.5 flex h-[13px] min-w-0 items-center gap-1.5 text-[9px] leading-none">
          {tag && (
            <span className="shrink-0 rounded-sm bg-slate-700/40 px-1 py-px text-[8px] text-slate-400">{tag}</span>
          )}
          {boards && bd && (bd.industry || bd.concepts.length > 0) && (
            <span className="truncate">
              {bd.industry && <span className="text-cyan-500/80">{bd.industry}</span>}
              {bd.concepts.length > 0 && (
                <span className="text-slate-600">
                  {bd.industry ? " · " : ""}
                  {bd.concepts.join("/")}
                </span>
              )}
            </span>
          )}
        </div>
      )}
    </Tag>
  );
});

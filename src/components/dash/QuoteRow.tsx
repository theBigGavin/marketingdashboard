import { usePolling } from "@/hooks/usePolling";
import { api } from "@/lib/api";
import { Spark } from "./Spark";
import { clsChg, fmtPct, fmtPrice, fmtYuan } from "@/lib/format";

const TNUM = { fontVariantNumeric: "tabular-nums" } as const;

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
 *  布局: [名称+代码(跨2行)] [分时(跨2列)/主力净额·净占比] [成交额/换手率] [现价/涨跌幅]
 *  底部整行: 行业 · 概念
 */
export function QuoteRow({
  code, name, price, pct, tag, rank, amount, turnover, spark, boards, flow, variant = "plain", active, onClick, onRemove,
}: QuoteRowProps) {
  const { data: minute } = usePolling(
    () => (spark ? api.minute(code) : Promise.resolve(null)),
    60000,
    [code, spark]
  );
  // 服务端 24h 缓存, 前端 5 分钟重试以容忍上游瞬时失败
  const { data: bd } = usePolling(
    () => (boards ? api.stockBoards(code) : Promise.resolve(null)),
    5 * 60 * 1000,
    [code, boards]
  );
  const { data: fl } = usePolling(
    () => (flow ? api.stockFlow(code) : Promise.resolve(null)),
    30000,
    [code, flow]
  );

  const Tag = onClick ? "button" : "div";
  const skin =
    variant === "card"
      ? "border border-slate-700/25 bg-slate-800/15 hover:border-cyan-500/40 hover:bg-slate-800/30"
      : "hover:bg-slate-800/40 hover:shadow-[inset_0_0_0_1px_rgba(34,211,238,0.22)]";

  const labelCls = "mr-1 text-[9px] text-slate-600";
  const ratioBar = fl ? Math.min(100, Math.abs(fl.netRatio) * 2) : 0;

  return (
    <Tag
      onClick={onClick}
      className={`group block w-full rounded px-2 py-[4px] text-left transition-colors ${skin} ${
        active ? "bg-cyan-500/10 ring-1 ring-cyan-500/40" : ""
      }`}
    >
      <div
        className="grid items-center gap-x-2"
        style={{
          // 名称+代码 / 分时(跨2列) / 成交额 / 现价 固定列宽, 保证各行分时图等宽
          gridTemplateColumns: `${rank != null ? "auto " : ""}${
            variant === "card"
              ? "56px minmax(0,1fr) minmax(0,1fr) 62px 50px"
              : "64px minmax(0,1fr) minmax(0,1fr) 76px 60px"
          }${onRemove ? " auto" : ""}`,
        }}
      >
        {/* 首列: 排名序号, 跨2行 */}
        {rank != null && (
          <div
            className={`row-span-2 self-center text-[11px] font-bold ${rank <= 3 ? "text-amber-400" : "text-slate-600"}`}
            style={TNUM}
          >
            {rank}
          </div>
        )}
        {/* 左格: 名称+代码, 跨2行 */}
        <div className="row-span-2 flex min-w-0 flex-col justify-center">
          <span className="truncate text-[12px] text-slate-200">{name}</span>
          <span className="text-[9px] text-slate-600">{code}</span>
        </div>

        {/* 第一行: 分时图(跨2列) */}
        <div className="col-span-2 min-w-0 self-center">
          {spark && minute && <Spark points={minute.points} prec={minute.prec} width={160} height={20} fluid />}
        </div>
        {/* 第一行: 成交额 / 现价 */}
        <div className="overflow-hidden whitespace-nowrap text-right">
          {amount && (
            <>
              <span className={labelCls}>成交额</span>
              <span className="text-[10px] text-slate-400" style={TNUM}>{amount}</span>
            </>
          )}
        </div>
        <div className="overflow-hidden whitespace-nowrap text-right text-[11px] text-slate-300" style={TNUM}>
          {price != null ? fmtPrice(price) : "—"}
        </div>
        {/* 末列: 删除按钮, 跨2行 */}
        {onRemove && (
          <div className="row-span-2 self-center">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onRemove();
              }}
              className="text-[10px] text-slate-600 opacity-0 transition-opacity hover:text-rose-400 group-hover:opacity-100"
              title="移除"
            >
              ×
            </button>
          </div>
        )}

        {/* 第二行: 主力净额 / 净占比(进度条) / 换手率 / 涨跌幅 */}
        <div className="min-w-0 overflow-hidden whitespace-nowrap">
          {flow && (
            <>
              <span className={labelCls}>{variant === "card" ? "净额" : "主力净额"}</span>
              <span className={`text-[10px] font-semibold ${fl ? clsChg(fl.netIn) : "text-slate-600"}`} style={TNUM}>
                {fl ? fmtYuan(fl.netIn) : "—"}
              </span>
            </>
          )}
        </div>
        <div className="flex min-w-0 items-center overflow-hidden whitespace-nowrap">
          {flow && (
            <>
              <span className={labelCls}>{variant === "card" ? "占比" : "净占比"}</span>
              <span className="h-1 min-w-0 flex-1 rounded-full bg-slate-800">
                <span
                  className={`block h-1 rounded-full ${fl && fl.netRatio < 0 ? "bg-emerald-400/80" : "bg-rose-400/80"}`}
                  style={{ width: `${ratioBar}%` }}
                />
              </span>
              <span className={`text-[10px] ${fl ? clsChg(fl.netRatio) : "text-slate-600"}`} style={TNUM}>
                {fl ? `${fl.netRatio.toFixed(1)}%` : "—"}
              </span>
            </>
          )}
        </div>
        <div className="overflow-hidden whitespace-nowrap text-right">
          {turnover && (
            <>
              <span className={labelCls}>换手率</span>
              <span className="text-[10px] text-slate-400" style={TNUM}>{turnover}</span>
            </>
          )}
        </div>
        <div
          className={`overflow-hidden whitespace-nowrap text-right text-[11px] font-semibold ${pct != null ? clsChg(pct) : "text-slate-600"}`}
          style={TNUM}
        >
          {pct != null ? fmtPct(pct) : ""}
        </div>
      </div>

      {/* 底部整行: 标签 · 行业 · 概念 */}
      {(tag || (boards && bd && (bd.industry || bd.concepts.length > 0))) && (
        <div className="mt-0.5 flex min-w-0 items-baseline gap-1.5 text-[9px]">
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
}

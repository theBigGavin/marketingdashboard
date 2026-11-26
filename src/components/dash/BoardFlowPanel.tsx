import { useEffect, useState } from "react";
import { Activity } from "lucide-react";
import { Panel, type PanelZoomProps } from "./Panel";
import { BoardFlowChart } from "./BoardFlowChart";
import { usePolling } from "@/hooks/usePolling";
import { api } from "@/lib/api";
import { boardFlowScope, FLOW_RANK_NOTE } from "@/lib/board-taxonomy";
import { isTv } from "@/lib/tv";

const POLL_MS = 10000;
const DURATION_MS = 12000;
const STEP_MS = 100;

/** 板块实时资金流向图(流入/流出 TOP10 行业, 分钟级累计主力净流入)
 *  板块"行业"口径随数据源变化(新浪行业/腾讯申万一级/东财多层级), 面板显式标注当前口径与排序口径,
 *  不跨源混用同一套"行业"名号(见 @/lib/board-taxonomy)。 */
export function BoardFlowPanel({
  className = "",
  onSelectSector,
  selectedSector,
  ...zoomProps
}: {
  className?: string;
  onSelectSector?: (sel: { code: string; name: string } | null) => void;
  /** 受控选中板块: 外部(资金流向面板)清除筛选时同步清图表高亮 */
  selectedSector?: { code: string; name: string } | null;
} & PanelZoomProps) {
  const { data: flowEnv, error, updated } = usePolling(() => api.boardFlow(20), POLL_MS);
  const flows = flowEnv?.data;
  // 上游(东财 push2*)不可达时服务端降级返回上次成功数据: 明确标注"旧数据"+ 快照时间, 不冒充实时
  const stale = !!flowEnv?.stale;
  const staleAt = flowEnv?.asof ? new Date(flowEnv.asof).toLocaleTimeString("zh-CN", { hour12: false }) : "";
  // 替代源(新浪/腾讯)无板块分时曲线 → 只有板块净额, 图表无曲线可画时给出说明而不是空白
  const noCurve = !!flows?.length && !flows.some((f) => f.points.length > 2);
  // 口径/层级标注: 由服务端信封的 source 决定(新浪行业 / 腾讯申万一级 / 东财多层级混排)
  const scope = boardFlowScope(flowEnv?.source ?? undefined);
  const [progress, setProgress] = useState(1);
  const [playing, setPlaying] = useState(false);
  // TV 弱 GPU: 倒计时每秒重渲染整个面板(含大SVG), 禁用
  const [countdown, setCountdown] = useState(isTv ? 0 : POLL_MS / 1000);
  const [labelMode, setLabelMode] = useState<"end" | "legend">("end");

  // 数据刷新时重置倒计时(render-time 派生态调整)
  const [prevUpdated, setPrevUpdated] = useState(updated);
  if (prevUpdated !== updated) {
    setPrevUpdated(updated);
    if (!isTv) setCountdown(POLL_MS / 1000);
  }

  // 倒计时每秒递减
  useEffect(() => {
    if (countdown <= 0) return;
    const id = window.setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => window.clearTimeout(id);
  }, [countdown]);

  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => {
      setProgress((p) => {
        const next = p + STEP_MS / DURATION_MS;
        if (next >= 1) {
          setPlaying(false);
          return 1;
        }
        return next;
      });
    }, STEP_MS);
    return () => clearInterval(id);
  }, [playing]);

  const label = playing ? "⏸ 暂停" : progress < 1 ? "▶ 继续" : "▶ 重放";

  return (
    <Panel
      className={className}
      {...zoomProps}
      title="板块资金流向"
      icon={<Activity size={14} />}
      accent="#f43f5e"
      right={
        <div className="flex items-center gap-2">
          {stale && (
            <span
              title={`上游数据源不可达, 服务端返回上次成功数据${staleAt ? `(快照 ${staleAt})` : ""}`}
              className="rounded bg-amber-500/15 px-1.5 py-0.5 text-meta text-amber-300"
            >
              旧数据{staleAt ? ` ${staleAt}` : ""}
            </span>
          )}
          {!isTv && (
            <span className="font-mono text-meta text-db-muted" style={{ fontVariantNumeric: "tabular-nums" }}>
              {countdown}s
            </span>
          )}
          <button
            type="button"
            onClick={() => setLabelMode((m) => (m === "end" ? "legend" : "end"))}
            title={labelMode === "end" ? "切换为图例" : "切换为端点标签"}
            className="rounded px-1.5 py-0.5 text-meta text-db-tertiary transition hover:bg-db-subtle hover:text-db-primary"
          >
            {labelMode === "end" ? "图例" : "标签"}
          </button>
          <button
            type="button"
            onClick={() => {
              if (progress >= 1) {
                setProgress(0);
                setPlaying(true);
              } else {
                setPlaying((p) => !p);
              }
            }}
            className="rounded px-1.5 py-0.5 text-meta text-db-tertiary transition hover:bg-db-subtle hover:text-db-primary"
          >
            {label}
          </button>
        </div>
      }
    >
      <div className="h-full min-h-0 p-1.5">
        {flows ? (
          <div className="flex h-full min-h-0 flex-col">
            {/* 口径行: 写清"行业"是哪个口径/层级 + 排序口径, 避免跨源跨层级混读 */}
            <div className="flex shrink-0 items-center gap-1 px-1 py-0.5 text-meta text-db-muted" title={scope.note}>
              <span>口径</span>
              <span className="text-db-secondary">{scope.label}</span>
              <span className="text-db-border">·</span>
              <span>{scope.singleLevel ? "单一口径(不分层)" : "多层级混排"}</span>
              <span className="text-db-border">·</span>
              <span className="truncate">{FLOW_RANK_NOTE}</span>
            </div>
            {noCurve && (
              <div className="shrink-0 px-1 py-0.5 text-meta text-amber-300/80">
                上游板块分时曲线不可用(替代源仅提供板块主力净额) — 选中板块仍可查看成分股资金流
              </div>
            )}
            <div className="min-h-0 flex-1">
              <BoardFlowChart flows={flows} progress={progress} labelMode={labelMode} selected={selectedSector?.code ?? null} onSelect={onSelectSector} />
            </div>
          </div>
        ) : (
          <div className="flex h-full items-center justify-center text-body text-db-faint">
            {error ? <span className="text-rose-400/80">板块资金流连接失败,自动重试中…</span> : "板块资金流加载中…"}
          </div>
        )}
      </div>
    </Panel>
  );
}

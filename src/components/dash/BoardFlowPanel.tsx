import { useEffect, useState } from "react";
import { Panel, type PanelZoomProps } from "./Panel";
import { BoardFlowChart } from "./BoardFlowChart";
import { usePolling } from "@/hooks/usePolling";
import { api } from "@/lib/api";

const POLL_MS = 10000;
const DURATION_MS = 12000;
const STEP_MS = 100;

/** 板块实时资金流向图(流入/流出 TOP10 行业, 分钟级累计主力净流入) */
export function BoardFlowPanel({ className = "", ...zoomProps }: { className?: string } & PanelZoomProps) {
  const { data: flows, error, updated } = usePolling(() => api.boardFlow(20), POLL_MS);
  const [progress, setProgress] = useState(1);
  const [playing, setPlaying] = useState(false);
  const [countdown, setCountdown] = useState(POLL_MS / 1000);

  // 数据刷新时重置倒计时(render-time 派生态调整)
  const [prevUpdated, setPrevUpdated] = useState(updated);
  if (prevUpdated !== updated) {
    setPrevUpdated(updated);
    setCountdown(POLL_MS / 1000);
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
      icon="∿"
      accent="#f43f5e"
      right={
        <div className="flex items-center gap-2">
          <span className="font-mono text-[10px] text-slate-500" style={{ fontVariantNumeric: "tabular-nums" }}>
            {countdown}s
          </span>
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
            className="rounded px-1.5 py-0.5 text-[10px] text-slate-400 transition hover:bg-slate-800 hover:text-slate-200"
          >
            {label}
          </button>
        </div>
      }
    >
      <div className="h-full min-h-0 p-1.5">
        {flows ? (
          <BoardFlowChart flows={flows} progress={progress} />
        ) : (
          <div className="flex h-full items-center justify-center text-[11px] text-slate-600">
            {error ? <span className="text-rose-400/80">板块资金流连接失败,自动重试中…</span> : "板块资金流加载中…"}
          </div>
        )}
      </div>
    </Panel>
  );
}

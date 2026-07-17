import { Panel } from "./Panel";
import { BoardFlowChart } from "./BoardFlowChart";
import { usePolling } from "@/hooks/usePolling";
import { api } from "@/lib/api";

/** 板块实时资金流向图(流入/流出 TOP10 行业, 分钟级累计主力净流入) */
export function BoardFlowPanel({ className = "" }: { className?: string }) {
  const { data: flows, error } = usePolling(() => api.boardFlow(20), 120000);

  return (
    <Panel
      className={className}
      title="板块资金流向"
      icon="∿"
      accent="#f43f5e"
      right={<span className="text-[10px] text-slate-500">行业 TOP10± · 2min</span>}
    >
      <div className="h-full min-h-0 p-1.5">
        {flows ? (
          <BoardFlowChart flows={flows} />
        ) : (
          <div className="flex h-full items-center justify-center text-[11px] text-slate-600">
            {error ? <span className="text-rose-400/80">板块资金流连接失败,自动重试中…</span> : "板块资金流加载中…"}
          </div>
        )}
      </div>
    </Panel>
  );
}

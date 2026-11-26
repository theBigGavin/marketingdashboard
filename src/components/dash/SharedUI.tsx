import type { ReactNode } from "react";

export interface TabDef<T extends string | number = string> {
  key: T;
  label: string;
}

/**
 * 统一标签栏/分段控件 — 替代各面板重复的 tab 切换按钮。
 * `accent` 控制高亮色: cyan / amber / violet / emerald / rose。
 */
export function TabBar<T extends string | number>({
  tabs,
  active,
  onChange,
  accent = "cyan",
  size = "sm",
}: {
  tabs: (TabDef<T> | { key: T; label: string })[];
  active: T;
  onChange: (key: T) => void;
  accent?: "cyan" | "amber" | "violet" | "emerald" | "rose";
  size?: "xs" | "sm";
}) {
  // pill 胶囊高亮(全站统一形态)
  const ACTIVE_CLS: Record<string, string> = {
    cyan: "bg-cyan-500/20 text-cyan-300",
    amber: "bg-amber-500/20 text-amber-300",
    violet: "bg-violet-500/20 text-violet-300",
    emerald: "bg-emerald-500/20 text-emerald-300",
    rose: "bg-rose-500/20 text-rose-300",
  };
  const baseCls = size === "xs" ? "text-meta px-1.5 py-0.5" : "text-body px-2 py-0.5";

  return (
    <div className="flex items-center gap-1">
      {tabs.map((t) => (
        <button
          key={t.key}
          onClick={() => onChange(t.key)}
          className={`rounded ${baseCls} transition-colors ${active === t.key ? ACTIVE_CLS[accent] : "text-db-tertiary hover:text-db-primary"}`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

/** 异步内容四态包装: loading(skeleton) → error(retry) → empty(message) → content */
export function AsyncContent({
  loading,
  error,
  empty,
  emptyMessage,
  onRetry,
  skeletonRows = 6,
  children,
}: {
  loading: boolean;
  error: string | null;
  empty: boolean;
  emptyMessage?: string;
  onRetry: () => void;
  skeletonRows?: number;
  children: ReactNode;
}) {
  if (loading) {
    return (
      <div className="flex h-full flex-col gap-[6px] p-2">
        {Array.from({ length: skeletonRows }, (_, i) => (
          <div key={i} className="h-3 shrink-0 rounded bg-db-subtle/40" style={{ width: `${88 - (i % 3) * 12}%` }} />
        ))}
        <div className="mt-auto pt-1 text-center text-body text-db-faint">数据加载中…</div>
      </div>
    );
  }

  if (error && !loading) {
    return (
      <div className="flex h-full items-center justify-center text-body">
        <button className="h-full w-full text-db-muted transition-colors hover:text-db-secondary" onClick={onRetry}>
          数据获取失败，点击重试{error ? `(${error})` : ""}
        </button>
      </div>
    );
  }

  if (empty) {
    return (
      <div className="flex h-full items-center justify-center text-body text-db-faint">
        {emptyMessage || "暂无数据"}
      </div>
    );
  }

  return <>{children}</>;
}

// ---- 通用徽标 ----

const TONE_MAP: Record<string, string> = {
  rose: "border-rose-400/60 bg-rose-400/10 text-rose-300",
  emerald: "border-emerald-400/60 bg-emerald-400/10 text-emerald-300",
  cyan: "border-cyan-400/60 bg-cyan-400/10 text-cyan-300",
  amber: "border-amber-400/60 bg-amber-400/10 text-amber-300",
  slate: "border-slate-500/60 bg-slate-500/10 text-db-tertiary",
};

/** 彩色边框徽标: 预喜/预悲/未定/宏观/政策 等 */
export function ToneChip({ tone, children, dot }: {
  tone: keyof typeof TONE_MAP; children: ReactNode; dot?: boolean;
}) {
  return (
    <span className={`flex shrink-0 items-center justify-center gap-0.5 rounded border px-0.5 text-caption leading-[12px] ${TONE_MAP[tone]}`}>
      {dot && <span className="inline-block h-[3px] w-[3px] rounded-full bg-amber-400" />}
      {children}
    </span>
  );
}

import { useEffect } from "react";

export type ChainEditorState = { mode: "add" | "update"; name: string; content: string } | null;
export type ChainParseState = { loading: boolean; error: string; warnings: string[] };

/** 产业链编辑弹窗(添加/更新) — 独立组件, Esc 关闭 */
export function ChainEditorDialog({
  editor,
  parseState,
  onChange,
  onClose,
  onAutoFetch,
  onSubmit,
}: {
  editor: NonNullable<ChainEditorState>;
  parseState: ChainParseState;
  onChange: (e: ChainEditorState) => void;
  onClose: () => void;
  onAutoFetch: () => void;
  onSubmit: () => void;
}) {
  // Esc 关闭
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[75] flex items-center justify-center bg-black/65 p-4 backdrop-blur-sm" role="dialog" aria-modal="true">
      <div className="flex max-h-[86vh] w-[640px] max-w-[96vw] flex-col rounded-md border border-cyan-400/35 bg-db-overlay shadow-[0_0_42px_rgba(34,211,238,0.18)]">
        <div className="flex items-center justify-between border-b border-db-border/45 px-4 py-3">
          <div>
            <div className="text-metric font-semibold text-db-strong">{editor.mode === "add" ? "添加自定义产业链" : "更新产业链股票库"}</div>
            <div className="mt-0.5 text-panel-title text-db-muted">粘贴问财结论，或点击「从问财获取」自动查询。</div>
          </div>
          <button type="button" onClick={onClose} className="rounded px-2 py-1 text-metric-sm text-db-tertiary transition hover:bg-db-subtle hover:text-db-strong">关闭</button>
        </div>
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
          <label className="block">
            <span className="mb-1 block text-subtitle font-semibold text-db-secondary">产业链名称</span>
            <input value={editor.name} onChange={(e) => onChange({ ...editor, name: e.target.value })}
              readOnly={editor.mode === "update"} placeholder="例如：人工智能产业链"
              className="h-9 w-full rounded border border-db-border bg-slate-950/80 px-3 text-metric-sm text-db-strong outline-none transition focus:border-cyan-400/70 placeholder:text-db-faint" />
          </label>
          <div className="flex justify-end">
            <button type="button" onClick={onAutoFetch} disabled={parseState.loading}
              className="rounded border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-panel-title font-semibold text-emerald-300 transition hover:bg-emerald-500/20 disabled:opacity-50">
              {parseState.loading ? "查询中..." : "从问财获取"}
            </button>
          </div>
          <label className="block">
            <span className="mb-1 block text-subtitle font-semibold text-db-secondary">问财结论内容</span>
            <textarea value={editor.content} onChange={(e) => onChange({ ...editor, content: e.target.value })}
              placeholder="从问财获取结果会自动填充到这里，也可以手动粘贴&#10;&#10;格式示例：&#10;AI产业链&#10;&#10;上游 · 算力基座：&#10;寒武纪(sh688256)、海光信息(sh688041)、中际旭创(sz300308)&#10;&#10;中游 · 模型平台：&#10;科大讯飞(sz002230)、商汤(hk00020)&#10;&#10;下游 · 应用：&#10;金山办公(sh688111)、万兴科技(sz300624)&#10;&#10;核心逻辑：AI产业链&#10;数据来源：同花顺问财"
              className="h-[240px] w-full resize-none rounded border border-db-border bg-slate-950/80 px-3 py-2 text-subtitle leading-6 text-db-primary outline-none transition placeholder:text-db-faint focus:border-cyan-400/70" />
          </label>
          {parseState.error && <div className="rounded border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-panel-title text-rose-300">{parseState.error}</div>}
          {parseState.warnings.map((w, i) => <div key={i} className="rounded border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-panel-title text-amber-300">{w}</div>)}
        </div>
        <div className="flex justify-end gap-2 border-t border-db-border/45 px-4 py-3">
          <button type="button" onClick={onClose} className="rounded border border-db-border px-3 py-1.5 text-subtitle text-db-secondary transition hover:bg-db-subtle">取消</button>
          <button type="button" onClick={onSubmit} disabled={parseState.loading}
            className="rounded border border-cyan-400/50 bg-cyan-500/15 px-3 py-1.5 text-subtitle font-semibold text-cyan-200 transition hover:bg-cyan-500/25 disabled:opacity-50">
            {parseState.loading ? "处理中..." : editor.mode === "add" ? "创建并保存" : "整理并保存"}
          </button>
        </div>
      </div>
    </div>
  );
}

import { useEffect, useState } from "react";
import { Star, X } from "lucide-react";
import { isTv } from "@/lib/tv";
import { loadJson, saveJson } from "@/lib/storage";

const HINT_KEY = "mrd_star_hint";

/**
 * 首次访问提示条: 右下角浮层, 邀请用户去 GitHub 点 Star。
 * - 仅非 TV 模式显示(电视场景不弹打扰)
 * - localStorage 记忆: 点过/关过不再显示
 */
export function StarHint({ githubUrl }: { githubUrl: string }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // 已提示过 / TV 模式 → 不显示 (loadJson 内部已 try-catch)
    if (isTv || loadJson<boolean>(HINT_KEY, false)) return;
    // 延迟出现, 等页面主体渲染完
    const t = setTimeout(() => setVisible(true), 4000);
    return () => clearTimeout(t);
  }, []);

  if (!visible) return null;

  const dismiss = () => {
    setVisible(false);
    saveJson(HINT_KEY, true); // saveJson 内部已 try-catch
  };

  return (
    <div className="fixed bottom-5 right-5 z-50 flex items-center gap-3 rounded-xl border border-db-border/60 bg-db-elevated/95 px-4 py-3 shadow-xl shadow-black/40 backdrop-blur">
      <Star className="h-4 w-4 shrink-0 fill-amber-400 text-amber-400" />
      <p className="text-subtitle leading-snug text-db-primary">
        觉得不错？去 GitHub 点个 <span className="font-bold text-amber-300">Star</span> 支持一下 ⭐
      </p>
      <a
        href={githubUrl}
        target="_blank"
        rel="noopener noreferrer"
        onClick={dismiss}
        className="rounded-md border border-cyan-500/50 bg-cyan-500/10 px-2.5 py-1 text-panel-title font-semibold text-cyan-300 transition-colors hover:bg-cyan-500/20"
      >
        去 Star
      </a>
      <button
        onClick={dismiss}
        title="关闭"
        aria-label="关闭"
        className="flex h-5 w-5 items-center justify-center rounded text-db-muted transition-colors hover:text-db-secondary"
      >
        <X size={14} />
      </button>
    </div>
  );
}

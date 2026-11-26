// mrd 托管版 · 登录/注册页（邮箱+密码极简账号, 内测版不做 OAuth/邮箱验证码）
import { useState } from "react";
import { hostingRegister, hostingLogin, setHostingToken } from "@/lib/hosting";

interface Props {
  onAuthed: () => void;
}

export default function LoginPage({ onAuthed }: Props) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) { setError("请输入有效邮箱"); return; }
    if (password.length < 8) { setError("密码至少 8 位"); return; }
    if (mode === "register" && !inviteCode.trim()) { setError("请输入邀请码"); return; }
    setBusy(true);
    try {
      const res = mode === "register"
        ? await hostingRegister(email.trim().toLowerCase(), password, inviteCode.trim().toUpperCase())
        : await hostingLogin(email.trim().toLowerCase(), password);
      setHostingToken(res.token);
      onAuthed();
    } catch (err) {
      // 服务端错误文案(邀请码无效/已使用/已撤销/限流等)原样展示
      setError(err instanceof Error ? err.message : "请求失败，请重试");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-db-canvas p-4 text-db-primary">
      <div className="w-full max-w-sm rounded-xl border border-db-border/50 bg-db-elevated/60 p-6 shadow-xl">
        <div className="mb-1 text-lg font-semibold text-db-strong">市场研究驾驶舱</div>
        <div className="mb-5 text-body uppercase tracking-widest text-db-muted">MARKET RESEARCH COCKPIT · 内测版</div>
        <form onSubmit={submit} className="flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-panel-title text-db-tertiary">
            邮箱
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
              className="rounded border border-db-border/60 bg-db-subtle/50 px-2.5 py-1.5 text-subtitle text-db-strong outline-none placeholder:text-db-faint focus:border-cyan-500/60"
            />
          </label>
          <label className="flex flex-col gap-1 text-panel-title text-db-tertiary">
            密码
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="至少 8 位"
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              className="rounded border border-db-border/60 bg-db-subtle/50 px-2.5 py-1.5 text-subtitle text-db-strong outline-none placeholder:text-db-faint focus:border-cyan-500/60"
            />
          </label>
          {mode === "register" && (
            <label className="flex flex-col gap-1 text-panel-title text-db-tertiary">
              邀请码<span className="text-meta text-db-faint">（内测名单发放，一次性使用）</span>
              <input
                type="text"
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value)}
                placeholder="请输入 12 位邀请码"
                autoComplete="off"
                spellCheck={false}
                className="rounded border border-db-border/60 bg-db-subtle/50 px-2.5 py-1.5 text-subtitle text-db-strong outline-none placeholder:text-db-faint focus:border-cyan-500/60"
              />
            </label>
          )}
          {error && <div className="rounded border border-rose-500/40 bg-rose-500/10 px-2 py-1.5 text-panel-title text-rose-300">{error}</div>}
          <button
            type="submit"
            disabled={busy}
            className="mt-1 rounded bg-cyan-600/80 py-2 text-subtitle font-medium text-white hover:bg-cyan-500 disabled:opacity-50"
          >
            {busy ? "请稍候…" : mode === "login" ? "登 录" : "注 册 并 登 录"}
          </button>
        </form>
        <div className="mt-4 text-center text-panel-title text-db-muted">
          {mode === "login" ? (
            <>
              还没有账号？{" "}
              <button className="text-cyan-400 hover:underline" onClick={() => { setMode("register"); setError(null); }}>注册</button>
            </>
          ) : (
            <>
              已有账号？{" "}
              <button className="text-cyan-400 hover:underline" onClick={() => { setMode("login"); setError(null); }}>直接登录</button>
            </>
          )}
        </div>
        <div className="mt-4 border-t border-db-border/40 pt-3 text-center text-meta leading-relaxed text-db-faint">
          托管版内测实例 · 仅限内测名单访问
          <br />
          行情数据为公开聚合 · 个性化数据按租户隔离
        </div>
      </div>
    </div>
  );
}

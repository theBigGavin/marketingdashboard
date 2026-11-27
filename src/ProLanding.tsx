import { useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, Check, Globe, LineChart, Moon, Plug, Star, Sun, Wrench, Zap } from "lucide-react";

function useTheme() {
  const [dark, setDark] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem("mrd-theme-v1");
      if (saved) return saved === "dark";
    } catch { /* localStorage 不可用时使用默认主题 */ }
    return true;
  });
  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    try { localStorage.setItem("mrd-theme-v1", dark ? "dark" : "light"); } catch { /* localStorage 不可用时使用默认主题 */ }
  }, [dark]);
  return { dark, toggle: () => setDark((d) => !d) };
}

const iconCls = "h-6 w-6 text-cyan-600 dark:text-cyan-400";

const stats = [
  { value: "50+", label: "GitHub stars" },
  { value: "¥0", label: "API Key 费用" },
  { value: "6", label: "资产类别一屏看全" },
  { value: "24h", label: "数据自动刷新" },
];

const features = [
  { icon: Plug, title: "零 API Key", desc: "数据源全免费公开，无需任何付费行情订阅，打开即用。" },
  { icon: Globe, title: "一屏看全", desc: "A股/港股/美股/黄金/商品/美债/板块资金流/产业链，全市场一张屏。" },
  { icon: Wrench, title: "免运维", desc: "数据源挂了我们自动修复、接口变更我们跟进，你只管看盘研究。" },
  { icon: Zap, title: "永远最新", desc: "功能更新自动同步，无需手动升级部署。" },
];

export default function ProLanding() {
  const { dark, toggle } = useTheme();
  const [email, setEmail] = useState("");
  const [need, setNeed] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">("idle");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setState("error"); return; }
    setState("sending");
    try {
      const r = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, need }),
      });
      if (!r.ok) throw new Error("fail");
      setState("done");
    } catch {
      setState("error");
    }
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-background text-foreground">
      {/* 渐变光晕背景 */}
      <div className="pointer-events-none absolute inset-x-0 -top-40 h-[560px] bg-[radial-gradient(ellipse_at_top,rgba(6,182,212,0.18),transparent_60%)]" />
      <div className="pointer-events-none absolute -right-40 top-1/3 h-[420px] w-[420px] rounded-full bg-[radial-gradient(circle,rgba(56,189,248,0.10),transparent_70%)]" />

      <div className="relative mx-auto max-w-6xl px-6 py-8">
        {/* Header */}
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-lg font-semibold">
            <LineChart className="h-6 w-6 text-cyan-600 dark:text-cyan-400" />
            市场研究驾驶舱 <span className="text-cyan-600 dark:text-cyan-400">Pro</span>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={toggle}
              aria-label="切换明暗"
              className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-sm text-foreground hover:border-cyan-600 dark:hover:border-cyan-400"
            >
              {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              {dark ? "亮色" : "暗色"}
            </button>
            <a href="/" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-cyan-600 dark:hover:text-cyan-300">
              <ArrowLeft className="h-4 w-4" /> 免费版 demo
            </a>
          </div>
        </header>

        {/* Hero 分栏 */}
        <div className="mt-14 grid items-center gap-12 lg:grid-cols-2">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-cyan-600/40 bg-cyan-500/10 px-3 py-1 text-xs text-cyan-700 dark:text-cyan-300">
              <Star className="h-3.5 w-3.5" /> 开源 MIT · 正在内测
            </div>
            <h1 className="mt-5 text-4xl font-bold leading-tight tracking-tight md:text-5xl">
              零 API Key，
              <br />
              一屏看全全球市场
            </h1>
            <p className="mt-5 max-w-lg text-lg leading-relaxed text-muted-foreground">
              托管版市场研究驾驶舱——数据源我们维护，故障我们修。
              打开浏览器就能看 A股、港股、美股、黄金、商品、美债与板块资金流。
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <a href="#join" className="inline-flex items-center gap-2 rounded-lg !bg-cyan-600 px-6 py-3 font-semibold text-white hover:!bg-cyan-500">
                预注册 Pro <ArrowRight className="h-4 w-4" />
              </a>
              <a href="/" className="inline-flex items-center gap-2 rounded-lg border border-border px-6 py-3 font-medium text-foreground hover:border-cyan-600 hover:text-cyan-700 dark:hover:text-cyan-300">
                免费版 demo（免注册）
              </a>
            </div>
            {/* 信任数字带 */}
            <div className="mt-10 grid grid-cols-2 gap-6 sm:grid-cols-4">
              {stats.map((s) => (
                <div key={s.label}>
                  <div className="text-2xl font-bold text-cyan-700 dark:text-cyan-300">{s.value}</div>
                  <div className="mt-1 text-xs text-muted-foreground">{s.label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* 产品截图 */}
          <div className="relative">
            <div className="absolute -inset-4 rounded-2xl bg-cyan-500/10 blur-2xl" />
            <div className="relative overflow-hidden rounded-xl border border-border bg-card shadow-2xl">
              <div className="flex items-center gap-1.5 border-b border-border bg-muted px-4 py-2.5">
                <span className="h-2.5 w-2.5 rounded-full bg-red-400" />
                <span className="h-2.5 w-2.5 rounded-full bg-yellow-400" />
                <span className="h-2.5 w-2.5 rounded-full bg-green-400" />
                <span className="ml-3 text-xs text-muted-foreground">mrd.hermes.cc.cd</span>
              </div>
              <img src="/pro/screenshot.png" alt="市场研究驾驶舱截图" className="w-full" loading="lazy" />
            </div>
          </div>
        </div>

        {/* Features */}
        <div className="mt-24">
          <h2 className="text-center text-2xl font-bold md:text-3xl">为什么选 mrd Pro</h2>
          <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {features.map((f) => (
              <div key={f.title} className="rounded-xl border border-border bg-card p-6 transition-colors hover:border-cyan-600/50">
                <f.icon className={iconCls} />
                <div className="mt-4 text-lg font-semibold">{f.title}</div>
                <div className="mt-2 text-sm leading-relaxed text-muted-foreground">{f.desc}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Pro vs OSS */}
        <div className="mt-24">
          <h2 className="text-center text-2xl font-bold md:text-3xl">Pro 托管 vs 开源自部署</h2>
          <div className="mx-auto mt-10 grid max-w-3xl gap-4 sm:grid-cols-2">
            <div className="rounded-xl border border-cyan-600/40 bg-cyan-500/5 p-6">
              <div className="text-lg font-semibold text-cyan-700 dark:text-cyan-300">Pro 托管（$5–15/月）</div>
              <ul className="mt-4 space-y-2.5 text-sm">
                <li className="flex items-center gap-2"><Check className="h-4 w-4 shrink-0 text-cyan-600 dark:text-cyan-400" /> 我们帮你部署、监控、修复</li>
                <li className="flex items-center gap-2"><Check className="h-4 w-4 shrink-0 text-cyan-600 dark:text-cyan-400" /> 数据源变更自动跟进</li>
                <li className="flex items-center gap-2"><Check className="h-4 w-4 shrink-0 text-cyan-600 dark:text-cyan-400" /> 功能更新自动同步</li>
                <li className="flex items-center gap-2"><Check className="h-4 w-4 shrink-0 text-cyan-600 dark:text-cyan-400" /> 零配置，打开即用</li>
              </ul>
            </div>
            <div className="rounded-xl border border-border bg-card p-6">
              <div className="text-lg font-semibold">开源自部署（免费）</div>
              <ul className="mt-4 space-y-2.5 text-sm text-muted-foreground">
                <li>MIT 协议，代码全开源</li>
                <li>Docker 一条命令部署</li>
                <li>自己维护数据源与更新</li>
                <li>适合想折腾的技术用户</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Join form */}
        <div id="join" className="mx-auto mt-24 max-w-xl">
          <h2 className="text-center text-2xl font-bold md:text-3xl">预注册 Pro，锁定早鸟价</h2>
          <p className="mt-3 text-center text-sm text-muted-foreground">内测开放时第一时间通知你，早鸟享 5 折</p>
          <form onSubmit={submit} className="mt-8 space-y-4">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="你的邮箱"
              required
              className="w-full rounded-lg border border-border bg-card px-4 py-3 text-foreground placeholder:text-muted-foreground outline-none focus:border-cyan-600"
            />
            <textarea
              value={need}
              onChange={(e) => setNeed(e.target.value)}
              placeholder="你想用托管版做什么？（可选）"
              rows={3}
              className="w-full rounded-lg border border-border bg-card px-4 py-3 text-foreground placeholder:text-muted-foreground outline-none focus:border-cyan-600"
            />
            <button
              type="submit"
              disabled={state === "sending" || state === "done"}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg !bg-cyan-600 py-3 font-semibold text-white hover:!bg-cyan-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {state === "sending" ? "提交中…" : state === "done" ? (<><Check className="h-5 w-5" /> 已收到，我们会联系你</>) : "预注册 Pro"}
            </button>
            {state === "error" && <div className="text-center text-sm text-red-500">邮箱格式不对，或提交失败，请重试</div>}
          </form>
          <p className="mt-6 text-center text-xs text-muted-foreground">
            开源版：<a className="text-cyan-700 hover:underline dark:text-cyan-400" href="https://github.com/theBigGavin/marketingdashboard" target="_blank" rel="noreferrer">github.com/theBigGavin/marketingdashboard</a>
          </p>
        </div>
      </div>
    </div>
  );
}

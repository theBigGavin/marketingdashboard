// WebViewController 是全局类(官方文档: 无需 import), 直接用
// ?tv=1 触发 mrd TV 模式; 无标题栏; 右下角悬浮退出按钮(官方 useDismiss)
// 本地开屏方案: 单WebView页 — loadHTML(本地开屏,含mrd logo动画) → 2s后 loadURL(mrd)
// 消除: 第二个present切换白屏 + 网络加载白屏 + React state重渲染黑屏
import {
  WebView, Navigation, Script, Button, ZStack, Spacer, VStack, useEffect, useMemo,
} from "scripting"

const BASE = "https://mrd.hermes.cc.cd/?tv=1"

// 本地开屏页: 复刻 TV app buildSplash (深底#070B12 + mrd logo呼吸 + 应用名 + 副标题 + 旋转进度圈 + 连接提示)
const SPLASH_HTML = `<!doctype html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body {
    background:#070b12; height:100vh; overflow:hidden;
    display:flex; flex-direction:column; align-items:center; justify-content:center;
    font-family:-apple-system, BlinkMacSystemFont, "SF Pro Display", "PingFang SC", sans-serif;
  }
  .logo { width:96px; height:96px; animation:pulse 0.8s ease-in-out infinite alternate; }
  .name { color:#E2E8F0; font-size:30px; font-weight:700; margin-top:24px; }
  .sub { color:#0891B2; font-size:13px; letter-spacing:3px; margin-top:8px; text-transform:uppercase; }
  .spinner {
    width:30px; height:30px; margin-top:32px;
    border:3px solid rgba(8,145,178,0.3); border-top-color:#0891B2;
    border-radius:50%; animation:spin 0.9s linear infinite;
  }
  .hint { color:#94A3B8; font-size:13px; margin-top:16px; }
  @keyframes spin { to { transform:rotate(360deg); } }
  @keyframes pulse { from { transform:scale(1); } to { transform:scale(1.12); } }
</style>
</head>
<body>
  <svg class="logo" viewBox="0 0 512 512">
    <defs>
      <linearGradient id="g" x1="0" y1="1" x2="1" y2="0">
        <stop offset="0" stop-color="#22d3ee"/>
        <stop offset="1" stop-color="#3b82f6"/>
      </linearGradient>
      <marker id="arr" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
        <path d="M 0 0 L 10 5 L 0 10 z" fill="#3b82f6"/>
      </marker>
    </defs>
    <rect width="512" height="512" rx="112" fill="#0b1220"/>
    <rect x="6" y="6" width="500" height="500" rx="106" fill="none" stroke="#1e293b" stroke-width="2"/>
    <g opacity="0.55">
      <line x1="150" y1="250" x2="150" y2="374" stroke="#155e75" stroke-width="7"/>
      <rect x="132" y="274" width="36" height="74" rx="7" fill="#164e63"/>
      <line x1="228" y1="230" x2="228" y2="354" stroke="#155e75" stroke-width="7"/>
      <rect x="210" y="250" width="36" height="82" rx="7" fill="#155e75"/>
      <line x1="306" y1="270" x2="306" y2="394" stroke="#155e75" stroke-width="7"/>
      <rect x="288" y="290" width="36" height="74" rx="7" fill="#164e63"/>
    </g>
    <polyline points="120,370 214,296 282,330 396,192" fill="none" stroke="url(#g)" stroke-width="22"
      stroke-linecap="round" stroke-linejoin="round" marker-end="url(#arr)"/>
  </svg>
  <div class="name">市场研究驾驶舱</div>
  <div class="sub">MARKET RESEARCH COCKPIT</div>
  <div class="spinner"></div>
  <div class="hint">正在连接 mrd.hermes.cc.cd …</div>
</body>
</html>`

// WebView 页: 无 state, 永不重渲染; 本地开屏 → mrd
function WebViewPage() {
  const dismiss = Navigation.useDismiss()
  const controller = useMemo(() => new WebViewController(), [])

  useEffect(() => {
    // 1. 本地开屏立即渲染(无网络) 2. 停留 2s 后加载 mrd (期间 mrd body 已是深色, 无缝衔接)
    controller.loadHTML(SPLASH_HTML).then(() => {
      setTimeout(() => controller.loadURL(BASE), 2000)
    })
    return () => { controller.dispose() }
  }, [controller])

  return (
    <ZStack
      frame={{ maxWidth: "infinity", maxHeight: "infinity" }}
    >
      <WebView
        controller={controller}
        frame={{ maxWidth: "infinity", maxHeight: "infinity" }}
        ignoresSafeArea
      />
      <VStack
        frame={{ maxWidth: "infinity", maxHeight: "infinity" }}
        alignment="trailing"
      >
        <Spacer />
        <Button
          title="退出"
          systemImage="xmark"
          action={() => dismiss()}
          buttonStyle="glass"
          tint="white"
          padding={{ trailing: 16, bottom: 16 }}
        />
      </VStack>
    </ZStack>
  )
}

export async function run() {
  await Navigation.present({
    element: <WebViewPage />,
    modalPresentationStyle: "overFullScreen",
  })
  Script.exit()
}

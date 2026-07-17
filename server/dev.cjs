/**
 * 开发启动器: 同时拉起数据代理(PORT=3001)与 Vite 开发服务器(:3000)
 * 任一进程退出则整体退出; Ctrl-C 时两个子进程都会被终止。
 */
const { spawn } = require("child_process");
const path = require("path");

const root = path.join(__dirname, "..");

const procs = [
  spawn(process.execPath, [path.join(__dirname, "index.cjs")], {
    cwd: root,
    env: { ...process.env, PORT: "3001" },
    stdio: "inherit",
  }),
  spawn(process.execPath, [path.join(root, "node_modules", "vite", "bin", "vite.js")], {
    cwd: root,
    env: process.env,
    stdio: "inherit",
  }),
];

let exiting = false;
function shutdown(code) {
  if (exiting) return;
  exiting = true;
  for (const p of procs) p.kill("SIGTERM");
  process.exit(code);
}

for (const p of procs) {
  p.on("exit", (code) => shutdown(code ?? 0));
}
process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

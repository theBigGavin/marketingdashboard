# Market Research Cockpit

这是一个面向金融与产业研究的实时驾驶舱仪表盘，聚合市场指数、大宗商品、美债、板块、资金流、快讯和产业链自选股等关键数据。

## 关键功能

- 实时盘面行情与指数报价
- 大宗商品与加密货币价格跟踪
- 美债收益率与利差监控
- 行业/概念板块排行榜与板块成分股
- 个股资金流与热度排行
- 产业链自选股票分层展示
- 7x24 快讯聚合与市场脉动提示
- 开发模式下自动代理外部数据源并缓存结果

## 技术栈

- 前端：React 19 + Vite + TypeScript
- 样式：Tailwind CSS + Radix UI 组件
- 数据可视化：Recharts
- 路由：react-router
- 后端代理：Node.js 原生 `http` + `curl` / `fetch`
- 数据源：腾讯、新浪、华尔街见闻、Binance、CNBC 等公开行情接口

## 安装与运行

### 先决条件

- Node.js 18+ 或更高版本
- 系统可用 `curl`（用于某些代理接口）

### 安装依赖

```bash
cd marketingdashboard
npm install
# 或者使用 pnpm
pnpm install
```

### 启动开发环境

```bash
npm run dev
```

默认会启动：

- Vite 开发服务器：`http://localhost:3000`
- 数据代理服务：`http://localhost:3001`

开发环境中，Vite 会将 `/api` 请求代理到本地数据服务。

### 生产构建

```bash
npm run build
```

### 预览构建结果

```bash
npm run preview
```

### 生产启动

```bash
npm run start
```

该命令会启动 `server/index.cjs`，并在 `dist` 目录下提供静态文件服务。

## 项目目录

- `src/`
  - `App.tsx`：仪表盘主界面与页面路由
  - `pages/`：页面入口
  - `components/dash/`：驾驶舱各个面板组件
  - `hooks/`：通用钩子（轮询、移动端判断等）
  - `lib/api.ts`：前端 API 客户端抽象
  - `config/dashboard.ts`：指数、商品、产业链等静态配置
- `server/`
  - `dev.cjs`：开发时启动 Vite 与代理服务
  - `index.cjs`：数据代理服务与静态文件服务器
- `package.json`：依赖与 npm 脚本
- `vite.config.ts`：开发代理与别名配置
- `tsconfig.*`：TypeScript 配置

## 本地代理 API

开发时前端通过 `/api` 代理访问本地服务。主要接口包括：

- `/api/quotes?codes=...`
- `/api/minute?code=...`
- `/api/boards?type=...&dir=...&n=...`
- `/api/board-stocks?code=...&dir=...&n=...`
- `/api/futures?list=...`
- `/api/future-minute?code=...`
- `/api/rank?sort=...&asc=...&n=...`
- `/api/moneyflow?n=...`
- `/api/news?page=...&size=...`
- `/api/treasuries`
- `/api/treasury-history`
- `/api/health`

## 设计说明

- 前端采用一屏式大屏布局，适合研究员实时监控全局市场动态。
- 后端无需数据库，依赖外部行情接口并在内存中进行短期缓存，减少上游请求压力。
- 代码结构清晰，`src/components/dash` 中的面板组件可按需求扩展或拆分。

## 贡献指南

欢迎提交 issue 或 PR。

1. Fork 仓库
2. 创建分支：`feature/xxx`
3. 提交修改并推送
4. 创建 Pull Request

## 许可证

MIT

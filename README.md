<div align="center">

<img src="public/icons/icon-192.png" alt="logo" width="96" />

# 📊 市场研究驾驶舱

**Market Research Cockpit — 面向金融与产业研究的一屏式实时行情大屏**

聚合 A股 / 港股 / 美股 · 大宗商品 · 美债收益率 · 板块热点 · 资金流 · 7×24 快讯 · 产业链自选股

[![React](https://img.shields.io/badge/React-19-61dafb?logo=react&logoColor=white)](https://react.dev)
[![Vite](https://img.shields.io/badge/Vite-7-646cff?logo=vite&logoColor=white)](https://vite.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178c6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-3.4-38bdf8?logo=tailwindcss&logoColor=white)](https://tailwindcss.com)
[![Node.js](https://img.shields.io/badge/Node.js-18+-339933?logo=node.js&logoColor=white)](https://nodejs.org)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

</div>

![市场研究驾驶舱截图](docs/screenshot.png)

## ✨ 功能亮点

- **🌍 全球市场一屏掌握** — 沪深 / 恒生 / 道琼斯 / 纳斯达克 / 标普 / VIX / 美元人民币汇率，指数分钟级走势同屏联动
- **🥇 大宗商品与加密货币** — 纽约金银、伦敦金、沪金、伦铜、原油、BTC，价格与日内曲线实时刷新
- **💵 美债收益率监控** — 10Y / 2Y 收益率、2s10s 利差、收益率曲线形态与历史月度变迁
- **🔥 板块热点雷达** — 行业 / 概念板块涨跌排行，点击板块联动成分股、龙头股与资金流
- **💰 资金流向追踪** — 个股主力净流入 TOP 榜、板块资金分钟级累计曲线、热门股 / 涨幅 / 跌幅榜单
- **⛓️ 产业链全景** — 半导体、AI 算力、新能源车、机器人、创新药等产业链，上中下游标的分层展示并联动行情。支持手动编辑或从问财自动获取股票列表
- **🤖 AI 驾驶舱** — OpenRouter 日度榜单 API，追踪全球 50+ 大模型厂商 Token 消耗量趋势（支持 7d~1y 时间范围），按厂商/国家/地区堆叠面积图展示份额变化，支持 60 天以上超长历史回溯
- **🏷️ 商品价格页（/goods）** — 贵金属 / 基本金属 / 黑色 / 能化 / 农产品 / 国际能源 6 大分组期货主力日线趋势（新浪全历史 K 线，30d~365d 区间切换），生意社现货日度报价（历史逐日积累）与现期基差对照表
- **📰 7×24 快讯聚合** — 全球财经快讯滚动播报，宏观关键词与产业链关联新闻自动高亮
- **🖥️ 可安装为桌面应用** — 内置 PWA 支持（Web Manifest + Service Worker），浏览器地址栏一键安装，独立窗口运行
- **⚡ 零依赖数据服务** — 内置 Node 代理聚合公开行情接口，内存缓存减压，大部分接口无需 API Key，开箱即用

## 🏗️ 架构

```mermaid
flowchart LR
    subgraph 外部数据源
        A[腾讯行情] --> D
        B[新浪财经] --> D
        C1[东方财富] --> D
        C2[华尔街见闻] --> D
        C3[CNBC / Binance] --> D
        C4[同花顺问财] --> D
        C5[OpenRouter 榜单] --> D
    end
    subgraph 本项目
        D["Node 数据代理<br/>内存 TTL 缓存"] -->|"/api/*"| E["React 19 前端<br/>轮询刷新"]
        E --> F[一屏式驾驶舱 UI]
    end
```

- 前端优先请求本站 Node 代理；代理不可用时，部分接口（腾讯系 / 见闻）自动降级为浏览器直连
- 服务端按接口粒度设置缓存 TTL（行情 1.5s ~ 板块归属 24h），缓存容量有界（LRU + 定时清扫），无数据库、无外部存储
- 生产环境单进程运行：同一端口同时提供 API 与前端静态文件

## 🚀 快速开始

### 先决条件

- Node.js 18+
- 系统可用 `curl`（部分代理接口使用）

### 本地开发

```bash
npm install     # 或 pnpm install
npm run dev
```

- 前端开发服务器：<http://localhost:3000>
- 数据代理服务：<http://localhost:3001>（Vite 自动将 `/api` 代理过去）

### 生产部署

```bash
npm run build   # 构建到 dist/
# 可选：配置 OpenRouter API Key（AI 驾驶舱面板）
# echo 'OPENROUTER_API_KEY=sk-or-v1-xxxx' > server/.env
npm start       # 单进程启动，访问 http://localhost:3000
```

### Docker

```bash
docker build -t market-cockpit .
docker run -p 3000:3000 market-cockpit
```

### 安装为桌面应用（PWA）

用 Chrome / Edge 打开部署后的页面，点击地址栏右侧的 **安装图标**（或菜单 →「安装市场研究驾驶舱」），即可作为独立桌面应用运行，支持离线缓存静态资源、独立图标。

> 注意：行情接口实时拉取，离线状态下仅应用外壳可用。

## 📡 API 一览

开发时前端通过 `/api` 访问本地代理服务：

| 接口 | 说明 |
| --- | --- |
| `/api/quotes?codes=...` | 指数 / 个股实时报价 |
| `/api/minute?code=...` | 日内分钟走势 |
| `/api/boards?type=...&dir=...&n=...` | 行业 / 概念板块排行 |
| `/api/board-stocks?code=...&n=...` | 板块成分股 |
| `/api/futures?list=...` | 大宗商品 / 加密货币报价 |
| `/api/future-minute?code=...` | 期货日内走势 |
| `/api/future-daily?code=...` | 期货日线 K 线（新浪全历史，内盘 nf_ / 外盘 hf_） |
| `/api/spot-table` | 生意社现期对照表（现货价 / 期货价 / 基差，现货历史逐日积累） |
| `/api/rank?sort=...&n=...` | 个股榜单（涨幅 / 成交额 / 换手率） |
| `/api/moneyflow?n=...` | 个股主力净流入排行 |
| `/api/stock-flows?codes=...` | 批量个股资金流 |
| `/api/board-flow?n=...` | 板块资金流向曲线 |
| `/api/stock-boards?code=...` | 个股所属板块（行业 / 地域 / 概念） |
| `/api/news?page=...&size=...` | 7×24 财经快讯 |
| `/api/treasuries` | 美债收益率实时值 |
| `/api/treasury-history` | 美债收益率历史曲线 |
| `/api/mystery-select?query=...&limit=...` | 问财股票筛选（按概念/行业查询） |
| `/api/chain-parse` | 产业链文本解析（按段落标题自动分配上中下游） |
| `/api/openrouter-usage` | OpenRouter 日度榜单（厂商 Token 消耗量，本地缓存持久化积累） |
| `/api/stock-search?q=...` | 股票搜索（名称/拼音首字母→代码，新浪建议代理） |
| `/api/health` | 健康检查 |

> 注：`/api/mystery-select` 与 `/api/openrouter-usage` 消耗服务端私有 API Key，仅接受同源页面请求（跨源 403）；POST 请求体上限 256KB；`/api/` 未命中路由返回 404 JSON。

## 🗂️ 项目结构

```
├── server/
│   ├── dev.cjs        # 开发入口：同时启动 Vite 与数据代理
│   └── index.cjs      # 数据代理 + 生产静态文件服务
├── src/
│   ├── App.tsx        # 大屏布局与路由（/ 市场驾驶舱、/ai AI驾驶舱、/goods 商品价格）
│   ├── AiDashboard.tsx    # AI 驾驶舱页
│   ├── GoodsDashboard.tsx # 商品价格页（6 分组趋势面板 + 现货/基差面板）
│   ├── components/
│   │   └── dash/      # 驾驶舱各面板（指数/板块/资金流/快讯/产业链/AI驾驶舱/自选股/商品趋势…）
│   │       ├── Spark.tsx       # 迷你走势图（A股按交易时段 / 24h 连续时间轴 / 日线按点均分）
│   │       └── WatchlistPanel.tsx  # 自选股面板（支持名称/拼音搜索，localStorage 持久化）
│   ├── config/        # 指数、商品、产业链等静态配置
│   ├── hooks/         # usePolling / useSharedPolling / useClock 等通用钩子
│   └── lib/           # API 客户端与工具函数
└── docs/              # 截图等文档资源
```

## 🛠️ 技术栈

- **前端**：React 19 · Vite 7 · TypeScript · Tailwind CSS · lucide-react 图标（图表为手写 SVG）
- **后端**：Node.js 原生 `http`（无框架）· `curl` / `fetch`
- **数据源**：腾讯 · 新浪 · 东方财富 · 华尔街见闻 · CNBC · Binance · 生意社 等公开行情接口

## ⚠️ 免责声明

本项目仅用于学习与研究目的。所有行情数据来自公开网络接口，可能存在延迟或误差，不构成任何投资建议。

## 🤝 贡献

欢迎提交 Issue 或 PR：

1. Fork 本仓库
2. 创建分支 `feature/xxx`
3. 提交修改并推送
4. 发起 Pull Request

## 📄 License

[MIT](LICENSE)

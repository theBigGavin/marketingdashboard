// 东财 + 新浪行情源 — 榜单/资金流/板块
"use strict";

module.exports = function createEastmoney(ctx) {
  const { fetchWithFallback, cache, cacheSet, num, toMarketCode6 } = ctx;
  const { entry, failEntry, quoteBackoff, TTLS, qqRank } = ctx;

  const EM_REFERER = "https://quote.eastmoney.com/"; // 东财接口统一 Referer

  /* ---------------- 新浪接口(fetch/curl 双通道, 见 lib/fetch-any.cjs) ---------------- */
  async function fetchSinaJson(url, { referer } = {}) {
    return JSON.parse(await fetchWithFallback(url, { referer }));
  }

  /* ---------------- 个股榜单(涨幅/跌幅/热门) — 新浪盘中 + 腾讯盘后双源 ---------------- */
  async function rankViaSina(sort, asc, want) {
    const fetchN = Math.min(100, Math.max(want * 3, 60));
    const url = `https://vip.stock.finance.sina.com.cn/quotes_service/api/json_v2.php/Market_Center.getHQNodeData?page=1&num=${fetchN}&sort=${encodeURIComponent(sort)}&asc=${encodeURIComponent(asc)}&node=hs_a&symbol=&_s_r_a=page`;
    const arr = await fetchSinaJson(url);
    if (!Array.isArray(arr)) return [];
    return arr.filter((s) => num(s.trade) > 0).slice(0, want).map((s) => ({
      symbol: s.symbol,
      code: s.code,
      name: s.name,
      price: num(s.trade),
      change: num(s.pricechange),
      pct: num(s.changepercent),
      open: num(s.open),
      high: num(s.high),
      low: num(s.low),
      vol: num(s.volume),
      amount: num(s.amount), // 元
      pe: num(s.per),
      pb: num(s.pb),
      total_mv: num(s.mktcap), // 万元
      circ_mv: num(s.nmc), // 万元
      turnover: num(s.turnoverratio),
      time: s.ticktime,
    }));
  }

  async function rankViaTencent(sort, asc, want) {
    // 盘后新浪清零,腾讯保留收盘价;涨跌幅字段同样清零(返回0)
    const sortMap = { changepercent: "PriceRatio", amount: "volume", turnoverratio: "PriceRatio" };
    const list = await qqRank.getBoardRankList({
      boardCode: "aStock",
      sortType: sortMap[sort] || "PriceRatio",
      direct: asc === "1" ? "up" : "down",
      offset: 0,
      count: want,
    });
    return list
      .filter((s) => num(s.zxj) > 0)
      .map((s) => ({
        symbol: s.code,
        code: s.code.slice(2),
        name: s.name,
        price: num(s.zxj),
        change: num(s.zd),
        pct: num(s.zdf),
        open: 0, high: 0, low: 0,
        vol: num(s.volume),
        amount: qqRank.estAmount(s), // 成交量(手)估算成交额, 公式见 lib/qq-rank.cjs
        pe: num(s.pe_ttm),
        pb: 0,
        total_mv: num(s.zsz) * 10000,
        circ_mv: num(s.ltsz) * 10000,
        turnover: num(s.hsl),
        time: "",
      }));
  }

  async function handleRank(sort, asc, n) {
    const want = parseInt(n) || 30;
    try {
      const rows = await rankViaSina(sort, asc, want);
      if (rows.length) return rows;
    } catch { /* 新浪不可用则走腾讯 */ }
    return rankViaTencent(sort, asc, want);
  }

  /* ---------------- 新浪个股主力资金流(兜底) ---------------- */
  async function handleMoneyFlow(n) {
    const url = `https://vip.stock.finance.sina.com.cn/quotes_service/api/json_v2.php/MoneyFlow.ssl_bkzj_ssggzj?page=1&num=${n}&sort=netamount&asc=0`;
    const arr = await fetchSinaJson(url);
    if (!Array.isArray(arr)) return [];
    return arr.filter((s) => typeof s.name === "string" && s.name.trim()).map((s) => ({
      symbol: s.symbol,
      name: s.name,
      price: num(s.trade),
      pct: +(num(s.changeratio) * 100).toFixed(2),
      amount: num(s.amount),
      netIn: num(s.netamount), // 主力净流入(元)
      netRatio: +(num(s.ratioamount) * 100).toFixed(2),
      r0Net: num(s.r0_net), // 超大单净流入
      turnover: num(s.turnover),
    }));
  }

  /* ---------------- 个股所属板块(东财): 行业/地域/概念 ---------------- */
  /* 东财对突发请求会断连(WAF), 串行队列 + 双节点 + fetch/curl 双通道兜底 */
  let emQueue = Promise.resolve();
  let emPending = 0; // 排队+执行中的任务数
  const EM_QUEUE_MAX = 20;
  function emEnqueue(fn) {
    // 队列满直接拒绝, 不再无界排队(err.status 供路由层返回 503)
    if (emPending >= EM_QUEUE_MAX) {
      const err = new Error("busy, retry later");
      err.status = 503;
      return Promise.reject(err);
    }
    emPending++;
    const run = () => fn().finally(() => { emPending--; });
    const p = emQueue.then(run, run);
    emQueue = p.catch(() => {});
    return p;
  }

  async function handleStockBoards(code) {
    const m = String(code || "").toLowerCase().match(/^(sh|sz|bj|nq)(\d{6})$/);
    if (!m) throw Object.assign(new Error(`bad code: ${code}`), { status: 400 });
    const market = m[1] === "sh" ? 1 : 0;
    return emEnqueue(async () => {
      // 双节点 × fetch/curl 双通道 × 节流, 统一走 fetchWithFallback(见 lib/fetch-any.cjs);
      // accept 校验 "HTTP 成功但 data 为空" 的情况, 视为失败继续下一通道
      const text = await fetchWithFallback(
        `https://push2delay.eastmoney.com/api/qt/stock/get?secid=${market}.${m[2]}&fields=f57,f58,f127,f128,f129`,
        {
          referer: EM_REFERER,
          hosts: ["push2delay2.eastmoney.com", "push2test.eastmoney.com", "push2.eastmoney.com"],
          throttle: { ok: 60, err: 400 }, // 队列节流
          accept: (t) => { try { return !!JSON.parse(t)?.data; } catch { return false; } },
        }
      );
      const d = JSON.parse(text)?.data;
      return {
        code: `${m[1]}${m[2]}`,
        industry: d.f127 || "",
        area: d.f128 || "",
        concepts: String(d.f129 || "").split(",").filter(Boolean),
      };
    });
  }

  /* ---------------- 东财个股资金流(按股查询) + 主力净流入排名 ---------------- */
  const emMarketOf = (m) => (m === "sh" ? 1 : 0);
  const EM_FS = "m:0+t:6,m:0+t:80,m:1+t:2,m:1+t:23,m:0+t:81+s:2048";

  // 东财行情族按出口 IP 掐断是整族性的(push2/push2delay/82.push2/push2his 全 TLS 断连),
  // 但同族兄弟主机并非同时被掐: push2delay2/push2test 实测(2026-10-29)仍返回完整数据
  // (clist/ulist/stock.get/fflow.kline 分钟曲线全通)。所有 emGet 走主机回退链。
  const EM_HOSTS = ["push2delay2.eastmoney.com", "push2test.eastmoney.com", "push2.eastmoney.com"];

  async function emGet(url) {
    // fetch/curl 双通道 + 主机回退 + 成功/失败节流, 统一走 fetchWithFallback(见 lib/fetch-any.cjs)
    // 主 URL 直接改写到链首主机(push2delay 已被掐, 每次先撞死主机白付一轮超时)
    const u = new URL(url);
    u.host = EM_HOSTS[0];
    return JSON.parse(await fetchWithFallback(u.href, {
      referer: EM_REFERER,
      hosts: EM_HOSTS.slice(1),
      throttle: { ok: 60, err: 400 }, // 队列节流
    }));
  }

  const emSymbol = (code6) => toMarketCode6(code6);

  /** 主力净流入排名(clist, f62 降序) */
  async function handleMoneyFlowEM(n) {
    return emEnqueue(async () => {
      const fields = "f12,f14,f2,f3,f62,f184,f66,f6,f8";
      const url = `https://push2delay.eastmoney.com/api/qt/clist/get?fid=f62&po=1&pz=${n}&pn=1&np=1&fltt=2&invt=2&fs=${encodeURIComponent(EM_FS)}&fields=${fields}`;
      const diff = (await emGet(url))?.data?.diff || [];
      return diff
        .filter((s) => s.f14 && num(s.f2) > 0)
        .map((s) => ({
          symbol: emSymbol(s.f12),
          name: s.f14,
          price: num(s.f2),
          pct: num(s.f3),
          amount: num(s.f6), // 成交额(元)
          netIn: num(s.f62), // 主力净流入(元)
          netRatio: num(s.f184), // 主力净占比(%)
          r0Net: num(s.f66), // 超大单净流入
          turnover: num(s.f8),
        }));
    });
  }

  /** 板块成分股主力净流入排行(clist, fs=b:板块代码, f62 降序) — 与 handleMoneyFlowEM 同映射 */
  async function handleBoardMoneyFlow(code, n) {
    if (!/^BK\d{4}$/.test(code)) return [];
    return emEnqueue(async () => {
      const fields = "f12,f14,f2,f3,f62,f184,f66,f6,f8";
      const cnt = Math.min(Math.max(parseInt(n, 10) || 15, 1), 100); // 防呆: 非法/超限 n 收拢到 1..100
      // 取数窗口放大到 max(cnt*3, 50): 上游按 f62 对全成分股排序, 本地再滤掉停牌股(f2=0)。
      // 若不放大, 前 n 名中混入停牌股时返回行数 < n, 榜单也非严格"交易股净流入前 n"。
      // 窗口内过滤后 slice 截断 → 语义: 交易中的股票按净流入前 n。
      const win = Math.max(cnt * 3, 50);
      const url = `https://push2delay.eastmoney.com/api/qt/clist/get?fid=f62&po=1&pz=${win}&pn=1&np=1&fltt=2&invt=2&fs=${encodeURIComponent(`b:${code}`)}&fields=${fields}`;
      const diff = (await emGet(url))?.data?.diff || [];
      return diff
        .filter((s) => s.f14 && num(s.f2) > 0)
        .slice(0, cnt)
        .map((s) => ({
          symbol: emSymbol(s.f12),
          name: s.f14,
          price: num(s.f2),
          pct: num(s.f3),
          amount: num(s.f6),
          netIn: num(s.f62),
          netRatio: num(s.f184),
          r0Net: num(s.f66),
          turnover: num(s.f8),
        }));
    });
  }

  /** 批量个股资金流(ulist 一次最多 50 只, 按 code 30s 缓存) */
  async function handleStockFlows(codesParam, flowInflight) {
    const list = String(codesParam || "")
      .toLowerCase()
      .split(",")
      .map((s) => s.trim())
      .filter((s) => /^(sh|sz|bj|nq)\d{6}$/.test(s))
      .slice(0, 150);
    const now = Date.now();
    const out = {};
    const missing = [];
    for (const c of list) {
      const hit = cache.get(`sf:${c}`);
      if (hit && hit.data !== undefined && now - hit.ts < 30000) out[c] = hit.data;
      else missing.push(c);
    }
    if (missing.length) {
      // 缺失列表级 inflight 去重(与 handleQuotes 同理, 防并发 miss 打爆东财)
      const fkey = `sfi:${missing.join(",")}`;
      const shared = flowInflight.get(fkey);
      if (shared) {
        Object.assign(out, await shared);
      } else {
        const p = (async () => {
          const rs = {};
          await emEnqueue(async () => {
            for (let i = 0; i < missing.length; i += 50) {
              const chunk = missing.slice(i, i + 50);
              const secids = chunk.map((c) => `${emMarketOf(c.slice(0, 2))}.${c.slice(2)}`).join(",");
              const url = `https://push2delay.eastmoney.com/api/qt/ulist.np/get?secids=${secids}&fields=f12,f62,f184&np=1&fltt=2&invt=2`;
              const diff = (await emGet(url))?.data?.diff || [];
              for (const d of diff) {
                const c = emSymbol(d.f12);
                const rec = { code: c, netIn: num(d.f62), netRatio: num(d.f184) };
                cacheSet(`sf:${c}`, entry(rec, TTLS.STOCK_FLOW)); // 30s 命名 TTL, 见 lib/cache.cjs
                rs[c] = rec;
              }
            }
          });
          return rs;
        })();
        flowInflight.set(fkey, p);
        try {
          Object.assign(out, await p);
        } finally {
          flowInflight.delete(fkey);
        }
      }
    }
    return list.map((c) => out[c]).filter(Boolean);
  }

  /** 板块实时资金流向图: 流入/流出各取前N/2, 拉取分钟级累计主力净流入 */
  async function handleBoardFlow(n) {
    const half = Math.max(3, Math.min(15, Math.floor((parseInt(n) || 20) / 2)));
    return emEnqueue(async () => {
      const pick = async (po) => {
        const url = `https://push2delay.eastmoney.com/api/qt/clist/get?fid=f62&po=${po}&pz=${half}&pn=1&np=1&fltt=2&invt=2&fs=${encodeURIComponent("m:90+t:2")}&fields=f12,f14,f62`;
        return ((await emGet(url))?.data?.diff || []).map((b) => ({
          code: b.f12,
          name: b.f14,
          netIn: num(b.f62),
        }));
      };
      const [ups, downs] = await Promise.all([pick(1), pick(0)]);
      const boards = [...ups, ...downs.filter((d) => !ups.some((u) => u.code === d.code))];
      const out = [];
      for (const b of boards) {
        try {
          const url = `https://push2delay.eastmoney.com/api/qt/stock/fflow/kline/get?secid=90.${b.code}&klt=1&lmt=0&fields1=f1,f2,f3,f7&fields2=f51,f52`;
          const kl = (await emGet(url))?.data?.klines || [];
          out.push({
            ...b,
            points: kl.map((s) => {
              const f = s.split(",");
              return { t: f[0].slice(11, 16), v: num(f[1]) }; // "2026-07-17 09:31" -> "09:31", 累计主力净流入(元)
            }),
          });
        } catch {
          out.push({ ...b, points: [] });
        }
      }
      return out;
    });
  }

  return { handleRank, handleMoneyFlow, handleStockBoards, handleMoneyFlowEM, handleBoardMoneyFlow, handleStockFlows, handleBoardFlow, fetchSinaJson };
};

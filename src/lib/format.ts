/** 格式化与涨跌配色(中国市场: 涨红 / 跌绿) */

import { UP, DOWN, FLAT } from "./colors";

/** 等宽数字样式片段, 各面板统一使用 */
export const TNUM = { fontVariantNumeric: "tabular-nums" } as const;

// 解析数值: 非法输入静默返回 0(与后端 num 同语义)
export const num = (v: unknown) => {
  const n = parseFloat(String(v));
  return Number.isFinite(n) ? n : 0;
};

export const fmtPct = (v: number, digits = 2) => `${v > 0 ? "+" : ""}${v.toFixed(digits)}%`;

/** 换手率: 0/缺失返回 undefined(隐藏该列), 否则 "12.3%" */
export const fmtTurnover = (t?: number): string | undefined => (t != null && t > 0 ? `${t.toFixed(1)}%` : undefined);

export const clsChg = (v: number) =>
  v > 0 ? "text-change-up" : v < 0 ? "text-change-down" : "text-change-flat";

export const bgChg = (v: number) =>
  v > 0
    ? "bg-change-up-bg/15 text-change-up-soft"
    : v < 0
      ? "bg-change-down-bg/15 text-change-down-soft"
      : "bg-change-flat-bg/15 text-change-flat-soft";

/** 兼容旧命名的 SVG/CSS 颜色入口；实际颜色由语义 token 提供。 */
export const hexChg = (v: number) => (v > 0 ? UP : v < 0 ? DOWN : FLAT);

/** 万元 -> 亿/万 */
export const fmtWan = (wan: number) => {
  if (!wan) return "—";
  const yi = wan / 10000;
  if (Math.abs(yi) >= 1) return `${yi.toFixed(0)}亿`;
  return `${wan.toFixed(0)}万`;
};

/** 元 -> 亿/万 */
export const fmtYuan = (y: number) => {
  const abs = Math.abs(y);
  if (abs >= 1e8) return `${(y / 1e8).toFixed(2)}亿`;
  if (abs >= 1e4) return `${(y / 1e4).toFixed(0)}万`;
  return y.toFixed(0);
};

/** 元 -> 千分位亿(财报榜单主列): 269900000000 → "2,699亿"; 不足亿 → 万 */
export const fmtYi = (y: number) => {
  if (!Number.isFinite(y) || y === 0) return "—";
  const abs = Math.abs(y);
  if (abs >= 1e8) return `${(y / 1e8).toLocaleString("zh-CN", { maximumFractionDigits: 0 })}亿`;
  if (abs >= 1e4) return `${(y / 1e4).toFixed(0)}万`;
  return y.toFixed(0);
};

export const fmtPrice = (v: number) => {
  if (!Number.isFinite(v) || v === 0) return "—";
  if (v >= 10000) return v.toLocaleString("zh-CN", { maximumFractionDigits: 1 });
  if (v >= 1000) return v.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (v >= 100) return v.toFixed(2);
  if (v >= 10) return v.toFixed(2);
  return v.toFixed(3);
};

/** 2026-07-17 08:09:40 -> 08:09 */
export const fmtTime = (t: string) => {
  const m = t.match(/(\d{2}):(\d{2})/);
  return m ? `${m[1]}:${m[2]}` : t;
};

/** 格式化与涨跌配色(中国市场: 涨红 / 跌绿) */

export const fmtPct = (v: number, digits = 2) => `${v > 0 ? "+" : ""}${v.toFixed(digits)}%`;

export const clsChg = (v: number) =>
  v > 0 ? "text-rose-400" : v < 0 ? "text-emerald-400" : "text-slate-400";

export const bgChg = (v: number) =>
  v > 0 ? "bg-rose-500/15 text-rose-300" : v < 0 ? "bg-emerald-500/15 text-emerald-300" : "bg-slate-500/15 text-slate-300";

export const hexChg = (v: number) => (v > 0 ? "#fb7185" : v < 0 ? "#34d399" : "#94a3b8");

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

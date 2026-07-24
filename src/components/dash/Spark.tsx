import { useMemo } from "react";
import { hexChg } from "@/lib/format";

interface SparkProps {
  points: { t: string; p: number }[];
  prec: number;
  width?: number;
  height?: number;
  /** 宽度撑满容器(按 viewBox 横向缩放) */
  fluid?: boolean;
  /** 无数据时的占位文案(默认"休市", 24h 品种传"—") */
  emptyLabel?: string;
  /** X 轴时间映射: A股交易时段(默认) / 24h 品种连续交易时间轴 / 日线按点均分 */
  session?: "ashare" | "h24" | "daily";
}

/** 解析时间字符串为分钟数, 支持 "0930" / "09:30" / "2024-01-01 09:30" */
function toMinute(t: string): number {
  const s = t.includes(":") ? (t.trim().split(/\s+/).pop() ?? t) : t;
  if (s.includes(":")) {
    const [hh, mm] = s.split(":");
    return parseInt(hh, 10) * 60 + parseInt(mm, 10);
  }
  return parseInt(s.slice(0, 2), 10) * 60 + parseInt(s.slice(2, 4), 10);
}

/** 日内分时迷你走势图 — X 轴按实际交易时间计算宽度 */
export function Spark({ points, prec, width = 120, height = 36, fluid = false, emptyLabel = "休市", session = "ashare" }: SparkProps) {
  const { line, area, refY, color } = useMemo(() => {
    if (!points || points.length < 2 || !prec) {
      return { line: "", area: "", refY: 0, color: "#64748b" };
    }
    const ps = points.map((d) => d.p);
    let min = Math.min(...ps, prec);
    let max = Math.max(...ps, prec);
    if (max - min < 1e-9) {
      max += 1;
      min -= 1;
    }
    const pad = (max - min) * 0.08;
    min -= pad;
    max += pad;
    let xs: number[];
    if (session === "daily") {
      // 日线序列: 交易日天然不均匀, 迷你图按点均匀分布(prec 传区间首日收盘价即区间涨跌基准)
      xs = points.map((_, i) => 1 + (i / (points.length - 1)) * (width - 2));
    } else if (session === "h24") {
      // 24h 品种(商品/加密): 连续交易时间轴 — 相邻间隔超阈值视为休市段并压缩,
      // 兼容夜盘+日盘结构(如沪金 21:00→01:00→09:00→15:00)与跨午夜
      const GAP_MIN = 5;
      const tl = [0];
      for (let i = 1; i < points.length; i++) {
        let d = toMinute(points[i].t) - toMinute(points[i - 1].t);
        if (d < -720) d += 1440; // 跨午夜
        if (d < 0 || d > GAP_MIN) d = 1; // 休市段压缩为 1 分钟
        tl.push(tl[i - 1] + d);
      }
      const span = Math.max(tl[tl.length - 1], 1);
      xs = tl.map((v) => (v / span) * (width - 2) + 1);
    } else {
      // A股交易时间: 09:30-11:30(上午), 13:00-15:00(下午), 共240分钟
      const OPEN = 9 * 60 + 30; // 570
      const LUNCH_S = 11 * 60 + 30; // 690
      const LUNCH_E = 13 * 60; // 780
      const SESSION = 240; // 总交易分钟数
      xs = points.map((d) => {
        const m = toMinute(d.t);
        let e = m - OPEN;
        if (m >= LUNCH_E) e -= LUNCH_E - LUNCH_S; // 13:00 整点也属下午时段
        return (Math.max(0, Math.min(e, SESSION)) / SESSION) * (width - 2) + 1;
      });
    }
    // 时间解析失败(如未知格式)时退化为按序号均匀分布
    if (xs.some((x) => !Number.isFinite(x))) {
      xs = points.map((_, i) => 1 + (i / (points.length - 1)) * (width - 2));
    }
    const Y = (v: number) => height - 3 - ((v - min) / (max - min)) * (height - 6);
    const last = ps[ps.length - 1];
    const color = hexChg(last - prec);
    const line = points.map((d, i) => `${xs[i].toFixed(1)},${Y(d.p).toFixed(1)}`).join(" ");
    const area = `${xs[0].toFixed(1)},${height - 1} ${line} ${xs[xs.length - 1].toFixed(1)},${height - 1}`;
    return { line, area, refY: Y(prec), color };
  }, [points, prec, width, height, session]);

  if (!line) return <div style={{ width: fluid ? "100%" : width, height }} className="flex items-center justify-center text-[10px] text-slate-600">{emptyLabel}</div>;

  return (
    <svg
      width={fluid ? "100%" : width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className={fluid ? "block min-w-0" : "shrink-0"}
    >
      <polygon points={area} fill={color} opacity={0.12} />
      <line x1={1} y1={refY} x2={width - 1} y2={refY} stroke="#475569" strokeWidth={0.6} strokeDasharray="2,3" />
      <polyline points={line} fill="none" stroke={color} strokeWidth={1.2} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

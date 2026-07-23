import { useMemo } from "react";
import { hexChg } from "@/lib/format";

interface SparkProps {
  points: { t: string; p: number }[];
  prec: number;
  width?: number;
  height?: number;
  /** 宽度撑满容器(按 viewBox 横向缩放) */
  fluid?: boolean;
}

/** 日内分时迷你走势图 — X 轴按实际交易时间计算宽度 */
export function Spark({ points, prec, width = 120, height = 36, fluid = false }: SparkProps) {
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
    // 解析时间字符串，兼容 "0930" (A股) 和 "09:30" (期货) 两种格式
    const parseTime = (t: string) => {
      if (!t || typeof t !== "string") return NaN;
      const s = t.replace(":", "");
      return parseInt(s.slice(0, 2), 10) * 60 + parseInt(s.slice(2, 4), 10);
    };
    // A股交易时间: 09:30-11:30(上午), 13:00-15:00(下午), 共240分钟
    const OPEN = 9 * 60 + 30; // 570
    const LUNCH_S = 11 * 60 + 30; // 690
    const LUNCH_E = 13 * 60; // 780
    const SESSION = 240; // 总交易分钟数
    const t2x = (t: string) => {
      const m = parseTime(t);
      if (!Number.isFinite(m)) return 1;
      let e = m - OPEN;
      if (m > LUNCH_E) e -= LUNCH_E - LUNCH_S;
      return (Math.max(0, Math.min(e, SESSION)) / SESSION) * (width - 2) + 1;
    };
    const Y = (v: number) => height - 3 - ((v - min) / (max - min)) * (height - 6);
    const last = ps[ps.length - 1];
    const color = hexChg(last - prec);
    const line = points.map((d) => `${t2x(d.t).toFixed(1)},${Y(d.p).toFixed(1)}`).join(" ");
    const area = `${t2x(points[0].t).toFixed(1)},${height - 1} ${line} ${t2x(points[points.length - 1].t).toFixed(1)},${height - 1}`;
    return { line, area, refY: Y(prec), color };
  }, [points, prec, width, height]);

  if (!line) return <div style={{ width: fluid ? "100%" : width, height }} className="flex items-center justify-center text-[10px] text-slate-600">休市</div>;

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

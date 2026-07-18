/** 应用 Logo: K线 + 上升趋势箭头(与 PWA 图标同源) */
export function Logo({ size = 22, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 512 512"
      className={className}
      role="img"
      aria-label="市场研究驾驶舱"
    >
      <defs>
        <linearGradient id="logo-g" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor="#22d3ee" />
          <stop offset="1" stopColor="#3b82f6" />
        </linearGradient>
        <marker
          id="logo-arr"
          viewBox="0 0 10 10"
          refX="6"
          refY="5"
          markerWidth="5"
          markerHeight="5"
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#3b82f6" />
        </marker>
      </defs>
      <rect width="512" height="512" rx="112" fill="#0b1220" />
      <rect x="6" y="6" width="500" height="500" rx="106" fill="none" stroke="#1e293b" strokeWidth="2" />
      <g opacity="0.55">
        <line x1="150" y1="250" x2="150" y2="374" stroke="#155e75" strokeWidth="7" />
        <rect x="132" y="274" width="36" height="74" rx="7" fill="#164e63" />
        <line x1="228" y1="230" x2="228" y2="354" stroke="#155e75" strokeWidth="7" />
        <rect x="210" y="250" width="36" height="82" rx="7" fill="#155e75" />
        <line x1="306" y1="270" x2="306" y2="394" stroke="#155e75" strokeWidth="7" />
        <rect x="288" y="290" width="36" height="74" rx="7" fill="#164e63" />
      </g>
      <polyline
        points="120,370 214,296 282,330 396,192"
        fill="none"
        stroke="url(#logo-g)"
        strokeWidth="22"
        strokeLinecap="round"
        strokeLinejoin="round"
        markerEnd="url(#logo-arr)"
      />
    </svg>
  );
}

/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ["class"],
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ["-apple-system", "Segoe UI", "Roboto", "PingFang SC", "Microsoft YaHei", "sans-serif"],
      },
      // 驾驶舱现有字阶的语义入口：本轮只做等价值替换，后续再逐步合并层级。
      fontSize: {
        micro: "8px",
        caption: "9px",
        meta: "10px",
        body: "11px",
        "panel-title": "12px",
        subtitle: "13px",
        "metric-sm": "14px",
        metric: "16px",
        "metric-lg": "18px",
        "display-sm": "20px",
        display: "26px",
      },
      colors: {
        db: {
          canvas: "rgb(var(--db-canvas) / <alpha-value>)",
          panel: "rgb(var(--db-panel) / <alpha-value>)",
          header: "rgb(var(--db-header) / <alpha-value>)",
          ticker: "rgb(var(--db-ticker) / <alpha-value>)",
          chart: "rgb(var(--db-chart) / <alpha-value>)",
          elevated: "rgb(var(--db-elevated) / <alpha-value>)",
          subtle: "rgb(var(--db-subtle) / <alpha-value>)",
          border: "rgb(var(--db-border) / <alpha-value>)",
          strong: "rgb(var(--db-strong) / <alpha-value>)",
          primary: "rgb(var(--db-primary) / <alpha-value>)",
          secondary: "rgb(var(--db-secondary) / <alpha-value>)",
          tertiary: "rgb(var(--db-tertiary) / <alpha-value>)",
          muted: "rgb(var(--db-muted) / <alpha-value>)",
          faint: "rgb(var(--db-faint) / <alpha-value>)",
          overlay: "rgb(var(--db-overlay) / <alpha-value>)",
        },
        gold: {
          DEFAULT: "rgb(var(--gold) / <alpha-value>)",
          soft: "rgb(var(--gold-soft) / <alpha-value>)",
        },
        model: {
          closed: "rgb(var(--model-closed) / <alpha-value>)",
          open: "rgb(var(--model-open) / <alpha-value>)",
        },
        infra: {
          price: "rgb(var(--infra-price) / <alpha-value>)",
          cost: "rgb(var(--infra-cost) / <alpha-value>)",
          roi: "rgb(var(--infra-roi) / <alpha-value>)",
          capex: "rgb(var(--infra-capex) / <alpha-value>)",
          grid: "rgb(var(--infra-grid) / <alpha-value>)",
        },
        change: {
          up: "rgb(var(--change-up) / <alpha-value>)",
          down: "rgb(var(--change-down) / <alpha-value>)",
          flat: "rgb(var(--change-flat) / <alpha-value>)",
          "up-soft": "rgb(var(--change-up-soft) / <alpha-value>)",
          "down-soft": "rgb(var(--change-down-soft) / <alpha-value>)",
          "flat-soft": "rgb(var(--change-flat-soft) / <alpha-value>)",
          "up-bg": "rgb(var(--change-up-bg) / <alpha-value>)",
          "down-bg": "rgb(var(--change-down-bg) / <alpha-value>)",
          "flat-bg": "rgb(var(--change-flat-bg) / <alpha-value>)",
        },
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive) / <alpha-value>)",
          foreground: "hsl(var(--destructive-foreground) / <alpha-value>)",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        sidebar: {
          DEFAULT: "hsl(var(--sidebar-background))",
          foreground: "hsl(var(--sidebar-foreground))",
          primary: "hsl(var(--sidebar-primary))",
          "primary-foreground": "hsl(var(--sidebar-primary-foreground))",
          accent: "hsl(var(--sidebar-accent))",
          "accent-foreground": "hsl(var(--sidebar-accent-foreground))",
          border: "hsl(var(--sidebar-border))",
          ring: "hsl(var(--sidebar-ring))",
        },
      },
      borderRadius: {
        xl: "calc(var(--radius) + 4px)",
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
        xs: "calc(var(--radius) - 6px)",
      },
      boxShadow: {
        xs: "0 1px 2px 0 rgb(0 0 0 / 0.05)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        "caret-blink": {
          "0%,70%,100%": { opacity: "1" },
          "20%,50%": { opacity: "0" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "caret-blink": "caret-blink 1.25s ease-out infinite",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
}
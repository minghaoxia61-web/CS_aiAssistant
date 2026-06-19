/** @type {import('tailwindcss').Config} */

export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    container: {
      center: true,
    },
    extend: {
      colors: {
        // 背景层 — 使用 CSS 变量支持双主题
        ink: {
          950: "var(--bg-base)",
          900: "var(--bg-surface)",
          850: "var(--bg-elevated)",
          800: "var(--bg-hover)",
          750: "var(--bg-active)",
          700: "var(--bg-active)",
          600: "var(--text-faint)",
          500: "var(--text-muted)",
        },
        // 琥珀金主色
        amber: {
          DEFAULT: "var(--amber)",
          soft: "var(--amber-soft)",
          dim: "var(--amber-dim)",
          glow: "var(--amber-glow)",
        },
        // 鼠尾草绿辅色
        sage: {
          DEFAULT: "var(--sage)",
          dim: "var(--sage-dim)",
          glow: "var(--sage-glow)",
        },
        // 文本
        bone: {
          DEFAULT: "var(--text-primary)",
          dim: "var(--text-secondary)",
          muted: "var(--text-muted)",
          faint: "var(--text-faint)",
        },
        // 状态
        rust: "var(--rust)",
        moss: "var(--moss)",
      },
      fontFamily: {
        serif: ['"Instrument Serif"', 'Georgia', 'serif'],
        sans: ['"Geist"', '"Inter"', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', '"Fira Code"', 'monospace'],
      },
      boxShadow: {
        glow: '0 0 24px -4px rgba(184, 134, 11, 0.2)',
        'glow-sage': '0 0 24px -4px rgba(90, 138, 86, 0.18)',
        panel: '0 4px 24px -8px rgba(0, 0, 0, 0.08), 0 1px 4px -1px rgba(0, 0, 0, 0.05)',
      },
      backgroundImage: {
        'grid-faint':
          'linear-gradient(var(--grid-color) 1px, transparent 1px), linear-gradient(90deg, var(--grid-color) 1px, transparent 1px)',
        'radial-glow':
          'radial-gradient(ellipse at top, var(--glow-color), transparent 60%)',
      },
      animation: {
        'fade-in': 'fadeIn 0.4s ease-out',
        'slide-up': 'slideUp 0.4s ease-out',
        'pulse-soft': 'pulseSoft 2s ease-in-out infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        pulseSoft: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.5' },
        },
      },
    },
  },
  plugins: [],
};

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
        glow: '0 0 24px -4px rgba(196, 145, 10, 0.25)',
        'glow-sage': '0 0 24px -4px rgba(90, 138, 86, 0.2)',
        'glow-lg': '0 0 60px -15px rgba(196, 145, 10, 0.35)',
        panel: '0 4px 24px -8px rgba(0, 0, 0, 0.08), 0 1px 4px -1px rgba(0, 0, 0, 0.04)',
        'panel-lg': '0 8px 40px -12px rgba(0, 0, 0, 0.12), 0 2px 8px -2px rgba(0, 0, 0, 0.06)',
      },
      backgroundImage: {
        'grid-faint':
          'linear-gradient(var(--grid-color) 1px, transparent 1px), linear-gradient(90deg, var(--grid-color) 1px, transparent 1px)',
        'radial-glow':
          'radial-gradient(ellipse at top, var(--glow-color), transparent 60%)',
        'gradient-amber': 'linear-gradient(135deg, var(--amber), var(--amber-glow))',
        'gradient-amber-soft': 'linear-gradient(135deg, var(--amber-glow), var(--amber-soft))',
        'gradient-sidebar': 'var(--glass-sidebar-bg)',
      },
      animation: {
        'fade-in': 'fadeIn 0.4s ease-out',
        'slide-up': 'slideUp 0.4s ease-out',
        'pulse-soft': 'pulseSoft 2s ease-in-out infinite',
        'glow-pulse': 'glowPulse 3s ease-in-out infinite',
        'blob-float': 'blobFloat 20s ease-in-out infinite',
        'progress-shimmer': 'progressShimmer 3s ease infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(12px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        pulseSoft: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.5' },
        },
        glowPulse: {
          '0%, 100%': { boxShadow: 'var(--shadow-panel)' },
          '50%': { boxShadow: 'var(--shadow-panel), var(--shadow-glow-amber)' },
        },
        blobFloat: {
          '0%, 100%': { transform: 'translate(0, 0) scale(1)' },
          '33%': { transform: 'translate(20px, -15px) scale(1.03)' },
          '66%': { transform: 'translate(-15px, 10px) scale(0.97)' },
        },
        progressShimmer: {
          '0%': { backgroundPosition: '0% 50%' },
          '50%': { backgroundPosition: '100% 50%' },
          '100%': { backgroundPosition: '0% 50%' },
        },
      },
      borderRadius: {
        '2xl': '1.25rem',
        '3xl': '1.5rem',
      },
    },
  },
  plugins: [],
};

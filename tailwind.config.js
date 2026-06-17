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
        // 温暖深炭色背景
        ink: {
          950: "#0f0e0c",
          900: "#16140f",
          850: "#1a1816",
          800: "#211f1c",
          750: "#272420",
          700: "#2f2b27",
          600: "#3a352f",
          500: "#4a443c",
        },
        // 琥珀金主色
        amber: {
          DEFAULT: "#e8b974",
          soft: "#d4a574",
          dim: "#a8814f",
          glow: "#f5d49a",
        },
        // 鼠尾草绿辅色
        sage: {
          DEFAULT: "#8ba888",
          dim: "#6b8268",
          glow: "#a8c4a4",
        },
        // 文本
        bone: {
          DEFAULT: "#e8e4dc",
          dim: "#b8b2a6",
          muted: "#8a8580",
          faint: "#5c574f",
        },
        // 状态
        rust: "#c87555",
        moss: "#7a9a6b",
      },
      fontFamily: {
        serif: ['"Instrument Serif"', 'Georgia', 'serif'],
        sans: ['"Geist"', '"Inter"', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', '"Fira Code"', 'monospace'],
      },
      boxShadow: {
        glow: '0 0 24px -4px rgba(232, 185, 116, 0.25)',
        'glow-sage': '0 0 24px -4px rgba(139, 168, 136, 0.2)',
        panel: '0 8px 32px -8px rgba(0, 0, 0, 0.6), 0 2px 8px -2px rgba(0, 0, 0, 0.4)',
      },
      backgroundImage: {
        'grid-faint':
          'linear-gradient(rgba(232,185,116,0.025) 1px, transparent 1px), linear-gradient(90deg, rgba(232,185,116,0.025) 1px, transparent 1px)',
        'radial-glow':
          'radial-gradient(ellipse at top, rgba(232,185,116,0.08), transparent 60%)',
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

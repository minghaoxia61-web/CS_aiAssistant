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
        // 温暖浅色背景
        ink: {
          950: "#f5f4f0",
          900: "#ffffff",
          850: "#efede8",
          800: "#e6e3dc",
          750: "#dad6cc",
          700: "#ccc8bc",
          600: "#b5b0a2",
          500: "#9a948a",
        },
        // 琥珀金主色（浅色背景下加深以保证对比度）
        amber: {
          DEFAULT: "#b8860b",
          soft: "#c8964a",
          dim: "#8a6508",
          glow: "#d4a017",
        },
        // 鼠尾草绿辅色
        sage: {
          DEFAULT: "#5a8a56",
          dim: "#4a7a46",
          glow: "#6a9a66",
        },
        // 文本（深色）
        bone: {
          DEFAULT: "#2d2a24",
          dim: "#5c574f",
          muted: "#6b665e",
          faint: "#8a857c",
        },
        // 状态
        rust: "#b8553a",
        moss: "#5a8a56",
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
          'linear-gradient(rgba(184,134,11,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(184,134,11,0.03) 1px, transparent 1px)',
        'radial-glow':
          'radial-gradient(ellipse at top, rgba(184,134,11,0.06), transparent 60%)',
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

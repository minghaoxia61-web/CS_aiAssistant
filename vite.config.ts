import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tsconfigPaths from "vite-tsconfig-paths";

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  base: './',
  build: {
    sourcemap: 'hidden',
    outDir: 'dist',
  },
  define: {
    'import.meta.env.VITE_WEB_MODE': JSON.stringify(mode === 'web'),
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
  worker: {
    format: 'es',
    plugins: () => [react()],
  },
  plugins: [
    react({
      babel: {
        plugins: [
          'react-dev-locator',
        ],
      },
    }),
    tsconfigPaths()
  ],
}))

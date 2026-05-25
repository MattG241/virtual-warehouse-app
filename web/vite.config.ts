import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'
import { execSync } from 'node:child_process'

function gitSha() {
  try {
    return execSync('git rev-parse --short HEAD').toString().trim()
  } catch {
    return 'unknown'
  }
}

function buildDate() {
  return new Date().toISOString().slice(0, 19) + 'Z'
}

// Build outputs to web/dist. Express serves it in production.
// Dev: `npm run dev` (in /web) — Vite on :5173, proxies API/SSE to :3000.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
  // Compile-time constants — readable in code via import.meta.env.VITE_*
  // (Vite only exposes vars starting with VITE_).
  define: {
    __APP_BUILD_SHA__: JSON.stringify(gitSha()),
    __APP_BUILD_TIME__: JSON.stringify(buildDate()),
  },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3000',
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: true,
  },
})

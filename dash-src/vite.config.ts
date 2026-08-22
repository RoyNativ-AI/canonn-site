import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

// The build number shown in the console footer, so a browser tab can be
// checked against the latest deploy at a glance. CI's run number gives a
// clean monotonic v-number without exposing repo internals; local builds
// say dev.
const build = process.env.GITHUB_RUN_NUMBER ? `v${process.env.GITHUB_RUN_NUMBER}` : 'dev'

export default defineConfig({
  base: '/dashboard/',
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
  define: { __BUILD__: JSON.stringify(build) },
})

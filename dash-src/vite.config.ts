import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'
import { execSync } from 'node:child_process'

// The commit this bundle was built from, shown in the console footer so a
// browser tab can be checked against the repo at a glance. CI provides
// GITHUB_SHA; local builds read git; anything else is honest about it.
let commit = 'dev'
try { commit = execSync('git rev-parse --short HEAD').toString().trim() } catch { /* not a checkout */ }
if (process.env.GITHUB_SHA) commit = process.env.GITHUB_SHA.slice(0, 7)

export default defineConfig({
  base: '/dashboard/',
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
  define: { __COMMIT__: JSON.stringify(commit) },
})

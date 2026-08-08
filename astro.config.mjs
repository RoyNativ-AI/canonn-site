// @ts-check
import { defineConfig } from 'astro/config';

// Canonn marketing site — static output.
// Build emits to ./dist; a GitHub Actions workflow publishes dist/ (plus the
// prebuilt /dashboard app) to GitHub Pages. Custom domain: canonn.ai.
export default defineConfig({
  site: 'https://canonn.ai',
  outDir: './dist',
  build: {
    // keep pretty URLs: /benchmark/ -> benchmark/index.html
    format: 'directory',
    // inline nothing automatically; each page keeps its own <style>
    inlineStylesheets: 'never',
  },
  // We hand-author full HTML documents in .astro pages, so let Astro pass
  // through our markup without injecting its own scoped-style transforms.
  scopedStyleStrategy: 'where',
});

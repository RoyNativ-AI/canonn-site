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
    // Inline the small shared Header/Footer global stylesheet straight into
    // every page instead of emitting an external /_astro/*.css file. That
    // bundle held the canonical header geometry (brand mark, the CTA pill)
    // and the footer styling; served externally it was fragile — a stale
    // CDN/browser cache or a missing-file hiccup (see the earlier .nojekyll
    // fix) left pages loading the header WITHOUT it, so the wordmark/logo/CTA
    // rendered inconsistently between pages. Inlining removes that external
    // dependency so the header + footer look identical everywhere, always.
    inlineStylesheets: 'auto',
  },
  // We hand-author full HTML documents in .astro pages, so let Astro pass
  // through our markup without injecting its own scoped-style transforms.
  scopedStyleStrategy: 'where',
});

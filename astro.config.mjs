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
    // Inline ALL CSS straight into each page's HTML — never emit an external
    // /_astro/*.css file. The shared Header/Footer styles (brand mark, CTA
    // pill, footer) live in one place (src/styles/header.css + footer.css) so
    // there's a single source of truth, but served as an external bundle they
    // were fragile: a stale CDN/browser cache or a missing-file hiccup (see the
    // earlier .nojekyll fix) left pages loading their header WITHOUT it, so the
    // wordmark/logo/CTA rendered differently from page to page. Inlining
    // ('always', not 'auto' — the shared bundle is just over the auto-inline
    // size limit) removes that external dependency entirely: the header and
    // footer are self-contained on every page and render identically, always.
    inlineStylesheets: 'always',
  },
  // We hand-author full HTML documents in .astro pages, so let Astro pass
  // through our markup without injecting its own scoped-style transforms.
  scopedStyleStrategy: 'where',
});

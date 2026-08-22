/// <reference path="../.astro/types.d.ts" />

interface ImportMetaEnv {
  /** Umami tracker script, e.g. https://analytics.canonn.ai/script.js. Unset = analytics off. */
  readonly PUBLIC_UMAMI_SCRIPT_URL?: string
  /** Umami website id for canonn.ai. */
  readonly PUBLIC_UMAMI_WEBSITE_ID?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

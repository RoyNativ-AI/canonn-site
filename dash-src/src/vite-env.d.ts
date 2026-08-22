/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_CLERK_PUBLISHABLE_KEY: string
  readonly VITE_API_URL?: string
  readonly VITE_GOOGLE_CLIENT_ID?: string
  readonly VITE_GOOGLE_API_KEY?: string
  /** Umami tracker script URL. Unset = analytics off. */
  readonly VITE_UMAMI_SCRIPT_URL?: string
  /** Umami website id for canonn.ai. */
  readonly VITE_UMAMI_WEBSITE_ID?: string
}

declare const __BUILD__: string

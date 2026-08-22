/**
 * Product analytics for the console, on self-hosted Umami.
 *
 * One thin seam: `track()` for funnel events and `identify()` to tie the
 * anonymous visitor to the Clerk user. Everything is a no-op when the env
 * vars are unset, so dev builds never phone home and call sites never guard.
 *
 * Event names are the funnel, in order. Keep them stable: dashboards,
 * retention queries and the investor deck all key on these strings.
 */

export type FunnelEvent =
  | 'signup_completed'
  | 'playground_message'
  | 'api_key_created'
  | 'assistant_created'
  | 'card_saved'
  | 'credit_added'

type EventData = Record<string, string | number | boolean>

interface Umami {
  track(name: string, data?: EventData): void
  identify(id: string, data?: EventData): void
}

declare global {
  interface Window { umami?: Umami }
}

const SCRIPT_URL = import.meta.env.VITE_UMAMI_SCRIPT_URL
const WEBSITE_ID = import.meta.env.VITE_UMAMI_WEBSITE_ID
export const ANALYTICS_ENABLED = Boolean(SCRIPT_URL && WEBSITE_ID)

/** Name of the first-touch attribution cookie written by the marketing site. */
const ATTR_COOKIE = 'cn_attr'

export interface Attribution {
  utm_source?: string
  utm_medium?: string
  utm_campaign?: string
  utm_content?: string
  utm_term?: string
  ref?: string
  referrer?: string
  landing?: string
  ts?: number
}

/** Where this browser first landed on canonn.ai, if the site recorded it. */
export function readAttribution(): Attribution | null {
  const raw = document.cookie.split('; ').find((c) => c.startsWith(ATTR_COOKIE + '='))
  if (!raw) return null
  try {
    const parsed: unknown = JSON.parse(decodeURIComponent(raw.slice(ATTR_COOKIE.length + 1)))
    return parsed && typeof parsed === 'object' ? (parsed as Attribution) : null
  } catch {
    return null
  }
}

let loading: Promise<void> | null = null

/** Inject the tracker once. Page views (including #screen changes) are automatic. */
export function loadAnalytics(): Promise<void> {
  if (!ANALYTICS_ENABLED) return Promise.resolve()
  if (loading) return loading
  loading = new Promise<void>((resolve) => {
    const s = document.createElement('script')
    s.defer = true
    s.src = SCRIPT_URL!
    s.dataset.websiteId = WEBSITE_ID!
    // The console lives under /dashboard/ on the same site; tag its views
    // so the site and the console are one funnel in Umami, not two.
    s.dataset.tag = 'dashboard'
    s.onload = () => resolve()
    s.onerror = () => resolve() // an ad blocker is not an error for the user
    document.head.appendChild(s)
  })
  return loading
}

export function track(name: FunnelEvent, data?: EventData): void {
  if (!ANALYTICS_ENABLED) return
  void loadAnalytics().then(() => window.umami?.track(name, data))
}

/** Bind this browser's sessions to the Clerk user so funnels span site -> console -> API. */
export function identify(userId: string, data?: EventData): void {
  if (!ANALYTICS_ENABLED) return
  void loadAnalytics().then(() => window.umami?.identify(userId, data))
}

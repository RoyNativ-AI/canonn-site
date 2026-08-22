import { useEffect } from 'react'
import { useSession, useUser } from '@clerk/clerk-react'
import { identify, readAttribution, track, type Attribution } from '@/lib/analytics'
import { postAttribution } from '@/lib/api'

/**
 * Runs once per signed-in session. Three jobs:
 *  1. identify() the Umami visitor as the Clerk user.
 *  2. On a brand-new account, fire `signup_completed` exactly once.
 *  3. Copy the site's first-touch attribution cookie onto the Clerk user
 *     (unsafeMetadata.attribution), so the source a developer came from is
 *     stored with the account forever, long after the cookie is gone.
 *  4. Report the account to the edge (POST /v1/me/attribution) once per
 *     browser session, which is where it gets joined to API usage.
 *
 * Renders nothing. Mount it inside <SignedIn>.
 */
export function Identify() {
  const { user, isLoaded } = useUser()
  const { session } = useSession()

  useEffect(() => {
    if (!isLoaded || !user) return
    const attribution = readAttribution()
    const stored = user.unsafeMetadata?.attribution as Attribution | undefined
    const source = stored ?? attribution ?? undefined

    identify(user.id, {
      created: user.createdAt ? Math.floor(user.createdAt.getTime() / 1000) : 0,
      ...(source?.utm_source ? { utm_source: source.utm_source } : {}),
      ...(source?.referrer ? { referrer: source.referrer } : {}),
    })

    // "New" means the account is minutes old and this browser has not yet
    // reported it; the localStorage flag survives the StrictMode double-run
    // and a refresh, so a signup is never counted twice.
    const flag = `cn_signup_${user.id}`
    const ageMs = user.createdAt ? Date.now() - user.createdAt.getTime() : Infinity
    let seen = true
    try { seen = localStorage.getItem(flag) === '1' } catch { /* storage blocked */ }
    if (!seen && ageMs < 10 * 60 * 1000) {
      track('signup_completed', {
        ...(source?.utm_source ? { utm_source: source.utm_source } : {}),
        ...(source?.referrer ? { referrer: source.referrer } : {}),
        ...(source?.landing ? { landing: source.landing } : {}),
      })
      try { localStorage.setItem(flag, '1') } catch { /* storage blocked */ }
    }

    if (!stored && attribution) {
      user.update({ unsafeMetadata: { ...user.unsafeMetadata, attribution } })
        .catch(() => { /* attribution is best-effort; never block the console */ })
    }

    // The edge keeps its own account row; one call per browser session is
    // enough because the worker only ever writes the source once.
    const reported = `cn_edge_${user.id}`
    let done = false
    try { done = sessionStorage.getItem(reported) === '1' } catch { /* storage blocked */ }
    if (!done && session) {
      session.getToken()
        .then((t) => (t ? postAttribution(t, source ?? null) : null))
        .then(() => { try { sessionStorage.setItem(reported, '1') } catch { /* storage blocked */ } })
        .catch(() => { /* the edge may predate this route; retry next session */ })
    }
  }, [isLoaded, user, session])

  return null
}

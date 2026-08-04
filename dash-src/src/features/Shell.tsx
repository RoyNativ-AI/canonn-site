import { useCallback, useEffect, useState } from 'react'
import { useClerk, useSession, useUser } from '@clerk/clerk-react'
import { fetchMe, type Me } from '@/lib/api'
import { Activity } from '@/features/Activity'
import { Logs } from '@/features/Logs'
import { Keys } from '@/features/Keys'
import { Billing } from '@/features/Billing'
import { cn } from '@/lib/utils'

const SCREENS = [
  { id: 'activity', label: 'Activity' },
  { id: 'logs', label: 'Logs' },
  { id: 'keys', label: 'API keys' },
  { id: 'billing', label: 'Billing' },
] as const

type ScreenId = (typeof SCREENS)[number]['id']

export function Shell() {
  const { user } = useUser()
  const { session } = useSession()
  const { signOut, openUserProfile } = useClerk()
  const [screen, setScreen] = useState<ScreenId>('activity')
  const [days, setDays] = useState(30)
  const [keyFilter, setKeyFilter] = useState('')
  const [me, setMe] = useState<Me | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)

  const refresh = useCallback(async () => {
    if (!session) return
    const token = await session.getToken()
    if (!token) return
    try {
      setMe(await fetchMe(token, days, keyFilter))
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load your usage.')
    }
  }, [session, days, keyFilter])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const email = user?.primaryEmailAddress?.emailAddress ?? ''

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-[1500px] items-center gap-6 px-6 md:px-10">
          <a href="/" className="flex shrink-0 items-center gap-2.5 font-display text-[17px] font-semibold">
            <img src="/assets/canon-logo.png" alt="" className="size-7 rounded-lg" />
            Canonn
          </a>

          <nav className="-mb-px flex min-w-0 flex-1 gap-1 overflow-x-auto">
            {SCREENS.map(({ id, label }) => (
              <button
                key={id}
                onClick={() => setScreen(id)}
                className={cn(
                  'relative shrink-0 px-3 py-4 text-sm font-medium transition-colors',
                  screen === id ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {label}
                {screen === id && <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-[#c96442]" />}
              </button>
            ))}
          </nav>

          <div className="relative flex shrink-0 items-center gap-3">
            <a
              href="#"
              onClick={(e) => { e.preventDefault(); alert('Coming to the App Store soon') }}
              className="hidden text-muted-foreground transition-colors hover:text-foreground sm:block"
              aria-label="Download on the App Store"
            >
              <svg viewBox="0 0 24 24" fill="currentColor" width="15" height="15"><path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.53 4.08zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/></svg>
            </a>
            <a
              href="#"
              onClick={(e) => { e.preventDefault(); alert('Coming to Google Play soon') }}
              className="hidden text-muted-foreground transition-colors hover:text-foreground sm:block"
              aria-label="Get it on Google Play"
            >
              <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><path d="M3.6 1.8c-.4.2-.6.6-.6 1.1v18.2c0 .5.2.9.6 1.1l.1.1 10.2-10.2v-.2L3.7 1.7l-.1.1zm14 8.3-2.6 2.1v.2l2.6 2.6 3-1.7c.9-.5.9-1.3 0-1.8l-3-1.4zM4.8 22.6l11-6.3-2.3-2.3-8.7 8.6zm0-21.2 8.7 8.6 2.3-2.3-11-6.3z"/></svg>
            </a>

            <button
              onClick={() => setMenuOpen((v) => !v)}
              className="flex size-8 items-center justify-center rounded-full bg-[#c96442] text-[13px] font-semibold text-white transition-transform hover:scale-105"
              aria-label="Account menu"
            >
              {(email[0] ?? '?').toUpperCase()}
            </button>
            {menuOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                <div className="absolute top-11 right-0 z-20 w-60 overflow-hidden rounded-xl border border-border bg-card shadow-lg">
                  <div className="truncate border-b border-border px-4 py-3 text-sm text-muted-foreground">{email}</div>
                  <button
                    onClick={() => { setMenuOpen(false); openUserProfile() }}
                    className="w-full px-4 py-2.5 text-left text-sm transition-colors hover:bg-secondary"
                  >
                    Account settings
                  </button>
                  <button
                    onClick={() => signOut()}
                    className="w-full px-4 py-2.5 text-left text-sm text-destructive transition-colors hover:bg-secondary"
                  >
                    Sign out
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1500px] px-6 py-9 md:px-10">
        {error && (
          <div className="mb-6 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 font-mono text-xs text-destructive">
            {error}
          </div>
        )}
        {screen === 'activity' && (
          <Activity me={me} days={days} setDays={setDays} keyFilter={keyFilter} setKeyFilter={setKeyFilter} />
        )}
        {screen === 'logs' && <Logs me={me} />}
        {screen === 'keys' && <Keys me={me} onChanged={refresh} />}
        {screen === 'billing' && <Billing me={me} />}
      </main>
    </div>
  )
}

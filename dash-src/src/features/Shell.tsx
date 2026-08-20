import { useCallback, useEffect, useRef, useState } from 'react'
import { useClerk, useSession, useUser } from '@clerk/clerk-react'
import { fetchMe, type Me } from '@/lib/api'
import { Activity } from '@/features/Activity'
import { Logs } from '@/features/Logs'
import { Keys } from '@/features/Keys'
import { Billing } from '@/features/Billing'
import { Playground } from '@/features/Playground'
import { Moon, Sun } from 'lucide-react'
import { applyTheme, readTheme, type Theme } from '@/lib/theme'
import { cn } from '@/lib/utils'

const SCREENS = [
  { id: 'playground', label: 'Playground' },
  { id: 'activity', label: 'Usage' },
  { id: 'logs', label: 'Logs' },
  { id: 'keys', label: 'API keys' },
  { id: 'billing', label: 'Billing' },
] as const

type ScreenId = (typeof SCREENS)[number]['id']

export function Shell() {
  const { user } = useUser()
  const { session } = useSession()
  const { signOut, openUserProfile } = useClerk()
  // The current screen lives in the URL hash so a refresh (or a shared link)
  // lands where the user actually was, not on the default tab.
  const [screen, setScreen] = useState<ScreenId>(() => {
    const h = window.location.hash.slice(1)
    return SCREENS.some((s) => s.id === h) ? (h as ScreenId) : 'activity'
  })
  useEffect(() => {
    window.history.replaceState(null, '', `#${screen}`)
  }, [screen])
  // In-page links (#keys from an empty state) and the back button both
  // navigate; the tab bar is not the only door.
  useEffect(() => {
    const onHash = () => {
      const h = window.location.hash.slice(1)
      if (SCREENS.some((s) => s.id === h)) setScreen(h as ScreenId)
    }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])
  const [days, setDays] = useState(30)
  const [keyFilter, setKeyFilter] = useState('')
  const [me, setMe] = useState<Me | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [range, setRange] = useState<{ from: string; to: string }>({ from: '', to: '' })
  const [theme, setTheme] = useState<Theme>(readTheme)

  useEffect(() => {
    applyTheme(theme)
  }, [theme])

  const refresh = useCallback(async () => {
    if (!session) return
    const token = await session.getToken()
    if (!token) return
    try {
      const next = await fetchMe(token, days, keyFilter, range.from, range.to)
      // Live without jank: background polls only touch state when the data
      // actually moved, so nothing re-renders or flickers on a quiet tick.
      const digest = JSON.stringify(next)
      if (digest !== lastDigest.current) {
        lastDigest.current = digest
        setMe(next)
      }
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load your usage.')
    }
  }, [session, days, keyFilter, range])
  const lastDigest = useRef('')

  useEffect(() => {
    void refresh()
  }, [refresh])

  // Poll while the tab is visible, refresh instantly on return, sleep when
  // hidden - the standard live-dashboard cadence without websockets.
  useEffect(() => {
    const tick = () => { if (document.visibilityState === 'visible') void refresh() }
    const interval = setInterval(tick, 12000)
    window.addEventListener('focus', tick)
    document.addEventListener('visibilitychange', tick)
    return () => {
      clearInterval(interval)
      window.removeEventListener('focus', tick)
      document.removeEventListener('visibilitychange', tick)
    }
  }, [refresh])

  const email = user?.primaryEmailAddress?.emailAddress ?? ''

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-[1500px] items-center gap-4 px-4 sm:gap-6 sm:px-6 md:px-10">
          <a href="/" className="flex shrink-0 items-center gap-2.5 font-display text-[17px] font-semibold">
            <img src="/assets/canon-logo.png" alt="" className="size-6.5 rounded-[5px] object-cover" />
            Canonn
          </a>

          <nav className="-mb-px hidden min-w-0 flex-1 gap-1 overflow-x-auto sm:flex">
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

          <div className="flex-1 sm:hidden" />

          <div className="relative flex shrink-0 items-center gap-3">
            <a
              href="https://canonn.ai/docs/"
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="13" height="13"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
              API docs
            </a>
            <button
              onClick={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
              className="flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              aria-label="Toggle theme"
            >
              {theme === 'dark' ? <Sun className="size-4" /> : <Moon className="size-4" />}
            </button>

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
                    onClick={() => signOut({ redirectUrl: 'https://canonn.ai' })}
                    className="w-full px-4 py-2.5 text-left text-sm text-destructive transition-colors hover:bg-secondary"
                  >
                    Sign out
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
        <nav className="flex gap-1 overflow-x-auto border-t border-border px-2 sm:hidden">
          {SCREENS.map(({ id, label }) => (
            <button
              key={id}
              onClick={() => setScreen(id)}
              className={cn(
                'relative shrink-0 px-3 py-2.5 text-sm font-medium transition-colors',
                screen === id ? 'text-foreground' : 'text-muted-foreground',
              )}
            >
              {label}
              {screen === id && <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-[#c96442]" />}
            </button>
          ))}
        </nav>
      </header>

      <main className="mx-auto w-full max-w-[1500px] px-6 py-9 md:px-10">
        {error && (
          <div className="mb-6 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 font-mono text-xs text-destructive">
            {error}
          </div>
        )}
        {/* Keyed on the screen so switching tabs settles in with a short
            fade instead of snapping. */}
        <div key={screen} className="screen-enter">
          {screen === 'playground' && (
            <Playground getToken={() => (session ? session.getToken() : Promise.resolve(null))} />
          )}
          {screen === 'activity' && (
            <Activity me={me} days={days} setDays={setDays} keyFilter={keyFilter} setKeyFilter={setKeyFilter} range={range} setRange={setRange} />
          )}
          {screen === 'logs' && (
            <Logs
              me={me} days={days} setDays={setDays} keyFilter={keyFilter} setKeyFilter={setKeyFilter}
              getToken={() => (session ? session.getToken() : Promise.resolve(null))}
              onIoChanged={refresh}
            />
          )}
          {screen === 'keys' && <Keys me={me} onChanged={refresh} />}
          {screen === 'billing' && <Billing me={me} />}
        </div>
      </main>

      <footer className="mx-auto flex w-full max-w-[1500px] flex-wrap items-center gap-x-5 gap-y-1.5 px-6 pt-2 pb-8 font-mono text-[10.5px] text-muted-foreground md:px-10">
        <span>© 2026 Canonn</span>
        <a href="https://canonn.ai/docs/" target="_blank" rel="noreferrer" className="transition-colors hover:text-foreground">Docs</a>
        <a href="https://canonn.ai/legal/" target="_blank" rel="noreferrer" className="transition-colors hover:text-foreground">Privacy &amp; terms</a>
        <span className="ml-auto">api.canonn.ai · canonn-r1</span>
      </footer>
    </div>
  )
}

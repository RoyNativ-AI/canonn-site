import { useCallback, useEffect, useRef, useState } from 'react'
import { useClerk, useSession, useUser } from '@clerk/clerk-react'
import { fetchMe, type Me } from '@/lib/api'
import { Activity } from '@/features/Activity'
import { Logs } from '@/features/Logs'
import { Keys } from '@/features/Keys'
import { Billing } from '@/features/Billing'
import { Playground } from '@/features/Playground'
import {
  BookOpen, ChartNoAxesColumn, CreditCard, KeyRound, MessagesSquare,
  Moon, ScrollText, Sun,
} from 'lucide-react'
import { applyTheme, readTheme, type Theme } from '@/lib/theme'
import { cn } from '@/lib/utils'

type ScreenId = 'playground' | 'activity' | 'logs' | 'keys' | 'billing'

// Navigation follows what the user is doing, in order: work in the
// product, watch it run, configure it. Group names stay boring on purpose.
const NAV: { group: string | null; items: { id: ScreenId; label: string; icon: typeof Moon }[] }[] = [
  { group: null, items: [{ id: 'playground', label: 'Playground', icon: MessagesSquare }] },
  { group: 'Monitoring', items: [
    { id: 'activity', label: 'Usage', icon: ChartNoAxesColumn },
    { id: 'logs', label: 'Logs', icon: ScrollText },
  ] },
  { group: 'Settings', items: [
    { id: 'keys', label: 'API keys', icon: KeyRound },
    { id: 'billing', label: 'Billing', icon: CreditCard },
  ] },
]

const SCREENS = NAV.flatMap((g) => g.items)

export function Shell() {
  const { user } = useUser()
  const { session } = useSession()
  const { signOut, openUserProfile } = useClerk()
  // The current screen lives in the URL hash so a refresh (or a shared link)
  // lands where the user actually was, not on the default tab.
  const [screen, setScreen] = useState<ScreenId>(() => {
    const h = window.location.hash.slice(1)
    return SCREENS.some((s) => s.id === h) ? (h as ScreenId) : 'playground'
  })
  useEffect(() => {
    window.history.replaceState(null, '', `#${screen}`)
  }, [screen])
  // In-page links (#keys from an empty state) and the back button both
  // navigate; the nav is not the only door.
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

  const accountMenu = menuOpen && (
    <>
      <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
      <div className="absolute bottom-full left-0 z-50 mb-2 w-56 overflow-hidden rounded-xl border border-border bg-popover shadow-lg max-lg:top-11 max-lg:right-0 max-lg:bottom-auto max-lg:left-auto">
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
  )

  return (
    <div className="min-h-screen">
      {/* ---- Sidebar (desktop) ---- */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[224px] flex-col border-r border-border lg:flex">
        <a href="/" className="flex items-center gap-2.5 px-5 pt-5 font-display text-[16px] font-semibold">
          <img src="/assets/canon-logo.png" alt="" className="size-6 rounded-[5px] object-cover" />
          Canonn
        </a>

        <nav className="mt-7 flex-1 overflow-y-auto px-3">
          {NAV.map(({ group, items }) => (
            <div key={group ?? 'root'}>
              {group && (
                <div className="px-2.5 pt-6 pb-1.5 text-[11px] font-medium text-muted-foreground/70">{group}</div>
              )}
              {items.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  onClick={() => setScreen(id)}
                  className={cn(
                    'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-[7px] text-left text-[13.5px] transition-colors',
                    screen === id
                      ? 'bg-secondary font-medium text-foreground'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  <Icon className="size-4" strokeWidth={1.75} />
                  {label}
                </button>
              ))}
            </div>
          ))}
          <a
            href="https://canonn.ai/docs/"
            target="_blank"
            rel="noreferrer"
            className="mt-6 flex w-full items-center gap-2.5 rounded-lg px-2.5 py-[7px] text-[13.5px] text-muted-foreground transition-colors hover:text-foreground"
          >
            <BookOpen className="size-4" strokeWidth={1.75} />
            Docs
          </a>
        </nav>

        <div className="px-3 pb-4">
          <button
            onClick={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
            className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-[7px] text-[13.5px] text-muted-foreground transition-colors hover:text-foreground"
          >
            {theme === 'dark' ? <Sun className="size-4" strokeWidth={1.75} /> : <Moon className="size-4" strokeWidth={1.75} />}
            {theme === 'dark' ? 'Light mode' : 'Dark mode'}
          </button>
          <div className="relative mt-2 border-t border-border pt-3">
            <button
              onClick={() => setMenuOpen((v) => !v)}
              className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-secondary"
              aria-label="Account menu"
            >
              <span className="flex size-6.5 shrink-0 items-center justify-center rounded-full bg-[#c96442] text-[12px] font-semibold text-white">
                {(email[0] ?? '?').toUpperCase()}
              </span>
              <span className="truncate text-[12.5px] text-muted-foreground">{email}</span>
            </button>
            {accountMenu}
          </div>
        </div>
      </aside>

      {/* ---- Header (mobile) ---- */}
      <header className="sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur-md lg:hidden">
        <div className="flex h-14 items-center gap-4 px-4 sm:px-6">
          <a href="/" className="flex shrink-0 items-center gap-2.5 font-display text-[17px] font-semibold">
            <img src="/assets/canon-logo.png" alt="" className="size-6.5 rounded-[5px] object-cover" />
            Canonn
          </a>
          <div className="flex-1" />
          <button
            onClick={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
            className="flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            aria-label="Toggle theme"
          >
            {theme === 'dark' ? <Sun className="size-4" /> : <Moon className="size-4" />}
          </button>
          <div className="relative">
            <button
              onClick={() => setMenuOpen((v) => !v)}
              className="flex size-8 items-center justify-center rounded-full bg-[#c96442] text-[13px] font-semibold text-white"
              aria-label="Account menu"
            >
              {(email[0] ?? '?').toUpperCase()}
            </button>
            {accountMenu}
          </div>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-2">
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

      <div className="lg:pl-[224px]">
        <main className="mx-auto w-full max-w-[1100px] px-5 py-8 sm:px-8 lg:py-10">
          {error && (
            <div className="mb-6 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 font-mono text-xs text-destructive">
              {error}
            </div>
          )}
          {/* Keyed on the screen so switching settles in with a short fade
              instead of snapping. */}
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

        {screen !== 'playground' && <footer className="mx-auto flex w-full max-w-[1100px] flex-wrap items-center gap-x-5 gap-y-1.5 px-5 pt-2 pb-8 font-mono text-[10.5px] text-muted-foreground sm:px-8">
          <span>© 2026 Canonn</span>
          <a href="https://canonn.ai/docs/" target="_blank" rel="noreferrer" className="transition-colors hover:text-foreground">Docs</a>
          <a href="https://canonn.ai/legal/" target="_blank" rel="noreferrer" className="transition-colors hover:text-foreground">Privacy &amp; terms</a>
          <span className="ml-auto">api.canonn.ai · canonn-r1</span>
        </footer>}
      </div>
    </div>
  )
}

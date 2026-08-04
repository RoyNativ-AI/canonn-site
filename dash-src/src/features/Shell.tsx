import { useCallback, useEffect, useState } from 'react'
import { useClerk, useSession, useUser } from '@clerk/clerk-react'
import { BarChart3, CreditCard, KeyRound, ScrollText } from 'lucide-react'
import { fetchMe, type Me } from '@/lib/api'
import { Activity } from '@/features/Activity'
import { Logs } from '@/features/Logs'
import { Keys } from '@/features/Keys'
import { Billing } from '@/features/Billing'
import { cn } from '@/lib/utils'

const SCREENS = [
  { id: 'activity', label: 'Activity', icon: BarChart3 },
  { id: 'logs', label: 'Logs', icon: ScrollText },
  { id: 'keys', label: 'API keys', icon: KeyRound },
  { id: 'billing', label: 'Billing', icon: CreditCard },
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
    <div className="grid min-h-screen md:grid-cols-[250px_1fr]">
      <aside className="flex flex-col border-b border-border bg-card px-4 py-6 md:sticky md:top-0 md:h-screen md:border-r md:border-b-0">
        <a href="/" className="mb-8 flex items-center gap-2.5 px-3 font-display text-lg font-semibold">
          <img src="/assets/canon-logo.png" alt="" className="size-8 rounded-lg" />
          Canonn
        </a>
        <nav className="flex gap-1 md:flex-col">
          {SCREENS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setScreen(id)}
              className={cn(
                'flex w-full items-center gap-3 rounded-xl px-3.5 py-3 text-left text-sm font-medium transition-colors',
                screen === id
                  ? 'bg-accent text-accent-foreground'
                  : 'text-muted-foreground hover:bg-secondary hover:text-foreground',
              )}
            >
              <Icon className="size-[17px]" />
              {label}
            </button>
          ))}
        </nav>
        <div className="mt-auto hidden border-t border-border pt-4 md:block">
          <div className="mb-3 space-y-1.5 px-1">
            <a href="#" onClick={(e) => { e.preventDefault(); alert('Coming to the App Store soon') }}
               className="flex items-center gap-2.5 rounded-lg bg-[#171412] px-3 py-2 text-[#f3efe8] transition-transform hover:-translate-y-px">
              <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.53 4.08zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/></svg>
              <span className="flex flex-col leading-tight"><span className="text-[8.5px] opacity-70">Download on the</span><span className="text-xs font-semibold">App Store</span></span>
            </a>
            <a href="#" onClick={(e) => { e.preventDefault(); alert('Coming to Google Play soon') }}
               className="flex items-center gap-2.5 rounded-lg bg-[#171412] px-3 py-2 text-[#f3efe8] transition-transform hover:-translate-y-px">
              <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><path d="M3.6 1.8c-.4.2-.6.6-.6 1.1v18.2c0 .5.2.9.6 1.1l.1.1 10.2-10.2v-.2L3.7 1.7l-.1.1zm14 8.3-2.6 2.1v.2l2.6 2.6 3-1.7c.9-.5.9-1.3 0-1.8l-3-1.4zM4.8 22.6l11-6.3-2.3-2.3-8.7 8.6zm0-21.2 8.7 8.6 2.3-2.3-11-6.3z"/></svg>
              <span className="flex flex-col leading-tight"><span className="text-[8.5px] opacity-70">Get it on</span><span className="text-xs font-semibold">Google Play</span></span>
            </a>
          </div>
          <button
            onClick={() => openUserProfile()}
            className="flex w-full items-center gap-2.5 rounded-xl bg-background px-3 py-2.5 text-left text-sm transition-colors hover:bg-secondary"
            title="Account settings"
          >
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[#c96442] text-[13px] font-semibold text-white">
              {(email[0] ?? '?').toUpperCase()}
            </span>
            <span className="truncate text-foreground">{email}</span>
          </button>
          <button onClick={() => signOut()} className="mt-2 px-3 font-mono text-[11px] text-muted-foreground hover:text-destructive">
            sign out
          </button>
        </div>
      </aside>

      <main className="w-full max-w-[1500px] min-w-0 px-6 py-9 md:px-11">
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

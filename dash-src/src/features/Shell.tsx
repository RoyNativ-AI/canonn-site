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

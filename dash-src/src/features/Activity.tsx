import { useState } from 'react'
import { Play } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { fmt, runDemo, type Me } from '@/lib/api'
import { cn } from '@/lib/utils'

const RANGES = [
  { days: 1, label: '24h' },
  { days: 7, label: '7d' },
  { days: 30, label: '30d' },
]

const DEMO_DATA =
  'Single sign-on (SSO) is included in the Business plan and above.\nPriority support: Pro (24h email), Business (4h chat + email), Enterprise (1h SLA).'
const DEMO_Q = 'Which plans include priority support?'

function Stat({ label, value, money }: { label: string; value: string; money?: boolean }) {
  return (
    <Card className="gap-2 py-5">
      <CardHeader className="px-5">
        <CardTitle className="font-mono text-[10px] font-normal tracking-[0.1em] text-muted-foreground uppercase">
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent className="px-5">
        <div className={cn('font-display text-[32px] leading-none font-semibold tracking-tight tabular-nums', money && 'text-[#3f7d54]')}>
          {value}
        </div>
      </CardContent>
    </Card>
  )
}

export function Activity({
  me, days, setDays, keyFilter, setKeyFilter,
}: {
  me: Me | null
  days: number
  setDays: (d: number) => void
  keyFilter: string
  setKeyFilter: (k: string) => void
}) {
  const buckets = me ? Object.keys(me.by_day).sort().slice(-24) : []
  const max = Math.max(1, ...buckets.map((d) => me!.by_day[d].requests))
  const [running, setRunning] = useState(false)
  const [demoOut, setDemoOut] = useState<string | null>(null)

  async function handleRun() {
    setRunning(true)
    setDemoOut(null)
    try {
      const res = await runDemo(DEMO_DATA, DEMO_Q)
      setDemoOut(`→ "${res.answer}"  (${res.seconds}s)`)
    } catch (e) {
      setDemoOut(`✗ ${e instanceof Error ? e.message : 'failed'}`)
    } finally {
      setRunning(false)
    }
  }

  return (
    <div>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-[32px] font-semibold tracking-tight">Activity</h1>
          <p className="text-sm text-muted-foreground">Your usage · api.canonn.ai</p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={keyFilter}
            onChange={(e) => setKeyFilter(e.target.value)}
            className="h-9 rounded-lg border border-input bg-card px-3 font-mono text-xs text-foreground outline-none focus:border-[#c96442]"
          >
            <option value="">All keys</option>
            {(me?.keys ?? []).map((k) => (
              <option key={k.name} value={k.name}>{k.name}</option>
            ))}
          </select>
          <div className="flex rounded-lg border border-input bg-card p-0.5">
            {RANGES.map((r) => (
              <button
                key={r.days}
                onClick={() => setDays(r.days)}
                className={cn(
                  'rounded-md px-3 py-1.5 font-mono text-xs transition-colors',
                  days === r.days ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <Stat label="Spend (est.)" value={`$${(me?.spend_usd ?? 0).toFixed(2)}`} money />
        <Stat label="Requests" value={fmt(me?.requests ?? 0)} />
        <Stat label="Input tokens" value={fmt(me?.input_tokens ?? 0)} />
        <Stat label="Output tokens" value={fmt(me?.output_tokens ?? 0)} />
      </div>

      <div className="mt-7 grid gap-5 xl:grid-cols-[1.55fr_1fr]">
        <Card className="py-5">
          <CardHeader className="px-5">
            <CardTitle className="font-display text-lg">
              Requests {days === 1 ? 'by hour' : 'by day'}
            </CardTitle>
          </CardHeader>
          <CardContent className="px-5">
            <div className="flex h-[190px] items-end gap-1.5 border-b border-border pb-0.5">
              {buckets.length > 0
                ? buckets.map((d) => {
                    const b = me!.by_day[d]
                    return (
                      <div
                        key={d}
                        className="group relative min-h-0.5 flex-1 rounded-t bg-[#c96442]/60 hover:bg-[#c96442]"
                        style={{ height: `${(b.requests / max) * 100}%` }}
                      >
                        <span className="absolute bottom-full left-1/2 z-10 mb-1.5 hidden -translate-x-1/2 rounded-lg border border-border bg-popover px-2.5 py-1 font-mono text-[11px] whitespace-nowrap group-hover:block">
                          {d} · {b.requests} req · {fmt(b.pt + b.ct)} tok
                        </span>
                      </div>
                    )
                  })
                : Array.from({ length: 14 }, (_, i) => (
                    <div key={i} className="flex-1 rounded-t bg-foreground/[0.06]" style={{ height: `${8 + ((i * 37) % 23)}%` }} />
                  ))}
            </div>
            <div className="mt-2 flex gap-1.5 overflow-hidden">
              {buckets.map((d) => (
                <span key={d} className="flex-1 truncate text-center font-mono text-[9px] text-muted-foreground">
                  {days === 1 ? d : d.slice(3)}
                </span>
              ))}
            </div>
            {buckets.length === 0 && (
              <p className="mt-3 font-mono text-xs text-muted-foreground">No traffic in this window.</p>
            )}
          </CardContent>
        </Card>

        <Card className="overflow-hidden border-[#3a342e] bg-[#211d1a] py-0 text-[#d8d2c8]">
          <div className="flex items-center gap-1.5 border-b border-white/10 bg-[#26221e] px-4 py-2.5">
            <span className="size-2.5 rounded-full bg-[#ff5f57]" />
            <span className="size-2.5 rounded-full bg-[#febc2e]" />
            <span className="size-2.5 rounded-full bg-[#28c840]" />
            <span className="ml-2 font-mono text-[11px] text-white/40">quick start</span>
            <Button
              size="sm"
              onClick={handleRun}
              disabled={running}
              className="ml-auto h-7 gap-1.5 bg-[#c96442] px-3 font-mono text-[11px] text-white hover:bg-[#b4533a]"
            >
              <Play className="size-3" />
              {running ? 'Running…' : 'Run it now'}
            </Button>
          </div>
          <pre className="overflow-x-auto p-5 font-mono text-[12.5px] leading-relaxed">
{`curl https://api.canonn.ai/v1/chat/completions \\
  -H "Authorization: Bearer `}<b className="font-medium text-[#a9c9a4]">YOUR_KEY</b>{`" \\
  -d '{"model":"canonn-r1","messages":[
    {"role":"system","content":"YOUR DATA"},
    {"role":"user","content":"your question"}]}'`}
{demoOut && (
  <>
    {'\n\n'}
    <span className={demoOut.startsWith('✗') ? 'text-[#e08b6d]' : 'text-[#a9d8bb]'}>{demoOut}</span>
  </>
)}
          </pre>
        </Card>
      </div>
    </div>
  )
}

import { Card, CardContent } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import { ArrowDownRight, ArrowUpRight, CalendarRange, Terminal } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { CHAT_URL, fmt, type Me } from '@/lib/api'
import { cn } from '@/lib/utils'

const RANGES = [
  { days: 1, label: '24h' },
  { days: 7, label: '7d' },
  { days: 30, label: '30d' },
]

// Mirrors the worker's PRICE_IN / PRICE_OUT so the daily bars add up to the
// same figure the metering reports.
const PRICE_IN = 1.2
const PRICE_OUT = 6

const LABEL = 'text-xs font-medium text-muted-foreground'

/** Change against the previous, equal-length window - the context that makes
 *  a number mean something. Renders nothing until there is a real baseline. */
function Delta({ prev, current, invert, className }: {
  prev?: number
  current?: number
  invert?: boolean
  className?: string
}) {
  if (prev === undefined || current === undefined || prev <= 0) return null
  const pct = ((current - prev) / prev) * 100
  if (Math.abs(pct) < 0.5) return null
  const up = pct >= 0
  const good = invert ? !up : up
  return (
    <span className={cn('inline-flex items-center gap-0.5 text-xs', good ? 'text-[#3f7d54]' : 'text-muted-foreground', className)}>
      {up ? <ArrowUpRight className="size-3.5" /> : <ArrowDownRight className="size-3.5" />}
      {Math.abs(pct).toFixed(0)}%
    </span>
  )
}

/** A quiet, borderless stat - hierarchy from type, not from boxes. */
function Stat({ label, value, suffix, prev, current, invert, loading }: {
  label: string
  value: string
  suffix?: string
  prev?: number
  current?: number
  invert?: boolean
  loading?: boolean
}) {
  return (
    <div>
      <div className={LABEL}>{label}</div>
      {loading ? (
        <Skeleton className="mt-1.5 h-[24px] w-20" />
      ) : (
        <div className="mt-1 flex items-baseline gap-2">
          <span className="font-display text-[22px] leading-none font-semibold tracking-tight tabular-nums">
            {value}
            {suffix && <span className="ml-1 text-sm font-normal text-muted-foreground">{suffix}</span>}
          </span>
          <Delta prev={prev} current={current} invert={invert} />
        </div>
      )}
    </div>
  )
}

/** What to do when there is nothing to chart yet - a dashboard's empty state
 *  should teach the next step, not show an empty axis. */
function GettingStarted() {
  const snippet = `curl ${CHAT_URL} \\
  -H "Authorization: Bearer $CANONN_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "canonn-r1",
    "messages": [
      {"role": "system", "content": "Answer from the data below.\\n\\nData: Refunds are accepted within 45 days."},
      {"role": "user", "content": "What is the refund window?"}
    ]
  }'`
  return (
    <Card className="py-6">
      <CardContent className="px-6">
        <div className="flex items-center gap-2 font-display text-lg font-semibold">
          <Terminal className="size-4.5 text-muted-foreground" /> Make your first call
        </div>
        <p className="mt-1 mb-4 text-sm text-muted-foreground">
          Charts fill in as soon as traffic arrives. Create a key under API keys, then:
        </p>
        <pre className="overflow-x-auto rounded-xl border border-border bg-secondary/50 p-4 font-mono text-xs leading-relaxed">{snippet}</pre>
        <p className="mt-4 text-xs text-muted-foreground">
          OpenAI-compatible: point any SDK at api.canonn.ai and keep your existing code.
        </p>
      </CardContent>
    </Card>
  )
}

const GHOST_BARS = (seed: number) => Array.from({ length: 14 }, (_, i) => (
  <div key={i} className="flex-1 rounded-t bg-foreground/[0.06]" style={{ height: `${8 + ((i * seed) % 27)}%` }} />
))

export function Activity({
  me, days, setDays, keyFilter, setKeyFilter, range, setRange,
}: {
  me: Me | null
  days: number
  setDays: (d: number) => void
  keyFilter: string
  setKeyFilter: (k: string) => void
  range: { from: string; to: string }
  setRange: (r: { from: string; to: string }) => void
}) {
  const buckets = me ? Object.keys(me.by_day).sort().slice(-31) : []
  const cost = (d: string) => {
    const b = me!.by_day[d]
    return (b.pt / 1e6) * PRICE_IN + (b.ct / 1e6) * PRICE_OUT
  }
  const maxCost = Math.max(0.000001, ...buckets.map(cost))
  const maxReq = Math.max(1, ...buckets.map((d) => me!.by_day[d].requests))
  const maxTok = Math.max(1, ...buckets.map((d) => me!.by_day[d].pt + me!.by_day[d].ct))
  const loading = me === null
  const hasTraffic = (me?.requests ?? 0) > 0
  const prev = me?.previous
  const errorRate = me && me.requests ? (me.truncated / me.requests) * 100 : 0
  const balance = me?.credit_usd ?? 0
  const runway = balance > 0 && me && me.spend_usd > 0 && days
    ? Math.floor(balance / (me.spend_usd / days))
    : null
  const period = range.from || range.to
    ? `${range.from || '…'} → ${range.to || 'now'}`
    : days === 1 ? 'last 24 hours' : `last ${days} days`

  return (
    <div>
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <h1 className="font-display text-[22px] font-semibold tracking-tight">Usage</h1>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={keyFilter || 'all'} onValueChange={(v) => setKeyFilter(v === 'all' ? '' : v)}>
            <SelectTrigger className="h-9 w-full min-w-[150px] bg-card font-mono text-xs sm:w-[170px]">
              <SelectValue placeholder="All keys" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="font-mono text-xs">All keys</SelectItem>
              {(me?.keys ?? []).map((k) => (
                <SelectItem key={k.name} value={k.name} className="font-mono text-xs">{k.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="flex w-full flex-wrap rounded-lg border border-input bg-card p-0.5 sm:w-auto">
            {RANGES.map((r) => (
              <button
                key={r.days}
                onClick={() => { setRange({ from: '', to: '' }); setDays(r.days) }}
                className={cn(
                  'flex-1 rounded-md px-3 py-1.5 text-center font-mono text-xs transition-colors sm:flex-initial',
                  !range.from && !range.to && days === r.days
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {r.label}
              </button>
            ))}
            <Popover>
              <PopoverTrigger asChild>
                <button
                  className={cn(
                    'flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 font-mono text-xs transition-colors sm:flex-initial',
                    range.from || range.to || !RANGES.some((r) => r.days === days)
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  <CalendarRange className="size-3.5" />
                  {range.from || range.to
                    ? `${(range.from || '…').slice(5)} → ${(range.to || 'now').slice(5)}`
                    : !RANGES.some((r) => r.days === days)
                      ? `${days}d`
                      : 'Custom'}
                </button>
              </PopoverTrigger>
              <PopoverContent align="end" collisionPadding={12} className="w-[min(20rem,calc(100vw-24px))]">
                <div className="space-y-3">
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <div>
                      <label className="mb-1.5 block text-xs font-medium text-muted-foreground">From</label>
                      <Input type="date" value={range.from} max={range.to || undefined}
                             onChange={(e) => setRange({ ...range, from: e.target.value })} className="font-mono text-xs" />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-xs font-medium text-muted-foreground">To</label>
                      <Input type="date" value={range.to} min={range.from || undefined}
                             onChange={(e) => setRange({ ...range, to: e.target.value })} className="font-mono text-xs" />
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {[14, 60, 90].map((d) => (
                      <Button key={d} size="sm" variant="outline" onClick={() => { setRange({ from: '', to: '' }); setDays(d) }} className="h-7 text-xs">
                        Last {d}d
                      </Button>
                    ))}
                    {(range.from || range.to) && (
                      <Button size="sm" variant="ghost" onClick={() => setRange({ from: '', to: '' })} className="h-7 text-xs text-destructive">
                        Clear
                      </Button>
                    )}
                  </div>
                </div>
              </PopoverContent>
            </Popover>
          </div>
        </div>
      </div>

      {/* ---- The one thing to understand: what this period costs ---- */}
      <section>
        <div className={LABEL}>Spend · {period}</div>
        {loading ? (
          <Skeleton className="mt-2 h-[46px] w-40" />
        ) : (
          <div className="mt-1 flex items-baseline gap-3">
            <span className="font-display text-[46px] leading-none font-semibold tracking-tight tabular-nums">
              ${me.spend_usd.toFixed(2)}
            </span>
            <Delta prev={prev?.spend_usd} current={me.spend_usd} invert className="text-sm" />
          </div>
        )}
        <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="relative flex size-1.5">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-[#3f7d54] opacity-60" />
              <span className="relative inline-flex size-1.5 rounded-full bg-[#3f7d54]" />
            </span>
            API operational
          </span>
          <span>
            balance {loading ? <Skeleton className="inline-block h-3 w-10 align-[-2px]" /> : <span className="text-foreground">${balance.toFixed(2)}</span>}
            {!loading && runway !== null && runway < 400 && <> · ~{runway}d left at this rate</>}
          </span>
          <span>
            truncated {loading ? <Skeleton className="inline-block h-3 w-8 align-[-2px]" /> : <span className={cn(errorRate > 2 ? 'text-destructive' : 'text-foreground')}>{errorRate.toFixed(1)}%</span>}
          </span>
        </div>

        <div className="mt-7 flex h-[240px] items-end gap-1.5 border-b border-border pb-0.5">
          {buckets.length > 0
            ? buckets.map((d) => (
                <div
                  key={d}
                  className="group relative min-h-0.5 flex-1 rounded-t bg-[#b3a894]/55 hover:bg-foreground/75"
                  style={{ height: `${(cost(d) / maxCost) * 100}%` }}
                >
                  <span className="absolute bottom-full left-1/2 z-10 mb-1.5 hidden -translate-x-1/2 rounded-lg border border-border bg-popover px-2.5 py-1 font-mono text-xs whitespace-nowrap group-hover:block">
                    {d} · ${cost(d).toFixed(3)} · {me!.by_day[d].requests} req
                  </span>
                </div>
              ))
            : GHOST_BARS(37)}
        </div>
        <div className="mt-2 flex justify-between font-mono text-[10.5px] text-muted-foreground">
          <span>{buckets[0] ?? ''}</span>
          <span>{buckets[buckets.length - 1] ?? ''}</span>
        </div>
      </section>

      {!loading && !hasTraffic && <div className="mt-8"><GettingStarted /></div>}

      {/* ---- Everything else reads as one quiet page: hairlines, not boxes ---- */}
      <section className="mt-10 grid grid-cols-2 gap-x-6 gap-y-6 border-t border-border pt-8 md:grid-cols-4 md:[&>*+*]:border-l md:[&>*+*]:border-border md:[&>*+*]:pl-6">
        <Stat label="Requests" loading={loading} value={fmt(me?.requests ?? 0)} prev={prev?.requests} current={me?.requests} />
        <Stat label="Tokens" loading={loading} value={fmt(me ? me.input_tokens + me.output_tokens : 0)}
              prev={prev ? prev.input_tokens + prev.output_tokens : undefined}
              current={me ? me.input_tokens + me.output_tokens : undefined} />
        <Stat label="Median latency" loading={loading} value={me?.p50_ms ? String(me.p50_ms) : '·'} suffix={me?.p50_ms ? 'ms' : ''}
              prev={prev?.p50_ms} current={me?.p50_ms} invert />
        <Stat label="Throughput" loading={loading} value={me?.avg_tok_s != null ? String(me.avg_tok_s) : '·'} suffix={me?.avg_tok_s != null ? 'tok/s' : ''} />
      </section>

      <section className="mt-10 grid gap-x-10 gap-y-8 border-t border-border pt-8 md:grid-cols-2">
        <div>
          <div className={LABEL}>Requests {days === 1 ? 'by hour' : 'by day'}</div>
          <div className="mt-4 flex h-[130px] items-end gap-1 border-b border-border pb-0.5">
            {buckets.map((d) => (
              <div key={d} className="group relative min-h-0.5 flex-1 rounded-t bg-[#b3a894]/50 hover:bg-foreground/75"
                   style={{ height: `${(me!.by_day[d].requests / maxReq) * 100}%` }}>
                <span className="absolute bottom-full left-1/2 z-10 mb-1.5 hidden -translate-x-1/2 rounded-lg border border-border bg-popover px-2.5 py-1 font-mono text-xs whitespace-nowrap group-hover:block">
                  {d} · {me!.by_day[d].requests} req
                </span>
              </div>
            ))}
            {buckets.length === 0 && GHOST_BARS(31)}
          </div>
        </div>

        <div>
          <div className={LABEL}>Token volume {days === 1 ? 'by hour' : 'by day'}</div>
          <div className="mt-4 flex h-[130px] items-end gap-1 border-b border-border pb-0.5">
            {buckets.map((d) => {
              const b = me!.by_day[d]
              const total = b.pt + b.ct
              return (
                <div key={d} className="group relative flex min-h-0.5 flex-1 flex-col justify-end" style={{ height: `${(total / maxTok) * 100}%` }}>
                  <div className="w-full rounded-t bg-[#3f7d54]/70" style={{ height: `${total ? (b.ct / total) * 100 : 0}%` }} />
                  <div className="w-full bg-[#b3a894]/55" style={{ height: `${total ? (b.pt / total) * 100 : 0}%` }} />
                  <span className="absolute bottom-full left-1/2 z-10 mb-1.5 hidden -translate-x-1/2 rounded-lg border border-border bg-popover px-2.5 py-1 font-mono text-xs whitespace-nowrap group-hover:block">
                    {d} · in {fmt(b.pt)} · out {fmt(b.ct)}
                  </span>
                </div>
              )
            })}
            {buckets.length === 0 && GHOST_BARS(43)}
          </div>
          <div className="mt-2.5 flex items-center gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5"><span className="size-2 rounded-sm bg-[#b3a894]/55" /> input</span>
            <span className="flex items-center gap-1.5"><span className="size-2 rounded-sm bg-[#3f7d54]/70" /> output</span>
          </div>
        </div>
      </section>

      <section className="mt-10 grid gap-x-10 gap-y-8 border-t border-border pt-8 md:grid-cols-[1fr_280px]">
        <div>
          <div className={cn(LABEL, 'mb-4')}>Traffic by key</div>
          {loading && (
            <div className="space-y-4">
              {[0, 1, 2].map((i) => (
                <div key={i}>
                  <div className="mb-1.5 flex items-baseline justify-between">
                    <Skeleton className="h-3.5 w-24" />
                    <Skeleton className="h-3 w-14" />
                  </div>
                  <Skeleton className="h-1.5 w-full rounded" />
                </div>
              ))}
            </div>
          )}
          {!loading && Object.keys(me.by_key ?? {}).length === 0 && (
            <p className="text-xs text-muted-foreground">No traffic from any key yet.</p>
          )}
          <div className="space-y-3">
            {Object.entries(me?.by_key ?? {})
              .sort((a, b) => b[1].requests - a[1].requests)
              .slice(0, 8)
              .map(([name, k]) => {
                const share = me?.requests ? (k.requests / me.requests) * 100 : 0
                return (
                  <div key={name}>
                    <div className="mb-1 flex items-baseline justify-between text-sm">
                      <span className="truncate font-medium">{name}</span>
                      <span className="ml-3 text-xs text-muted-foreground tabular-nums">{fmt(k.requests)} · {share.toFixed(0)}%</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded bg-secondary">
                      <div className="h-full rounded bg-[#b3a894]/65" style={{ width: `${share}%` }} />
                    </div>
                  </div>
                )
              })}
          </div>
        </div>

        <div>
          <div className={cn(LABEL, 'mb-4')}>Latency &amp; cost</div>
          <div className="space-y-2.5">
            {[
              ['Median', me?.p50_ms != null ? `${me.p50_ms} ms` : '·'],
              ['p95', me?.p95_ms != null ? `${me.p95_ms} ms` : '·'],
              ['Average', me?.avg_ms != null ? `${me.avg_ms} ms` : '·'],
              ['Tokens in', fmt(me?.input_tokens ?? 0)],
              ['Tokens out', fmt(me?.output_tokens ?? 0)],
              ['Cost / request', me?.requests ? `$${(me.spend_usd / me.requests).toFixed(4)}` : '·'],
            ].map(([label, value]) => (
              <div key={label} className="flex items-baseline justify-between text-sm">
                <span className="text-xs text-muted-foreground">{label}</span>
                <span className="font-mono text-[13px] tabular-nums">{value}</span>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  )
}

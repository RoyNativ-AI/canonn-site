import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import { ArrowDownRight, ArrowUpRight, CalendarRange, Terminal } from 'lucide-react'
import { fmt, type Me } from '@/lib/api'
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

const LABEL = 'font-mono text-[10px] tracking-[0.14em] text-muted-foreground uppercase'

/** A headline number with its change against the previous, equal-length
 *  window - the context that makes a metric mean something. */
function Kpi({
  label, value, prev, current, invert, suffix,
}: {
  label: string
  value: string
  prev?: number
  current?: number
  invert?: boolean
  suffix?: string
}) {
  const hasDelta = prev !== undefined && current !== undefined && prev > 0
  const pct = hasDelta ? ((current! - prev!) / prev!) * 100 : 0
  const up = pct >= 0
  const good = invert ? !up : up
  return (
    <Card className="gap-2 py-5">
      <CardHeader className="px-5"><CardTitle className={LABEL}>{label}</CardTitle></CardHeader>
      <CardContent className="px-5">
        <div className="font-display text-[30px] leading-none font-semibold tracking-tight tabular-nums">
          {value}<span className="ml-1 text-base font-normal text-muted-foreground">{suffix}</span>
        </div>
        {hasDelta && Math.abs(pct) >= 0.5 && (
          <div className={cn('mt-2 flex items-center gap-1 font-mono text-[11px]', good ? 'text-[#3f7d54]' : 'text-muted-foreground')}>
            {up ? <ArrowUpRight className="size-3" /> : <ArrowDownRight className="size-3" />}
            {Math.abs(pct).toFixed(0)}% vs previous period
          </div>
        )}
        {!hasDelta && <div className="mt-2 font-mono text-[11px] text-muted-foreground">no prior data</div>}
      </CardContent>
    </Card>
  )
}

/** What to do when there is nothing to chart yet - a dashboard's empty state
 *  should teach the next step, not show an empty axis. */
function GettingStarted() {
  const snippet = `curl https://api.canonn.ai/v1/chat/completions \\
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
        <pre className="overflow-x-auto rounded-xl border border-border bg-secondary/50 p-4 font-mono text-[11.5px] leading-relaxed">{snippet}</pre>
        <p className="mt-4 font-mono text-[10.5px] text-muted-foreground">
          OpenAI-compatible: point any SDK at api.canonn.ai and keep your existing code.
        </p>
      </CardContent>
    </Card>
  )
}

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
  const hasTraffic = (me?.requests ?? 0) > 0
  const prev = me?.previous
  const errorRate = me && me.requests ? (me.truncated / me.requests) * 100 : 0
  const balance = me?.credit_usd ?? 0
  const runway = balance > 0 && me && me.spend_usd > 0 && days
    ? Math.floor(balance / (me.spend_usd / days))
    : null

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-[32px] font-semibold tracking-tight">Usage</h1>
          <p className="text-sm text-muted-foreground">Your usage · api.canonn.ai</p>
        </div>
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

          <div className="flex flex-wrap rounded-lg border border-input bg-card p-0.5">
            {RANGES.map((r) => (
              <button
                key={r.days}
                onClick={() => { setRange({ from: '', to: '' }); setDays(r.days) }}
                className={cn(
                  'rounded-md px-3 py-1.5 font-mono text-xs transition-colors',
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
                    'flex items-center gap-1.5 rounded-md px-3 py-1.5 font-mono text-xs transition-colors',
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
                      <label className="mb-1.5 block font-mono text-[10px] tracking-[0.12em] text-muted-foreground uppercase">From</label>
                      <Input type="date" value={range.from} max={range.to || undefined}
                             onChange={(e) => setRange({ ...range, from: e.target.value })} className="font-mono text-xs" />
                    </div>
                    <div>
                      <label className="mb-1.5 block font-mono text-[10px] tracking-[0.12em] text-muted-foreground uppercase">To</label>
                      <Input type="date" value={range.to} min={range.from || undefined}
                             onChange={(e) => setRange({ ...range, to: e.target.value })} className="font-mono text-xs" />
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {[14, 60, 90].map((d) => (
                      <Button key={d} size="sm" variant="outline" onClick={() => { setRange({ from: '', to: '' }); setDays(d) }} className="h-7 font-mono text-[11px]">
                        Last {d}d
                      </Button>
                    ))}
                    {(range.from || range.to) && (
                      <Button size="sm" variant="ghost" onClick={() => setRange({ from: '', to: '' })} className="h-7 font-mono text-[11px] text-destructive">
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

      {/* Status strip: what a person checks first thing in the morning. */}
      <div className="mb-6 flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl border border-border bg-card px-4 py-3 sm:px-5">
        <span className="flex items-center gap-2 text-sm">
          <span className="relative flex size-2">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-[#3f7d54] opacity-60" />
            <span className="relative inline-flex size-2 rounded-full bg-[#3f7d54]" />
          </span>
          API operational
        </span>
        <span className="font-mono text-xs text-muted-foreground">
          balance <span className="text-foreground">${balance.toFixed(2)}</span>
          {runway !== null && runway < 400 && <> · ~{runway}d at this rate</>}
        </span>
        <span className="font-mono text-xs text-muted-foreground">
          median <span className="text-foreground">{me?.p50_ms ? `${me.p50_ms} ms` : '·'}</span>
        </span>
        <span className="font-mono text-xs text-muted-foreground">
          truncated <span className={cn(errorRate > 2 ? 'text-destructive' : 'text-foreground')}>{errorRate.toFixed(1)}%</span>
        </span>
        <span className="font-mono text-[10.5px] text-muted-foreground sm:ml-auto">updates live</span>
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="Spend" value={`$${(me?.spend_usd ?? 0).toFixed(2)}`} prev={prev?.spend_usd} current={me?.spend_usd} invert />
        <Kpi label="Requests" value={fmt(me?.requests ?? 0)} prev={prev?.requests} current={me?.requests} />
        <Kpi label="Tokens" value={fmt(me ? me.input_tokens + me.output_tokens : 0)}
             prev={prev ? prev.input_tokens + prev.output_tokens : undefined}
             current={me ? me.input_tokens + me.output_tokens : undefined} />
        <Kpi label="Median latency" value={me?.p50_ms ? String(me.p50_ms) : '·'} suffix={me?.p50_ms ? 'ms' : ''}
             prev={prev?.p50_ms} current={me?.p50_ms} invert />
      </div>

      {!hasTraffic && <div className="mb-6"><GettingStarted /></div>}

      <div className="grid gap-6 xl:grid-cols-[1fr_340px]">
        <div className="space-y-6">
          <Card className="py-5">
            <CardContent className="px-5">
              <div className={LABEL}>Spend {days === 1 ? 'by hour' : 'by day'}</div>
              <div className="mt-5 flex h-[260px] items-end gap-1.5 border-b border-border pb-0.5">
                {buckets.length > 0
                  ? buckets.map((d) => (
                      <div
                        key={d}
                        className="group relative min-h-0.5 flex-1 rounded-t bg-[#c96442]/70 hover:bg-[#c96442]"
                        style={{ height: `${(cost(d) / maxCost) * 100}%` }}
                      >
                        <span className="absolute bottom-full left-1/2 z-10 mb-1.5 hidden -translate-x-1/2 rounded-lg border border-border bg-popover px-2.5 py-1 font-mono text-[11px] whitespace-nowrap group-hover:block">
                          {d} · ${cost(d).toFixed(3)} · {me!.by_day[d].requests} req
                        </span>
                      </div>
                    ))
                  : Array.from({ length: 16 }, (_, i) => (
                      <div key={i} className="flex-1 rounded-t bg-foreground/[0.06]" style={{ height: `${8 + ((i * 37) % 23)}%` }} />
                    ))}
              </div>
              <div className="mt-2 flex justify-between font-mono text-[10px] text-muted-foreground">
                <span>{buckets[0] ?? ''}</span>
                <span>{buckets[buckets.length - 1] ?? ''}</span>
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-6 md:grid-cols-2">
            <Card className="py-5">
              <CardHeader className="px-5">
                <CardTitle className="font-display text-lg">Requests {days === 1 ? 'by hour' : 'by day'}</CardTitle>
              </CardHeader>
              <CardContent className="px-5">
                <div className="flex h-[150px] items-end gap-1 border-b border-border pb-0.5">
                  {buckets.map((d) => (
                    <div key={d} className="group relative min-h-0.5 flex-1 rounded-t bg-[#c96442]/60 hover:bg-[#c96442]"
                         style={{ height: `${(me!.by_day[d].requests / maxReq) * 100}%` }}>
                      <span className="absolute bottom-full left-1/2 z-10 mb-1.5 hidden -translate-x-1/2 rounded-lg border border-border bg-popover px-2.5 py-1 font-mono text-[11px] whitespace-nowrap group-hover:block">
                        {d} · {me!.by_day[d].requests} req
                      </span>
                    </div>
                  ))}
                  {buckets.length === 0 && <p className="font-mono text-xs text-muted-foreground">No traffic in this window.</p>}
                </div>
              </CardContent>
            </Card>

            <Card className="py-5">
              <CardHeader className="px-5">
                <CardTitle className="font-display text-lg">Token volume {days === 1 ? 'by hour' : 'by day'}</CardTitle>
              </CardHeader>
              <CardContent className="px-5">
                <div className="flex h-[150px] items-end gap-1 border-b border-border pb-0.5">
                  {buckets.map((d) => {
                    const b = me!.by_day[d]
                    const total = b.pt + b.ct
                    return (
                      <div key={d} className="group relative flex min-h-0.5 flex-1 flex-col justify-end" style={{ height: `${(total / maxTok) * 100}%` }}>
                        <div className="w-full rounded-t bg-[#3f7d54]/70" style={{ height: `${total ? (b.ct / total) * 100 : 0}%` }} />
                        <div className="w-full bg-[#c96442]/50" style={{ height: `${total ? (b.pt / total) * 100 : 0}%` }} />
                        <span className="absolute bottom-full left-1/2 z-10 mb-1.5 hidden -translate-x-1/2 rounded-lg border border-border bg-popover px-2.5 py-1 font-mono text-[11px] whitespace-nowrap group-hover:block">
                          {d} · in {fmt(b.pt)} · out {fmt(b.ct)}
                        </span>
                      </div>
                    )
                  })}
                </div>
                <div className="mt-2.5 flex items-center gap-4 font-mono text-[10px] text-muted-foreground">
                  <span className="flex items-center gap-1.5"><span className="size-2 rounded-sm bg-[#c96442]/50" /> input</span>
                  <span className="flex items-center gap-1.5"><span className="size-2 rounded-sm bg-[#3f7d54]/70" /> output</span>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        <div className="space-y-6">
          <Card className="gap-2 py-5">
            <CardHeader className="px-5"><CardTitle className={LABEL}>Tokens in / out</CardTitle></CardHeader>
            <CardContent className="px-5">
              <div className="font-display text-[26px] leading-none font-semibold tracking-tight tabular-nums">
                {(me ? me.input_tokens + me.output_tokens : 0).toLocaleString()}
              </div>
              <div className="mt-4 h-2 overflow-hidden rounded-full bg-secondary">
                <div className="h-full rounded-full bg-[#c96442]/70"
                     style={{ width: `${me && me.input_tokens + me.output_tokens ? (me.input_tokens / (me.input_tokens + me.output_tokens)) * 100 : 0}%` }} />
              </div>
              <p className="mt-2 font-mono text-[10.5px] text-muted-foreground">
                in {fmt(me?.input_tokens ?? 0)} · out {fmt(me?.output_tokens ?? 0)}
              </p>
              <p className="mt-3 font-mono text-[10.5px] text-muted-foreground">
                avg {me?.requests ? Math.round((me.input_tokens + me.output_tokens) / me.requests) : 0} tokens / request
              </p>
            </CardContent>
          </Card>

          <Card className="gap-2 py-5">
            <CardHeader className="px-5"><CardTitle className={LABEL}>Speed</CardTitle></CardHeader>
            <CardContent className="space-y-2.5 px-5">
              {[
                ['Median', me?.p50_ms != null ? `${me.p50_ms} ms` : '·'],
                ['p95', me?.p95_ms != null ? `${me.p95_ms} ms` : '·'],
                ['Average', me?.avg_ms != null ? `${me.avg_ms} ms` : '·'],
                ['Throughput', me?.avg_tok_s != null ? `${me.avg_tok_s} tok/s` : '·'],
                ['Cost / request', me?.requests ? `$${(me.spend_usd / me.requests).toFixed(4)}` : '·'],
              ].map(([label, value]) => (
                <div key={label} className="flex items-baseline justify-between">
                  <span className="font-mono text-[10px] tracking-[0.1em] text-muted-foreground uppercase">{label}</span>
                  <span className="font-mono text-sm">{value}</span>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="gap-2 py-5">
            <CardHeader className="px-5"><CardTitle className={LABEL}>Traffic by key</CardTitle></CardHeader>
            <CardContent className="px-5">
              {Object.keys(me?.by_key ?? {}).length === 0 && (
                <p className="font-mono text-xs text-muted-foreground">No usage yet.</p>
              )}
              <div className="space-y-2.5">
                {Object.entries(me?.by_key ?? {})
                  .sort((a, b) => b[1].requests - a[1].requests)
                  .slice(0, 8)
                  .map(([name, k]) => {
                    const share = me?.requests ? (k.requests / me.requests) * 100 : 0
                    return (
                      <div key={name}>
                        <div className="mb-1 flex items-baseline justify-between text-sm">
                          <span className="truncate font-medium">{name}</span>
                          <span className="ml-3 font-mono text-xs text-muted-foreground">{fmt(k.requests)} · {share.toFixed(0)}%</span>
                        </div>
                        <div className="h-1.5 overflow-hidden rounded bg-secondary">
                          <div className="h-full rounded bg-[#c96442]/70" style={{ width: `${share}%` }} />
                        </div>
                      </div>
                    )
                  })}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

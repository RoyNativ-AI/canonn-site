import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import { CalendarRange } from 'lucide-react'
import { fmt, type Me } from '@/lib/api'
import { cn } from '@/lib/utils'

const RANGES = [
  { days: 1, label: '24h' },
  { days: 7, label: '7d' },
  { days: 30, label: '30d' },
]

// Mirrors the worker's PRICE_IN / PRICE_OUT so the daily spend bars add up to
// the same figure the metering reports.
const PRICE_IN = 1.2
const PRICE_OUT = 6

const LABEL = 'font-mono text-[10px] tracking-[0.14em] text-muted-foreground uppercase'

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

  return (
    <div>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-[32px] font-semibold tracking-tight">Usage</h1>
          <p className="text-sm text-muted-foreground">Your usage · api.canonn.ai</p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={keyFilter || 'all'} onValueChange={(v) => setKeyFilter(v === 'all' ? '' : v)}>
            <SelectTrigger className="h-9 w-[170px] bg-card font-mono text-xs">
              <SelectValue placeholder="All keys" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="font-mono text-xs">All keys</SelectItem>
              {(me?.keys ?? []).map((k) => (
                <SelectItem key={k.name} value={k.name} className="font-mono text-xs">{k.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="flex rounded-lg border border-input bg-card p-0.5">
            {RANGES.map((r) => (
              <button
                key={r.days}
                onClick={() => { setRange({ from: '', to: '' }); setDays(r.days) }}
                className={cn(
                  'rounded-md px-3 py-1.5 font-mono text-xs transition-colors',
                  days === r.days ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
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
                    ? `${range.from || '…'} → ${range.to || 'now'}`
                    : !RANGES.some((r) => r.days === days)
                      ? `${days}d`
                      : 'Custom'}
                </button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-72">
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="mb-1.5 block font-mono text-[10px] tracking-[0.12em] text-muted-foreground uppercase">From</label>
                      <Input
                        type="date"
                        value={range.from}
                        max={range.to || undefined}
                        onChange={(e) => setRange({ ...range, from: e.target.value })}
                        className="font-mono text-xs"
                      />
                    </div>
                    <div>
                      <label className="mb-1.5 block font-mono text-[10px] tracking-[0.12em] text-muted-foreground uppercase">To</label>
                      <Input
                        type="date"
                        value={range.to}
                        min={range.from || undefined}
                        onChange={(e) => setRange({ ...range, to: e.target.value })}
                        className="font-mono text-xs"
                      />
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

      <div className="grid gap-6 xl:grid-cols-[1fr_340px]">
        {/* Main column: the money chart first, like every usage page people know. */}
        <div className="space-y-6">
          <Card className="py-5">
            <CardContent className="px-5">
              <div className={LABEL}>Total spend</div>
              <div className="mt-1 font-display text-5xl font-semibold tracking-tight text-[#3f7d54]">
                ${(me?.spend_usd ?? 0).toFixed(2)}
              </div>
              <div className="mt-8 flex h-[280px] items-end gap-1.5 border-b border-border pb-0.5">
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
                <CardTitle className="font-display text-lg">
                  Requests {days === 1 ? 'by hour' : 'by day'}
                </CardTitle>
              </CardHeader>
              <CardContent className="px-5">
                <div className="flex h-[150px] items-end gap-1 border-b border-border pb-0.5">
                  {buckets.map((d) => (
                    <div
                      key={d}
                      className="group relative min-h-0.5 flex-1 rounded-t bg-[#c96442]/60 hover:bg-[#c96442]"
                      style={{ height: `${(me!.by_day[d].requests / maxReq) * 100}%` }}
                    >
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

        {/* Sidebar: the totals at a glance, like the usage pages people know. */}
        <div className="space-y-6">
          <Card className="gap-2 py-5">
            <CardHeader className="px-5">
              <CardTitle className={LABEL}>Total tokens</CardTitle>
            </CardHeader>
            <CardContent className="px-5">
              <div className="font-display text-[28px] leading-none font-semibold tracking-tight tabular-nums">
                {(me ? me.input_tokens + me.output_tokens : 0).toLocaleString()}
              </div>
              {buckets.length > 1 && (
                <svg viewBox="0 0 100 26" preserveAspectRatio="none" className="mt-4 h-10 w-full">
                  <polyline
                    fill="none" stroke="#c96442" strokeWidth="1.5"
                    points={buckets.map((d, i) => {
                      const t = me!.by_day[d].pt + me!.by_day[d].ct
                      return `${(i / (buckets.length - 1)) * 100},${24 - (t / maxTok) * 22}`
                    }).join(' ')}
                  />
                </svg>
              )}
              <p className="mt-2 font-mono text-[10.5px] text-muted-foreground">
                in {fmt(me?.input_tokens ?? 0)} · out {fmt(me?.output_tokens ?? 0)}
              </p>
            </CardContent>
          </Card>

          <Card className="gap-2 py-5">
            <CardHeader className="px-5">
              <CardTitle className={LABEL}>Total requests</CardTitle>
            </CardHeader>
            <CardContent className="px-5">
              <div className="font-display text-[28px] leading-none font-semibold tracking-tight tabular-nums">
                {(me?.requests ?? 0).toLocaleString()}
              </div>
              <div className="mt-4 flex h-9 items-end gap-[3px]">
                {buckets.map((d) => (
                  <div key={d} className="min-h-[2px] flex-1 rounded-sm bg-[#c96442]/60"
                       style={{ height: `${(me!.by_day[d].requests / maxReq) * 100}%` }} />
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="gap-2 py-5">
            <CardHeader className="px-5">
              <CardTitle className={LABEL}>Latency</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2.5 px-5">
              {[
                ['Median', me?.p50_ms != null ? `${me.p50_ms} ms` : '·'],
                ['p95', me?.p95_ms != null ? `${me.p95_ms} ms` : '·'],
                ['Average', me?.avg_ms != null ? `${me.avg_ms} ms` : '·'],
                ['Throughput', me?.avg_tok_s != null ? `${me.avg_tok_s} tok/s` : '·'],
              ].map(([label, value]) => (
                <div key={label} className="flex items-baseline justify-between">
                  <span className="font-mono text-[10px] tracking-[0.1em] text-muted-foreground uppercase">{label}</span>
                  <span className="font-mono text-sm">{value}</span>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="gap-2 py-5">
            <CardHeader className="px-5">
              <CardTitle className={LABEL}>API keys</CardTitle>
            </CardHeader>
            <CardContent className="px-5">
              {Object.keys(me?.by_key ?? {}).length === 0 && (
                <p className="font-mono text-xs text-muted-foreground">No usage yet.</p>
              )}
              <div className="space-y-2">
                {Object.entries(me?.by_key ?? {})
                  .sort((a, b) => b[1].requests - a[1].requests)
                  .slice(0, 8)
                  .map(([name, k]) => (
                    <div key={name} className="flex items-center justify-between rounded-lg bg-secondary/50 px-3 py-2">
                      <span className="truncate text-sm font-medium">{name}</span>
                      <span className="ml-3 font-mono text-xs text-muted-foreground">{fmt(k.requests)}</span>
                    </div>
                  ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

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
  const buckets = me ? Object.keys(me.by_day).sort().slice(-24) : []
  const max = Math.max(1, ...buckets.map((d) => me!.by_day[d].requests))

  return (
    <div>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-[32px] font-semibold tracking-tight">Activity</h1>
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

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-6">
        <Stat label="Spend (est.)" value={`$${(me?.spend_usd ?? 0).toFixed(2)}`} money />
        <Stat label="Requests" value={fmt(me?.requests ?? 0)} />
        <Stat label="Input tokens" value={fmt(me?.input_tokens ?? 0)} />
        <Stat label="Output tokens" value={fmt(me?.output_tokens ?? 0)} />
        <Stat label="Avg latency" value={me?.avg_ms ? `${(me.avg_ms / 1000).toFixed(1)}s` : '·'} />
        <Stat label="P95 latency" value={me?.p95_ms ? `${(me.p95_ms / 1000).toFixed(1)}s` : '·'} />
      </div>

      <div className="mt-7 grid gap-5 xl:grid-cols-2">
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

        <Card className="py-5">
          <CardHeader className="px-5">
            <CardTitle className="font-display text-lg">Token volume {days === 1 ? 'by hour' : 'by day'}</CardTitle>
          </CardHeader>
          <CardContent className="px-5">
            <div className="flex h-[190px] items-end gap-1.5 border-b border-border pb-0.5">
              {buckets.length > 0
                ? buckets.map((d) => {
                    const b = me!.by_day[d]
                    const tmax = Math.max(1, ...buckets.map((x) => me!.by_day[x].pt + me!.by_day[x].ct))
                    const total = b.pt + b.ct
                    return (
                      <div key={d} className="group relative flex min-h-0.5 flex-1 flex-col justify-end" style={{ height: `${(total / tmax) * 100}%` }}>
                        <div className="w-full rounded-t bg-[#3f7d54]/70" style={{ height: `${total ? (b.ct / total) * 100 : 0}%` }} />
                        <div className="w-full bg-[#c96442]/50" style={{ height: `${total ? (b.pt / total) * 100 : 0}%` }} />
                        <span className="absolute bottom-full left-1/2 z-10 mb-1.5 hidden -translate-x-1/2 rounded-lg border border-border bg-popover px-2.5 py-1 font-mono text-[11px] whitespace-nowrap group-hover:block">
                          {d} · in {fmt(b.pt)} · out {fmt(b.ct)}
                        </span>
                      </div>
                    )
                  })
                : Array.from({ length: 14 }, (_, i) => (
                    <div key={i} className="flex-1 rounded-t bg-foreground/[0.06]" style={{ height: `${8 + ((i * 29) % 21)}%` }} />
                  ))}
            </div>
            <div className="mt-2.5 flex items-center gap-4 font-mono text-[10px] text-muted-foreground">
              <span className="flex items-center gap-1.5"><span className="size-2 rounded-sm bg-[#c96442]/50" /> input</span>
              <span className="flex items-center gap-1.5"><span className="size-2 rounded-sm bg-[#3f7d54]/70" /> output</span>
            </div>
          </CardContent>
        </Card>

        <Card className="py-5">
          <CardHeader className="px-5">
            <CardTitle className="font-display text-lg">Top keys</CardTitle>
          </CardHeader>
          <CardContent className="px-5">
            {Object.keys(me?.by_key ?? {}).length === 0 && (
              <p className="font-mono text-xs text-muted-foreground">No usage yet.</p>
            )}
            <div className="space-y-3">
              {Object.entries(me?.by_key ?? {})
                .sort((a, b) => b[1].pt + b[1].ct - (a[1].pt + a[1].ct))
                .slice(0, 6)
                .map(([name, k]) => {
                  const total = k.pt + k.ct
                  const gmax = Math.max(1, ...Object.values(me?.by_key ?? {}).map((x) => x.pt + x.ct))
                  return (
                    <div key={name}>
                      <div className="mb-1 flex items-baseline justify-between text-sm">
                        <span className="font-medium">{name}</span>
                        <span className="font-mono text-xs text-muted-foreground">{fmt(total)} tok · {k.requests} req</span>
                      </div>
                      <div className="h-2 overflow-hidden rounded bg-secondary">
                        <div className="h-full rounded bg-[#c96442]/70" style={{ width: `${(total / gmax) * 100}%` }} />
                      </div>
                    </div>
                  )
                })}
            </div>
          </CardContent>
        </Card>

      </div>
    </div>
  )
}

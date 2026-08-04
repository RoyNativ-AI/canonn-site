import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { useState } from 'react'
import type { LogRow } from '@/lib/api'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { fmt, type Me } from '@/lib/api'

const RANGES = [
  { days: 1, label: '24h' },
  { days: 7, label: '7d' },
  { days: 30, label: '30d' },
]

export function Logs({
  me, days, setDays, keyFilter, setKeyFilter,
}: {
  me: Me | null
  days: number
  setDays: (d: number) => void
  keyFilter: string
  setKeyFilter: (k: string) => void
}) {
  const rows = me?.recent ?? []
  const [detail, setDetail] = useState<LogRow | null>(null)
  return (
    <div>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-[32px] font-semibold tracking-tight">Logs</h1>
          <p className="text-sm text-muted-foreground">Your most recent requests · click a row for full details</p>
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
      <Card className="overflow-hidden py-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Time</TableHead>
              <TableHead>Key</TableHead>
              <TableHead>Mode</TableHead>
              <TableHead>Expert</TableHead>
              <TableHead className="text-right">Tokens</TableHead>
              <TableHead className="text-right">Latency</TableHead>
              <TableHead className="text-right">Speed</TableHead>
              <TableHead className="text-right">Cost</TableHead>
              <TableHead>Finish</TableHead>
              <TableHead className="text-right">Request ID</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={10} className="py-10 text-center text-muted-foreground">
                  No requests yet. Create a key and make your first call.
                </TableCell>
              </TableRow>
            )}
            {rows.map((r, i) => (
              <TableRow key={i} onClick={() => setDetail(r)} className="cursor-pointer">
                <TableCell className="font-mono text-xs">
                  {new Date(r.ts * 1000).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </TableCell>
                <TableCell className="max-w-[130px] truncate">{r.key}</TableCell>
                <TableCell>
                  <Badge variant="outline" className="font-mono text-[10px]">{r.mode}</Badge>
                </TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">{r.adapter ?? '·'}</TableCell>
                <TableCell className="text-right font-mono text-xs whitespace-nowrap">
                  {fmt(r.pt)} <span className="text-muted-foreground">→</span> {fmt(r.ct)}
                </TableCell>
                <TableCell className="text-right font-mono text-xs">{r.ms ? `${(r.ms / 1000).toFixed(1)}s` : '·'}</TableCell>
                <TableCell className="text-right font-mono text-xs text-muted-foreground">
                  {r.tok_s ? `${r.tok_s} t/s` : '·'}
                </TableCell>
                <TableCell className="text-right font-mono text-xs">
                  {r.cost !== undefined ? `$${r.cost.toFixed(5)}` : '·'}
                </TableCell>
                <TableCell>
                  <span className={`font-mono text-[10.5px] ${r.finish === 'length' ? 'text-destructive' : 'text-muted-foreground'}`}>
                    {r.finish ?? 'stop'}{r.stream ? ' · stream' : ''}
                  </span>
                </TableCell>
                <TableCell className="max-w-[150px] truncate text-right font-mono text-[10.5px] text-muted-foreground">
                  {r.req_id ?? '·'}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <Sheet open={detail !== null} onOpenChange={(o) => !o && setDetail(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
          <SheetHeader>
            <SheetTitle className="font-display text-xl">Request details</SheetTitle>
          </SheetHeader>
          {detail && (
            <div className="space-y-6 px-4 pb-8">
              <div className="flex flex-wrap gap-2">
                <span className="rounded-full bg-secondary px-3 py-1 font-mono text-[11px]">canonn-r1</span>
                <span className="rounded-full bg-secondary px-3 py-1 font-mono text-[11px]">{detail.mode}</span>
                {detail.adapter && (
                  <span className="rounded-full bg-secondary px-3 py-1 font-mono text-[11px]">expert: {detail.adapter}</span>
                )}
              </div>

              <div className="grid grid-cols-3 gap-2.5">
                {[
                  { l: 'Latency', v: detail.ms ? `${(detail.ms / 1000).toFixed(1)}s` : '·' },
                  { l: 'Throughput', v: detail.tok_s ? `${detail.tok_s} tok/s` : '·' },
                  { l: 'Cost', v: detail.cost !== undefined ? `$${detail.cost.toFixed(5)}` : '·' },
                ].map((s) => (
                  <div key={s.l} className="rounded-xl border border-border bg-card p-3">
                    <div className="font-mono text-[9.5px] tracking-[0.1em] text-muted-foreground uppercase">{s.l}</div>
                    <div className="mt-1 font-display text-lg font-semibold">{s.v}</div>
                  </div>
                ))}
              </div>

              <div className="rounded-xl border border-border bg-card p-3">
                <div className="font-mono text-[9.5px] tracking-[0.1em] text-muted-foreground uppercase">Tokens</div>
                <div className="mt-1 font-display text-lg font-semibold tabular-nums">
                  {fmt(detail.pt)} <span className="text-muted-foreground">→</span> {fmt(detail.ct)}
                </div>
              </div>

              <div>
                <h3 className="mb-2 font-display text-base font-semibold">Overview</h3>
                <dl className="space-y-2 text-sm">
                  {[
                    ['Model ID', 'canonn-r1'],
                    ['Expert', detail.adapter || 'routed'],
                    ['Mode', detail.mode],
                    ['Finish reason', detail.finish ?? 'stop'],
                    ['Streaming', String(detail.stream ?? false)],
                    ['Data policy', 'No training on your data'],
                  ].map(([k, v]) => (
                    <div key={k} className="grid grid-cols-[130px_1fr] gap-3">
                      <dt className="text-muted-foreground">{k}</dt>
                      <dd className="font-mono text-xs break-all">{v}</dd>
                    </div>
                  ))}
                </dl>
              </div>

              <div>
                <h3 className="mb-2 font-display text-base font-semibold">Request</h3>
                <dl className="space-y-2 text-sm">
                  {[
                    ['API key', detail.key],
                    ['Request ID', detail.req_id ?? '·'],
                    ['Time', new Date(detail.ts * 1000).toLocaleString()],
                    ['Client', detail.ua || '·'],
                  ].map(([k, v]) => (
                    <div key={k} className="grid grid-cols-[130px_1fr] gap-3">
                      <dt className="text-muted-foreground">{k}</dt>
                      <dd className="font-mono text-xs break-all">{v}</dd>
                    </div>
                  ))}
                </dl>
              </div>

              <div>
                <h3 className="mb-2 font-display text-base font-semibold">Raw JSON</h3>
                <pre className="overflow-x-auto rounded-xl border border-border bg-secondary p-3 font-mono text-[11px] leading-relaxed">
{JSON.stringify(detail, null, 2)}
                </pre>
              </div>

              <p className="font-mono text-[10.5px] text-muted-foreground">
                Prompt and completion text is never stored. Only these metrics are logged.
              </p>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  )
}

import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { useEffect, useState } from 'react'
import type { IoRow, LogRow } from '@/lib/api'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Skeleton } from '@/components/ui/skeleton'
import { ScrollText, SlidersHorizontal } from 'lucide-react'
import { Switch } from '@/components/ui/switch'
import { toast } from 'sonner'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { fetchIo, fetchLogs, fmt, setIoLogging, type Me } from '@/lib/api'
import { JsonView } from '@/components/JsonView'

const RANGES = [
  { days: 1, label: '24h' },
  { days: 7, label: '7d' },
  { days: 30, label: '30d' },
]

// One glanceable status per row instead of raw finish flags. A healthy row
// stays quiet; only trouble gets color. The origin HTTP status is the truth
// when the API sends it; the finish/tokens heuristic covers older rows.
function rowStatus(r: LogRow): 'ok' | 'truncated' | 'failed' {
  if (r.status && r.status >= 400) return 'failed'
  if (r.finish === 'length') return 'truncated'
  if (!r.finish && !r.ct) return 'failed'
  return 'ok'
}

// The API route behind a row. Rows logged before the endpoint column existed
// are derived from their mode: only generations were metered back then.
function rowEndpoint(r: LogRow): string {
  if (r.endpoint) return r.endpoint.replace(/^\/v1/, '')
  if (r.mode === 'demo') return '/demo'
  if (r.mode === 'playground') return '/me/chat'
  return '/chat/completions'
}

const STATUS_FILTERS = [
  { id: 'all', label: 'All statuses' },
  { id: 'ok', label: 'Succeeded' },
  { id: 'failed', label: 'Failed' },
] as const
type StatusFilter = typeof STATUS_FILTERS[number]['id']

// Where a call came from, read off the row's display key: the edge labels
// playground and assistant traffic; everything else is an API key.
function rowOrigin(r: LogRow): 'api' | 'playground' | 'assistant' {
  if (r.key === 'Playground' || r.key.startsWith('playground')) return 'playground'
  if (/\(assistant\)$/.test(r.key) || r.key.startsWith('share:')) return 'assistant'
  return 'api'
}

const ORIGIN_FILTERS = [
  { id: 'all', label: 'All traffic' },
  { id: 'api', label: 'API' },
  { id: 'playground', label: 'Playground' },
  { id: 'assistant', label: 'Assistants' },
] as const
type OriginFilter = typeof ORIGIN_FILTERS[number]['id']

type FilterOption = { id: string; label: string }

/** One filter control, compact in the desktop row and full width in the phone
 *  sheet - the same control described once, sized by where it lands. */
function FilterSelect({ value, options, placeholder, onChange, className }: {
  value: string
  options: readonly FilterOption[]
  placeholder?: string
  onChange: (v: string) => void
  className?: string
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className={cn('h-9 bg-card font-mono text-xs', className)}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.id} value={o.id} className="font-mono text-xs">{o.label}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

function StatusCell({ status }: { status: 'ok' | 'truncated' | 'failed' }) {
  if (status === 'ok') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
        <span className="size-1.5 rounded-full bg-[#3f7d54]/70" /> ok
      </span>
    )
  }
  if (status === 'truncated') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-[#996c1f] dark:text-[#d9a94e]">
        <span className="size-1.5 rounded-full bg-current" /> truncated
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-destructive">
      <span className="size-1.5 rounded-full bg-current" /> failed
    </span>
  )
}

export function Logs({
  me, days, setDays, keyFilter, setKeyFilter, getToken, onIoChanged,
}: {
  me: Me | null
  days: number
  setDays: (d: number) => void
  keyFilter: string
  setKeyFilter: (k: string) => void
  getToken: () => Promise<string | null>
  onIoChanged: () => void
}) {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [originFilter, setOriginFilter] = useState<OriginFilter>('all')
  // On a phone the filters live in a bottom sheet: the log is the hero, and
  // three squeezed selects across 375px are not worth the row they cost.
  const [filtersOpen, setFiltersOpen] = useState(false)
  // The log walks the whole window through /v1/me/logs pages, not just the
  // recency cap /v1/me carries for its summary cards.
  const [logRows, setLogRows] = useState<LogRow[] | null>(null)
  const [nextBefore, setNextBefore] = useState<number | null>(null)
  const [loadingMore, setLoadingMore] = useState(false)
  const allRows = logRows ?? []
  const rows = allRows.filter((r) =>
    (originFilter === 'all' || rowOrigin(r) === originFilter)
    && (statusFilter === 'all' || (statusFilter === 'failed' ? rowStatus(r) === 'failed' : rowStatus(r) !== 'failed')))
  const [detail, setDetail] = useState<LogRow | null>(null)

  useEffect(() => {
    let alive = true
    setLogRows(null)
    setNextBefore(null)
    getToken().then((t) => (t ? fetchLogs(t, days, keyFilter) : Promise.reject(new Error('no session'))))
      .then((p) => { if (alive) { setLogRows(p.data); setNextBefore(p.next_before) } })
      .catch(() => { if (alive) setLogRows([]) })
    return () => { alive = false }
  }, [days, keyFilter, getToken])

  // Stay live the way the rest of the console does: refresh the newest page
  // and merge by row id, so loaded history is kept while new calls appear.
  useEffect(() => {
    const tick = async () => {
      if (document.visibilityState !== 'visible') return
      const t = await getToken()
      if (!t) return
      try {
        const p = await fetchLogs(t, days, keyFilter)
        setLogRows((cur) => {
          if (cur === null) return cur
          const fresh = new Set(p.data.map((r) => r.id))
          return [...p.data, ...cur.filter((r) => !fresh.has(r.id))]
        })
      } catch { /* a quiet tick; the next one retries */ }
    }
    const iv = setInterval(tick, 12000)
    return () => clearInterval(iv)
  }, [days, keyFilter, getToken])

  const loadMore = async () => {
    if (!nextBefore || loadingMore) return
    setLoadingMore(true)
    try {
      const t = await getToken()
      if (!t) return
      const p = await fetchLogs(t, days, keyFilter, '', '', nextBefore)
      setLogRows((cur) => [...(cur ?? []), ...p.data])
      setNextBefore(p.next_before)
    } catch {
      toast.error('Could not load older requests.')
    } finally {
      setLoadingMore(false)
    }
  }
  const [io, setIo] = useState<IoRow | null>(null)
  const [ioState, setIoState] = useState<'idle' | 'loading' | 'missing'>('idle')

  useEffect(() => {
    setIo(null)
    if (!detail?.req_id || !me?.io_logging) { setIoState('idle'); return }
    let alive = true
    setIoState('loading')
    getToken().then((t) => (t ? fetchIo(t, detail.req_id!) : Promise.reject(new Error('no session'))))
      .then((row) => { if (alive) { setIo(row); setIoState('idle') } })
      .catch(() => { if (alive) setIoState('missing') })
    return () => { alive = false }
  }, [detail?.req_id, me?.io_logging])

  const enableIo = async () => {
    const t = await getToken()
    if (!t) return
    await setIoLogging(t, true)
    onIoChanged()
  }

  const toggleIo = async (v: boolean) => {
    const t = await getToken()
    if (!t) return
    await setIoLogging(t, v)
    toast.success(v ? 'I/O logging enabled - applies to new requests.' : 'I/O logging disabled.')
    onIoChanged()
  }

  const keyOptions: FilterOption[] = [
    { id: 'all', label: 'All keys' },
    ...(me?.keys ?? []).map((k) => ({ id: k.name, label: k.name })),
  ]
  const activeFilters = (keyFilter ? 1 : 0) + (originFilter === 'all' ? 0 : 1) + (statusFilter === 'all' ? 0 : 1)
  const clearFilters = () => {
    setKeyFilter('')
    setOriginFilter('all')
    setStatusFilter('all')
  }

  return (
    <div>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-[22px] font-semibold tracking-tight">Logs</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">Your most recent requests · click a row for full details</p>
        </div>
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
          {/* Phone: one chip carries every secondary control, with a count so
              an active filter is never invisible. */}
          <Button
            variant="outline"
            className="h-10 gap-1.5 bg-card font-mono text-xs sm:hidden"
            onClick={() => setFiltersOpen(true)}
          >
            <SlidersHorizontal className="size-3.5" />
            Filters
            {activeFilters > 0 && (
              <span className="rounded-full bg-primary px-1.5 py-0.5 text-[10px] leading-none text-primary-foreground tabular-nums">
                {activeFilters}
              </span>
            )}
          </Button>

          <label className="hidden h-9 items-center gap-2 rounded-lg border border-input bg-card px-3 font-mono text-xs text-muted-foreground sm:flex">
            I/O logging
            <Switch checked={Boolean(me?.io_logging)} onCheckedChange={toggleIo} />
          </label>
          <div className="hidden sm:contents">
            <FilterSelect
              value={keyFilter || 'all'}
              options={keyOptions}
              placeholder="All keys"
              onChange={(v) => setKeyFilter(v === 'all' ? '' : v)}
            />
            <FilterSelect value={originFilter} options={ORIGIN_FILTERS} onChange={(v) => setOriginFilter(v as OriginFilter)} />
            <FilterSelect value={statusFilter} options={STATUS_FILTERS} onChange={(v) => setStatusFilter(v as StatusFilter)} />
          </div>

          <div className="flex flex-1 rounded-lg border border-input bg-card p-0.5 sm:w-auto sm:flex-initial">
            {RANGES.map((r) => (
              <button
                key={r.days}
                onClick={() => setDays(r.days)}
                className={cn(
                  'flex-1 rounded-md px-3 py-2.5 text-center font-mono text-xs transition-colors sm:flex-initial sm:py-1.5',
                  days === r.days ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <Sheet open={filtersOpen} onOpenChange={setFiltersOpen}>
        <SheetContent side="bottom" className="max-h-[85dvh] gap-0 overflow-y-auto rounded-t-xl p-4">
          <SheetHeader className="p-0">
            <SheetTitle className="font-display text-lg">Filters</SheetTitle>
          </SheetHeader>
          <div className="mt-4 space-y-4">
            {[
              { label: 'Key', value: keyFilter || 'all', options: keyOptions, onChange: (v: string) => setKeyFilter(v === 'all' ? '' : v) },
              { label: 'Traffic', value: originFilter, options: ORIGIN_FILTERS, onChange: (v: string) => setOriginFilter(v as OriginFilter) },
              { label: 'Status', value: statusFilter, options: STATUS_FILTERS, onChange: (v: string) => setStatusFilter(v as StatusFilter) },
            ].map((f) => (
              <div key={f.label}>
                <label className="mb-1.5 block text-xs font-medium text-muted-foreground">{f.label}</label>
                <FilterSelect value={f.value} options={f.options} onChange={f.onChange} className="h-11 w-full" />
              </div>
            ))}
            <label className="flex h-11 items-center justify-between gap-3 rounded-lg border border-input bg-card px-3 font-mono text-xs text-muted-foreground">
              I/O logging
              <Switch checked={Boolean(me?.io_logging)} onCheckedChange={toggleIo} />
            </label>
          </div>
          <div className="mt-5 flex gap-2">
            <Button variant="outline" className="h-11 flex-1" disabled={activeFilters === 0} onClick={clearFilters}>
              Clear all
            </Button>
            <Button className="h-11 flex-1" onClick={() => setFiltersOpen(false)}>
              Show {fmt(rows.length)} {rows.length === 1 ? 'request' : 'requests'}
            </Button>
          </div>
        </SheetContent>
      </Sheet>
      <Card className="overflow-hidden py-0">
        {/* One scroll container, not two: the table pans sideways inside its
            own, and only from sm: up does it get a vertical window as well. On
            a phone the page scrolls, so a long log is never a scroll trap. */}
        <Table containerClassName="sm:max-h-[620px]">
          <TableHeader className="relative bg-card shadow-[0_1px_0_var(--border)] sm:sticky sm:top-0 sm:z-10">
            <TableRow>
              <TableHead>Time</TableHead>
              <TableHead>Key</TableHead>
              <TableHead>Endpoint</TableHead>
              <TableHead className="text-right">Tokens</TableHead>
              <TableHead className="text-right">Latency</TableHead>
              <TableHead className="text-right">Speed</TableHead>
              <TableHead className="text-right">Cost</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Request ID</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {logRows === null && Array.from({ length: 8 }, (_, i) => (
              <TableRow key={`s${i}`} className="hover:bg-transparent">
                <TableCell><Skeleton className="h-3.5 w-24" /></TableCell>
                <TableCell><Skeleton className="h-3.5 w-20" /></TableCell>
                <TableCell><Skeleton className="h-3.5 w-16" /></TableCell>
                <TableCell><Skeleton className="ml-auto h-3.5 w-16" /></TableCell>
                <TableCell><Skeleton className="ml-auto h-3.5 w-10" /></TableCell>
                <TableCell><Skeleton className="ml-auto h-3.5 w-12" /></TableCell>
                <TableCell><Skeleton className="ml-auto h-3.5 w-14" /></TableCell>
                <TableCell><Skeleton className="h-3.5 w-10" /></TableCell>
                <TableCell><Skeleton className="ml-auto h-3.5 w-16" /></TableCell>
              </TableRow>
            ))}
            {logRows !== null && rows.length === 0 && (
              <TableRow className="hover:bg-transparent">
                {/* The cell inherits whitespace-nowrap from the data rows;
                    prose in it would push the whole table sideways. */}
                <TableCell colSpan={9} className="py-16 text-center whitespace-normal">
                  <ScrollText className="mx-auto mb-3 size-6 text-muted-foreground/40" strokeWidth={1.5} />
                  <p className="text-sm font-medium">
                    {statusFilter === 'all' ? 'No requests in this window' : `No ${statusFilter === 'failed' ? 'failed' : 'successful'} requests in this window`}
                  </p>
                  <p className="mx-auto mt-1 max-w-sm text-xs text-muted-foreground">
                    Every call to the API shows up here within seconds, with tokens, latency, and cost.
                  </p>
                  <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                    <Button size="sm" className="h-9 sm:h-7" asChild><a href="#keys">Create a key</a></Button>
                    <Button size="sm" variant="outline" className="h-9 sm:h-7" asChild><a href="#playground">Try the Playground</a></Button>
                  </div>
                </TableCell>
              </TableRow>
            )}
            {rows.map((r, i) => {
              const status = rowStatus(r)
              return (
                <TableRow
                  key={r.id ?? `${r.ts}-${i}`}
                  onClick={() => setDetail(r)}
                  className={cn(
                    'cursor-pointer [&>td]:py-3 sm:[&>td]:py-2',
                    status === 'failed' && 'bg-destructive/[0.04] hover:bg-destructive/[0.07]',
                  )}
                >
                  <TableCell className="font-mono text-xs whitespace-nowrap">
                    {new Date(r.ts * 1000).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </TableCell>
                  <TableCell className="max-w-[130px] truncate text-[13px] text-muted-foreground">{r.key}</TableCell>
                  <TableCell className="font-mono text-xs whitespace-nowrap text-muted-foreground">{rowEndpoint(r)}</TableCell>
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
                  <TableCell><StatusCell status={status} /></TableCell>
                  <TableCell className="text-right">
                    {r.req_id ? (
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          void navigator.clipboard.writeText(r.req_id!)
                          toast.success('Request ID copied.')
                        }}
                        title={r.req_id}
                        className="rounded px-1 py-0.5 font-mono text-[10.5px] text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                      >
                        …{r.req_id.slice(-8)}
                      </button>
                    ) : (
                      <span className="font-mono text-[10.5px] text-muted-foreground">·</span>
                    )}
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
        {rows.length > 0 && (
          <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-2 font-mono text-[10.5px] text-muted-foreground">
            <span>
              {statusFilter === 'all'
                ? `${rows.length} ${nextBefore ? 'newest ' : ''}requests in this window${nextBefore ? '' : ' — that is all of them'}`
                : `${rows.length} of ${allRows.length} loaded requests match this filter`}
            </span>
            {nextBefore && (
              <Button size="sm" variant="ghost" className="h-9 shrink-0 px-2 font-mono text-[10.5px] sm:h-7" onClick={loadMore} disabled={loadingMore}>
                {loadingMore ? 'Loading…' : 'Load older'}
              </Button>
            )}
          </div>
        )}
      </Card>

      <Sheet open={detail !== null} onOpenChange={(o) => !o && setDetail(null)}>
        <SheetContent className="w-full overflow-y-auto p-4 sm:max-w-lg sm:p-6">
          <SheetHeader className="p-0">
            <SheetTitle className="font-display text-xl">Request details</SheetTitle>
            <span className="mt-1 block h-1 w-10 rounded-full bg-primary" />
          </SheetHeader>
          {detail && (
            <div className="space-y-6 pb-8">
              <div className="flex flex-wrap gap-2">
                <span className="rounded-full border border-primary/30 bg-primary/10 px-3 py-1 font-mono text-xs text-primary">canonn-r1</span>
                {detail.stream && (
                  <span className="rounded-full bg-secondary px-3 py-1 font-mono text-xs">stream</span>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                {[
                  { l: 'Latency', v: detail.ms ? `${(detail.ms / 1000).toFixed(1)}s` : '·' },
                  { l: 'Throughput', v: detail.tok_s ? `${detail.tok_s} tok/s` : '·' },
                  { l: 'Cost', v: detail.cost !== undefined ? `$${detail.cost.toFixed(4)}` : '·' },
                ].map((s) => (
                  <div key={s.l} className="min-w-0 rounded-xl border border-border bg-card p-3">
                    <div className="font-mono text-[10.5px] tracking-[0.1em] text-muted-foreground uppercase">{s.l}</div>
                    <div className="mt-1 font-display text-sm font-semibold whitespace-nowrap">{s.v}</div>
                  </div>
                ))}
              </div>

              <div className="rounded-xl border border-border bg-card p-3">
                <div className="font-mono text-[10.5px] tracking-[0.1em] text-muted-foreground uppercase">Tokens</div>
                <div className="mt-1 font-display text-lg font-semibold tabular-nums">
                  {fmt(detail.pt)} <span className="text-muted-foreground">→</span> {fmt(detail.ct)}
                </div>
              </div>

              <div>
                <h3 className="mb-2 font-display text-base font-semibold">Overview</h3>
                <dl className="space-y-2 text-sm">
                  {[
                    ['Model ID', 'canonn-r1'],
                    ['Endpoint', detail.endpoint || `/v1${rowEndpoint(detail)}`],
                    ['Type', detail.mode || '·'],
                    ['HTTP status', detail.status ? String(detail.status) : '·'],
                    ['Finish reason', detail.finish ?? 'stop'],
                    ['Streaming', String(detail.stream ?? false)],
                    ['Data policy', 'No training on your data'],
                  ].map(([k, v]) => (
                    <div key={k} className="grid grid-cols-1 gap-0.5 sm:grid-cols-[130px_1fr] sm:gap-3">
                      <dt className="text-muted-foreground">{k}</dt>
                      <dd className="font-mono text-xs break-words [overflow-wrap:anywhere]">{v}</dd>
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
                    <div key={k} className="grid grid-cols-1 gap-0.5 sm:grid-cols-[130px_1fr] sm:gap-3">
                      <dt className="text-muted-foreground">{k}</dt>
                      <dd className="font-mono text-xs break-words [overflow-wrap:anywhere]">{v}</dd>
                    </div>
                  ))}
                </dl>
              </div>

              <JsonView title="Request JSON" value={detail} />

              <div>
                <div className="mb-2 flex items-center gap-2">
                  <span className="h-3.5 w-1 rounded-full bg-primary" />
                  <h3 className="font-display text-base font-semibold">Prompt &amp; completion</h3>
                </div>
                {!me?.io_logging && (
                  <div className="rounded-xl border border-dashed border-border bg-card p-4 text-center">
                    <p className="text-sm font-medium">I/O logging is not enabled</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Enable I/O logging to view prompt and completion data for your requests. Applies to new requests only.
                    </p>
                    <Button size="sm" className="mt-3 h-9 sm:h-7" onClick={enableIo}>Enable I/O logging</Button>
                  </div>
                )}
                {me?.io_logging && ioState === 'loading' && (
                  <div className="space-y-3">
                    <Skeleton className="h-24 w-full rounded-xl" />
                    <Skeleton className="h-16 w-full rounded-xl" />
                  </div>
                )}
                {me?.io_logging && ioState === 'missing' && (
                  <p className="font-mono text-xs text-muted-foreground">
                    No logged bodies for this request — it predates I/O logging being enabled.
                  </p>
                )}
                {me?.io_logging && io && (
                  <div className="space-y-3">
                    <JsonView title="Prompt" value={io.prompt} />
                    <div className="overflow-hidden rounded-xl border border-border bg-card">
                      <div className="border-b border-border px-3 py-2 font-mono text-[10.5px] tracking-[0.14em] text-muted-foreground uppercase">Completion</div>
                      <div className="max-h-72 overflow-auto p-3 text-sm leading-relaxed whitespace-pre-wrap">{io.completion}</div>
                    </div>
                  </div>
                )}
              </div>

              <p className="font-mono text-[10.5px] text-muted-foreground">
                {me?.io_logging
                  ? 'I/O logging is on: prompt and completion bodies are stored for your keys. Turn it off any time in this panel.'
                  : 'Prompt and completion text is never stored unless you enable I/O logging. Only metrics are logged.'}
              </p>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  )
}

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ArrowUp, ChevronDown, ClipboardType, FileText, Globe, Headset, Link2,
  Loader2, Network, Plus, Trash2, Upload, X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import {
  deleteFile, listFiles, streamChat, uploadBinaryFile, uploadFromUrl,
  uploadFromZendesk, uploadTextFile,
  type GroundedCitation, type KnowledgeFile,
} from '@/lib/api'

// The dashboard twin of the app's Chat + Knowledge screens, running entirely
// on the public API: /v1/files for ingestion, streamed grounded completions
// for answers. Same visual language as the app - terracotta only where the
// eye should go, mono uppercase labels, citation cards under every answer.

const ACCENT = '#c96442'

type LoaderId = 'upload' | 'paste' | 'web' | 'crawl' | 'pdf' | 'zendesk'

const LOADERS: { id: LoaderId; name: string; blurb: string; icon: typeof Globe }[] = [
  { id: 'upload', name: 'Upload files', blurb: 'txt · md · json · html — 1 MB each', icon: Upload },
  { id: 'pdf', name: 'PDF', blurb: 'Text extracted in your browser, page by page', icon: FileText },
  { id: 'paste', name: 'Paste text', blurb: 'A policy, an email thread, a snippet of notes', icon: ClipboardType },
  { id: 'web', name: 'Web page', blurb: 'Fetch one URL and strip it to clean text', icon: Link2 },
  { id: 'crawl', name: 'Website crawl', blurb: 'Follow links from a starting page, up to 8 pages', icon: Network },
  { id: 'zendesk', name: 'Zendesk Help Center', blurb: 'Every public article, straight from the API', icon: Headset },
]

// The rest of the app's loader catalog. Connector sync lands on the API
// next; until then the catalog is honest about where each one runs.
const COMING = ['Notion', 'Google Drive', 'Slack', 'GitHub', 'Confluence', 'Jira',
  'Intercom', 'HubSpot', 'Salesforce', 'Dropbox', 'Linear', 'Airtable']

interface Turn {
  role: 'user' | 'assistant'
  content: string
  citations?: GroundedCitation[]
  grounded: boolean
  error?: boolean
}

export function Playground({ getToken }: { getToken: () => Promise<string | null> }) {
  const [files, setFiles] = useState<KnowledgeFile[] | null>(null)
  const [turns, setTurns] = useState<Turn[]>([])
  const [question, setQuestion] = useState('')
  const [busy, setBusy] = useState(false)
  const [uploading, setUploading] = useState<string | null>(null)
  const [picker, setPicker] = useState(false)
  const [form, setForm] = useState<LoaderId | null>(null)
  const [formTitle, setFormTitle] = useState('')
  const [formText, setFormText] = useState('')
  const [dragOver, setDragOver] = useState(false)
  // Scope: which sources answer questions. Off is remembered locally so a
  // toggled-out source stays out across visits (the server has no flag).
  const [disabled, setDisabled] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem('pg.scope.off') ?? '[]')) } catch { return new Set() }
  })
  const toggleScope = (id: string) => setDisabled((prev) => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    localStorage.setItem('pg.scope.off', JSON.stringify([...next]))
    return next
  })
  const fileInput = useRef<HTMLInputElement>(null)
  const pdfInput = useRef<HTMLInputElement>(null)
  const scroller = useRef<HTMLDivElement>(null)

  const withToken = useCallback(async <T,>(fn: (t: string) => Promise<T>): Promise<T> => {
    const t = await getToken()
    if (!t) throw new Error('sign in required')
    return fn(t)
  }, [getToken])

  const refresh = useCallback(() => {
    withToken((t) => listFiles(t)).then((r) => setFiles(r.data)).catch(() => setFiles([]))
  }, [withToken])

  useEffect(() => { refresh() }, [refresh])
  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight })
  }, [turns])

  function fail(e: unknown) {
    alert(e instanceof Error ? e.message : 'failed')
  }

  async function ingest(label: string, work: (t: string) => Promise<unknown>) {
    setUploading(label)
    try {
      await withToken(work)
      setForm(null)
      setFormTitle('')
      setFormText('')
      refresh()
    } catch (e) {
      fail(e)
    } finally {
      setUploading(null)
    }
  }

  const addFiles = (list: FileList | File[]) =>
    ingest('Uploading…', async (t) => {
      for (const file of Array.from(list)) await uploadBinaryFile(t, file)
    })

  const addPdfs = (list: FileList) =>
    ingest('Extracting PDF…', async (t) => {
      const pdfjs = await import('pdfjs-dist')
      const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url')
      pdfjs.GlobalWorkerOptions.workerSrc = worker.default
      for (const file of Array.from(list)) {
        const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise
        const pages: string[] = []
        for (let p = 1; p <= doc.numPages; p += 1) {
          const content = await (await doc.getPage(p)).getTextContent()
          pages.push(content.items.map((i) => ('str' in i ? i.str : '')).join(' '))
        }
        const text = pages.join('\n\n').replace(/[ \t]+/g, ' ').trim()
        if (!text) throw new Error(`${file.name}: no extractable text`)
        await uploadTextFile(t, file.name.replace(/\.pdf$/i, '.txt'), text)
      }
    })

  async function ask() {
    const q = question.trim()
    if (!q || busy) return
    const scope = (files ?? []).filter((f) => !disabled.has(f.id)).map((f) => f.id)
    const grounded = scope.length > 0
    setQuestion('')
    setBusy(true)
    const history = turns.filter((t) => !t.error).map(({ role, content }) => ({ role, content }))
    setTurns((ts) => [...ts, { role: 'user', content: q, grounded }, { role: 'assistant', content: '', grounded }])
    try {
      const token = await getToken()
      if (!token) throw new Error('sign in required')
      for await (const event of streamChat(token, [...history, { role: 'user', content: q }], grounded ? scope : null)) {
        setTurns((ts) => {
          const next = [...ts]
          const last = { ...next[next.length - 1] }
          if (event.kind === 'token') last.content += event.text
          else last.citations = event.citations
          next[next.length - 1] = last
          return next
        })
      }
    } catch (e) {
      setTurns((ts) => {
        const next = [...ts]
        next[next.length - 1] = {
          role: 'assistant', grounded: false, error: true,
          content: e instanceof Error ? e.message : 'request failed',
        }
        return next
      })
    } finally {
      setBusy(false)
    }
  }

  const ready = (files ?? []).length > 0
  const inScope = (files ?? []).filter((f) => !disabled.has(f.id))
  const scopePassages = inScope.reduce((n, f) => n + f.chunk_count, 0)

  return (
    <div className="flex h-[calc(100vh-8.5rem)] min-h-[480px] flex-col gap-4 lg:flex-row lg:items-stretch">
      {/* ---- Sources ---- */}
      <div className="flex shrink-0 flex-col rounded-2xl border border-border bg-card lg:w-[320px]">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <span className="font-mono text-[10px] tracking-[0.14em] text-muted-foreground uppercase">Knowledge</span>
          <Button size="sm" variant="ghost" className="h-7 gap-1 px-2 text-xs" onClick={() => { setPicker(true); setForm(null) }}>
            <Plus className="size-3.5" /> Add source
          </Button>
        </div>

        <input ref={fileInput} type="file" multiple accept=".txt,.md,.markdown,.json,.html,.htm,.csv" className="hidden"
          onChange={(e) => e.target.files?.length && addFiles(e.target.files)} />
        <input ref={pdfInput} type="file" multiple accept=".pdf" className="hidden"
          onChange={(e) => e.target.files?.length && addPdfs(e.target.files)} />

        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault(); setDragOver(false)
            const dropped = Array.from(e.dataTransfer.files)
            const pdfs = dropped.filter((f) => f.name.toLowerCase().endsWith('.pdf'))
            const rest = dropped.filter((f) => !f.name.toLowerCase().endsWith('.pdf'))
            if (pdfs.length) { const dt = new DataTransfer(); pdfs.forEach((f) => dt.items.add(f)); addPdfs(dt.files) }
            if (rest.length) addFiles(rest)
          }}
          className={cn('flex-1 overflow-y-auto px-2 py-2 transition-colors', dragOver && 'bg-secondary/60')}
        >
          {files === null && <div className="px-2 py-6 text-center text-xs text-muted-foreground">Loading…</div>}
          {files?.length === 0 && (
            <button
              onClick={() => setPicker(true)}
              className="w-full rounded-xl border border-dashed border-border px-4 py-8 text-center text-xs text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground"
            >
              Drop documents here, or add a source.
              <div className="mt-1 font-mono text-[10px] opacity-70">files · pdf · web · zendesk</div>
            </button>
          )}
          {files?.map((f) => (
            <div key={f.id} className="group flex items-center gap-2.5 rounded-lg px-2 py-2 hover:bg-secondary/50">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-md border border-border bg-background">
                <FileText className="size-3.5 text-muted-foreground" />
              </span>
              <div className={cn('min-w-0 flex-1 transition-opacity', disabled.has(f.id) && 'opacity-45')}>
                <div className="truncate text-[13px] font-medium">{f.filename}</div>
                <div className="font-mono text-[10.5px] text-muted-foreground">
                  {f.chunk_count} passages · {(f.bytes / 1024).toFixed(1)} KB{disabled.has(f.id) ? ' · out of scope' : ''}
                </div>
              </div>
              <Switch
                checked={!disabled.has(f.id)}
                onCheckedChange={() => toggleScope(f.id)}
                className="shrink-0 data-[state=checked]:bg-[#c96442]"
                aria-label={`Include ${f.filename} in answers`}
              />
              <button
                onClick={() => withToken((t) => deleteFile(t, f.id)).then(refresh).catch(fail)}
                className="hidden size-6 shrink-0 items-center justify-center rounded text-muted-foreground group-hover:flex hover:text-destructive"
                aria-label={`Delete ${f.filename}`}
              >
                <Trash2 className="size-3.5" />
              </button>
            </div>
          ))}
          {uploading && (
            <div className="flex items-center gap-2 px-2 py-2 text-xs text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" /> {uploading}
            </div>
          )}
        </div>

        <div className="border-t border-border px-4 py-2.5 font-mono text-[10.5px] text-muted-foreground">
          {ready
            ? `${inScope.length} of ${files!.length} ${files!.length === 1 ? 'source' : 'sources'} · ${scopePassages} passages in scope`
            : 'No sources yet — chat works without them too'}
        </div>
      </div>

      {/* ---- Chat ---- */}
      <div className="flex min-h-0 flex-1 flex-col rounded-2xl border border-border bg-card">
        <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6">
          {turns.length === 0 && (
            <div className="mx-auto flex h-full max-w-md flex-col items-center justify-center text-center">
              <div className="mb-4 flex size-10 items-center justify-center rounded-xl bg-foreground text-lg font-bold text-background">C</div>
              <h2 className="font-serif text-[26px] leading-tight font-semibold tracking-tight">
                The model that trusts your data.
              </h2>
              <p className="mt-3 text-sm text-muted-foreground">
                {inScope.length
                  ? `${inScope.length} ${inScope.length === 1 ? 'source' : 'sources'} in scope. Every answer shows the passages it came from.`
                  : 'Ask anything, or add a source on the left to see grounded answers with citations.'}
              </p>
            </div>
          )}

          {turns.map((turn, i) =>
            turn.role === 'user' ? (
              <div key={i} className="mb-4 flex justify-end">
                <div className="max-w-[85%] rounded-2xl bg-secondary px-4 py-2.5 text-[14px]">{turn.content}</div>
              </div>
            ) : (
              <div key={i} className="mb-6">
                <div className="mb-1.5 font-mono text-[10px] tracking-[0.14em] text-muted-foreground uppercase">
                  Canonn R1
                  {turn.citations?.length
                    ? ` · grounded in ${turn.citations.length} ${turn.citations.length === 1 ? 'passage' : 'passages'}`
                    : (!turn.grounded && !turn.error ? ' · no sources in scope' : '')}
                </div>
                {turn.content === '' && busy && i === turns.length - 1 ? (
                  <div className="flex gap-1 pt-1">
                    {[0, 1, 2].map((d) => (
                      <span key={d} className="size-1.5 animate-pulse rounded-full bg-muted-foreground/60" style={{ animationDelay: `${d * 200}ms` }} />
                    ))}
                  </div>
                ) : (
                  turn.error ? (
                    <div className="text-[14.5px] leading-relaxed text-destructive">{turn.content}</div>
                  ) : (
                    <Answer text={turn.content} />
                  )
                )}
                {!!turn.citations?.length && <Citations citations={turn.citations} />}
              </div>
            ),
          )}
        </div>

        <div className="border-t border-border p-3">
          <div className="flex items-center gap-2 rounded-full border border-input bg-background py-1.5 pr-1.5 pl-4">
            <input
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && ask()}
              placeholder={inScope.length ? `Ask about your ${inScope.length === 1 ? 'source' : `${inScope.length} sources`}…` : 'Ask anything…'}
              disabled={busy}
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground disabled:opacity-60"
            />
            <button
              onClick={ask}
              disabled={busy || !question.trim()}
              className="flex size-8 items-center justify-center rounded-full text-white transition-opacity disabled:opacity-30"
              style={{ background: ACCENT }}
              aria-label="Send"
            >
              <ArrowUp className="size-4" />
            </button>
          </div>
        </div>
      </div>

      {/* ---- Source catalog ---- */}
      {picker && (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 p-4 sm:items-center" onClick={() => setPicker(false)}>
          <div
            className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-border bg-card p-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <span className="font-serif text-lg font-semibold">New source</span>
              <button onClick={() => setPicker(false)} className="text-muted-foreground hover:text-foreground"><X className="size-4" /></button>
            </div>

            {!form && (
              <>
                <div className="grid gap-2 sm:grid-cols-2">
                  {LOADERS.map(({ id, name, blurb, icon: Icon }) => (
                    <button
                      key={id}
                      onClick={() => {
                        if (id === 'upload') { setPicker(false); fileInput.current?.click() }
                        else if (id === 'pdf') { setPicker(false); pdfInput.current?.click() }
                        else setForm(id)
                      }}
                      className="rounded-xl border border-border bg-background p-3 text-left transition-colors hover:border-foreground/30"
                    >
                      <Icon className="mb-2 size-4" style={{ color: ACCENT }} />
                      <div className="text-[13px] font-medium">{name}</div>
                      <div className="mt-0.5 text-[11.5px] leading-snug text-muted-foreground">{blurb}</div>
                    </button>
                  ))}
                </div>
                <div className="mt-4 mb-2 font-mono text-[10px] tracking-[0.12em] text-muted-foreground uppercase">
                  In the app · coming to the API
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {COMING.map((name) => (
                    <span key={name} className="rounded-full border border-border px-2.5 py-1 text-[11.5px] text-muted-foreground">
                      {name}
                    </span>
                  ))}
                </div>
              </>
            )}

            {form && (
              <div>
                <button onClick={() => setForm(null)} className="mb-3 text-xs text-muted-foreground hover:text-foreground">← All sources</button>
                {form === 'paste' && (
                  <>
                    <Input value={formTitle} onChange={(e) => setFormTitle(e.target.value)} placeholder="Title (optional)" className="mb-2 h-9 bg-background text-sm" />
                    <textarea
                      value={formText}
                      onChange={(e) => setFormText(e.target.value)}
                      rows={8}
                      placeholder="Paste the text to answer from…"
                      className="w-full resize-none rounded-lg border border-input bg-background p-2.5 font-mono text-xs leading-relaxed outline-none focus:border-[#c96442]"
                    />
                  </>
                )}
                {(form === 'web' || form === 'crawl') && (
                  <Input value={formText} onChange={(e) => setFormText(e.target.value)} placeholder="https://example.com/help" className="mb-1 h-9 bg-background font-mono text-xs" />
                )}
                {form === 'crawl' && (
                  <p className="mb-1 text-[11.5px] text-muted-foreground">Follows same-site links from this page, up to 8 pages.</p>
                )}
                {form === 'zendesk' && (
                  <>
                    <Input value={formText} onChange={(e) => setFormText(e.target.value)} placeholder="support.yourcompany.com or subdomain" className="mb-1 h-9 bg-background font-mono text-xs" />
                    <p className="mb-1 text-[11.5px] text-muted-foreground">Public help centers only — every article via the Zendesk API.</p>
                  </>
                )}
                <Button
                  onClick={() => {
                    if (form === 'paste') {
                      const name = (formTitle.trim() || 'Pasted text').slice(0, 80)
                      ingest('Adding…', (t) => uploadTextFile(t, name.endsWith('.md') ? name : `${name}.md`, formText))
                    } else if (form === 'web') ingest('Fetching page…', (t) => uploadFromUrl(t, formText.trim(), false))
                    else if (form === 'crawl') ingest('Crawling…', (t) => uploadFromUrl(t, formText.trim(), true))
                    else if (form === 'zendesk') ingest('Importing articles…', (t) => uploadFromZendesk(t, formText.trim()))
                    setPicker(false)
                  }}
                  disabled={!formText.trim() || !!uploading}
                  className="mt-2 h-9 w-full text-sm text-white"
                  style={{ background: ACCENT }}
                >
                  Add source
                </Button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}


function Inline({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`|\[\d+\])/g)
  return (
    <>
      {parts.map((part, i) => {
        if (/^\*\*[^*]+\*\*$/.test(part)) return <strong key={i} className="font-semibold">{part.slice(2, -2)}</strong>
        if (/^`[^`]+`$/.test(part)) {
          return <code key={i} className="rounded bg-secondary px-1 py-0.5 font-mono text-[12.5px]">{part.slice(1, -1)}</code>
        }
        if (/^\[\d+\]$/.test(part)) return <sup key={i} className="font-mono text-[11px] font-semibold" style={{ color: ACCENT }}>{part}</sup>
        return <span key={i}>{part}</span>
      })}
    </>
  )
}

function Answer({ text }: { text: string }) {
  const blocks = text.split(/\n/)
  return (
    <div className="space-y-1 text-[14.5px] leading-relaxed">
      {blocks.map((line, i) => {
        const heading = line.match(/^(#{1,6})\s+(.*)$/)
        if (heading) {
          return (
            <div key={i} className={cn('pt-1 font-semibold', heading[1].length <= 2 ? 'text-[16px]' : 'text-[14.5px]')}>
              <Inline text={heading[2]} />
            </div>
          )
        }
        const bullet = line.match(/^\s*(?:[-*•]|\d+\.)\s+(.*)$/)
        if (bullet) {
          return (
            <div key={i} className="flex gap-2 pl-1">
              <span className="mt-[9px] size-1 shrink-0 rounded-full bg-muted-foreground" />
              <span className="min-w-0"><Inline text={bullet[1]} /></span>
            </div>
          )
        }
        if (!line.trim()) return <div key={i} className="h-1.5" />
        return <div key={i}><Inline text={line} /></div>
      })}
    </div>
  )
}

function Citations({ citations }: { citations: GroundedCitation[] }) {
  const [open, setOpen] = useState<number | null>(null)
  const sources = new Set(citations.map((c) => c.file_id)).size
  return (
    <div className="mt-3">
      <div className="mb-1.5 font-mono text-[10px] tracking-[0.14em] text-muted-foreground uppercase">
        Answered from {sources} {sources === 1 ? 'source' : 'sources'}
      </div>
      <div className="space-y-1.5">
        {citations.slice(0, 6).map((c, i) => (
          <button
            key={`${c.file_id}-${c.ordinal}`}
            onClick={() => setOpen(open === i ? null : i)}
            className="block w-full rounded-xl border border-border bg-secondary/40 px-3.5 py-2.5 text-left transition-colors hover:bg-secondary/70"
          >
            <div className="flex items-center gap-2">
              <span className="font-mono text-[11px] font-semibold" style={{ color: ACCENT }}>{i + 1}</span>
              <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium">{c.filename}</span>
              <span className="font-mono text-[10px] text-muted-foreground">§{c.ordinal + 1}</span>
              <ChevronDown className={cn('size-3.5 text-muted-foreground transition-transform', open === i && 'rotate-180')} />
            </div>
            {open === i && c.excerpt && (
              <div className="mt-2 border-t border-border/60 pt-2 font-mono text-[11.5px] leading-relaxed whitespace-pre-wrap text-muted-foreground">
                {c.excerpt}
              </div>
            )}
          </button>
        ))}
      </div>
    </div>
  )
}

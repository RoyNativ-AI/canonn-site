import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowUp, ChevronDown, FileText, Loader2, Plus, Trash2, Upload, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import {
  deleteFile, groundedChat, listFiles, uploadBinaryFile, uploadTextFile,
  type GroundedCitation, type KnowledgeFile,
} from '@/lib/api'

// The dashboard twin of the app's Chat + Knowledge screens: same server,
// same retrieval, same visual language - quiet warm cards, terracotta only
// where the eye should go, mono uppercase labels, citation cards under every
// answer. Everything here runs through the public /v1/files + grounded
// chat API, so what a customer tries here is exactly what they integrate.

const ACCENT = '#c96442'

interface Turn {
  role: 'user' | 'assistant'
  content: string
  citations?: GroundedCitation[]
  seconds?: number
  error?: boolean
}

export function Playground({ getToken }: { getToken: () => Promise<string | null> }) {
  const [files, setFiles] = useState<KnowledgeFile[] | null>(null)
  const [turns, setTurns] = useState<Turn[]>([])
  const [question, setQuestion] = useState('')
  const [busy, setBusy] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [pasteOpen, setPasteOpen] = useState(false)
  const [pasteTitle, setPasteTitle] = useState('')
  const [pasteText, setPasteText] = useState('')
  const [dragOver, setDragOver] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)
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
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: 'smooth' })
  }, [turns])

  async function addFiles(list: FileList | File[]) {
    setUploading(true)
    try {
      for (const file of Array.from(list)) {
        await withToken((t) => uploadBinaryFile(t, file))
      }
      refresh()
    } catch (e) {
      alert(e instanceof Error ? e.message : 'upload failed')
    } finally {
      setUploading(false)
    }
  }

  async function addPasted() {
    if (!pasteText.trim()) return
    setUploading(true)
    try {
      const name = (pasteTitle.trim() || 'Pasted text').replace(/[^\w.\- ]+/g, '').slice(0, 80) || 'Pasted text'
      await withToken((t) => uploadTextFile(t, name.endsWith('.md') ? name : `${name}.md`, pasteText))
      setPasteOpen(false)
      setPasteTitle('')
      setPasteText('')
      refresh()
    } catch (e) {
      alert(e instanceof Error ? e.message : 'upload failed')
    } finally {
      setUploading(false)
    }
  }

  async function ask() {
    const q = question.trim()
    if (!q || busy) return
    setQuestion('')
    setBusy(true)
    setTurns((ts) => [...ts, { role: 'user', content: q }])
    try {
      const history = turns.map(({ role, content }) => ({ role, content }))
      const res = await withToken((t) => groundedChat(t, [...history, { role: 'user', content: q }]))
      setTurns((ts) => [...ts, { role: 'assistant', content: res.answer, citations: res.citations, seconds: res.seconds }])
    } catch (e) {
      setTurns((ts) => [...ts, { role: 'assistant', content: e instanceof Error ? e.message : 'request failed', error: true }])
    } finally {
      setBusy(false)
    }
  }

  const ready = (files ?? []).length > 0
  const passages = (files ?? []).reduce((n, f) => n + f.chunk_count, 0)

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(260px,340px)_1fr] lg:items-start">
      {/* ---- Sources ---- */}
      <div className="rounded-2xl border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <span className="font-mono text-[10px] tracking-[0.14em] text-muted-foreground uppercase">Knowledge</span>
          <div className="flex gap-1">
            <Button size="sm" variant="ghost" className="h-7 gap-1 px-2 text-xs" onClick={() => setPasteOpen(true)}>
              <Plus className="size-3.5" /> Paste
            </Button>
            <Button size="sm" variant="ghost" className="h-7 gap-1 px-2 text-xs" onClick={() => fileInput.current?.click()}>
              <Upload className="size-3.5" /> Upload
            </Button>
          </div>
        </div>

        <input
          ref={fileInput}
          type="file"
          multiple
          accept=".txt,.md,.markdown,.json,.html,.htm,.csv"
          className="hidden"
          onChange={(e) => e.target.files && addFiles(e.target.files)}
        />

        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => { e.preventDefault(); setDragOver(false); addFiles(e.dataTransfer.files) }}
          className={cn('px-2 py-2 transition-colors', dragOver && 'bg-secondary/60')}
        >
          {files === null && (
            <div className="px-2 py-6 text-center text-xs text-muted-foreground">Loading…</div>
          )}
          {files?.length === 0 && !pasteOpen && (
            <button
              onClick={() => fileInput.current?.click()}
              className="w-full rounded-xl border border-dashed border-border px-4 py-8 text-center text-xs text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground"
            >
              Drop documents here, or click to choose.
              <div className="mt-1 font-mono text-[10px] opacity-70">txt · md · json · html — 1 MB max</div>
            </button>
          )}
          {files?.map((f) => (
            <div key={f.id} className="group flex items-center gap-2.5 rounded-lg px-2 py-2 hover:bg-secondary/50">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-md border border-border bg-background">
                <FileText className="size-3.5 text-muted-foreground" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] font-medium">{f.filename}</div>
                <div className="font-mono text-[10.5px] text-muted-foreground">
                  {f.chunk_count} passages · {(f.bytes / 1024).toFixed(1)} KB
                </div>
              </div>
              <button
                onClick={() => withToken((t) => deleteFile(t, f.id)).then(refresh)}
                className="hidden size-6 shrink-0 items-center justify-center rounded text-muted-foreground group-hover:flex hover:text-destructive"
                aria-label={`Delete ${f.filename}`}
              >
                <Trash2 className="size-3.5" />
              </button>
            </div>
          ))}
          {uploading && (
            <div className="flex items-center gap-2 px-2 py-2 text-xs text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" /> Processing…
            </div>
          )}
        </div>

        {pasteOpen && (
          <div className="border-t border-border p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="font-mono text-[10px] tracking-[0.12em] text-muted-foreground uppercase">Paste text</span>
              <button onClick={() => setPasteOpen(false)} className="text-muted-foreground hover:text-foreground"><X className="size-3.5" /></button>
            </div>
            <Input
              value={pasteTitle}
              onChange={(e) => setPasteTitle(e.target.value)}
              placeholder="Title (optional)"
              className="mb-2 h-8 bg-background text-xs"
            />
            <textarea
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              rows={6}
              placeholder="Drop in a policy, an email thread, a snippet of notes…"
              className="w-full resize-none rounded-lg border border-input bg-background p-2.5 font-mono text-xs leading-relaxed outline-none focus:border-[#c96442]"
            />
            <Button
              size="sm"
              onClick={addPasted}
              disabled={!pasteText.trim() || uploading}
              className="mt-2 h-7 w-full text-xs text-white"
              style={{ background: ACCENT }}
            >
              Add source
            </Button>
          </div>
        )}

        {ready && (
          <div className="border-t border-border px-4 py-2.5 font-mono text-[10.5px] text-muted-foreground">
            {files!.length} {files!.length === 1 ? 'source' : 'sources'} · {passages} passages in scope
          </div>
        )}
      </div>

      {/* ---- Chat ---- */}
      <div className="flex min-h-[540px] flex-col rounded-2xl border border-border bg-card">
        <div ref={scroller} className="flex-1 overflow-y-auto px-4 py-5 sm:px-6" style={{ maxHeight: '62vh' }}>
          {turns.length === 0 && (
            <div className="mx-auto max-w-md pt-10 text-center">
              <div className="mx-auto mb-4 flex size-10 items-center justify-center rounded-xl bg-foreground text-background text-lg font-bold">C</div>
              <h2 className="font-serif text-[26px] leading-tight font-semibold tracking-tight">
                The model that trusts your data.
              </h2>
              <p className="mt-3 text-sm text-muted-foreground">
                {ready
                  ? `${files!.length} ${files!.length === 1 ? 'source' : 'sources'} in scope. Every answer shows the passages it came from.`
                  : 'Add a document on the left, then ask about it. Canonn answers from what you upload — and says so when the answer is not there.'}
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
                  Canonn R1{turn.citations?.length ? ` · grounded in ${turn.citations.length} ${turn.citations.length === 1 ? 'passage' : 'passages'}` : ''}
                  {turn.seconds != null ? ` · ${turn.seconds}s` : ''}
                </div>
                <div className={cn('text-[14.5px] leading-relaxed whitespace-pre-wrap', turn.error && 'text-destructive')}>
                  {turn.content}
                </div>
                {!!turn.citations?.length && <Citations citations={turn.citations} />}
              </div>
            ),
          )}

          {busy && (
            <div className="mb-6">
              <div className="mb-1.5 font-mono text-[10px] tracking-[0.14em] text-muted-foreground uppercase">Canonn R1</div>
              <div className="flex gap-1 pt-1">
                {[0, 1, 2].map((d) => (
                  <span
                    key={d}
                    className="size-1.5 animate-pulse rounded-full bg-muted-foreground/60"
                    style={{ animationDelay: `${d * 200}ms` }}
                  />
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="border-t border-border p-3">
          <div className="flex items-center gap-2 rounded-full border border-input bg-background py-1.5 pr-1.5 pl-4">
            <input
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && ask()}
              placeholder={ready ? `Ask about your ${files!.length === 1 ? 'source' : `${files!.length} sources`}…` : 'Add a source first…'}
              disabled={!ready || busy}
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground disabled:opacity-60"
            />
            <button
              onClick={ask}
              disabled={!ready || busy || !question.trim()}
              className="flex size-8 items-center justify-center rounded-full text-white transition-opacity disabled:opacity-30"
              style={{ background: ACCENT }}
              aria-label="Send"
            >
              <ArrowUp className="size-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function Citations({ citations }: { citations: GroundedCitation[] }) {
  const [open, setOpen] = useState<number | null>(null)
  const scored = citations.filter((c) => c.score > 0)
  const support = citations.length - scored.length
  return (
    <div className="mt-3">
      <div className="mb-1.5 font-mono text-[10px] tracking-[0.14em] text-muted-foreground uppercase">
        Answered from {new Set(citations.map((c) => c.file_id)).size} {new Set(citations.map((c) => c.file_id)).size === 1 ? 'source' : 'sources'}
        {support > 0 ? ` · ${support} supporting` : ''}
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

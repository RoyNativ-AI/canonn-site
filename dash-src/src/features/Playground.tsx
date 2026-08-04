import { useEffect, useMemo, useRef, useState } from 'react'
import { useSession } from '@clerk/clerk-react'
import { BookOpenText, Plus, SendHorizonal, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { buildSystem, chunk, retrieve, type Citation, type Source } from '@/lib/knowledge'

interface Turn {
  q: string
  a: string
  done: boolean
  seconds?: number
  citations?: Citation[]
  error?: string
}

const SAMPLE: Source = {
  id: 'sample',
  title: 'Plans & Pricing',
  text: `Single sign-on (SSO) is included in the Business plan and above.

Priority support:
Pro - priority email support (24h response).
Business - priority chat and email (4h response).
Enterprise - dedicated support engineer with a 1h SLA.

Customer data is stored in EU data centers (Frankfurt).`,
  enabled: true,
}

function loadSources(): Source[] {
  try {
    const raw = localStorage.getItem('canonn.play.sources')
    if (raw) return JSON.parse(raw) as Source[]
  } catch { /* fresh start */ }
  return [SAMPLE]
}

export function Playground() {
  const { session } = useSession()
  const [sources, setSources] = useState<Source[]>(loadSources)
  const [addOpen, setAddOpen] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newText, setNewText] = useState('')
  const [question, setQuestion] = useState('')
  const [turns, setTurns] = useState<Turn[]>([])
  const [busy, setBusy] = useState(false)
  const threadRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    localStorage.setItem('canonn.play.sources', JSON.stringify(sources))
  }, [sources])

  const chunks = useMemo(
    () => sources.filter((s) => s.enabled).flatMap((s) => chunk(s)),
    [sources],
  )

  const scrollDown = () => queueMicrotask(() => threadRef.current?.scrollTo({ top: 1e9, behavior: 'smooth' }))

  async function ask() {
    const q = question.trim()
    if (!q || !session || busy) return
    if (chunks.length === 0) return
    setBusy(true)
    setQuestion('')

    const passages = retrieve(chunks, q)
    const citations: Citation[] = passages.map((p) => ({
      sourceTitle: p.sourceTitle,
      ordinal: p.ordinal,
      score: p.score,
      excerpt: p.text.slice(0, 140),
    }))
    setTurns((t) => [...t, { q, a: '', done: false, citations }])
    scrollDown()
    const t0 = performance.now()

    try {
      const token = await session.getToken()
      const res = await fetch('https://api.canonn.ai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          model: 'canonn-r1',
          mode: 'balanced',
          stream: true,
          max_tokens: 700,
          messages: [
            { role: 'system', content: buildSystem(passages) },
            { role: 'user', content: q },
          ],
        }),
      })
      if (!res.ok || !res.body) {
        const b = await res.json().catch(() => ({}))
        throw new Error((b as { error?: string }).error ?? `request failed (${res.status})`)
      }
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let pending = ''
      for (;;) {
        const { value, done } = await reader.read()
        if (done) break
        pending += decoder.decode(value, { stream: true })
        const lines = pending.split('\n')
        pending = lines.pop() ?? ''
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const payload = line.slice(6)
          if (payload === '[DONE]') continue
          try {
            const j = JSON.parse(payload)
            const delta: string = j.choices?.[0]?.delta?.content ?? ''
            if (delta) {
              setTurns((t) => t.map((turn, i) => (i === t.length - 1 ? { ...turn, a: turn.a + delta } : turn)))
              scrollDown()
            }
          } catch { /* keepalive or partial frame */ }
        }
      }
      const seconds = Math.round((performance.now() - t0) / 100) / 10
      setTurns((t) => t.map((turn, i) => (i === t.length - 1 ? { ...turn, done: true, seconds } : turn)))
    } catch (e) {
      setTurns((t) =>
        t.map((turn, i) =>
          i === t.length - 1 ? { ...turn, done: true, error: e instanceof Error ? e.message : 'failed' } : turn,
        ),
      )
    } finally {
      setBusy(false)
      scrollDown()
    }
  }

  function addSource() {
    const title = newTitle.trim() || 'Untitled'
    const text = newText.trim()
    if (!text) return
    setSources((s) => [...s, { id: crypto.randomUUID(), title, text, enabled: true }])
    setNewTitle('')
    setNewText('')
    setAddOpen(false)
  }

  const passageCount = chunks.length

  return (
    <div className="flex h-full flex-col">
      <div className="mb-6">
        <h1 className="font-display text-[32px] font-semibold tracking-tight">Playground</h1>
        <p className="text-sm text-muted-foreground">
          Your knowledge base, retrieved and answered live · {sources.filter((s) => s.enabled).length} sources · {passageCount} passages
        </p>
      </div>

      <div className="grid min-h-0 flex-1 gap-5 lg:grid-cols-[0.85fr_1.15fr]">
        <Card className="flex min-h-[300px] flex-col gap-0 self-start overflow-hidden py-0">
          <div className="flex items-center border-b border-border bg-secondary/50 px-4 py-2.5">
            <span className="font-mono text-[10px] tracking-[0.12em] text-muted-foreground uppercase">Knowledge</span>
            <Button size="sm" variant="ghost" onClick={() => setAddOpen(true)} className="ml-auto h-7 gap-1 px-2 font-mono text-[11px]">
              <Plus className="size-3.5" /> Add source
            </Button>
          </div>
          <div className="divide-y divide-border">
            {sources.map((s) => {
              const n = s.enabled ? chunk(s).length : 0
              return (
                <div key={s.id} className="flex items-center gap-3 px-4 py-3">
                  <BookOpenText className="size-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{s.title}</div>
                    <div className="font-mono text-[10.5px] text-muted-foreground">
                      {s.enabled ? `${n} passages · ${(s.text.length / 1000).toFixed(1)}K chars` : 'disabled'}
                    </div>
                  </div>
                  <Switch checked={s.enabled} onCheckedChange={(v) => setSources((all) => all.map((x) => (x.id === s.id ? { ...x, enabled: v } : x)))} />
                  <button
                    onClick={() => setSources((all) => all.filter((x) => x.id !== s.id))}
                    className="text-muted-foreground transition-colors hover:text-destructive"
                    aria-label={`Delete ${s.title}`}
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
              )
            })}
            {sources.length === 0 && (
              <p className="px-4 py-8 text-center text-sm text-muted-foreground">Add a source to start asking.</p>
            )}
          </div>
        </Card>

        <Card className="flex min-h-[480px] flex-col gap-0 overflow-hidden py-0">
          <div className="flex items-center border-b border-border bg-secondary/50 px-4 py-2.5 font-mono text-[10px] tracking-[0.12em] text-muted-foreground uppercase">
            Chat
            <span className="ml-auto flex items-center gap-1.5 normal-case tracking-normal">
              <span className="size-1.5 rounded-full bg-[#3f7d54] shadow-[0_0_6px_#3f7d54]" />
              canonn-r1 · streaming
            </span>
          </div>
          <div ref={threadRef} className="flex-1 space-y-5 overflow-y-auto p-4">
            {turns.length === 0 && (
              <p className="pt-12 text-center text-sm text-muted-foreground">Ask something about your knowledge base.</p>
            )}
            {turns.map((t, i) => (
              <div key={i} className="space-y-2.5">
                <div className="ml-auto w-fit max-w-[85%] rounded-2xl bg-secondary px-4 py-2.5 text-sm">{t.q}</div>
                <div className="max-w-[94%]">
                  <div className="mb-1 font-mono text-[10px] tracking-[0.14em] text-muted-foreground uppercase">
                    Canonn R1 · grounded in {t.citations?.length ?? 0} passages{t.seconds ? ` · ${t.seconds}s` : ''}
                  </div>
                  {t.error ? (
                    <div className="font-mono text-xs text-destructive">✗ {t.error}</div>
                  ) : (
                    <div className="text-[15px] leading-relaxed whitespace-pre-wrap">
                      {t.a}
                      {!t.done && <span className="ml-0.5 inline-block h-4 w-[7px] animate-pulse bg-[#3f7d54] align-middle" />}
                    </div>
                  )}
                  {t.done && !t.error && t.citations && t.citations.length > 0 && (
                    <div className="mt-3 border-t border-border pt-2.5">
                      <div className="mb-1.5 font-mono text-[10px] tracking-[0.14em] text-muted-foreground uppercase">
                        Answered from {new Set(t.citations.map((c) => c.sourceTitle)).size} source
                        {new Set(t.citations.map((c) => c.sourceTitle)).size > 1 ? 's' : ''}
                      </div>
                      {t.citations.slice(0, 3).map((c, j) => (
                        <div key={j} className="flex items-baseline gap-2 py-0.5 font-mono text-[11.5px] text-muted-foreground">
                          <span className="text-[#c96442]">{j + 1}</span>
                          <span className="truncate text-foreground">{c.sourceTitle}</span>
                          <span>passage {c.ordinal + 1}</span>
                          <span className="text-[#3f7d54]">{Math.round(c.score * 100)}% match</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-2 border-t border-border p-3">
            <input
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && ask()}
              placeholder={chunks.length ? `Ask about your ${sources.filter((s) => s.enabled).length} sources…` : 'Add a source first…'}
              className="h-10 flex-1 rounded-xl bg-secondary px-4 text-sm outline-none placeholder:text-muted-foreground"
            />
            <Button size="icon" onClick={ask} disabled={busy || !question.trim() || chunks.length === 0} className="size-10 rounded-xl">
              <SendHorizonal className="size-4" />
            </Button>
          </div>
        </Card>
      </div>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-display">Add a source</DialogTitle>
            <DialogDescription>Paste any text: a policy, an FAQ, product docs.</DialogDescription>
          </DialogHeader>
          <Input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="Title, e.g. Refund policy" />
          <textarea
            value={newText}
            onChange={(e) => setNewText(e.target.value)}
            rows={9}
            placeholder="Paste the content…"
            className="w-full resize-none rounded-xl border border-input bg-card p-3 font-mono text-xs leading-relaxed outline-none focus:border-[#c96442]"
          />
          <Button onClick={addSource} disabled={!newText.trim()} className="w-full">
            Add source
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  )
}

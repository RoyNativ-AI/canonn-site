import { useRef, useState } from 'react'
import { useSession } from '@clerk/clerk-react'
import { SendHorizonal } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { playgroundChat } from '@/lib/api'
import { cn } from '@/lib/utils'

interface Turn {
  q: string
  a?: string
  seconds?: number
  error?: string
}

const SAMPLE = `Single sign-on (SSO) is included in the Business plan and above.
Priority support: Pro (24h email), Business (4h chat + email), Enterprise (1h SLA, dedicated engineer).
Customer data is stored in EU data centers (Frankfurt).`

export function Playground() {
  const { session } = useSession()
  const [data, setData] = useState(SAMPLE)
  const [mode, setMode] = useState<'balanced' | 'extraction'>('balanced')
  const [question, setQuestion] = useState('')
  const [turns, setTurns] = useState<Turn[]>([])
  const [busy, setBusy] = useState(false)
  const threadRef = useRef<HTMLDivElement>(null)

  async function ask() {
    const q = question.trim()
    if (!q || !data.trim() || !session || busy) return
    setBusy(true)
    setQuestion('')
    setTurns((t) => [...t, { q }])
    queueMicrotask(() => threadRef.current?.scrollTo({ top: 1e9, behavior: 'smooth' }))
    try {
      const token = await session.getToken()
      const res = await playgroundChat(token!, data, q, mode)
      setTurns((t) => t.map((turn, i) => (i === t.length - 1 ? { ...turn, a: res.answer, seconds: res.seconds } : turn)))
    } catch (e) {
      setTurns((t) =>
        t.map((turn, i) => (i === t.length - 1 ? { ...turn, error: e instanceof Error ? e.message : 'failed' } : turn)),
      )
    } finally {
      setBusy(false)
      queueMicrotask(() => threadRef.current?.scrollTo({ top: 1e9, behavior: 'smooth' }))
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-[32px] font-semibold tracking-tight">Playground</h1>
          <p className="text-sm text-muted-foreground">Paste your data, ask questions, watch it stay grounded</p>
        </div>
        <div className="flex rounded-lg border border-input bg-card p-0.5">
          {(['balanced', 'extraction'] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={cn(
                'rounded-md px-3 py-1.5 font-mono text-xs transition-colors',
                mode === m ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {m}
            </button>
          ))}
        </div>
      </div>

      <div className="grid min-h-0 flex-1 gap-5 lg:grid-cols-[0.9fr_1.1fr]">
        <Card className="flex flex-col gap-0 overflow-hidden py-0">
          <div className="border-b border-border bg-secondary/50 px-4 py-2.5 font-mono text-[10px] tracking-[0.12em] text-muted-foreground uppercase">
            Your data
          </div>
          <textarea
            value={data}
            onChange={(e) => setData(e.target.value)}
            className="min-h-[300px] flex-1 resize-none bg-card p-4 font-mono text-[13px] leading-relaxed outline-none"
            placeholder="Paste the knowledge the model should answer from…"
          />
        </Card>

        <Card className="flex min-h-[420px] flex-col gap-0 overflow-hidden py-0">
          <div className="flex items-center border-b border-border bg-secondary/50 px-4 py-2.5 font-mono text-[10px] tracking-[0.12em] text-muted-foreground uppercase">
            Chat
            <span className="ml-auto flex items-center gap-1.5 normal-case tracking-normal">
              <span className="size-1.5 rounded-full bg-[#3f7d54] shadow-[0_0_6px_#3f7d54]" />
              canonn-r1 · {mode}
            </span>
          </div>
          <div ref={threadRef} className="flex-1 space-y-4 overflow-y-auto p-4">
            {turns.length === 0 && (
              <p className="pt-10 text-center text-sm text-muted-foreground">
                Ask something about the data on the left.
              </p>
            )}
            {turns.map((t, i) => (
              <div key={i} className="space-y-3">
                <div className="ml-auto w-fit max-w-[85%] rounded-2xl bg-secondary px-4 py-2.5 text-sm">{t.q}</div>
                {t.a !== undefined && (
                  <div className="max-w-[92%]">
                    <div className="mb-1 font-mono text-[10px] tracking-[0.14em] text-muted-foreground uppercase">
                      Canonn R1 · grounded {t.seconds ? `· ${t.seconds}s` : ''}
                    </div>
                    <div className="text-[15px] leading-relaxed whitespace-pre-wrap">{t.a}</div>
                  </div>
                )}
                {t.error && <div className="font-mono text-xs text-destructive">✗ {t.error}</div>}
                {t.a === undefined && !t.error && (
                  <div className="font-mono text-xs text-muted-foreground">
                    <span className="inline-block animate-pulse">Grounding…</span>
                  </div>
                )}
              </div>
            ))}
          </div>
          <div className="flex items-center gap-2 border-t border-border p-3">
            <input
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && ask()}
              placeholder="Ask about your data…"
              className="h-10 flex-1 rounded-xl bg-secondary px-4 text-sm outline-none placeholder:text-muted-foreground"
            />
            <Button size="icon" onClick={ask} disabled={busy || !question.trim()} className="size-10 rounded-xl">
              <SendHorizonal className="size-4" />
            </Button>
          </div>
        </Card>
      </div>
    </div>
  )
}

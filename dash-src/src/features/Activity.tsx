import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { fmt, type Me } from '@/lib/api'

function Stat({ label, value, money }: { label: string; value: string; money?: boolean }) {
  return (
    <Card className="gap-2 py-5">
      <CardHeader className="px-5">
        <CardTitle className="font-mono text-[10px] font-normal tracking-[0.1em] text-muted-foreground uppercase">
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent className="px-5">
        <div className={`font-display text-[32px] leading-none font-semibold tracking-tight tabular-nums ${money ? 'text-[#3f7d54]' : ''}`}>
          {value}
        </div>
      </CardContent>
    </Card>
  )
}

export function Activity({ me }: { me: Me | null }) {
  const days = me ? Object.keys(me.by_day).sort().slice(-14) : []
  const max = Math.max(1, ...days.map((d) => me!.by_day[d].requests))

  return (
    <div>
      <h1 className="font-display text-[32px] font-semibold tracking-tight">Activity</h1>
      <p className="mb-8 text-sm text-muted-foreground">Your usage across the last 30 days · api.canonn.ai</p>

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <Stat label="Spend (est.)" value={`$${(me?.spend_usd ?? 0).toFixed(2)}`} money />
        <Stat label="Requests" value={fmt(me?.requests ?? 0)} />
        <Stat label="Input tokens" value={fmt(me?.input_tokens ?? 0)} />
        <Stat label="Output tokens" value={fmt(me?.output_tokens ?? 0)} />
      </div>

      <div className="mt-7 grid gap-5 xl:grid-cols-[1.55fr_1fr]">
        <Card className="py-5">
          <CardHeader className="px-5">
            <CardTitle className="font-display text-lg">Requests by day</CardTitle>
          </CardHeader>
          <CardContent className="px-5">
            <div className="flex h-[190px] items-end gap-1.5 border-b border-border pb-0.5">
              {days.length > 0
                ? days.map((d) => {
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
            <div className="mt-2 flex gap-1.5">
              {days.map((d) => (
                <span key={d} className="flex-1 text-center font-mono text-[9px] text-muted-foreground">
                  {d.slice(3)}
                </span>
              ))}
            </div>
            {days.length === 0 && (
              <p className="mt-3 font-mono text-xs text-muted-foreground">No traffic yet. Create a key and make your first call.</p>
            )}
          </CardContent>
        </Card>

        <Card className="overflow-hidden border-[#3a342e] bg-[#211d1a] py-0 text-[#d8d2c8]">
          <div className="flex items-center gap-1.5 border-b border-white/10 bg-[#26221e] px-4 py-3">
            <span className="size-2.5 rounded-full bg-[#ff5f57]" />
            <span className="size-2.5 rounded-full bg-[#febc2e]" />
            <span className="size-2.5 rounded-full bg-[#28c840]" />
            <span className="ml-2 font-mono text-[11px] text-white/40">quick start</span>
          </div>
          <pre className="overflow-x-auto p-5 font-mono text-[12.5px] leading-relaxed">
{`curl https://api.canonn.ai/v1/chat/completions \\
  -H "Authorization: Bearer `}<b className="font-medium text-[#a9c9a4]">YOUR_KEY</b>{`" \\
  -d '{"model":"canonn-r1","messages":[
    {"role":"system","content":"YOUR DATA"},
    {"role":"user","content":"your question"}]}'`}
          </pre>
        </Card>
      </div>
    </div>
  )
}

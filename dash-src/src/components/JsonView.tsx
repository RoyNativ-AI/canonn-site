import { useState, type ReactNode } from 'react'
import { Check, Copy } from 'lucide-react'

// Dependency-free JSON syntax highlighting in the product palette: keys in
// the brand primary, strings green, numbers blue, literals amber.
const TOKEN = /("(?:\\.|[^"\\])*")(\s*:)?|\b(?:true|false|null)\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g

function highlight(text: string): ReactNode[] {
  const nodes: ReactNode[] = []
  let last = 0
  let i = 0
  for (const m of text.matchAll(TOKEN)) {
    const start = m.index ?? 0
    if (start > last) nodes.push(text.slice(last, start))
    const tok = m[0]
    if (m[1] && m[2] !== undefined) {
      nodes.push(<span key={i++} className="text-primary">{m[1]}</span>)
      nodes.push(m[2])
    } else if (tok.startsWith('"')) {
      nodes.push(<span key={i++} className="text-[#3f7d54] dark:text-[#8fc9a0]">{tok}</span>)
    } else if (/^(true|false|null)$/.test(tok)) {
      nodes.push(<span key={i++} className="text-[#b07d2d] dark:text-[#d9a85c]">{tok}</span>)
    } else {
      nodes.push(<span key={i++} className="text-[#3b6ea5] dark:text-[#7fb3e3]">{tok}</span>)
    }
    last = start + tok.length
  }
  if (last < text.length) nodes.push(text.slice(last))
  return nodes
}

export function JsonView({ title = 'JSON', value }: { title?: string; value: unknown }) {
  const [copied, setCopied] = useState(false)
  let text: string
  if (typeof value === 'string') {
    try { text = JSON.stringify(JSON.parse(value), null, 2) } catch { text = value }
  } else {
    text = JSON.stringify(value, null, 2)
  }
  const copy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <span className="font-mono text-[9.5px] tracking-[0.14em] text-muted-foreground uppercase">{title}</span>
        <button onClick={copy} className="text-muted-foreground transition-colors hover:text-primary" aria-label="Copy JSON">
          {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
        </button>
      </div>
      <pre className="max-h-72 overflow-auto p-3 font-mono text-[11.5px] leading-relaxed whitespace-pre">{highlight(text)}</pre>
    </div>
  )
}

// Ported from the iOS app's TextChunker + Retriever (BM25). The Swift code is
// the spec; behavior is intentionally the same shape: header-glued record
// chunks, BM25 scoring, top-k passages with per-passage match scores.

export interface Source {
  id: string
  title: string
  text: string
  enabled: boolean
}

export interface Chunk {
  sourceId: string
  sourceTitle: string
  ordinal: number
  text: string
}

export interface Citation {
  sourceTitle: string
  ordinal: number
  score: number
  excerpt: string
}

const MAX_CHUNK = 1200

export function chunk(source: Source): Chunk[] {
  const blocks = source.text
    .split(/\n\s*\n/)
    .map((b) => b.trim())
    .filter(Boolean)

  // header glue: a block ending with ":" or starting with "#" belongs to the next
  const glued: string[] = []
  for (const b of blocks) {
    const prev = glued[glued.length - 1]
    if (prev && (prev.endsWith(':') || (prev.startsWith('#') && prev.length < 200))) {
      glued[glued.length - 1] = prev + '\n' + b
    } else {
      glued.push(b)
    }
  }

  const pieces: string[] = []
  for (const g of glued) {
    if (g.length <= MAX_CHUNK) {
      pieces.push(g)
      continue
    }
    const lines = g.split('\n')
    const header = lines[0].startsWith('#') || lines[0].endsWith(':') ? lines[0] : null
    let buf = header ? header + '\n' : ''
    for (const line of lines.slice(header ? 1 : 0)) {
      if (buf.length + line.length > MAX_CHUNK && buf.trim() !== (header ?? '')) {
        pieces.push(buf.trim())
        buf = header ? header + '\n' : ''
      }
      buf += line + '\n'
    }
    if (buf.trim()) pieces.push(buf.trim())
  }

  return pieces.map((text, ordinal) => ({
    sourceId: source.id,
    sourceTitle: source.title,
    ordinal,
    text,
  }))
}

const tokenize = (s: string): string[] => s.toLowerCase().match(/[a-z0-9֐-׿]+/g) ?? []

export function retrieve(chunks: Chunk[], query: string, k = 6): (Chunk & { score: number })[] {
  const q = tokenize(query)
  if (q.length === 0 || chunks.length === 0) return []
  const docs = chunks.map((c) => tokenize(c.text))
  const avgLen = docs.reduce((a, d) => a + d.length, 0) / docs.length
  const df = new Map<string, number>()
  for (const term of new Set(q)) {
    df.set(term, docs.filter((d) => d.includes(term)).length)
  }
  const k1 = 1.5
  const b = 0.75
  const scored = chunks.map((c, i) => {
    const d = docs[i]
    let score = 0
    for (const term of q) {
      const n = df.get(term) ?? 0
      if (n === 0) continue
      const idf = Math.log((chunks.length - n + 0.5) / (n + 0.5) + 1)
      const tf = d.filter((t) => t === term).length
      score += idf * ((tf * (k1 + 1)) / (tf + k1 * (1 - b + (b * d.length) / avgLen)))
    }
    return { ...c, score }
  })
  const max = Math.max(...scored.map((s) => s.score), 0.0001)
  return scored
    .filter((s) => s.score > 0)
    .sort((a, x) => x.score - a.score)
    .slice(0, k)
    .map((s) => ({ ...s, score: s.score / max }))
}

export function buildSystem(passages: (Chunk & { score: number })[]): string {
  const intro =
    'You are Canonn, answering strictly from the provided passages. ' +
    'Use only the passages below. If the answer is not there, say so briefly. ' +
    'Use exact values as written. When the answer is a list, give the complete list. ' +
    'Start answers with the fact or action itself.'
  const body = passages.map((p, i) => `[${i + 1}] (${p.sourceTitle})\n${p.text}`).join('\n\n')
  return `${intro}\n\nPASSAGES:\n${body}`
}

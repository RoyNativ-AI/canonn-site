export const API_BASE = import.meta.env.VITE_API_URL || 'https://api.canonn.ai/v1'
export const CHAT_URL = `${API_BASE}/chat/completions`
/** The public site, for links out of the console. */
export const SITE_URL = 'https://canonn.ai'
const API = API_BASE

export interface UsageDay { requests: number; pt: number; ct: number }
export interface LogRow {
  /** D1 row id - the pagination cursor. Present on /v1/me/logs rows. */
  id?: number
  ts: number
  key: string
  model?: string
  /** What kind of call this was: grounded | balanced | extraction | playground | demo. */
  mode?: string
  pt: number
  ct: number
  ms: number
  ip?: string
  adapter?: string
  /** Origin HTTP status; >= 400 means the request failed. */
  status?: number
  finish?: string
  stream?: boolean
  req_id?: string
  tok_s?: number
  ua?: string
  cost?: number
}
export interface IoRow {
  req_id: string
  ts: number
  key_name: string
  prompt: string
  completion: string
}
export interface KeyRow { name: string; prefix: string; created: number | null }
export interface Me {
  user: string
  role: string
  io_logging?: boolean
  credit_usd?: number
  previous?: {
    requests: number
    input_tokens: number
    output_tokens: number
    spend_usd: number
    p50_ms: number
    avg_tok_s: number
  }
  keys: KeyRow[]
  requests: number
  input_tokens: number
  output_tokens: number
  spend_usd: number
  avg_ms: number
  p50_ms: number
  p95_ms: number
  avg_tok_s: number
  truncated: number
  by_day: Record<string, UsageDay>
  by_key: Record<string, UsageDay>
  recent: LogRow[]
}

async function request<T>(path: string, token: string, init?: RequestInit): Promise<T> {
  const res = await fetch(API + path, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  })
  const body = await res.json()
  if (!res.ok) throw new Error(body.error ?? `Request failed (${res.status})`)
  return body as T
}

export const fetchMe = (token: string, days = 30, key = '', from = '', to = '') =>
  request<Me>(
    `/me?days=${days}` +
      (key ? `&key=${encodeURIComponent(key)}` : '') +
      (from ? `&from=${from}` : '') +
      (to ? `&to=${to}` : ''),
    token,
  )

/** One page of the full request log, newest first. Pass the previous page's
 *  next_before to keep walking back through the window. */
export const fetchLogs = (
  token: string, days = 30, key = '', from = '', to = '', before = 0,
) =>
  request<{ data: LogRow[]; next_before: number | null }>(
    `/me/logs?days=${days}&limit=200` +
      (key ? `&key=${encodeURIComponent(key)}` : '') +
      (from ? `&from=${from}` : '') +
      (to ? `&to=${to}` : '') +
      (before ? `&before=${before}` : ''),
    token,
  )

export const runDemo = (data: string, question: string) =>
  fetch(`${API_BASE}/demo`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ data, question }),
  }).then(async (r) => {
    const b = await r.json()
    if (!r.ok) throw new Error(b.error ?? 'demo failed')
    return b as { answer: string; seconds: number }
  })
export const createKey = (token: string, name: string) =>
  request<{ key: string; name: string }>('/me/keys', token, {
    method: 'POST',
    body: JSON.stringify({ name }),
  })
export const revokeKey = (token: string, name: string) =>
  request<{ revoked: string }>('/me/keys/revoke', token, {
    method: 'POST',
    body: JSON.stringify({ name }),
  })
export const renameKey = (token: string, name: string, newName: string) =>
  request<{ renamed: string; to: string }>('/me/keys/rename', token, {
    method: 'POST',
    body: JSON.stringify({ name, new_name: newName }),
  })

export interface BillingMe {
  credit_usd: number
  card: { brand: string; last4: string; exp: string } | null
  auto_recharge: boolean
  auto_amount_usd: number
  auto_threshold_usd: number
  free_tier_calls: number
  used_calls_this_month: number
  spend_this_month_usd: number
  price_in_per_1m: number
  price_out_per_1m: number
  transactions: { iid: number; ts: number; amount_usd: number; kind: string; receipt_url: string | null }[]
}
export const billingConfig = () =>
  fetch(`${API_BASE}/billing/config`).then(async (r) => {
    const b = await r.json()
    if (!r.ok) throw new Error(b.error ?? 'billing not configured')
    return b as { publishable_key: string }
  })
export const billingMe = (token: string) => request<BillingMe>('/me/billing', token)
export const billingSetupIntent = (token: string, email: string) =>
  request<{ client_secret: string; customer: string }>('/me/billing/setup-intent', token, {
    method: 'POST',
    body: JSON.stringify({ email }),
  })
export const billingTopup = (token: string, amountUsd: number, autoRecharge: boolean, email: string) =>
  request<{ client_secret: string; amount_usd: number }>('/me/billing/topup', token, {
    method: 'POST',
    body: JSON.stringify({ amount_usd: amountUsd, auto_recharge: autoRecharge, email }),
  })
export const billingAutoRecharge = (token: string, enabled: boolean, amountUsd?: number, thresholdUsd?: number) =>
  request<{ auto_recharge: boolean }>('/me/billing/auto-recharge', token, {
    method: 'POST',
    body: JSON.stringify({ enabled, amount_usd: amountUsd, threshold_usd: thresholdUsd }),
  })
export interface SavedCard {
  id: string
  brand: string
  last4: string
  exp: string
  is_default: boolean
}
export const billingListPms = (token: string) =>
  request<{ cards: SavedCard[] }>('/me/billing/payment-methods', token)
export const billingRemovePm = (token: string, paymentMethod: string) =>
  request<{ removed: string }>('/me/billing/payment-methods/remove', token, {
    method: 'POST',
    body: JSON.stringify({ payment_method: paymentMethod }),
  })
export const billingSavePm = (token: string, paymentMethod: string) =>
  request<{ saved: boolean }>('/me/billing/payment-method', token, {
    method: 'POST',
    body: JSON.stringify({ payment_method: paymentMethod }),
  })
export const billingCharge = (token: string, amountUsd: number) =>
  request<{ status: string; amount_usd: number }>('/me/billing/charge', token, {
    method: 'POST',
    body: JSON.stringify({ amount_usd: amountUsd }),
  })

export const setIoLogging = (token: string, enabled: boolean) =>
  request<{ io_logging: boolean }>('/me/io-logging', token, {
    method: 'POST',
    body: JSON.stringify({ enabled }),
  })
export const fetchIo = (token: string, reqId: string) =>
  request<IoRow>(`/me/io?req_id=${encodeURIComponent(reqId)}`, token)

export const playgroundChat = (token: string, data: string, question: string, mode: 'balanced' | 'extraction') =>
  request<{ answer: string; mode: string; seconds: number }>('/me/chat', token, {
    method: 'POST',
    body: JSON.stringify({ data, question, mode }),
  })

// ---- Knowledge files (the playground grounds on the signed-in account) ----

export interface KnowledgeFile {
  id: string
  filename: string
  bytes: number
  status: string
  chunk_count: number
  created_at: number
}
export interface GroundedCitation {
  file_id: string
  filename: string
  ordinal: number
  score: number
  excerpt?: string
}

export const listFiles = (token: string) =>
  request<{ data: KnowledgeFile[] }>('/files', token)

export const uploadTextFile = (token: string, filename: string, content: string) =>
  request<KnowledgeFile>('/files', token, {
    method: 'POST',
    body: JSON.stringify({ filename, content }),
  })

export const uploadBinaryFile = async (token: string, file: File): Promise<KnowledgeFile> => {
  const form = new FormData()
  form.append('purpose', 'assistants')
  form.append('file', file)
  const r = await fetch(`${API}/files`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  })
  const b = await r.json()
  if (!r.ok) throw new Error(b.error ?? `upload failed (${r.status})`)
  return b as KnowledgeFile
}

export const deleteFile = (token: string, id: string) =>
  request<{ deleted: boolean }>(`/files/${id}`, token, { method: 'DELETE' })

export const uploadFromUrl = (token: string, url: string, crawl: boolean) =>
  request<KnowledgeFile>('/files', token, {
    method: 'POST',
    body: JSON.stringify({ url, crawl }),
  })

export const uploadFromZendesk = (token: string, subdomain: string) =>
  request<KnowledgeFile>('/files', token, {
    method: 'POST',
    body: JSON.stringify({ zendesk: subdomain }),
  })

export type StreamEvent =
  | { kind: 'token'; text: string }
  | { kind: 'citations'; citations: GroundedCitation[] }

/** Streamed chat; grounds on the given file ids (the enabled scope), or
 *  answers ungrounded when null. Citations arrive as a final `canonn` SSE
 *  event the edge injects. */
export async function* streamChat(
  token: string,
  messages: { role: string; content: string }[],
  fileIds: string[] | null,
): AsyncGenerator<StreamEvent> {
  const r = await fetch(`${API}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      model: 'canonn-r1',
      stream: true,
      // Grounded extraction wants determinism; vLLM's default is 1.0 and it
      // showed - fabricated SLA numbers and flipped verdicts were sampling
      // noise, not model regressions (2026-08-20 evidence dossier).
      temperature: 0.2,
      ...(fileIds && fileIds.length ? { files: fileIds } : {}),
      messages,
    }),
  })
  if (!r.ok) {
    const b = await r.json().catch(() => ({}))
    throw new Error((b as { error?: string }).error ?? `request failed (${r.status})`)
  }
  if (!r.body) throw new Error('no response stream')
  const reader = r.body.getReader()
  const dec = new TextDecoder()
  let buf = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buf += dec.decode(value, { stream: true })
    const lines = buf.split('\n')
    buf = lines.pop() ?? ''
    for (const line of lines) {
      const payload = line.startsWith('data:') ? line.slice(5).trim() : null
      if (!payload || payload === '[DONE]') continue
      try {
        const j = JSON.parse(payload)
        if (j.canonn?.citations) yield { kind: 'citations', citations: j.canonn.citations }
        const delta = j.choices?.[0]?.delta?.content
        if (delta) yield { kind: 'token', text: delta }
      } catch { /* keepalive or partial */ }
    }
  }
}

export const fmt = (n: number) =>
  n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e3 ? (n / 1e3).toFixed(1) + 'K' : String(n)

export const fetchInvoiceHtml = async (token: string, iid: number) => {
  const r = await fetch(`${API}/me/billing/invoice/${iid}`, { headers: { Authorization: `Bearer ${token}` } })
  if (!r.ok) throw new Error('could not load the invoice')
  return r.text()
}

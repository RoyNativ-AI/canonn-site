const API = 'https://api.canonn.ai/v1'

export interface UsageDay { requests: number; pt: number; ct: number }
export interface LogRow {
  ts: number
  key: string
  model?: string
  pt: number
  ct: number
  ms: number
  ip?: string
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

export const runDemo = (data: string, question: string) =>
  fetch('https://api.canonn.ai/v1/demo', {
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

export const fmt = (n: number) =>
  n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e3 ? (n / 1e3).toFixed(1) + 'K' : String(n)

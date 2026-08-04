const API = 'https://api.canonn.ai/v1'

export interface UsageDay { requests: number; pt: number; ct: number }
export interface LogRow { ts: number; key: string; mode: string; pt: number; ct: number; ms: number }
export interface KeyRow { name: string; prefix: string; created: number | null }
export interface Me {
  user: string
  keys: KeyRow[]
  requests: number
  input_tokens: number
  output_tokens: number
  spend_usd: number
  by_day: Record<string, UsageDay>
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

export const fetchMe = (token: string) => request<Me>('/me', token)
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

export const fmt = (n: number) =>
  n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e3 ? (n / 1e3).toFixed(1) + 'K' : String(n)

// Google Drive import that runs entirely in the browser.
//
// Consent uses Google Identity Services' token model: the access token is
// issued to this tab, lives in memory for an hour, and is never written to
// storage or sent to Canonn. File bytes go Google → browser → /v1/files as
// plain text, so no Canonn server ever holds a Google credential.
//
// The scope is read-only Drive; Docs/Sheets/Slides are exported through the
// Drive API, everything else is downloaded and handed to the same extractors
// the dashboard already uses for local uploads.

export const GOOGLE_CLIENT_ID: string = import.meta.env.VITE_GOOGLE_CLIENT_ID ?? ''
export const driveConfigured = () => GOOGLE_CLIENT_ID.length > 0

const SCOPE = 'https://www.googleapis.com/auth/drive.readonly'
const GSI_SRC = 'https://accounts.google.com/gsi/client'

export interface DriveFile {
  id: string
  name: string
  mimeType: string
  modifiedTime?: string
}

interface TokenResponse { access_token?: string; expires_in?: number; error?: string; error_description?: string }
interface TokenClient { requestAccessToken: (o?: { prompt?: string }) => void }
interface Gis {
  accounts: { oauth2: {
    initTokenClient: (c: { client_id: string; scope: string; callback: (r: TokenResponse) => void; error_callback?: (e: { type: string }) => void }) => TokenClient
    revoke: (token: string, done?: () => void) => void
  } }
}

declare global { interface Window { google?: Gis } }

let gisLoading: Promise<Gis> | null = null
function loadGis(): Promise<Gis> {
  if (window.google?.accounts?.oauth2) return Promise.resolve(window.google)
  gisLoading ??= new Promise<Gis>((resolve, reject) => {
    const s = document.createElement('script')
    s.src = GSI_SRC
    s.async = true
    s.onload = () => (window.google ? resolve(window.google) : reject(new Error('Google sign-in failed to load')))
    s.onerror = () => reject(new Error('Google sign-in failed to load'))
    document.head.appendChild(s)
  })
  return gisLoading
}

let token: { value: string; expiresAt: number } | null = null

/** A valid access token for this tab, prompting for consent when needed. */
export async function driveToken(): Promise<string> {
  if (!driveConfigured()) throw new Error('Google Drive is not configured for this dashboard')
  if (token && token.expiresAt > Date.now() + 60_000) return token.value
  const gis = await loadGis()
  return new Promise<string>((resolve, reject) => {
    const client = gis.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: SCOPE,
      callback: (r) => {
        if (!r.access_token) {
          reject(new Error(r.error === 'access_denied' ? 'Google access was declined' : r.error_description ?? r.error ?? 'Google sign-in failed'))
          return
        }
        token = { value: r.access_token, expiresAt: Date.now() + (r.expires_in ?? 3600) * 1000 }
        resolve(r.access_token)
      },
      error_callback: (e) => reject(new Error(e.type === 'popup_closed' ? 'The Google window was closed' : `Google sign-in failed (${e.type})`)),
    })
    client.requestAccessToken()
  })
}

export const driveConnected = () => token !== null && token.expiresAt > Date.now()

/** Forgets the token here and revokes it at Google. */
export async function driveDisconnect() {
  const current = token
  token = null
  if (!current) return
  const gis = await loadGis().catch(() => null)
  gis?.accounts.oauth2.revoke(current.value)
}

// Native Google formats are exported to text; the rest must be something the
// dashboard's upload path already understands.
const EXPORTS: Record<string, string> = {
  'application/vnd.google-apps.document': 'text/plain',
  'application/vnd.google-apps.spreadsheet': 'text/csv',
  'application/vnd.google-apps.presentation': 'text/plain',
}
const DOWNLOADABLE = new Set([
  'application/pdf',
  'text/plain', 'text/markdown', 'text/csv', 'text/html', 'application/json', 'application/xml', 'text/xml',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
])

export const driveSupported = (mime: string) => mime in EXPORTS || DOWNLOADABLE.has(mime)

export function driveKind(mime: string): string {
  switch (mime) {
    case 'application/vnd.google-apps.document': return 'Google Doc'
    case 'application/vnd.google-apps.spreadsheet': return 'Google Sheet'
    case 'application/vnd.google-apps.presentation': return 'Google Slides'
    case 'application/pdf': return 'PDF'
    case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document': return 'Word'
    case 'application/vnd.openxmlformats-officedocument.presentationml.presentation': return 'PowerPoint'
    default: return mime.startsWith('text/') ? 'Text' : 'Document'
  }
}

async function driveFetch(accessToken: string, url: string): Promise<Response> {
  const r = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } })
  if (r.status === 401) { token = null; throw new Error('Google access expired — connect again') }
  if (!r.ok) {
    const b = await r.json().catch(() => ({})) as { error?: { message?: string } }
    throw new Error(b.error?.message ?? `Google Drive request failed (${r.status})`)
  }
  return r
}

/** The most recently modified readable files, newest first. */
export async function driveRecentFiles(accessToken: string, limit = 100): Promise<DriveFile[]> {
  const q = new URLSearchParams({
    q: "trashed = false and mimeType != 'application/vnd.google-apps.folder'",
    orderBy: 'modifiedTime desc',
    pageSize: String(limit),
    fields: 'files(id,name,mimeType,modifiedTime)',
  })
  const r = await driveFetch(accessToken, `https://www.googleapis.com/drive/v3/files?${q}`)
  const b = await r.json() as { files: DriveFile[] }
  return b.files.filter((f) => driveSupported(f.mimeType))
}

/** One file as either extracted text or the original bytes. */
export async function driveDownload(accessToken: string, file: DriveFile): Promise<{ text: string } | { blob: File }> {
  const exportMime = EXPORTS[file.mimeType]
  if (exportMime) {
    const r = await driveFetch(accessToken, `https://www.googleapis.com/drive/v3/files/${file.id}/export?mimeType=${encodeURIComponent(exportMime)}`)
    return { text: await r.text() }
  }
  const r = await driveFetch(accessToken, `https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`)
  const blob = await r.blob()
  return { blob: new File([blob], file.name, { type: file.mimeType }) }
}

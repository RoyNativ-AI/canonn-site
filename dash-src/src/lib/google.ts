// Google sources that run entirely in the browser: Drive (Docs, Sheets,
// Slides and uploaded files) and the captions of the user's own YouTube
// videos.
//
// Consent uses Google Identity Services' token model: the access token is
// issued to this tab, lives in memory for an hour, and is never written to
// storage or sent to Canonn. Content goes Google → browser → /v1/files as
// plain text, so no Canonn server ever holds a Google credential.

export const GOOGLE_CLIENT_ID: string = import.meta.env.VITE_GOOGLE_CLIENT_ID ?? ''
export const googleConfigured = () => GOOGLE_CLIENT_ID.length > 0

const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.readonly'
const YOUTUBE_SCOPE = 'https://www.googleapis.com/auth/youtube.force-ssl'
const GSI_SRC = 'https://accounts.google.com/gsi/client'

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

// One token per scope, so connecting Drive never asks for YouTube and back.
const tokens = new Map<string, { value: string; expiresAt: number }>()

async function googleToken(scope: string): Promise<string> {
  if (!googleConfigured()) throw new Error('Google sources are not configured for this dashboard')
  const held = tokens.get(scope)
  if (held && held.expiresAt > Date.now() + 60_000) return held.value
  const gis = await loadGis()
  return new Promise<string>((resolve, reject) => {
    const client = gis.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope,
      callback: (r) => {
        if (!r.access_token) {
          reject(new Error(r.error === 'access_denied' ? 'Google access was declined' : r.error_description ?? r.error ?? 'Google sign-in failed'))
          return
        }
        tokens.set(scope, { value: r.access_token, expiresAt: Date.now() + (r.expires_in ?? 3600) * 1000 })
        resolve(r.access_token)
      },
      error_callback: (e) => reject(new Error(e.type === 'popup_closed' ? 'The Google window was closed' : `Google sign-in failed (${e.type})`)),
    })
    client.requestAccessToken()
  })
}

/** Forgets every token here and revokes them at Google. */
export async function googleDisconnect() {
  const held = [...tokens.values()]
  tokens.clear()
  if (held.length === 0) return
  const gis = await loadGis().catch(() => null)
  for (const t of held) gis?.accounts.oauth2.revoke(t.value)
}

async function googleFetch(scope: string, accessToken: string, url: string): Promise<Response> {
  const r = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } })
  if (r.status === 401) { tokens.delete(scope); throw new Error('Google access expired — connect again') }
  if (!r.ok) {
    const b = await r.json().catch(() => ({})) as { error?: { message?: string } }
    throw new Error(b.error?.message ?? `Google request failed (${r.status})`)
  }
  return r
}

// ---------------------------------------------------------------- Drive

export interface DriveFile {
  id: string
  name: string
  mimeType: string
  modifiedTime?: string
}

/** Which part of Drive a catalog entry opens on. */
export type DriveFilter = 'all' | 'docs' | 'sheets'

const DOC = 'application/vnd.google-apps.document'
const SHEET = 'application/vnd.google-apps.spreadsheet'
const SLIDES = 'application/vnd.google-apps.presentation'

// Native Google formats are exported to text; the rest must be something the
// dashboard's upload path already understands.
const EXPORTS: Record<string, string> = {
  [DOC]: 'text/plain',
  [SHEET]: 'text/csv',
  [SLIDES]: 'text/plain',
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
    case DOC: return 'Google Doc'
    case SHEET: return 'Google Sheet'
    case SLIDES: return 'Google Slides'
    case 'application/pdf': return 'PDF'
    case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document': return 'Word'
    case 'application/vnd.openxmlformats-officedocument.presentationml.presentation': return 'PowerPoint'
    default: return mime.startsWith('text/') ? 'Text' : 'Document'
  }
}

export const driveToken = () => googleToken(DRIVE_SCOPE)

/** The most recently modified readable files, newest first. */
export async function driveRecentFiles(accessToken: string, filter: DriveFilter = 'all', limit = 100): Promise<DriveFile[]> {
  const mimeClause =
    filter === 'docs' ? ` and (mimeType = '${DOC}' or mimeType = '${SLIDES}')`
    : filter === 'sheets' ? ` and mimeType = '${SHEET}'`
    : " and mimeType != 'application/vnd.google-apps.folder'"
  const q = new URLSearchParams({
    q: `trashed = false${mimeClause}`,
    orderBy: 'modifiedTime desc',
    pageSize: String(limit),
    fields: 'files(id,name,mimeType,modifiedTime)',
  })
  const r = await googleFetch(DRIVE_SCOPE, accessToken, `https://www.googleapis.com/drive/v3/files?${q}`)
  const b = await r.json() as { files: DriveFile[] }
  return b.files.filter((f) => driveSupported(f.mimeType))
}

/** One file as either extracted text or the original bytes. */
export async function driveDownload(accessToken: string, file: DriveFile): Promise<{ text: string } | { blob: File }> {
  const exportMime = EXPORTS[file.mimeType]
  if (exportMime) {
    const r = await googleFetch(DRIVE_SCOPE, accessToken, `https://www.googleapis.com/drive/v3/files/${file.id}/export?mimeType=${encodeURIComponent(exportMime)}`)
    return { text: await r.text() }
  }
  const r = await googleFetch(DRIVE_SCOPE, accessToken, `https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`)
  const blob = await r.blob()
  return { blob: new File([blob], file.name, { type: file.mimeType }) }
}

// -------------------------------------------------------------- YouTube
// YouTube only hands captions to the video's owner, so this lists the
// signed-in channel's uploads and imports the transcript of the ones picked.
// Public videos of other channels are not reachable this way.

export interface YouTubeVideo {
  id: string
  title: string
  publishedAt: string
}

export const youtubeToken = () => googleToken(YOUTUBE_SCOPE)

/** The signed-in channel's most recent uploads. */
export async function youtubeOwnVideos(accessToken: string, limit = 50): Promise<YouTubeVideo[]> {
  const q = new URLSearchParams({ part: 'snippet', forMine: 'true', type: 'video', order: 'date', maxResults: String(limit) })
  const r = await googleFetch(YOUTUBE_SCOPE, accessToken, `https://www.googleapis.com/youtube/v3/search?${q}`)
  const b = await r.json() as { items: { id: { videoId: string }; snippet: { title: string; publishedAt: string } }[] }
  return b.items.map((i) => ({ id: i.id.videoId, title: i.snippet.title, publishedAt: i.snippet.publishedAt }))
}

/** The transcript of one owned video as plain paragraphs, or null when the
 *  video has no caption track at all. */
export async function youtubeTranscript(accessToken: string, videoId: string): Promise<string | null> {
  const list = await googleFetch(YOUTUBE_SCOPE, accessToken, `https://www.googleapis.com/youtube/v3/captions?part=snippet&videoId=${videoId}`)
  const b = await list.json() as { items: { id: string; snippet: { language: string; trackKind: string } }[] }
  if (b.items.length === 0) return null
  // Prefer a human-made track; fall back to YouTube's automatic one.
  const track = b.items.find((i) => i.snippet.trackKind !== 'asr') ?? b.items[0]
  const r = await googleFetch(YOUTUBE_SCOPE, accessToken, `https://www.googleapis.com/youtube/v3/captions/${track.id}?tfmt=srt`)
  return srtToText(await r.text())
}

function srtToText(srt: string): string {
  const lines: string[] = []
  for (const block of srt.split(/\r?\n\r?\n/)) {
    const text = block
      .split(/\r?\n/)
      .filter((l) => !/^\d+$/.test(l) && !/-->/.test(l))
      .join(' ')
      .replace(/<[^>]+>/g, '')
      .trim()
    if (text && text !== lines[lines.length - 1]) lines.push(text)
  }
  // Roughly a paragraph every ~12 cues keeps the chunker's shape.
  const paragraphs: string[] = []
  for (let i = 0; i < lines.length; i += 12) paragraphs.push(lines.slice(i, i + 12).join(' '))
  return paragraphs.join('\n\n')
}

// Google sources that run entirely in the browser: Drive (Docs, Sheets,
// Slides and uploaded files) and the captions of the user's own YouTube
// videos.
//
// Consent uses Google Identity Services' token model: the access token is
// issued to this tab, lives in memory for an hour, and is never written to
// storage or sent to Canonn. Content goes Google → browser → /v1/files as
// plain text, so no Canonn server ever holds a Google credential.

export const GOOGLE_CLIENT_ID: string = import.meta.env.VITE_GOOGLE_CLIENT_ID ?? ''
/** Referrer-restricted browser key; the Picker requires one. Public by design. */
export const GOOGLE_API_KEY: string = import.meta.env.VITE_GOOGLE_API_KEY ?? ''
export const googleConfigured = () => GOOGLE_CLIENT_ID.length > 0
export const driveConfigured = () => googleConfigured() && GOOGLE_API_KEY.length > 0

// drive.file is non-sensitive: no Google verification, no user cap. The app
// only ever sees the files the person picks in Google's own picker.
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file'
const YOUTUBE_SCOPE = 'https://www.googleapis.com/auth/youtube.force-ssl'
const GSI_SRC = 'https://accounts.google.com/gsi/client'
const GAPI_SRC = 'https://apis.google.com/js/api.js'
// The Picker ties its grant to the Cloud project that owns the OAuth client.
const PROJECT_NUMBER = GOOGLE_CLIENT_ID.split('-')[0]

interface TokenResponse { access_token?: string; expires_in?: number; error?: string; error_description?: string }
interface TokenClient { requestAccessToken: (o?: { prompt?: string }) => void }
interface Gis {
  accounts: { oauth2: {
    initTokenClient: (c: { client_id: string; scope: string; callback: (r: TokenResponse) => void; error_callback?: (e: { type: string }) => void }) => TokenClient
    revoke: (token: string, done?: () => void) => void
  } }
}

interface PickerDoc { id: string; name: string; mimeType: string }
interface PickerView { setMimeTypes: (m: string) => PickerView; setIncludeFolders: (b: boolean) => PickerView }
interface PickerBuilder {
  setOAuthToken: (t: string) => PickerBuilder
  setDeveloperKey: (k: string) => PickerBuilder
  setAppId: (id: string) => PickerBuilder
  setOrigin: (o: string) => PickerBuilder
  addView: (v: PickerView | string) => PickerBuilder
  enableFeature: (f: string) => PickerBuilder
  setTitle: (t: string) => PickerBuilder
  setCallback: (cb: (data: { action: string; docs?: PickerDoc[] }) => void) => PickerBuilder
  build: () => { setVisible: (b: boolean) => void }
}
interface PickerNs {
  PickerBuilder: new () => PickerBuilder
  DocsView: new (viewId?: string) => PickerView
  ViewId: { DOCS: string; DOCUMENTS: string; SPREADSHEETS: string; PRESENTATIONS: string }
  Feature: { MULTISELECT_ENABLED: string; NAV_HIDDEN: string }
  Action: { PICKED: string; CANCEL: string }
}
interface Gapi { load: (lib: string, cb: () => void) => void }

declare global { interface Window { google?: Gis & { picker?: PickerNs }; gapi?: Gapi } }

let pickerLoading: Promise<PickerNs> | null = null
function loadPicker(): Promise<PickerNs> {
  if (window.google?.picker) return Promise.resolve(window.google.picker)
  pickerLoading ??= new Promise<PickerNs>((resolve, reject) => {
    const ready = () => window.gapi?.load('picker', () => (window.google?.picker ? resolve(window.google.picker) : reject(new Error('Google Picker failed to load'))))
    if (window.gapi) { ready(); return }
    const s = document.createElement('script')
    s.src = GAPI_SRC
    s.async = true
    s.onload = ready
    s.onerror = () => reject(new Error('Google Picker failed to load'))
    document.head.appendChild(s)
  })
  return pickerLoading
}

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

/** Opens Google's own file picker and resolves with what the person chose
 *  (empty when they cancel). Picking is what grants this tab access to those
 *  files under drive.file. */
export async function drivePick(accessToken: string, filter: DriveFilter = 'all'): Promise<DriveFile[]> {
  if (!driveConfigured()) throw new Error('Google Drive is not configured for this dashboard')
  const picker = await loadPicker()
  const mimes =
    filter === 'docs' ? [DOC, SLIDES]
    : filter === 'sheets' ? [SHEET]
    : [DOC, SHEET, SLIDES, ...DOWNLOADABLE]
  const view = new picker.DocsView(picker.ViewId.DOCS).setMimeTypes(mimes.join(',')).setIncludeFolders(true)
  return new Promise<DriveFile[]>((resolve) => {
    new picker.PickerBuilder()
      .setOAuthToken(accessToken)
      .setDeveloperKey(GOOGLE_API_KEY)
      .setAppId(PROJECT_NUMBER)
      .setOrigin(window.location.origin)
      .setTitle(filter === 'sheets' ? 'Choose spreadsheets' : 'Choose documents')
      .addView(view)
      .enableFeature(picker.Feature.MULTISELECT_ENABLED)
      .setCallback((data) => {
        if (data.action === picker.Action.PICKED) resolve((data.docs ?? []).filter((d) => driveSupported(d.mimeType)))
        else if (data.action === picker.Action.CANCEL) resolve([])
      })
      .build()
      .setVisible(true)
  })
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

/** The signed-in channel's most recent uploads, via its uploads playlist —
 *  the canonical listing, and 1 quota unit per page instead of search's 100. */
export async function youtubeOwnVideos(accessToken: string, limit = 50): Promise<YouTubeVideo[]> {
  const ch = await googleFetch(YOUTUBE_SCOPE, accessToken, 'https://www.googleapis.com/youtube/v3/channels?part=contentDetails&mine=true')
  const channels = await ch.json() as { items?: { contentDetails?: { relatedPlaylists?: { uploads?: string } } }[] }
  const uploads = channels.items?.[0]?.contentDetails?.relatedPlaylists?.uploads
  if (!uploads) return []
  const q = new URLSearchParams({ part: 'snippet,status', playlistId: uploads, maxResults: String(limit) })
  const r = await googleFetch(YOUTUBE_SCOPE, accessToken, `https://www.googleapis.com/youtube/v3/playlistItems?${q}`)
  const b = await r.json() as {
    items?: { snippet?: { title?: string; publishedAt?: string; resourceId?: { videoId?: string } } }[]
  }
  return (b.items ?? []).flatMap((i) => {
    const id = i.snippet?.resourceId?.videoId
    return id ? [{ id, title: i.snippet?.title ?? id, publishedAt: i.snippet?.publishedAt ?? '' }] : []
  })
}

/** The transcript of one owned video as plain paragraphs, or null when the
 *  video has no caption track at all. */
export async function youtubeTranscript(accessToken: string, videoId: string): Promise<string | null> {
  const list = await googleFetch(YOUTUBE_SCOPE, accessToken, `https://www.googleapis.com/youtube/v3/captions?part=snippet&videoId=${videoId}`)
  const b = await list.json() as { items?: { id: string; snippet?: { language?: string; trackKind?: string } }[] }
  const items = b.items ?? []
  if (items.length === 0) return null
  // Prefer a human-made track; fall back to YouTube's automatic one.
  const track = items.find((i) => i.snippet?.trackKind !== 'asr') ?? items[0]
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

// ---------------------------------------------------------------- Gmail
// gmail.readonly is a Google *restricted* scope: it needs Google's scope
// verification plus a CASA assessment before the public can use it. The flow
// itself is the same as the others — messages are read into this tab and
// reduced to text.

const GMAIL_SCOPE = 'https://www.googleapis.com/auth/gmail.readonly'
export const gmailToken = () => googleToken(GMAIL_SCOPE)

interface GmailPart { mimeType?: string; body?: { data?: string }; parts?: GmailPart[] }
interface GmailMessage { id: string; payload?: GmailPart & { headers?: { name: string; value: string }[] } }

function base64UrlDecode(data: string): string {
  const b64 = data.replace(/-/g, '+').replace(/_/g, '/')
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4))
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)))
}

function htmlToText(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  doc.querySelectorAll('script,style,head').forEach((n) => n.remove())
  return (doc.body?.textContent ?? '').replace(/[ \t]+/g, ' ').replace(/\n\s*\n\s*\n+/g, '\n\n').trim()
}

/** The plain text of a message: a text/plain part when there is one, else
 *  the HTML part stripped. */
function gmailBody(part: GmailPart | undefined): string {
  if (!part) return ''
  const flat: GmailPart[] = []
  const walk = (p: GmailPart) => { flat.push(p); p.parts?.forEach(walk) }
  walk(part)
  const plain = flat.find((p) => p.mimeType === 'text/plain' && p.body?.data)
  if (plain?.body?.data) return base64UrlDecode(plain.body.data).trim()
  const html = flat.find((p) => p.mimeType === 'text/html' && p.body?.data)
  if (html?.body?.data) return htmlToText(base64UrlDecode(html.body.data))
  return ''
}

/** Messages matching a Gmail search, newest first, rendered as one text
 *  document with a record per message. */
export async function gmailSearch(accessToken: string, query: string, limit = 100): Promise<{ text: string; count: number }> {
  const q = new URLSearchParams({ q: query, maxResults: String(Math.min(limit, 100)) })
  const list = await googleFetch(GMAIL_SCOPE, accessToken, `https://gmail.googleapis.com/gmail/v1/users/me/messages?${q}`)
  const ids = ((await list.json() as { messages?: { id: string }[] }).messages ?? []).map((m) => m.id)
  const records: string[] = []
  // Sequential with a small window: Gmail rate-limits bursts per user.
  for (let i = 0; i < ids.length; i += 5) {
    const batch = await Promise.all(ids.slice(i, i + 5).map(async (id) => {
      const r = await googleFetch(GMAIL_SCOPE, accessToken, `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=full`)
      return await r.json() as GmailMessage
    }))
    for (const m of batch) {
      const h = (name: string) => m.payload?.headers?.find((x) => x.name.toLowerCase() === name)?.value ?? ''
      const body = gmailBody(m.payload)
      if (!body) continue
      records.push([
        `## ${h('subject') || '(no subject)'}`,
        `From: ${h('from')}`,
        `To: ${h('to')}`,
        `Date: ${h('date')}`,
        '',
        body.slice(0, 20_000),
      ].join('\n'))
    }
  }
  return { text: records.join('\n\n'), count: records.length }
}

// ------------------------------------------------------------- Calendar
// calendar.readonly is *sensitive* (verification, no CASA).

const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.readonly'
export const calendarToken = () => googleToken(CALENDAR_SCOPE)

interface CalendarEvent {
  summary?: string
  description?: string
  location?: string
  start?: { dateTime?: string; date?: string }
  end?: { dateTime?: string; date?: string }
  attendees?: { email: string; displayName?: string; responseStatus?: string }[]
  organizer?: { email?: string; displayName?: string }
  hangoutLink?: string
}

/** Events on the primary calendar in a window around today, as one text
 *  document with a record per event. */
export async function calendarEvents(accessToken: string, pastDays = 90, futureDays = 180): Promise<{ text: string; count: number }> {
  const now = Date.now()
  const timeMin = new Date(now - pastDays * 86_400_000).toISOString()
  const timeMax = new Date(now + futureDays * 86_400_000).toISOString()
  const records: string[] = []
  let pageToken: string | undefined
  do {
    const q = new URLSearchParams({ timeMin, timeMax, singleEvents: 'true', orderBy: 'startTime', maxResults: '250' })
    if (pageToken) q.set('pageToken', pageToken)
    const r = await googleFetch(CALENDAR_SCOPE, accessToken, `https://www.googleapis.com/calendar/v3/calendars/primary/events?${q}`)
    const b = await r.json() as { items?: CalendarEvent[]; nextPageToken?: string }
    for (const e of b.items ?? []) {
      const when = (t?: { dateTime?: string; date?: string }) => t?.dateTime ?? t?.date ?? ''
      const people = (e.attendees ?? []).map((a) => `${a.displayName ?? a.email}${a.responseStatus ? ` (${a.responseStatus})` : ''}`).join(', ')
      records.push([
        `## ${e.summary ?? '(untitled)'}`,
        `Start: ${when(e.start)}`,
        `End: ${when(e.end)}`,
        e.location ? `Location: ${e.location}` : '',
        e.organizer ? `Organizer: ${e.organizer.displayName ?? e.organizer.email}` : '',
        people ? `Attendees: ${people}` : '',
        e.hangoutLink ? `Meet: ${e.hangoutLink}` : '',
        e.description ? `\n${htmlToText(e.description)}` : '',
      ].filter(Boolean).join('\n'))
    }
    pageToken = b.nextPageToken
  } while (pageToken && records.length < 2000)
  return { text: records.join('\n\n'), count: records.length }
}

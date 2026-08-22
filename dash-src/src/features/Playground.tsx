import { useCallback, useEffect, useRef, useState } from 'react'
import { useUser } from '@clerk/clerk-react'
import { formatDistanceToNowStrict } from 'date-fns'
import {
  Archive, ArrowLeftRight, ArrowUp, ArrowUpRight, BarChart3, BookOpen, Braces,
  Check, ChevronDown, ClipboardType, CloudSun, Copy, Database, EllipsisVertical,
  FileCode, FileText, FileType, FolderOpen, GitBranch, Globe, HardDrive, Hash,
  History, Leaf, LifeBuoy, Link2, List, Loader2, MessageCircle, MessageSquare,
  Mic, Network, Package, Play, Plus, Rss, ScanLine, Server, Share2, SquarePen,
  StickyNote, Table, Trash2, Type, Users, X,
} from 'lucide-react'
import {
  siAirtable, siAmazons3, siBox, siConfluence, siDropbox, siGithub, siGitlab,
  siGmail, siGooglebigquery, siGooglecalendar, siGoogledocs, siGoogledrive, siGooglesheets, siHelpscout, siHubspot,
  siIntercom, siJira, siLinear, siMicrosoftonedrive, siMongodb, siMysql,
  siNotion, siPostgresql, siSalesforce, siSlack, siYoutube, siZendesk,
} from 'simple-icons'

// Simple Icons still carries Intercom's old cyan; the brand has been black
// since their rebrand. Near-black marks follow the theme via BrandIcon.
const INTERCOM = { ...siIntercom, hex: '000000' }

// The familiar faces under the empty composer - full-color marks drifting in
// a slow marquee, the way the landing page runs its model strip. Clicking
// any of them opens the catalog.
const BRAND_STRIP = [
  { name: 'Gmail', brand: siGmail },
  { name: 'Google Drive', brand: siGoogledrive },
  { name: 'YouTube', brand: siYoutube },
  { name: 'Notion', brand: siNotion },
  { name: 'Slack', brand: siSlack },
  { name: 'GitHub', brand: siGithub },
  { name: 'Dropbox', brand: siDropbox },
  { name: 'Zendesk', brand: siZendesk },
  { name: 'Salesforce', brand: siSalesforce },
  { name: 'Intercom', brand: INTERCOM },
  { name: 'Confluence', brand: siConfluence },
  { name: 'HubSpot', brand: siHubspot },
  { name: 'Airtable', brand: siAirtable },
  { name: 'PostgreSQL', brand: siPostgresql },
]
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import {
  deleteFile, listFiles, streamChat, uploadBinaryFile, uploadFromUrl,
  uploadFromZendesk, uploadTextFile, uploadFromSitemap, uploadFromFeed, uploadFromHelpCenter,
  uploadFromGithub, uploadFromRest, previewSql, uploadFromSql,
  type GroundedCitation, type KnowledgeFile, type SqlPreview,
} from '@/lib/api'
import { officeToText, imageToText } from '@/lib/office'
import {
  googleConfigured, driveConfigured, googleDisconnect, driveDownload, drivePick, driveToken,
  youtubeOwnVideos, youtubeToken, youtubeTranscript, gmailSearch, gmailToken, calendarEvents, calendarToken,
  type DriveFile, type DriveFilter, type YouTubeVideo,
} from '@/lib/google'

// The dashboard twin of the app's Chat + Knowledge screens, running entirely
// on the public API: /v1/files for ingestion, streamed grounded completions
// for answers. Same visual language as the app - terracotta only where the
// eye should go, mono uppercase labels, citation cards under every answer.

// Terracotta is reserved for evidence - citation markers and source indices.
// Actions, focus, and chrome use ink, so the accent only ever means "this is
// backed by your data".
const ACCENT = '#c96442'

type LoaderId =
  | 'upload' | 'paste' | 'web' | 'crawl' | 'pdf' | 'office' | 'ocr' | 'sitemap' | 'feed'
  | 'zendesk' | 'intercom' | 'helpscout' | 'hubspot' | 'github' | 'rest' | 'postgres' | 'mysql'
  | 'gdrive' | 'gdocs' | 'gsheets' | 'youtube' | 'gmail' | 'gcal'

// Google loaders light up only once the dashboard has a client ID.
const DRIVE_FILTERS: Partial<Record<LoaderId, DriveFilter>> = { gdrive: 'all', gdocs: 'docs', gsheets: 'sheets' }
const google = (id: LoaderId): LoaderId | undefined =>
  ((id in DRIVE_FILTERS ? driveConfigured() : googleConfigured()) ? id : undefined)

// The app's loader catalog (LoaderCatalog.swift), mirrored: the same
// categories, names, and summaries. Loaders with an `action` run on the API
// today; the rest are listed honestly as Preview, exactly like the app marks
// connectors that need a workspace connection.
interface CatalogItem {
  name: string
  blurb: string
  icon: typeof Globe
  /** Official mark (Simple Icons, same set the app bundles). Wins over icon. */
  brand?: { path: string; hex: string }
  action?: LoaderId
}

// The service's real logo, in its real color - except near-black marks
// (Notion, GitHub, Zendesk), which follow the theme so dark mode keeps them
// visible. Mirrors the app's LoaderIcon template-image behavior.
function BrandIcon({ brand, className }: { brand: { path: string; hex: string }; className?: string }) {
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(brand.hex.slice(i, i + 2), 16))
  const dark = 0.299 * r + 0.587 * g + 0.114 * b < 70
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={className} style={{ fill: dark ? 'var(--foreground)' : `#${brand.hex}` }}>
      <path d={brand.path} />
    </svg>
  )
}

const CATALOG: { category: string; items: CatalogItem[] }[] = [
  // Google Workspace, together: one consent style, one picker, one place.
  { category: 'Google', items: [
    { name: 'Google Drive', blurb: 'Pick documents in Google\'s file picker and import them.', icon: FolderOpen, brand: siGoogledrive, action: google('gdrive') },
    { name: 'Google Docs', blurb: 'Docs and Slides, exported as text.', icon: FileText, brand: siGoogledocs, action: google('gdocs') },
    { name: 'Google Sheets', blurb: 'Spreadsheets, flattened row by row.', icon: Table, brand: siGooglesheets, action: google('gsheets') },
    { name: 'Gmail', blurb: 'Messages matching a Gmail search, one record each.', icon: MessageSquare, brand: siGmail, action: google('gmail') },
    { name: 'Google Calendar', blurb: 'Events from the last 90 days and the next 180.', icon: History, brand: siGooglecalendar, action: google('gcal') },
    { name: 'YouTube transcript', blurb: 'Captions of the videos on your own channel.', icon: Play, brand: siYoutube, action: google('youtube') },
    { name: 'BigQuery', blurb: 'Warehouse tables as knowledge records.', icon: BarChart3, brand: siGooglebigquery },
  ] },
  { category: 'Web', items: [
    { name: 'Web page', blurb: 'Fetch one URL and strip it to clean text.', icon: Link2, action: 'web' },
    { name: 'Website crawl', blurb: 'Follow links from a starting page, up to 8 pages.', icon: Network, action: 'crawl' },
    { name: 'Sitemap', blurb: 'Every page a sitemap.xml lists, up to 60.', icon: List, action: 'sitemap' },
    { name: 'RSS / Atom feed', blurb: 'The latest articles of a feed, one record each.', icon: Rss, action: 'feed' },
  ] },
  { category: 'Files', items: [
    { name: 'PDF', blurb: 'Contracts, reports, policies — text extracted page by page.', icon: FileText, action: 'pdf' },
    { name: 'Text & Markdown', blurb: 'Plain .txt, .md and .html documents.', icon: Type, action: 'upload' },
    { name: 'CSV & spreadsheets', blurb: 'Row data flattened into readable records.', icon: Table, action: 'upload' },
    { name: 'JSON & XML', blurb: 'Structured exports, flattened key by key.', icon: Braces, action: 'upload' },
    { name: 'HTML archive', blurb: 'Saved pages, help-centre exports.', icon: FileCode, action: 'upload' },
    { name: 'Paste text', blurb: 'Drop in a policy, an email thread, a snippet of notes.', icon: ClipboardType, action: 'paste' },
    { name: 'Word & PowerPoint', blurb: '.docx and .pptx, text extracted in your browser.', icon: FileType, action: 'office' },
    { name: 'Scanned images', blurb: 'OCR in your browser for photographed or scanned pages.', icon: ScanLine, action: 'ocr' },
    { name: 'Audio & meetings', blurb: 'Transcribe recordings and calls into text.', icon: Mic },
  ] },
  { category: 'Cloud storage', items: [
    { name: 'Dropbox', blurb: 'Pick documents straight from your Dropbox folder.', icon: Package, brand: siDropbox },
    { name: 'OneDrive / SharePoint', blurb: 'Pick documents from your Microsoft 365 libraries.', icon: HardDrive, brand: siMicrosoftonedrive },
    { name: 'Box', blurb: 'Pick documents straight from your Box folder.', icon: Archive, brand: siBox },
    { name: 'Amazon S3', blurb: 'Ingest a bucket or prefix using your own keys.', icon: Server, brand: siAmazons3 },
  ] },
  { category: 'Workspace', items: [
    { name: 'Notion', blurb: 'Pages and databases from a workspace.', icon: StickyNote, brand: siNotion },
    { name: 'Confluence', blurb: 'Spaces and pages from Atlassian.', icon: BookOpen, brand: siConfluence },
    { name: 'Slack', blurb: 'Channel history as searchable knowledge.', icon: Hash, brand: siSlack },
    { name: 'Jira', blurb: 'Issues, descriptions and comments.', icon: Check, brand: siJira },
    { name: 'Linear', blurb: 'Issues and project documents.', icon: ArrowUpRight, brand: siLinear },
    { name: 'Airtable', blurb: 'Bases and tables as records.', icon: Table, brand: siAirtable },
  ] },
  { category: 'Code', items: [
    { name: 'GitHub', blurb: 'READMEs and docs of a public repository.', icon: FileCode, brand: siGithub, action: 'github' },
    { name: 'GitLab', blurb: 'Projects and wikis from GitLab.', icon: GitBranch, brand: siGitlab },
    { name: 'Documentation site', blurb: 'Crawl a docs site and keep its page structure.', icon: BookOpen, action: 'crawl' },
  ] },
  { category: 'Support & CRM', items: [
    { name: 'Zendesk', blurb: 'Public help-centre articles, fetched without a login.', icon: LifeBuoy, brand: siZendesk, action: 'zendesk' },
    { name: 'Intercom', blurb: 'Public help-centre articles, fetched without a login.', icon: MessageSquare, brand: INTERCOM, action: 'intercom' },
    { name: 'HubSpot', blurb: 'Public knowledge-base articles, fetched without a login.', icon: Users, brand: siHubspot, action: 'hubspot' },
    { name: 'Salesforce', blurb: 'Knowledge articles and case notes.', icon: CloudSun, brand: siSalesforce },
    { name: 'Help Scout', blurb: 'Public Docs articles, fetched without a login.', icon: MessageCircle, brand: siHelpscout, action: 'helpscout' },
  ] },
  { category: 'Databases & APIs', items: [
    { name: 'PostgreSQL', blurb: 'A SELECT, one record per row. Read-only, nothing stored.', icon: Database, brand: siPostgresql, action: 'postgres' },
    { name: 'MySQL', blurb: 'A SELECT, one record per row. Read-only, nothing stored.', icon: Database, brand: siMysql, action: 'mysql' },
    { name: 'MongoDB', blurb: 'Collections mapped to documents.', icon: Leaf, brand: siMongodb },
    { name: 'REST endpoint', blurb: 'One JSON response, flattened into records.', icon: ArrowLeftRight, action: 'rest' },
  ] },
]

// Source rows carry the loader's face, like the app's LoaderIcon. The API
// only returns a filename, so the kind is read off it: help-center imports
// carry "help center" in their title (and get the real Zendesk mark), web
// pages have no extension, and uploads keep theirs.
function SourceGlyph({ filename, className }: { filename: string; className?: string }) {
  if (/help center/i.test(filename)) return <BrandIcon brand={siZendesk} className={className} />
  const Icon = /\.(csv|json)$/i.test(filename) ? Database
    : /\.[a-z0-9]{2,5}$/i.test(filename) ? FileText
    : Globe
  return <Icon className={cn(className, 'text-muted-foreground')} />
}

// Same starter prompts as the app's empty chat screen.
const SUGGESTIONS = [
  { q: 'What does our refund policy say?', icon: FileText },
  { q: 'Summarise the key obligations in this contract.', icon: BookOpen },
  { q: 'Which clauses mention data retention?', icon: Database },
]

interface Turn {
  role: 'user' | 'assistant'
  content: string
  citations?: GroundedCitation[]
  grounded: boolean
  error?: boolean
  /** When the turn was created. Older stored chats may not carry one. */
  ts?: number
}

const fmtTime = (ts: number) =>
  new Date(ts).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })

// A finished conversation, as it lives in localStorage. Client-side only:
// the server never sees or stores chat history. Keyed per Clerk user so two
// accounts on one machine keep separate lists.
interface StoredChat {
  id: string
  createdAt: number
  updatedAt: number
  turns: Turn[]
}

const MAX_CHATS = 50

function chatTitle(chat: StoredChat): string {
  const first = chat.turns.find((t) => t.role === 'user')?.content.trim()
  return first ? (first.length > 64 ? `${first.slice(0, 64)}…` : first) : 'New conversation'
}

export function Playground({ getToken }: { getToken: () => Promise<string | null> }) {
  const { user } = useUser()
  const [files, setFiles] = useState<KnowledgeFile[] | null>(null)
  const [turns, setTurns] = useState<Turn[]>([])
  const [question, setQuestion] = useState('')
  const [busy, setBusy] = useState(false)
  const [uploading, setUploading] = useState<string | null>(null)
  const [picker, setPicker] = useState(false)
  const [srcOpen, setSrcOpen] = useState(false)
  const [form, setForm] = useState<LoaderId | null>(null)
  const [formTitle, setFormTitle] = useState('')
  const [formText, setFormText] = useState('')
  const [ytVideos, setYtVideos] = useState<YouTubeVideo[] | null>(null)
  const [ytSel, setYtSel] = useState<Set<string>>(new Set())
  const [dragOver, setDragOver] = useState(false)
  // @-mentions: typing '@' opens a picker over the composer; picked sources
  // narrow retrieval for that one question, Cursor-style.
  const [mention, setMention] = useState<{ query: string } | null>(null)
  const [mentionSel, setMentionSel] = useState(0)
  const [tagged, setTagged] = useState<{ id: string; name: string }[]>([])
  const taRef = useRef<HTMLTextAreaElement>(null)
  // Scope: which sources answer questions. Off is remembered locally so a
  // toggled-out source stays out across visits (the server has no flag).
  const [disabled, setDisabled] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem('pg.scope.off') ?? '[]')) } catch { return new Set() }
  })
  const toggleScope = (id: string) => setDisabled((prev) => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    localStorage.setItem('pg.scope.off', JSON.stringify([...next]))
    return next
  })
  const [ctxMenu, setCtxMenu] = useState<{ id: string; name: string; x: number; y: number } | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const pdfInput = useRef<HTMLInputElement>(null)
  const officeInput = useRef<HTMLInputElement>(null)
  const imageInput = useRef<HTMLInputElement>(null)
  const [formExtra, setFormExtra] = useState('')
  const [sqlPreview, setSqlPreview] = useState<SqlPreview | null>(null)
  const [sqlTesting, setSqlTesting] = useState(false)
  const scroller = useRef<HTMLDivElement>(null)

  // ---- Conversation history: localStorage per Clerk user, never the server.
  const storageKey = `pg.chats.${user?.id ?? 'anon'}`
  const [chats, setChats] = useState<StoredChat[]>([])
  const [chatId, setChatId] = useState<string | null>(null)
  const [histOpen, setHistOpen] = useState(false)

  useEffect(() => {
    try {
      const parsed: unknown = JSON.parse(localStorage.getItem(storageKey) ?? '[]')
      setChats(Array.isArray(parsed) ? (parsed as StoredChat[]) : [])
    } catch {
      setChats([])
    }
    setChatId(null)
    setTurns([])
  }, [storageKey])

  // Save when a turn completes - never per streamed token. Opening an old
  // chat re-sets the same turns reference, which the guard treats as "already
  // saved" so a mere read does not bump the chat to the top of the list.
  useEffect(() => {
    if (busy || turns.length === 0) return
    const existing = chatId ? chats.find((c) => c.id === chatId) : undefined
    if (existing && existing.turns === turns) return
    const now = Date.now()
    const id = chatId ?? crypto.randomUUID()
    const entry: StoredChat = existing
      ? { ...existing, turns, updatedAt: now }
      : { id, createdAt: now, updatedAt: now, turns }
    const next = [entry, ...chats.filter((c) => c.id !== id)].slice(0, MAX_CHATS)
    setChats(next)
    if (!chatId) setChatId(id)
    try { localStorage.setItem(storageKey, JSON.stringify(next)) } catch { /* quota - keep in memory */ }
  }, [busy, turns, chatId, chats, storageKey])

  const newChat = () => {
    if (busy) return
    setTurns([])
    setChatId(null)
    setHistOpen(false)
  }

  const openChat = (chat: StoredChat) => {
    if (busy) return
    setTurns(chat.turns)
    setChatId(chat.id)
    setHistOpen(false)
  }

  const deleteChat = (id: string) => {
    const next = chats.filter((c) => c.id !== id)
    setChats(next)
    try { localStorage.setItem(storageKey, JSON.stringify(next)) } catch { /* quota - keep in memory */ }
    if (id === chatId) {
      setChatId(null)
      setTurns([])
    }
  }

  const withToken = useCallback(async <T,>(fn: (t: string) => Promise<T>): Promise<T> => {
    const t = await getToken()
    if (!t) throw new Error('sign in required')
    return fn(t)
  }, [getToken])

  const refresh = useCallback(() => {
    withToken((t) => listFiles(t)).then((r) => setFiles(r.data)).catch(() => setFiles([]))
  }, [withToken])

  useEffect(() => { refresh() }, [refresh])
  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight })
  }, [turns])

  function fail(e: unknown) {
    toast.error(e instanceof Error ? e.message : 'Something went wrong')
  }

  async function ingest(label: string, work: (t: string) => Promise<unknown>) {
    setUploading(label)
    try {
      await withToken(work)
      setForm(null)
      setFormTitle('')
      setFormText('')
      refresh()
    } catch (e) {
      fail(e)
    } finally {
      setUploading(null)
    }
  }

  const addFiles = (list: FileList | File[]) =>
    ingest('Uploading…', async (t) => {
      for (const file of Array.from(list)) await uploadBinaryFile(t, file)
    })

  async function extractPdf(file: File): Promise<string> {
    const pdfjs = await import('pdfjs-dist')
    const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url')
    pdfjs.GlobalWorkerOptions.workerSrc = worker.default
    const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise
    const pages: string[] = []
    for (let p = 1; p <= doc.numPages; p += 1) {
      const content = await (await doc.getPage(p)).getTextContent()
      pages.push(content.items.map((i) => ('str' in i ? i.str : '')).join(' '))
    }
    const text = pages.join('\n\n').replace(/[ \t]+/g, ' ').trim()
    if (!text) throw new Error(`${file.name}: no extractable text`)
    return text
  }

  const addPdfs = (list: FileList) =>
    ingest('Extracting PDF…', async (t) => {
      for (const file of Array.from(list)) {
        await uploadTextFile(t, file.name.replace(/\.pdf$/i, '.txt'), await extractPdf(file))
      }
    })

  const addOffice = (list: FileList) =>
    ingest('Extracting text…', async (t) => {
      for (const file of Array.from(list)) {
        await uploadTextFile(t, file.name.replace(/\.(docx|pptx)$/i, '.txt'), await officeToText(file))
      }
    })

  const addImages = (list: FileList) =>
    ingest('Recognising text…', async (t) => {
      for (const file of Array.from(list)) {
        const text = await imageToText(file, (p) => setUploading(`Recognising text… ${Math.round(p * 100)}%`))
        await uploadTextFile(t, file.name.replace(/\.[^.]+$/, '') + '.txt', text)
      }
    })

  // SQL: the connection string is in formExtra, the query in formText. A
  // preview runs the same query with LIMIT 5 and stores nothing.
  async function testSql(engine: 'postgres' | 'mysql') {
    setSqlTesting(true)
    setSqlPreview(null)
    try {
      setSqlPreview(await withToken((t) => previewSql(t, engine, formExtra.trim(), formText.trim())))
    } catch (e) {
      fail(e)
    } finally {
      setSqlTesting(false)
    }
  }

  // Google Drive: consent, then Google's own picker; each picked file is
  // fetched from Google in this tab and pushed to /v1/files like a local
  // upload. Under drive.file, picking is what grants access.
  async function openDrive(id: LoaderId) {
    setPicker(false)
    let chosen: DriveFile[] = []
    try {
      chosen = await drivePick(await driveToken(), DRIVE_FILTERS[id] ?? 'all')
    } catch (e) {
      fail(e)
      return
    }
    if (chosen.length) await importDrive(chosen)
  }

  // YouTube: the Data API only releases captions to the video's owner, so
  // the list is the signed-in channel's uploads.
  async function openYouTube() {
    setForm('youtube')
    setYtVideos(null)
    setYtSel(new Set())
    try {
      const token = await youtubeToken()
      setYtVideos(await youtubeOwnVideos(token))
    } catch (e) {
      setForm(null)
      fail(e)
    }
  }

  const importYouTube = () =>
    ingest('Importing transcripts…', async (t) => {
      const token = await youtubeToken()
      const chosen = (ytVideos ?? []).filter((v) => ytSel.has(v.id))
      const missing: string[] = []
      for (const video of chosen) {
        const text = await youtubeTranscript(token, video.id)
        if (!text) { missing.push(video.title); continue }
        await uploadTextFile(t, `${video.title.slice(0, 120)}.txt`, `# ${video.title}\nhttps://www.youtube.com/watch?v=${video.id}\n\n${text}`)
      }
      if (missing.length) toast.warning(`No captions yet: ${missing.join(', ')}`)
    })

  const importDrive = (chosen: DriveFile[]) =>
    ingest('Importing from Drive…', async (t) => {
      const token = await driveToken()
      for (const file of chosen) {
        const got = await driveDownload(token, file)
        if ('text' in got) {
          const name = /\.(txt|md|csv|json|xml|html?)$/i.test(file.name) ? file.name : `${file.name}.txt`
          await uploadTextFile(t, name, got.text)
        } else if (file.mimeType === 'application/pdf') {
          await uploadTextFile(t, file.name.replace(/\.pdf$/i, '.txt'), await extractPdf(got.blob))
        } else {
          await uploadBinaryFile(t, got.blob)
        }
      }
    })

  async function ask() {
    const q = question.trim()
    if (!q || busy) return
    // @-tags narrow the scope for this one question: with chips present,
    // only those sources answer it.
    const scope = tagged.length
      ? tagged.map((m) => m.id)
      : (files ?? []).filter((f) => !disabled.has(f.id)).map((f) => f.id)
    const grounded = scope.length > 0
    setTagged([])
    setMention(null)
    setQuestion('')
    setBusy(true)
    const history = turns.filter((t) => !t.error).map(({ role, content }) => ({ role, content }))
    const now = Date.now()
    setTurns((ts) => [...ts, { role: 'user', content: q, grounded, ts: now }, { role: 'assistant', content: '', grounded, ts: now }])
    try {
      const token = await getToken()
      if (!token) throw new Error('sign in required')
      for await (const event of streamChat(token, [...history, { role: 'user', content: q }], grounded ? scope : null)) {
        setTurns((ts) => {
          const next = [...ts]
          const last = { ...next[next.length - 1] }
          if (event.kind === 'token') last.content += event.text
          else last.citations = event.citations
          next[next.length - 1] = last
          return next
        })
      }
    } catch (e) {
      setTurns((ts) => {
        const next = [...ts]
        next[next.length - 1] = {
          role: 'assistant', grounded: false, error: true,
          content: e instanceof Error ? e.message : 'request failed',
        }
        return next
      })
    } finally {
      setBusy(false)
    }
  }

  const ready = (files ?? []).length > 0
  const inScope = (files ?? []).filter((f) => !disabled.has(f.id))
  const scopePassages = inScope.reduce((n, f) => n + f.chunk_count, 0)

  // One composer, two homes: centered on the empty screen, pinned to the
  // bottom once a conversation is running. The proportions are the point:
  // a textarea with real body (two lines of reserved height), a flat
  // borderless toolbar underneath, and a radius that suits a tall box -
  // not a pill wrapped around one cramped line.
  const composerTool = 'flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground'

  const mentionMatches = mention === null ? [] : (files ?? [])
    .filter((f) => f.filename.toLowerCase().includes(mention.query.trim().toLowerCase()))
    .slice(0, 6)

  function syncMention(value: string, caret: number) {
    const m = value.slice(0, caret).match(/(?:^|\s)@([^@\n]*)$/)
    if (m && ready) {
      setMention({ query: m[1] })
      setMentionSel(0)
    } else {
      setMention(null)
    }
  }

  // Picking swallows the @query from the text and turns the source into a
  // chip above the field - a real label, not loose text the user can break.
  function pickMention(f: KnowledgeFile) {
    const ta = taRef.current
    const caret = ta ? ta.selectionStart : question.length
    const before = question.slice(0, caret).replace(/@[^@\n]*$/, '')
    setQuestion(before + question.slice(caret))
    setTagged((t) => (t.some((x) => x.id === f.id) ? t : [...t, { id: f.id, name: f.filename }]))
    setMention(null)
    requestAnimationFrame(() => {
      ta?.focus()
      ta?.setSelectionRange(before.length, before.length)
    })
  }

  const composer = (
    <div className="relative rounded-[20px] border border-input bg-card shadow-sm transition-colors focus-within:border-foreground/40">
      {mention !== null && mentionMatches.length > 0 && (
        <div className="absolute bottom-full left-4 z-30 mb-2 w-80 max-w-[calc(100%-2rem)] overflow-hidden rounded-lg border border-border bg-card py-1 shadow-lg">
          <div className="px-3 py-1.5 font-mono text-[10.5px] tracking-[0.11em] text-muted-foreground uppercase">Tag a source</div>
          {mentionMatches.map((f, i) => (
            <button
              key={f.id}
              onMouseDown={(e) => { e.preventDefault(); pickMention(f) }}
              onMouseEnter={() => setMentionSel(i)}
              className={cn('flex w-full items-center gap-2.5 px-3 py-2 text-left', i === mentionSel && 'bg-secondary/60')}
            >
              <span className="flex size-6 shrink-0 items-center justify-center rounded-md border border-border bg-background">
                <SourceGlyph filename={f.filename} className="size-3" />
              </span>
              <span className="min-w-0 flex-1 truncate text-[13px]">{f.filename}</span>
              <span className="shrink-0 font-mono text-[10.5px] text-muted-foreground">{f.chunk_count} passages</span>
            </button>
          ))}
        </div>
      )}
      {tagged.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 px-4 pt-3.5">
          {tagged.map((m) => (
            <span key={m.id} className="flex max-w-56 items-center gap-1.5 rounded-md border border-border bg-secondary/60 py-1 pr-1 pl-2 text-xs">
              <SourceGlyph filename={m.name} className="size-3 shrink-0" />
              <span className="truncate">{m.name}</span>
              <button
                onClick={() => setTagged((t) => t.filter((x) => x.id !== m.id))}
                className="rounded p-0.5 text-muted-foreground transition-colors hover:text-foreground"
                aria-label={`Remove ${m.name}`}
              >
                <X className="size-3" />
              </button>
            </span>
          ))}
        </div>
      )}
      <textarea
        ref={taRef}
        value={question}
        onChange={(e) => {
          setQuestion(e.target.value)
          syncMention(e.target.value, e.target.selectionStart)
        }}
        onKeyDown={(e) => {
          if (mention && mentionMatches.length) {
            if (e.key === 'ArrowDown') { e.preventDefault(); setMentionSel((s) => (s + 1) % mentionMatches.length); return }
            if (e.key === 'ArrowUp') { e.preventDefault(); setMentionSel((s) => (s - 1 + mentionMatches.length) % mentionMatches.length); return }
            if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); pickMention(mentionMatches[mentionSel]); return }
            if (e.key === 'Escape') { e.preventDefault(); setMention(null); return }
          }
          if (e.key === 'Backspace' && question === '' && tagged.length) {
            setTagged((t) => t.slice(0, -1))
            return
          }
          if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask() }
        }}
        onBlur={() => setMention(null)}
        placeholder={inScope.length ? `Ask about your ${inScope.length === 1 ? 'source' : `${inScope.length} sources`} — @ targets one…` : 'Ask anything…'}
        disabled={busy}
        rows={2}
        className={cn(
          'max-h-40 w-full resize-none bg-transparent px-5 pt-4 text-base leading-relaxed outline-none placeholder:text-muted-foreground disabled:opacity-60 sm:text-[15px]',
          tagged.length > 0 && 'pt-2',
        )}
      />
      <div className="flex items-center gap-1 px-2.5 pt-0.5 pb-2.5">
        <button onClick={() => setSrcOpen(true)} className={cn(composerTool, 'min-w-0')}>
          <Database className="size-4 shrink-0" strokeWidth={1.75} />
          <span className="truncate">{inScope.length ? `Sources · ${inScope.length} in scope` : 'Sources'}</span>
        </button>
        {/* Text labels yield to icons on a phone so the toolbar never wraps
            or scrolls at 375px. */}
        <button onClick={() => { if (!busy) setHistOpen(true) }} className={composerTool} aria-label="Conversation history">
          <History className="size-4" strokeWidth={1.75} />
          <span className="max-sm:hidden">History</span>
        </button>
        {inScope.length > 0 && (
          <button
            onClick={() => {
              // Hand the current scope to the Assistants screen, which opens
              // its create dialog with these sources preselected.
              sessionStorage.setItem('assistants.prefill', JSON.stringify(inScope.map((f) => f.id)))
              window.location.hash = 'assistants'
            }}
            className={composerTool}
            aria-label="Share as an assistant link"
          >
            <Share2 className="size-4" strokeWidth={1.75} />
            <span className="max-sm:hidden">Share</span>
          </button>
        )}
        <div className="flex-1" />
        <button
          onClick={ask}
          disabled={busy || !question.trim()}
          className="flex size-9 items-center justify-center rounded-full bg-foreground text-background transition-opacity disabled:opacity-30"
          aria-label="Send"
        >
          <ArrowUp className="size-4" />
        </button>
      </div>
    </div>
  )

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* ---- Sources: a drawer over the chat, not a permanent column. The
           canvas belongs to the conversation; knowledge slides in on demand. ---- */}
      <div
        className={cn(
          'fixed inset-0 z-40 bg-black/40 transition-opacity duration-200 motion-reduce:transition-none lg:left-[224px] lg:z-10',
          srcOpen ? 'opacity-100' : 'pointer-events-none opacity-0',
        )}
        onClick={() => setSrcOpen(false)}
      />
      <div
        inert={!srcOpen}
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex w-[300px] max-w-[85vw] flex-col border-r border-border bg-card shadow-xl transition-transform duration-200 ease-out motion-reduce:transition-none lg:left-[224px] lg:z-20',
          srcOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <span className="text-xs font-medium text-muted-foreground">Knowledge</span>
          <div className="flex items-center gap-1">
            <Button size="sm" variant="ghost" className="h-7 gap-1 px-2 text-xs" onClick={() => { setPicker(true); setForm(null) }}>
              <Plus className="size-3.5" /> Add source
            </Button>
            <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => setSrcOpen(false)} aria-label="Close sources">
              <X className="size-4" />
            </Button>
          </div>
        </div>

        <input ref={fileInput} type="file" multiple accept=".txt,.md,.markdown,.json,.html,.htm,.csv" className="hidden"
          onChange={(e) => e.target.files?.length && addFiles(e.target.files)} />
        <input ref={pdfInput} type="file" multiple accept=".pdf" className="hidden"
          onChange={(e) => e.target.files?.length && addPdfs(e.target.files)} />
        <input ref={officeInput} type="file" multiple accept=".docx,.pptx" className="hidden"
          onChange={(e) => e.target.files?.length && addOffice(e.target.files)} />
        <input ref={imageInput} type="file" multiple accept="image/*" className="hidden"
          onChange={(e) => e.target.files?.length && addImages(e.target.files)} />

        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault(); setDragOver(false)
            const dropped = Array.from(e.dataTransfer.files)
            const pdfs = dropped.filter((f) => f.name.toLowerCase().endsWith('.pdf'))
            const rest = dropped.filter((f) => !f.name.toLowerCase().endsWith('.pdf'))
            if (pdfs.length) { const dt = new DataTransfer(); pdfs.forEach((f) => dt.items.add(f)); addPdfs(dt.files) }
            if (rest.length) addFiles(rest)
          }}
          className={cn('flex-1 overflow-y-auto px-2 py-2 transition-colors', dragOver && 'bg-secondary/60')}
        >
          {files === null && [0, 1, 2].map((i) => (
            <div key={i} className="flex items-center gap-2.5 rounded-lg px-2 py-2">
              <Skeleton className="size-7 shrink-0 rounded-md" />
              <div className="min-w-0 flex-1 space-y-1.5">
                <Skeleton className="h-3.5 w-3/5" />
                <Skeleton className="h-2.5 w-2/5" />
              </div>
            </div>
          ))}
          {files?.length === 0 && (
            <button
              onClick={() => setPicker(true)}
              className="w-full rounded-xl border border-dashed border-border px-4 py-8 text-center text-xs text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground"
            >
              Drop documents here, or add a source.
              <div className="mt-1 font-mono text-[10.5px] opacity-70">files · pdf · web · zendesk</div>
            </button>
          )}
          {files?.map((f) => (
            <div
              key={f.id}
              onContextMenu={(e) => { e.preventDefault(); setCtxMenu({ id: f.id, name: f.filename, x: e.clientX, y: e.clientY }) }}
              className="group flex items-center gap-2.5 rounded-lg px-2 py-2 hover:bg-secondary/50"
            >
              <span className="flex size-7 shrink-0 items-center justify-center rounded-md border border-border bg-background">
                <SourceGlyph filename={f.filename} className="size-3.5" />
              </span>
              <div className={cn('min-w-0 flex-1 transition-opacity', disabled.has(f.id) && 'opacity-45')}>
                <div className="truncate text-[13px] font-medium">{f.filename}</div>
                <div className="font-mono text-[10.5px] text-muted-foreground">
                  {f.chunk_count} passages · {(f.bytes / 1024).toFixed(1)} KB{disabled.has(f.id) ? ' · out of scope' : ''}
                </div>
              </div>
              <Switch
                checked={!disabled.has(f.id)}
                onCheckedChange={() => toggleScope(f.id)}
                className="shrink-0 data-[state=checked]:bg-foreground"
                aria-label={`Include ${f.filename} in answers`}
              />
              {/* Right-click has no finger: the same menu opens from this
                  button, always visible on coarse pointers. */}
              <button
                onClick={(e) => {
                  const r = e.currentTarget.getBoundingClientRect()
                  setCtxMenu({ id: f.id, name: f.filename, x: r.right - 192, y: r.bottom + 4 })
                }}
                className="shrink-0 rounded-md p-1 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100 pointer-coarse:opacity-100 hover:text-foreground"
                aria-label={`Options for ${f.filename}`}
              >
                <EllipsisVertical className="size-4" />
              </button>
            </div>
          ))}
          {uploading && (
            <div className="flex items-center gap-2 px-2 py-2 text-xs text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" /> {uploading}
            </div>
          )}
        </div>

        <div className="border-t border-border px-4 py-2.5 font-mono text-[10.5px] text-muted-foreground">
          {files === null
            ? <Skeleton className="h-3 w-44" />
            : ready
              ? `${inScope.length} of ${files.length} ${files.length === 1 ? 'source' : 'sources'} · ${scopePassages} passages in scope`
              : 'No sources yet — chat works without them too'}
        </div>
      </div>

      {/* ---- History: same drawer pattern as Knowledge. Conversations live
           in this browser only - localStorage, per signed-in user. ---- */}
      <div
        className={cn(
          'fixed inset-0 z-40 bg-black/40 transition-opacity duration-200 motion-reduce:transition-none lg:left-[224px] lg:z-10',
          histOpen ? 'opacity-100' : 'pointer-events-none opacity-0',
        )}
        onClick={() => setHistOpen(false)}
      />
      <div
        inert={!histOpen}
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex w-[300px] max-w-[85vw] flex-col border-r border-border bg-card shadow-xl transition-transform duration-200 ease-out motion-reduce:transition-none lg:left-[224px] lg:z-20',
          histOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <span className="text-xs font-medium text-muted-foreground">Chats</span>
          <div className="flex items-center gap-1">
            <Button size="sm" variant="ghost" className="h-7 gap-1 px-2 text-xs" onClick={newChat}>
              <SquarePen className="size-3.5" /> New chat
            </Button>
            <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => setHistOpen(false)} aria-label="Close history">
              <X className="size-4" />
            </Button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-2 py-2">
          {chats.length === 0 && (
            <div className="px-4 py-8 text-center text-xs text-muted-foreground">
              No conversations yet.
              <div className="mt-1 font-mono text-[10.5px] opacity-70">chats stay in this browser</div>
            </div>
          )}
          {chats.map((chat) => (
            <div
              key={chat.id}
              className={cn(
                'group flex items-center gap-2 rounded-lg px-2 py-2 hover:bg-secondary/50',
                chat.id === chatId && 'bg-secondary/50',
              )}
            >
              <button onClick={() => openChat(chat)} className="min-w-0 flex-1 text-left">
                <div className="truncate text-[13px] font-medium">{chatTitle(chat)}</div>
                <div className="font-mono text-[10.5px] text-muted-foreground">
                  {formatDistanceToNowStrict(chat.updatedAt, { addSuffix: true })} · {chat.turns.length} {chat.turns.length === 1 ? 'message' : 'messages'}
                </div>
              </button>
              <button
                onClick={() => deleteChat(chat.id)}
                className="shrink-0 rounded-md p-1.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100 pointer-coarse:opacity-100 hover:text-destructive"
                aria-label={`Delete chat: ${chatTitle(chat)}`}
              >
                <Trash2 className="size-3.5" />
              </button>
            </div>
          ))}
        </div>

        <div className="border-t border-border px-4 py-2.5 font-mono text-[10.5px] text-muted-foreground">
          {chats.length === 0 ? 'Stored on this device only' : `${chats.length} ${chats.length === 1 ? 'chat' : 'chats'} · stored on this device only`}
        </div>
      </div>

      {/* ---- Chat: the whole canvas, straight on the paper background,
           like the app's chat screen. No card around the conversation. ---- */}
      <div className="flex min-h-0 flex-1 flex-col">
        {/* Empty state is a chat home, not a splash: headline, suggestions,
            and the composer together in one centered column. Once the first
            message is sent the composer drops to the bottom like any chat. */}
        {turns.length === 0 && (
          // justify-center on a scroll container clips the top once content is
          // taller than the viewport (small phones, open keyboard); my-auto on
          // the child centers the same way but degrades to scrollable.
          <div className="flex min-h-0 flex-1 flex-col items-center overflow-y-auto px-4 py-8 sm:px-6">
            <div className="my-auto w-[min(100%,max(60%,680px))]">
              <div className="mb-5 flex items-center justify-center gap-2.5">
                <div className="flex size-[26px] items-center justify-center rounded-md bg-foreground text-[13px] font-bold text-background">C</div>
                <span className="font-mono text-xs tracking-[0.14em] text-muted-foreground uppercase">Canonn R1</span>
              </div>
              <h2 className="text-center font-display text-[28px] leading-[1.12] font-semibold tracking-tight sm:text-[34px]">
                The model that trusts your data.
              </h2>
              <p className="mx-auto mt-3 max-w-md text-center text-sm leading-relaxed text-muted-foreground">
                {inScope.length
                  ? `${inScope.length} ${inScope.length === 1 ? 'source' : 'sources'} in scope. Every answer shows the passages it came from.`
                  : 'Add a website or a document, then ask about it. Canonn answers from what you give it — not from what it remembers.'}
              </p>
              {inScope.length > 0 && (
                // Phones drop the suggestions entirely - the headline and the
                // composer are the whole story, nothing between the question
                // and the input. The three cards return at sm.
                <div className="mt-9 hidden gap-2.5 sm:grid sm:grid-cols-3">
                  {SUGGESTIONS.map(({ q, icon: Icon }) => (
                    <button
                      key={q}
                      onClick={() => setQuestion(q)}
                      className="rounded-xl border border-border bg-card p-4 text-left transition-colors hover:border-foreground/30"
                    >
                      <Icon className="mb-2.5 size-4 text-muted-foreground" />
                      <div className="text-[13px] leading-snug text-foreground/85">{q}</div>
                    </button>
                  ))}
                </div>
              )}
              <div className="mt-6 sm:mt-9">{composer}</div>
              {/* Recognition marquee: full-color marks drifting by, faded at
                  the edges. Gone the moment a conversation starts, because
                  the whole empty state is. */}
              <div className="mt-8 flex flex-col items-center gap-3.5">
                <span className="font-mono text-[10.5px] tracking-[0.14em] text-muted-foreground uppercase">Bring knowledge from</span>
                <div className="w-full max-w-[560px] overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_18%,black_82%,transparent)]">
                  <div className="brand-marquee flex w-max items-center gap-9 py-1">
                    {[...BRAND_STRIP, ...BRAND_STRIP].map(({ name, brand }, i) => (
                      <button
                        key={`${name}-${i}`}
                        title={name}
                        aria-label={`Add a ${name} source`}
                        onClick={() => { setPicker(true); setForm(null) }}
                        className="shrink-0 transition-transform hover:scale-125"
                      >
                        <BrandIcon brand={brand} className="size-5" />
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {turns.length > 0 && (
        <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto px-4 py-6 sm:px-6">
          {/* One reading column, like the app and every serious chat: turns
              hold a comfortable measure instead of stretching pane-wide. */}
          <div className="mx-auto w-[min(100%,max(60%,680px))]">
          {turns.map((turn, i) =>
            turn.role === 'user' ? (
              <div key={i} className="group/turn mb-5 flex flex-col items-end">
                <div className="max-w-[85%] rounded-[18px] bg-secondary px-4 py-2.5 text-[15px] break-words whitespace-pre-wrap">{turn.content}</div>
                <div className="mt-1 flex items-center gap-1.5 pr-1 opacity-0 transition-opacity focus-within:opacity-100 group-hover/turn:opacity-100">
                  <CopyAnswer text={turn.content} />
                  {turn.ts && <span className="font-mono text-[10.5px] text-muted-foreground">{fmtTime(turn.ts)}</span>}
                </div>
              </div>
            ) : (
              <div key={i} className="group/turn mb-6">
                <div className="mb-1.5 font-mono text-[10.5px] tracking-[0.11em] text-muted-foreground uppercase">
                  Canonn R1
                  {turn.citations?.length
                    ? ` · grounded in ${turn.citations.length} ${turn.citations.length === 1 ? 'passage' : 'passages'}`
                    : (!turn.grounded && !turn.error ? ' · no sources in scope' : '')}
                </div>
                {turn.content === '' && busy && i === turns.length - 1 ? (
                  <div className="pt-1">
                    <span className="thinking-dot block size-2.5 rounded-full bg-foreground/80" />
                  </div>
                ) : (
                  turn.error ? (
                    <div className="text-sm leading-relaxed text-destructive">{turn.content}</div>
                  ) : (
                    <Answer text={turn.content} />
                  )
                )}
                {!!turn.citations?.length && <Citations citations={turn.citations} />}
                {/* Actions live under the message, where every chat keeps
                    them: copy shows on hover, the timestamp stays put. */}
                {!turn.error && turn.content && !(busy && i === turns.length - 1) && (
                  <div className="mt-1.5 flex items-center gap-1.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover/turn:opacity-100">
                    <CopyAnswer text={turn.content} />
                    {turn.ts && <span className="font-mono text-[10.5px] text-muted-foreground">{fmtTime(turn.ts)}</span>}
                  </div>
                )}
              </div>
            ),
          )}
          </div>
        </div>
        )}

        {turns.length > 0 && (
          <div className="p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            <div className="mx-auto w-[min(100%,max(60%,680px))]">{composer}</div>
          </div>
        )}
      </div>

      {ctxMenu && (
        <>
          {/* Above the sources drawer (z-50), so a tap anywhere - including
              inside the drawer - dismisses the menu. */}
          <div className="fixed inset-0 z-[60]" onClick={() => setCtxMenu(null)} onContextMenu={(e) => { e.preventDefault(); setCtxMenu(null) }} />
          <div
            className="fixed z-[65] w-48 overflow-hidden rounded-xl border border-border bg-card py-1 shadow-lg"
            style={{ left: Math.min(ctxMenu.x, window.innerWidth - 200), top: Math.min(ctxMenu.y, window.innerHeight - 100) }}
          >
            <button
              onClick={() => { toggleScope(ctxMenu.id); setCtxMenu(null) }}
              className="w-full px-3.5 py-2 text-left text-[13px] transition-colors hover:bg-secondary"
            >
              {disabled.has(ctxMenu.id) ? 'Include in answers' : 'Exclude from answers'}
            </button>
            <button
              onClick={() => {
                const { id } = ctxMenu
                setCtxMenu(null)
                withToken((t) => deleteFile(t, id)).then(refresh).catch(fail)
              }}
              className="flex w-full items-center gap-2 px-3.5 py-2 text-left text-[13px] text-destructive transition-colors hover:bg-secondary"
            >
              <Trash2 className="size-3.5" /> Delete source
            </button>
          </div>
        </>
      )}

      {/* ---- Source catalog ---- */}
      {picker && (
        // z-[70]: above the mobile sources sheet (z-50) and its scrim, so the
        // catalog never opens underneath the Knowledge panel.
        <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/40 p-4 sm:items-center" onClick={() => setPicker(false)}>
          <div
            className="max-h-[85vh] w-full max-w-xl overflow-y-auto rounded-xl border border-border bg-card p-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <span className="font-display text-lg font-semibold tracking-tight">New source</span>
              <button onClick={() => setPicker(false)} className="text-muted-foreground hover:text-foreground"><X className="size-4" /></button>
            </div>

            {!form && CATALOG.map(({ category, items }) => (
              <div key={category} className="mb-5 last:mb-0">
                <div className="mb-2 font-mono text-[10.5px] tracking-[0.11em] text-muted-foreground uppercase">{category}</div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {items.map(({ name, blurb, icon: Icon, brand, action }) => (
                    <button
                      key={name}
                      disabled={!action}
                      onClick={() => {
                        if (!action) return
                        if (action === 'upload') { setPicker(false); fileInput.current?.click() }
                        else if (action === 'pdf') { setPicker(false); pdfInput.current?.click() }
                        else if (action === 'office') { setPicker(false); officeInput.current?.click() }
                        else if (action === 'ocr') { setPicker(false); imageInput.current?.click() }
                        else if (action in DRIVE_FILTERS) void openDrive(action)
                        else if (action === 'youtube') void openYouTube()
                        else setForm(action)
                      }}
                      className={cn(
                        'flex items-start gap-2.5 rounded-lg border border-border bg-background p-3 text-left transition-colors',
                        action ? 'hover:border-foreground/30' : 'opacity-55',
                      )}
                    >
                      <span className="flex size-7 shrink-0 items-center justify-center rounded-md border border-border bg-card">
                        {brand
                          ? <BrandIcon brand={brand} className="size-3.5" />
                          : <Icon className="size-3.5 text-foreground/70" />}
                      </span>
                      <span className="min-w-0">
                        <span className="flex items-center gap-1.5 text-[13px] font-medium">
                          {name}
                          {!action && (
                            <span className="rounded-full border border-border px-1.5 py-px font-mono text-[10.5px] text-muted-foreground">Preview</span>
                          )}
                        </span>
                        <span className="mt-0.5 block text-xs leading-snug text-muted-foreground">
                          {action ? blurb : 'Needs a workspace connection.'}
                        </span>
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ))}

            {form && (
              <div>
                <button onClick={() => setForm(null)} className="mb-3 text-xs text-muted-foreground hover:text-foreground">← All sources</button>
                {form === 'paste' && (
                  <>
                    <Input value={formTitle} onChange={(e) => setFormTitle(e.target.value)} placeholder="Title (optional)" className="mb-2 h-9 bg-background text-sm" />
                    <textarea
                      value={formText}
                      onChange={(e) => setFormText(e.target.value)}
                      rows={8}
                      placeholder="Paste the text to answer from…"
                      className="w-full resize-none rounded-lg border border-input bg-background p-2.5 font-mono text-xs leading-relaxed outline-none focus:border-foreground/40"
                    />
                  </>
                )}
                {(form === 'web' || form === 'crawl') && (
                  <Input value={formText} onChange={(e) => setFormText(e.target.value)} placeholder="https://example.com/help" className="mb-1 h-9 bg-background font-mono text-xs" />
                )}
                {form === 'crawl' && (
                  <p className="mb-1 text-xs text-muted-foreground">Follows same-site links from this page, up to 8 pages.</p>
                )}
                {(form === 'sitemap' || form === 'feed') && (
                  <>
                    <Input value={formText} onChange={(e) => setFormText(e.target.value)} placeholder={form === 'sitemap' ? 'https://example.com/sitemap.xml' : 'https://example.com/feed.xml'} className="mb-1 h-9 bg-background font-mono text-xs" />
                    <p className="mb-1 text-xs text-muted-foreground">{form === 'sitemap' ? 'Up to 60 pages, each saved as its own record. Sitemap indexes are followed one level.' : 'RSS 2.0 or Atom. Teaser-only items are fetched from their link.'}</p>
                  </>
                )}
                {(form === 'intercom' || form === 'helpscout' || form === 'hubspot') && (
                  <>
                    <Input value={formText} onChange={(e) => setFormText(e.target.value)} placeholder={form === 'intercom' ? 'https://help.acme.com/en/' : form === 'helpscout' ? 'https://docs.acme.com' : 'https://knowledge.acme.com'} className="mb-1 h-9 bg-background font-mono text-xs" />
                    <p className="mb-1 text-xs text-muted-foreground">Public help centers only — every article, one record each, up to 150. A path like /en/ keeps one language.</p>
                  </>
                )}
                {form === 'github' && (
                  <>
                    <Input value={formText} onChange={(e) => setFormText(e.target.value)} placeholder="owner/repo or https://github.com/owner/repo" className="mb-1 h-9 bg-background font-mono text-xs" />
                    <p className="mb-1 text-xs text-muted-foreground">Public repositories: README, docs/ and every Markdown file, up to 80 files.</p>
                  </>
                )}
                {form === 'rest' && (
                  <>
                    <Input value={formText} onChange={(e) => setFormText(e.target.value)} placeholder="https://api.example.com/v1/items" className="mb-2 h-9 bg-background font-mono text-xs" />
                    <Input value={formExtra} onChange={(e) => setFormExtra(e.target.value)} placeholder="Authorization header (optional): Bearer …" className="mb-1 h-9 bg-background font-mono text-xs" />
                    <p className="mb-1 text-xs text-muted-foreground">One JSON response, flattened key by key. The header is used for this request only and never stored.</p>
                  </>
                )}
                {(form === 'postgres' || form === 'mysql') && (
                  <>
                    <Input type="password" autoComplete="off" value={formExtra} onChange={(e) => { setFormExtra(e.target.value); setSqlPreview(null) }} placeholder={form === 'postgres' ? 'postgres://user:password@host:5432/db' : 'mysql://user:password@host:3306/db'} className="mb-2 h-9 bg-background font-mono text-xs" />
                    <textarea
                      value={formText}
                      onChange={(e) => { setFormText(e.target.value); setSqlPreview(null) }}
                      rows={4}
                      spellCheck={false}
                      placeholder="select id, title, body from articles where published"
                      className="w-full resize-none rounded-lg border border-input bg-background p-2.5 font-mono text-xs leading-relaxed outline-none focus:border-foreground/40"
                    />
                    <p className="mb-1 mt-1 text-xs text-muted-foreground">SELECT only, up to 5,000 rows, one record per row. The database must be reachable from the internet; credentials are used for this import and never stored.</p>
                    {sqlPreview && (
                      <div className="mt-2 max-h-48 overflow-auto rounded-lg border border-border">
                        <table className="w-full text-left font-mono text-[11px]">
                          <thead><tr>{sqlPreview.columns.map((c) => <th key={c} className="border-b border-border px-2 py-1 font-medium text-muted-foreground">{c}</th>)}</tr></thead>
                          <tbody>
                            {sqlPreview.rows.map((r, i) => (
                              <tr key={i}>{sqlPreview.columns.map((c) => <td key={c} className="max-w-[220px] truncate border-b border-border px-2 py-1">{String(r[c] ?? '')}</td>)}</tr>
                            ))}
                            {sqlPreview.rows.length === 0 && <tr><td className="px-2 py-2 text-muted-foreground">The query returned no rows.</td></tr>}
                          </tbody>
                        </table>
                      </div>
                    )}
                    <Button
                      variant="outline"
                      onClick={() => void testSql(form)}
                      disabled={!formText.trim() || !formExtra.trim() || sqlTesting}
                      className="mt-2 h-9 w-full text-sm"
                    >
                      {sqlTesting ? <><Loader2 className="size-3.5 animate-spin" /> Testing…</> : 'Test query (first 5 rows)'}
                    </Button>
                  </>
                )}
                {form === 'gmail' && (
                  <>
                    <Input value={formText} onChange={(e) => setFormText(e.target.value)} placeholder="from:support@acme.com newer_than:90d" className="mb-1 h-9 bg-background font-mono text-xs" />
                    <p className="mb-1 text-xs text-muted-foreground">Any Gmail search. Up to 100 matching messages are read in this browser and saved as one source.</p>
                  </>
                )}
                {form === 'gcal' && (
                  <p className="mb-1 text-xs text-muted-foreground">Imports your primary calendar — the last 90 days and the next 180 — one record per event, read in this browser.</p>
                )}
                {form === 'zendesk' && (
                  <>
                    <Input value={formText} onChange={(e) => setFormText(e.target.value)} placeholder="support.yourcompany.com or subdomain" className="mb-1 h-9 bg-background font-mono text-xs" />
                    <p className="mb-1 text-xs text-muted-foreground">Public help centers only — every article via the Zendesk API.</p>
                  </>
                )}
                {form === 'youtube' && (
                  <>
                    <div className="mb-2 font-mono text-[10.5px] tracking-[0.11em] text-muted-foreground uppercase">Your uploads</div>
                    {ytVideos === null && (
                      <div className="flex items-center gap-2 py-6 text-xs text-muted-foreground"><Loader2 className="size-3.5 animate-spin" /> Waiting for Google…</div>
                    )}
                    {ytVideos?.length === 0 && (
                      <p className="py-6 text-xs text-muted-foreground">This Google account has no videos on its channel.</p>
                    )}
                    {ytVideos && ytVideos.length > 0 && (
                      <div className="max-h-[45vh] overflow-y-auto rounded-lg border border-border">
                        {ytVideos.map((v) => {
                          const on = ytSel.has(v.id)
                          return (
                            <label key={v.id} className="flex cursor-pointer items-center gap-2.5 border-b border-border px-3 py-2 last:border-b-0 hover:bg-muted/40">
                              <input
                                type="checkbox"
                                checked={on}
                                onChange={() => setYtSel((s) => { const n = new Set(s); if (on) n.delete(v.id); else n.add(v.id); return n })}
                                className="size-3.5 accent-foreground"
                              />
                              <span className="min-w-0 flex-1 truncate text-[13px]">{v.title}</span>
                              <span className="shrink-0 font-mono text-[10.5px] text-muted-foreground">{v.publishedAt.slice(0, 10)}</span>
                            </label>
                          )
                        })}
                      </div>
                    )}
                    <p className="mt-2 text-xs text-muted-foreground">
                      YouTube releases captions only to a video's owner, so this lists your channel. Transcripts come to this browser and are added as sources.
                    </p>
                    <div className="mt-2 flex gap-2">
                      <Button
                        onClick={() => { void importYouTube(); setPicker(false) }}
                        disabled={ytSel.size === 0 || !!uploading}
                        className="h-9 flex-1 text-sm"
                      >
                        Import {ytSel.size} {ytSel.size === 1 ? 'transcript' : 'transcripts'}
                      </Button>
                      <Button variant="outline" onClick={() => { void googleDisconnect(); setForm(null) }} className="h-9 text-sm">
                        Disconnect
                      </Button>
                    </div>
                  </>
                )}
                {form !== 'youtube' && <Button
                  onClick={() => {
                    if (form === 'paste') {
                      const name = (formTitle.trim() || 'Pasted text').slice(0, 80)
                      ingest('Adding…', (t) => uploadTextFile(t, name.endsWith('.md') ? name : `${name}.md`, formText))
                    } else if (form === 'web') ingest('Fetching page…', (t) => uploadFromUrl(t, formText.trim(), false))
                    else if (form === 'crawl') ingest('Crawling…', (t) => uploadFromUrl(t, formText.trim(), true))
                    else if (form === 'zendesk') ingest('Importing articles…', (t) => uploadFromZendesk(t, formText.trim()))
                    else if (form === 'sitemap') ingest('Reading sitemap…', (t) => uploadFromSitemap(t, formText.trim()))
                    else if (form === 'feed') ingest('Reading feed…', (t) => uploadFromFeed(t, formText.trim()))
                    else if (form === 'intercom' || form === 'helpscout' || form === 'hubspot') ingest('Importing articles…', (t) => uploadFromHelpCenter(t, form, formText.trim()))
                    else if (form === 'github') ingest('Reading repository…', (t) => uploadFromGithub(t, formText.trim()))
                    else if (form === 'rest') { const auth = formExtra.trim(); setFormExtra(''); ingest('Fetching JSON…', (t) => uploadFromRest(t, formText.trim(), auth || undefined)) }
                    else if (form === 'postgres' || form === 'mysql') {
                      const engine = form, conn = formExtra.trim(), query = formText.trim()
                      setFormExtra(''); setSqlPreview(null)
                      ingest('Running query…', (t) => uploadFromSql(t, engine, conn, query))
                    }
                    else if (form === 'gmail') {
                      const query = formText.trim()
                      ingest('Reading Gmail…', async (t) => {
                        const got = await gmailSearch(await gmailToken(), query)
                        if (got.count === 0) throw new Error('No messages matched that search')
                        await uploadTextFile(t, `Gmail - ${query.slice(0, 60)}.md`, got.text)
                      })
                    } else if (form === 'gcal') {
                      ingest('Reading Calendar…', async (t) => {
                        const got = await calendarEvents(await calendarToken())
                        if (got.count === 0) throw new Error('No events in that window')
                        await uploadTextFile(t, 'Google Calendar.md', got.text)
                      })
                    }
                    setPicker(false)
                  }}
                  disabled={(form !== 'gcal' && !formText.trim()) || ((form === 'postgres' || form === 'mysql') && !formExtra.trim()) || !!uploading}
                  className="mt-2 h-9 w-full text-sm"
                >
                  Add source
                </Button>}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}



function CopyAnswer({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      onClick={() => {
        void navigator.clipboard.writeText(text)
        setCopied(true)
        setTimeout(() => setCopied(false), 1500)
      }}
      className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 font-mono text-[10.5px] tracking-[0.08em] text-muted-foreground uppercase hover:text-foreground"
      aria-label="Copy answer"
    >
      {copied ? <Check className="size-3 text-foreground" /> : <Copy className="size-3" />}
      {copied ? 'Copied' : 'Copy'}
    </button>
  )
}

function Inline({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`|\[\d+\])/g)
  return (
    <>
      {parts.map((part, i) => {
        if (/^\*\*[^*]+\*\*$/.test(part)) return <strong key={i} className="font-semibold">{part.slice(2, -2)}</strong>
        if (/^`[^`]+`$/.test(part)) {
          return <code key={i} className="rounded bg-secondary px-1 py-0.5 font-mono text-xs">{part.slice(1, -1)}</code>
        }
        if (/^\[\d+\]$/.test(part)) return <sup key={i} className="font-mono text-xs font-semibold" style={{ color: ACCENT }}>{part}</sup>
        return <span key={i}>{part}</span>
      })}
    </>
  )
}

function Answer({ text }: { text: string }) {
  const blocks = text.split(/\n/)
  return (
    <div className="space-y-1 text-[15px] leading-[1.7] break-words">
      {blocks.map((line, i) => {
        const heading = line.match(/^(#{1,6})\s+(.*)$/)
        if (heading) {
          return (
            <div key={i} className={cn('pt-1 font-semibold', heading[1].length <= 2 ? 'text-[16px]' : 'text-sm')}>
              <Inline text={heading[2]} />
            </div>
          )
        }
        const bullet = line.match(/^\s*(?:[-*•]|\d+\.)\s+(.*)$/)
        if (bullet) {
          return (
            <div key={i} className="flex gap-2 pl-1">
              <span className="mt-[9px] size-1 shrink-0 rounded-full bg-muted-foreground" />
              <span className="min-w-0"><Inline text={bullet[1]} /></span>
            </div>
          )
        }
        if (!line.trim()) return <div key={i} className="h-1.5" />
        return <div key={i}><Inline text={line} /></div>
      })}
    </div>
  )
}

function Citations({ citations }: { citations: GroundedCitation[] }) {
  // Closed by default: the answer stands on its own, and one quiet line
  // says the evidence is there for whoever wants to inspect it.
  const [expanded, setExpanded] = useState(false)
  const [open, setOpen] = useState<number | null>(null)
  const sources = new Set(citations.map((c) => c.file_id)).size
  return (
    <div className="mt-2.5">
      <button
        onClick={() => { setExpanded(!expanded); setOpen(null) }}
        className="flex items-center gap-1.5 rounded-md py-0.5 font-mono text-[10.5px] tracking-[0.11em] text-muted-foreground uppercase transition-colors hover:text-foreground"
      >
        <span className="size-1.5 rounded-full" style={{ background: ACCENT }} />
        {sources} {sources === 1 ? 'source' : 'sources'}
        <ChevronDown className={cn('size-3 transition-transform', expanded && 'rotate-180')} />
      </button>
      {/* Evidence as quote cards, matching the app: collapsed shows the line
          the answer drew on, tapping opens the full passage in place. */}
      {expanded && <div className="mt-2 space-y-2">
        {citations.slice(0, 6).map((c, i) => (
          <button
            key={`${c.file_id}-${c.ordinal}`}
            onClick={() => setOpen(open === i ? null : i)}
            className="block w-full rounded-lg border border-border bg-secondary/60 px-3.5 py-3 text-left transition-colors hover:bg-secondary"
          >
            {c.excerpt && (
              <div className={cn(
                'mb-2 text-[13px] leading-relaxed break-words whitespace-pre-wrap',
                open !== i && 'line-clamp-3',
              )}>
                {open === i ? c.excerpt : `“${c.excerpt.trim()}”`}
              </div>
            )}
            <div className="flex items-center gap-2">
              <span className="font-mono text-[10.5px] font-semibold" style={{ color: ACCENT }}>{i + 1}</span>
              <span className="min-w-0 flex-1 truncate font-mono text-[10.5px] text-muted-foreground">{c.filename}</span>
              <span className="font-mono text-[10.5px] text-muted-foreground">§{c.ordinal + 1}</span>
              <ChevronDown className={cn('size-3.5 text-muted-foreground transition-transform', open === i && 'rotate-180')} />
            </div>
          </button>
        ))}
      </div>}
    </div>
  )
}

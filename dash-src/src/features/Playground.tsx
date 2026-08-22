import { useCallback, useEffect, useRef, useState } from 'react'
import { useUser } from '@clerk/clerk-react'
import { formatDistanceToNowStrict } from 'date-fns'
import {
  Archive, ArrowLeftRight, ArrowUp, ArrowUpRight, BarChart3, BookOpen, Braces,
  Check, ChevronDown, ClipboardType, CloudSun, Copy, Database, EllipsisVertical,
  FileCode, FileText, FileType, FolderOpen, GitBranch, Globe, HardDrive, Hash,
  Headset, History, Leaf, LifeBuoy, Link2, List, Loader2, MessageCircle, MessageSquare,
  Mic, Network, Package, Play, Plus, Rss, ScanLine, Server, SquarePen, StickyNote,
  Table, Trash2, Type, Users, X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import {
  deleteFile, listFiles, streamChat, uploadBinaryFile, uploadFromUrl,
  uploadFromZendesk, uploadTextFile,
  type GroundedCitation, type KnowledgeFile,
} from '@/lib/api'

// The dashboard twin of the app's Chat + Knowledge screens, running entirely
// on the public API: /v1/files for ingestion, streamed grounded completions
// for answers. Same visual language as the app - terracotta only where the
// eye should go, mono uppercase labels, citation cards under every answer.

// Terracotta is reserved for evidence - citation markers and source indices.
// Actions, focus, and chrome use ink, so the accent only ever means "this is
// backed by your data".
const ACCENT = '#c96442'

type LoaderId = 'upload' | 'paste' | 'web' | 'crawl' | 'pdf' | 'zendesk'

// The app's loader catalog (LoaderCatalog.swift), mirrored: the same
// categories, names, and summaries. Loaders with an `action` run on the API
// today; the rest are listed honestly as Preview, exactly like the app marks
// connectors that need a workspace connection.
interface CatalogItem {
  name: string
  blurb: string
  icon: typeof Globe
  action?: LoaderId
}

const CATALOG: { category: string; items: CatalogItem[] }[] = [
  { category: 'Web', items: [
    { name: 'Web page', blurb: 'Fetch one URL and strip it to clean text.', icon: Link2, action: 'web' },
    { name: 'Website crawl', blurb: 'Follow links from a starting page, up to 8 pages.', icon: Network, action: 'crawl' },
    { name: 'Sitemap', blurb: 'Ingest every URL listed in a sitemap.xml.', icon: List },
    { name: 'RSS / Atom feed', blurb: 'Pull articles from a syndication feed.', icon: Rss },
    { name: 'YouTube transcript', blurb: 'Import the transcript of a video or playlist.', icon: Play },
  ] },
  { category: 'Files', items: [
    { name: 'PDF', blurb: 'Contracts, reports, policies — text extracted page by page.', icon: FileText, action: 'pdf' },
    { name: 'Text & Markdown', blurb: 'Plain .txt, .md and .html documents.', icon: Type, action: 'upload' },
    { name: 'CSV & spreadsheets', blurb: 'Row data flattened into readable records.', icon: Table, action: 'upload' },
    { name: 'JSON & XML', blurb: 'Structured exports, flattened key by key.', icon: Braces, action: 'upload' },
    { name: 'HTML archive', blurb: 'Saved pages, help-centre exports.', icon: FileCode, action: 'upload' },
    { name: 'Paste text', blurb: 'Drop in a policy, an email thread, a snippet of notes.', icon: ClipboardType, action: 'paste' },
    { name: 'Word & PowerPoint', blurb: '.docx and .pptx, text extracted on device.', icon: FileType },
    { name: 'Scanned images', blurb: 'OCR for photographed or scanned documents.', icon: ScanLine },
    { name: 'Audio & meetings', blurb: 'Transcribe recordings and calls into text.', icon: Mic },
  ] },
  { category: 'Cloud storage', items: [
    { name: 'Google Drive', blurb: 'Connect your Drive and import documents directly.', icon: FolderOpen },
    { name: 'Dropbox', blurb: 'Pick documents straight from your Dropbox folder.', icon: Package },
    { name: 'OneDrive / SharePoint', blurb: 'Pick documents from your Microsoft 365 libraries.', icon: HardDrive },
    { name: 'Box', blurb: 'Pick documents straight from your Box folder.', icon: Archive },
    { name: 'Amazon S3', blurb: 'Ingest a bucket or prefix using your own keys.', icon: Server },
  ] },
  { category: 'Workspace', items: [
    { name: 'Notion', blurb: 'Pages and databases from a workspace.', icon: StickyNote },
    { name: 'Confluence', blurb: 'Spaces and pages from Atlassian.', icon: BookOpen },
    { name: 'Slack', blurb: 'Channel history as searchable knowledge.', icon: Hash },
    { name: 'Google Docs', blurb: 'Individual documents by link.', icon: FileText },
    { name: 'Jira', blurb: 'Issues, descriptions and comments.', icon: Check },
    { name: 'Linear', blurb: 'Issues and project documents.', icon: ArrowUpRight },
    { name: 'Airtable', blurb: 'Bases and tables as records.', icon: Table },
  ] },
  { category: 'Code', items: [
    { name: 'GitHub', blurb: 'Repository files, READMEs and wikis.', icon: FileCode },
    { name: 'GitLab', blurb: 'Projects and wikis from GitLab.', icon: GitBranch },
    { name: 'Documentation site', blurb: 'Crawl a docs site and keep its page structure.', icon: BookOpen, action: 'crawl' },
  ] },
  { category: 'Support & CRM', items: [
    { name: 'Zendesk', blurb: 'Public help-centre articles, fetched without a login.', icon: LifeBuoy, action: 'zendesk' },
    { name: 'Intercom', blurb: 'Articles and saved replies.', icon: MessageSquare },
    { name: 'HubSpot', blurb: 'Knowledge base and CRM notes.', icon: Users },
    { name: 'Salesforce', blurb: 'Knowledge articles and case notes.', icon: CloudSun },
    { name: 'Help Scout', blurb: 'Docs collections and saved replies.', icon: MessageCircle },
  ] },
  { category: 'Databases & APIs', items: [
    { name: 'PostgreSQL', blurb: 'Materialise a query result as documents.', icon: Database },
    { name: 'MySQL', blurb: 'Same as Postgres, against a MySQL instance.', icon: Database },
    { name: 'MongoDB', blurb: 'Collections mapped to documents.', icon: Leaf },
    { name: 'BigQuery', blurb: 'Warehouse tables as knowledge records.', icon: BarChart3 },
    { name: 'REST endpoint', blurb: 'Poll a JSON API and map fields to documents.', icon: ArrowLeftRight },
  ] },
]

// Source rows carry the loader's face, like the app's LoaderIcon. The API
// only returns a filename, so the kind is read off it: help-center imports
// carry "help center" in their title, web pages have no extension, and
// uploads keep theirs.
function sourceIcon(filename: string): typeof Globe {
  if (/help center/i.test(filename)) return Headset
  if (/\.(csv|json)$/i.test(filename)) return Database
  if (/\.[a-z0-9]{2,5}$/i.test(filename)) return FileText
  return Globe
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
}

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
  const [dragOver, setDragOver] = useState(false)
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

  const addPdfs = (list: FileList) =>
    ingest('Extracting PDF…', async (t) => {
      const pdfjs = await import('pdfjs-dist')
      const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url')
      pdfjs.GlobalWorkerOptions.workerSrc = worker.default
      for (const file of Array.from(list)) {
        const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise
        const pages: string[] = []
        for (let p = 1; p <= doc.numPages; p += 1) {
          const content = await (await doc.getPage(p)).getTextContent()
          pages.push(content.items.map((i) => ('str' in i ? i.str : '')).join(' '))
        }
        const text = pages.join('\n\n').replace(/[ \t]+/g, ' ').trim()
        if (!text) throw new Error(`${file.name}: no extractable text`)
        await uploadTextFile(t, file.name.replace(/\.pdf$/i, '.txt'), text)
      }
    })

  async function ask() {
    const q = question.trim()
    if (!q || busy) return
    const scope = (files ?? []).filter((f) => !disabled.has(f.id)).map((f) => f.id)
    const grounded = scope.length > 0
    setQuestion('')
    setBusy(true)
    const history = turns.filter((t) => !t.error).map(({ role, content }) => ({ role, content }))
    setTurns((ts) => [...ts, { role: 'user', content: q, grounded }, { role: 'assistant', content: '', grounded }])
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
  const composer = (
    <div className="rounded-[20px] border border-input bg-card shadow-sm transition-colors focus-within:border-foreground/40">
      <textarea
        value={question}
        onChange={(e) => setQuestion(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask() } }}
        placeholder={inScope.length ? `Ask about your ${inScope.length === 1 ? 'source' : `${inScope.length} sources`}…` : 'Ask anything…'}
        disabled={busy}
        rows={2}
        className="max-h-40 w-full resize-none bg-transparent px-5 pt-4 text-base leading-relaxed outline-none placeholder:text-muted-foreground disabled:opacity-60 sm:text-[15px]"
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
                {(() => { const Icon = sourceIcon(f.filename); return <Icon className="size-3.5 text-muted-foreground" /> })()}
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
            <div className="my-auto w-full max-w-2xl">
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
            </div>
          </div>
        )}

        {turns.length > 0 && (
        <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto px-4 py-6 sm:px-6">
          {/* One reading column, like the app and every serious chat: turns
              hold a comfortable measure instead of stretching pane-wide. */}
          <div className="mx-auto w-full max-w-[760px]">
          {turns.map((turn, i) =>
            turn.role === 'user' ? (
              <div key={i} className="mb-5 flex justify-end">
                <div className="max-w-[85%] rounded-[18px] bg-secondary px-4 py-2.5 text-[15px] break-words whitespace-pre-wrap">{turn.content}</div>
              </div>
            ) : (
              <div key={i} className="group/turn mb-6">
                <div className="mb-1.5 flex items-center gap-2 font-mono text-[10.5px] tracking-[0.11em] text-muted-foreground uppercase">
                  <span>
                  Canonn R1
                  {turn.citations?.length
                    ? ` · grounded in ${turn.citations.length} ${turn.citations.length === 1 ? 'passage' : 'passages'}`
                    : (!turn.grounded && !turn.error ? ' · no sources in scope' : '')}
                  </span>
                  {!turn.error && turn.content && !(busy && i === turns.length - 1) && <CopyAnswer text={turn.content} />}
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
              </div>
            ),
          )}
          </div>
        </div>
        )}

        {turns.length > 0 && (
          <div className="p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            <div className="mx-auto w-full max-w-[760px]">{composer}</div>
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
                  {items.map(({ name, blurb, icon: Icon, action }) => (
                    <button
                      key={name}
                      disabled={!action}
                      onClick={() => {
                        if (!action) return
                        if (action === 'upload') { setPicker(false); fileInput.current?.click() }
                        else if (action === 'pdf') { setPicker(false); pdfInput.current?.click() }
                        else setForm(action)
                      }}
                      className={cn(
                        'flex items-start gap-2.5 rounded-lg border border-border bg-background p-3 text-left transition-colors',
                        action ? 'hover:border-foreground/30' : 'opacity-55',
                      )}
                    >
                      <span className="flex size-7 shrink-0 items-center justify-center rounded-md border border-border bg-card">
                        <Icon className="size-3.5 text-foreground/70" />
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
                {form === 'zendesk' && (
                  <>
                    <Input value={formText} onChange={(e) => setFormText(e.target.value)} placeholder="support.yourcompany.com or subdomain" className="mb-1 h-9 bg-background font-mono text-xs" />
                    <p className="mb-1 text-xs text-muted-foreground">Public help centers only — every article via the Zendesk API.</p>
                  </>
                )}
                <Button
                  onClick={() => {
                    if (form === 'paste') {
                      const name = (formTitle.trim() || 'Pasted text').slice(0, 80)
                      ingest('Adding…', (t) => uploadTextFile(t, name.endsWith('.md') ? name : `${name}.md`, formText))
                    } else if (form === 'web') ingest('Fetching page…', (t) => uploadFromUrl(t, formText.trim(), false))
                    else if (form === 'crawl') ingest('Crawling…', (t) => uploadFromUrl(t, formText.trim(), true))
                    else if (form === 'zendesk') ingest('Importing articles…', (t) => uploadFromZendesk(t, formText.trim()))
                    setPicker(false)
                  }}
                  disabled={!formText.trim() || !!uploading}
                  className="mt-2 h-9 w-full text-sm"
                >
                  Add source
                </Button>
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
      className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 font-mono text-[10.5px] tracking-[0.08em] text-muted-foreground uppercase opacity-0 transition-opacity group-hover/turn:opacity-100 hover:text-foreground focus:opacity-100"
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

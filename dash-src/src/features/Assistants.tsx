import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { formatDistanceToNowStrict } from 'date-fns'
import { Check, Copy, ExternalLink, FileText, Globe, Link2, Lock, Share2, Sparkles, SquarePen, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'
import {
  createShare, deleteShare, fmt, listFiles, listShares, removeShareDomain,
  revokeShare, setShareDomain, shareDomainStatus, updateShare,
  type DomainStatus, type KnowledgeFile, type Me, type ShareRow,
} from '@/lib/api'

// Shared assistants: a business pre-scopes sources and instructions, then
// hands customers one link (canonn.ai/c/#token). Creation can start here or
// from the Playground's Share button, which prefills the current scope.

/** The Playground drops file ids here before jumping to this screen. */
export const SHARE_PREFILL_KEY = 'assistants.prefill'

// Terracotta means one thing across this console - "backed by your data" -
// so here it marks only the sources an assistant answers from, the same way
// it marks citations in the Playground. Live/connected state wears the
// console's green, exactly like Billing's auto-reload chip and primary card.
const ACCENT = '#c96442'

// The mono uppercase micro-label: the console's smallest unit of structure.
const MICRO = 'font-mono text-[10.5px] tracking-[0.11em] text-muted-foreground uppercase'
const LABEL = `mb-1.5 block ${MICRO}`

// The three zones of a dialog that is a sheet on a phone. On a narrow screen
// they read as a sticky header, a scrolling body and a pinned footer; from sm:
// up the padding adds back up to the p-4/gap-4 dialog this console has always
// used, so nothing changes on a desktop.
const SHEET_HEAD = 'border-b border-border px-4 py-3.5 pr-12 sm:border-b-0 sm:pt-4 sm:pr-10 sm:pb-0'
const SHEET_BODY = 'space-y-4 overflow-y-auto px-4 py-4 sm:pt-4 sm:pb-0'
const SHEET_FOOT = 'border-t border-border px-4 py-3 sm:border-t-0 sm:pt-4 sm:pb-4'
// Comfortable on a thumb, unchanged on a mouse.
const FIELD = 'h-11 sm:h-9'
const ACTION = 'h-11 w-full sm:h-8'
// Card-level controls: a real tap target on a phone, compact on a pointer.
const ROW_ACTION = 'h-9 gap-1.5 px-2.5 text-xs sm:h-8'

/** An address is read as a host, not as a protocol. */
const prettyUrl = (url: string) => url.replace(/^https?:\/\//, '').replace(/\/$/, '')

interface Address { key: string; url: string; label: string; own: boolean }

// Every place the assistant answers, most branded first: the customer's own
// domain, then their subdomain, then the token link that always works.
function addressesOf(s: ShareRow): Address[] {
  const out: Address[] = []
  if (s.custom_domain) out.push({ key: 'domain', url: `https://${s.custom_domain}`, label: s.custom_domain, own: true })
  if (s.vanity_url) out.push({ key: 'vanity', url: s.vanity_url, label: prettyUrl(s.vanity_url), own: true })
  out.push({ key: 'token', url: s.url, label: prettyUrl(s.url), own: false })
  return out
}

/** Live or revoked, in colour and in shape - filled dot against hollow ring. */
function StatusPill({ live }: { live: boolean }) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2 py-0.5 font-mono text-[10.5px]',
        live ? 'border-[#3f7d54]/30 bg-[#3f7d54]/10 text-[#3f7d54]' : 'border-border text-muted-foreground',
      )}
    >
      <span className={cn('size-1.5 rounded-full', live ? 'bg-current' : 'border border-current')} />
      {live ? 'Live' : 'Revoked'}
    </span>
  )
}

/** One figure with its label. Traffic is a stat, not a sentence. */
function Stat({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className={cn('min-w-0', className)}>
      <div className={MICRO}>{label}</div>
      <div className="mt-0.5 truncate font-mono text-[13px]">{value}</div>
    </div>
  )
}

/** A certificate is either issued or on its way - shown, not described. */
function DomainChip({ active }: { active: boolean }) {
  return active ? (
    <span className="inline-flex shrink-0 items-center gap-1.5 font-mono text-[10.5px] text-[#3f7d54]">
      <span className="size-1.5 rounded-full bg-current" /> Connected
    </span>
  ) : (
    <span className="inline-flex shrink-0 items-center gap-1.5 font-mono text-[10.5px] text-muted-foreground">
      <span className="size-1.5 animate-pulse rounded-full bg-current" /> Verifying…
    </span>
  )
}

// Paid ground: unlocked it is a set of real fields; locked it is a preview of
// what the money buys, with the customer's own traffic as the argument. Never
// a row of greyed-out controls - a locked door, not a broken one.
function BrandingPanel({
  paid, slug, onSlug, hideBranding, onHideBranding, impressions, domain,
}: {
  paid: boolean
  slug: string
  onSlug: (v: string) => void
  hideBranding: boolean
  onHideBranding: (v: boolean) => void
  impressions: number
  domain: ReactNode
}) {
  return (
    <div className={cn('rounded-xl border border-border p-3.5', paid ? 'bg-transparent' : 'bg-secondary/40')}>
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5">
          {paid ? <Sparkles className="size-3 text-muted-foreground" /> : <Lock className="size-3 text-muted-foreground" />}
          <span className={MICRO}>Branding</span>
        </span>
        {paid ? (
          <span className="rounded-full border border-[#3f7d54]/30 bg-[#3f7d54]/10 px-2 py-0.5 font-mono text-[10.5px] text-[#3f7d54]">Unlocked</span>
        ) : (
          <span className="rounded-full border border-border bg-background px-2 py-0.5 font-mono text-[10.5px] text-muted-foreground">With credits</span>
        )}
      </div>

      {paid ? (
        <>
          <label className={cn(LABEL, 'mt-3')}>Branded link</label>
          <div className="flex items-center gap-1.5">
            <Input
              value={slug}
              onChange={(e) => onSlug(e.target.value.toLowerCase())}
              placeholder="grammarly"
              className={cn(FIELD, 'font-mono text-xs')}
              maxLength={31}
            />
            <span className="shrink-0 font-mono text-xs text-muted-foreground">.canonn.ai</span>
          </div>
          <label className="mt-3.5 flex cursor-pointer items-center justify-between gap-3 py-1.5 sm:py-0">
            <span className="text-[13px]">Hide &ldquo;Powered by Canonn&rdquo;</span>
            <Switch checked={hideBranding} onCheckedChange={onHideBranding} className="data-[state=checked]:bg-foreground" />
          </label>
        </>
      ) : (
        <>
          <p className="mt-2.5 text-[13px] leading-relaxed">Your name on the assistant, instead of ours.</p>
          <div className="mt-2.5 space-y-1.5">
            {[
              { icon: Link2, sample: slug ? `${slug}.canonn.ai` : 'yourname.canonn.ai', note: 'A branded subdomain' },
              { icon: Globe, sample: 'chat.yourcompany.com', note: 'Your own domain' },
              { icon: Sparkles, sample: 'No “Powered by Canonn”', note: 'Your footer, not ours' },
            ].map(({ icon: Icon, sample, note }) => (
              <div key={note} className="flex items-center gap-2 rounded-lg border border-border bg-background px-2.5 py-2">
                <Icon className="size-3.5 shrink-0 text-muted-foreground" strokeWidth={1.75} />
                <span className="min-w-0 flex-1 truncate font-mono text-[11px]">{sample}</span>
                <span className="shrink-0 text-[10.5px] text-muted-foreground max-sm:hidden">{note}</span>
              </div>
            ))}
          </div>
          {impressions > 0 && (
            <p className="mt-3 border-t border-border pt-2.5 text-xs leading-relaxed text-muted-foreground">
              &ldquo;Powered by Canonn&rdquo; was shown ~{fmt(impressions)} times this week.
            </p>
          )}
          {/* Outline, not solid: the dialog already has one primary action,
              and it is not this one. */}
          <Button asChild variant="outline" className={cn(ACTION, 'mt-3')}>
            <a href="#billing">Add credits to unlock</a>
          </Button>
        </>
      )}

      {domain}
    </div>
  )
}

export function Assistants({ getToken, me }: { getToken: () => Promise<string | null>; me: Me | null }) {
  const paid = (me?.credit_usd ?? 0) > 0
  const [shares, setShares] = useState<ShareRow[] | null>(null)
  const [files, setFiles] = useState<KnowledgeFile[]>([])
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [instructions, setInstructions] = useState('')
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [cap, setCap] = useState('500')
  const [slug, setSlug] = useState('')
  const [hideBranding, setHideBranding] = useState(false)
  const [saving, setSaving] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)
  // Edit dialog state, and the two-tap delete arm (first tap arms, second
  // deletes; it disarms itself after a moment).
  const [editing, setEditing] = useState<ShareRow | null>(null)
  const [editName, setEditName] = useState('')
  const [editInstructions, setEditInstructions] = useState('')
  const [editCap, setEditCap] = useState('500')
  const [editSlug, setEditSlug] = useState('')
  const [editHideBranding, setEditHideBranding] = useState(false)
  const [domainInput, setDomainInput] = useState('')
  const [domainInfo, setDomainInfo] = useState<DomainStatus | null>(null)
  const [domainBusy, setDomainBusy] = useState(false)
  const [armedDelete, setArmedDelete] = useState<string | null>(null)

  const withToken = useCallback(async <T,>(fn: (t: string) => Promise<T>): Promise<T> => {
    const t = await getToken()
    if (!t) throw new Error('sign in required')
    return fn(t)
  }, [getToken])

  const refresh = useCallback(() => {
    withToken((t) => listShares(t)).then((r) => setShares(r.data)).catch(() => setShares([]))
  }, [withToken])

  useEffect(() => {
    refresh()
    withToken((t) => listFiles(t)).then((r) => setFiles(r.data)).catch(() => setFiles([]))
    // A jump from the Playground preselects its in-scope sources.
    try {
      const raw = sessionStorage.getItem(SHARE_PREFILL_KEY)
      if (raw) {
        sessionStorage.removeItem(SHARE_PREFILL_KEY)
        const ids = JSON.parse(raw) as string[]
        if (ids.length) {
          setPicked(new Set(ids))
          setOpen(true)
        }
      }
    } catch { /* stale prefill is not worth an error */ }
  }, [refresh, withToken])

  const togglePick = (id: string) => setPicked((prev) => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  })

  const save = async () => {
    if (!name.trim() || picked.size === 0 || saving) return
    setSaving(true)
    try {
      const r = await withToken((t) => createShare(t, name.trim(), instructions.trim(), [...picked], parseInt(cap, 10) || 500, slug.trim() || undefined, hideBranding))
      setOpen(false)
      setName('')
      setInstructions('')
      setSlug('')
      setHideBranding(false)
      setPicked(new Set())
      refresh()
      await navigator.clipboard.writeText(r.vanity_url || r.url).catch(() => {})
      toast.success('Assistant created - link copied to your clipboard.')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not create the assistant.')
    } finally {
      setSaving(false)
    }
  }

  // Each address copies itself, so what the eye reads and what the clipboard
  // holds are always the same string.
  const copyAddress = (key: string, url: string) => {
    void navigator.clipboard.writeText(url)
    setCopied(key)
    setTimeout(() => setCopied(null), 1500)
  }

  const toggleRevoke = async (s: ShareRow) => {
    try {
      await withToken((t) => revokeShare(t, s.id, !s.revoked))
      toast.success(s.revoked ? 'Link is live again.' : 'Link revoked - it stops answering immediately.')
      refresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not update the link.')
    }
  }

  const openEdit = (s: ShareRow) => {
    setEditing(s)
    setEditName(s.name)
    setEditInstructions(s.instructions)
    setEditCap(String(s.daily_cap))
    setEditSlug(s.slug ?? '')
    setEditHideBranding(s.hide_branding)
    setDomainInput('')
    setDomainInfo(null)
  }

  const saveEdit = async () => {
    if (!editing || saving) return
    setSaving(true)
    try {
      await withToken((t) => updateShare(t, editing.id, {
        name: editName.trim() || undefined,
        instructions: editInstructions,
        daily_cap: parseInt(editCap, 10) || undefined,
        slug: editSlug.trim() || null,
        hide_branding: editHideBranding,
      }))
      setEditing(null)
      refresh()
      toast.success('Assistant updated.')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not update the assistant.')
    } finally {
      setSaving(false)
    }
  }

  const connectDomain = async () => {
    if (!editing || !domainInput.trim() || domainBusy) return
    setDomainBusy(true)
    try {
      const st = await withToken((t) => setShareDomain(t, editing.id, domainInput.trim()))
      setDomainInfo(st)
      setEditing({ ...editing, custom_domain: st.domain })
      refresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not connect the domain.')
    } finally {
      setDomainBusy(false)
    }
  }

  const disconnectDomain = async () => {
    if (!editing || domainBusy) return
    setDomainBusy(true)
    try {
      await withToken((t) => removeShareDomain(t, editing.id))
      setDomainInfo(null)
      setEditing({ ...editing, custom_domain: null })
      refresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not remove the domain.')
    } finally {
      setDomainBusy(false)
    }
  }

  // While the edit dialog shows a connecting domain, poll until the
  // certificate goes active - the customer sees it flip green by itself.
  useEffect(() => {
    if (!editing?.custom_domain) return
    let alive = true
    const tick = () => {
      withToken((t) => shareDomainStatus(t, editing.id))
        .then((st) => { if (alive) setDomainInfo(st) })
        .catch(() => { /* poll again */ })
    }
    tick()
    const iv = setInterval(tick, 8000)
    return () => { alive = false; clearInterval(iv) }
  }, [editing?.custom_domain, editing?.id, withToken])

  const removeShare = async (s: ShareRow) => {
    if (armedDelete !== s.id) {
      setArmedDelete(s.id)
      setTimeout(() => setArmedDelete((cur) => (cur === s.id ? null : cur)), 3000)
      return
    }
    setArmedDelete(null)
    try {
      await withToken((t) => deleteShare(t, s.id))
      toast.success('Assistant deleted - the link is gone for good.')
      refresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not delete the assistant.')
    }
  }

  const live = shares?.filter((s) => !s.revoked).length ?? 0
  const weekTraffic = shares?.reduce((n, s) => n + s.requests_7d, 0) ?? 0

  // The domain section only makes sense once a share exists: connecting one
  // needs its id. In the create dialog it is a promise; in edit it is a field.
  const domainNote = (
    <div className="mt-3.5 border-t border-border pt-3 text-[13px] leading-relaxed text-muted-foreground">
      Your own domain (chat.yourcompany.com) &mdash; connect it right after creating, under Edit.
    </div>
  )

  const domainField = (
    <div className="mt-3.5 border-t border-border pt-3">
      <span className={LABEL}>Your own domain</span>
      {!editing?.custom_domain ? (
        <>
          <div className="flex items-center gap-1.5">
            <Input
              value={domainInput}
              onChange={(e) => setDomainInput(e.target.value.toLowerCase())}
              placeholder="chat.yourcompany.com"
              disabled={!paid}
              className={cn(FIELD, 'font-mono text-xs')}
            />
            <Button
              size="sm"
              variant="outline"
              className={cn(FIELD, 'shrink-0 px-3 text-xs')}
              disabled={!paid || !domainInput.trim() || domainBusy}
              onClick={connectDomain}
            >
              {domainBusy ? 'Connecting…' : 'Connect'}
            </Button>
          </div>
          <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
            One CNAME record at your DNS provider. We verify it and issue the certificate for you.
          </p>
        </>
      ) : (
        <div className="rounded-lg border border-border bg-background p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="inline-flex min-w-0 items-center gap-2">
              <Globe className="size-3.5 shrink-0 text-muted-foreground" strokeWidth={1.75} />
              <span className="min-w-0 truncate font-mono text-xs font-medium">{editing.custom_domain}</span>
            </span>
            <DomainChip active={domainInfo?.ssl_status === 'active'} />
          </div>
          {domainInfo?.ssl_status !== 'active' && (
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
              Add one CNAME record at your DNS provider:{' '}
              <code className="rounded bg-secondary px-1 py-0.5 font-mono text-[10.5px]">{editing.custom_domain}</code>
              {' '}&rarr;{' '}
              <code className="rounded bg-secondary px-1 py-0.5 font-mono text-[10.5px]">{domainInfo?.target ?? 'fallback.canonn.ai'}</code>
              . We verify and issue the certificate automatically - this turns green by itself.
            </p>
          )}
          <button
            onClick={disconnectDomain}
            disabled={domainBusy}
            className="mt-2 text-xs text-muted-foreground underline underline-offset-2 hover:text-destructive"
          >
            Disconnect
          </button>
        </div>
      )}
    </div>
  )

  return (
    <div>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-[22px] font-semibold tracking-tight">Assistants</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Pre-scoped chat links your customers can use - grounded in the sources you pick, on your account.
          </p>
        </div>
        <Button onClick={() => setOpen(true)} className="h-11 w-full gap-1.5 sm:h-8 sm:w-auto">
          <Share2 className="size-4" /> New assistant
        </Button>
      </div>

      {shares === null && (
        <div className="space-y-3">
          {[0, 1].map((i) => (
            <Card key={i} className="gap-0 p-0">
              <div className="px-4 pt-4 pb-4 sm:px-5">
                <div className="flex items-start gap-3">
                  <Skeleton className="size-9 shrink-0 rounded-lg" />
                  <div className="min-w-0 flex-1 space-y-2">
                    <Skeleton className="h-3.5 w-40" />
                    <Skeleton className="h-2.5 w-28" />
                  </div>
                </div>
                <Skeleton className="mt-3.5 h-9 w-full rounded-lg" />
                <Skeleton className="mt-3.5 h-12 w-full rounded-lg" />
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Empty state as a home screen, the way the Playground opens: an
          eyebrow, one sentence of display type, and the three steps - which
          a phone drops entirely, leaving the promise and the button. */}
      {shares !== null && shares.length === 0 && (
        <div className="rounded-xl border border-dashed border-border bg-card/60 px-5 py-14 text-center sm:px-8">
          <div className="mb-5 flex items-center justify-center gap-2.5">
            <div className="flex size-[26px] items-center justify-center rounded-md bg-foreground text-[13px] font-bold text-background">C</div>
            <span className={cn(MICRO, 'tracking-[0.14em]')}>Shared assistants</span>
          </div>
          <h2 className="font-display text-[26px] leading-[1.12] font-semibold tracking-tight sm:text-[32px]">
            Hand customers a link, not a login.
          </h2>
          <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-muted-foreground">
            Anyone who opens it chats with your data - with citations, without an account, on your terms.
          </p>
          <div className="mx-auto mt-9 hidden max-w-2xl gap-2.5 text-left sm:grid sm:grid-cols-3">
            {[
              { icon: FileText, title: 'Pick the sources', body: 'Only what you choose answers questions.' },
              { icon: SquarePen, title: 'Set the rules', body: 'Instructions and a daily message cap.' },
              { icon: Globe, title: 'Share the address', body: 'A link, your subdomain, or your own domain.' },
            ].map(({ icon: Icon, title, body }) => (
              <div key={title} className="rounded-xl border border-border bg-card p-4">
                <Icon className="mb-2.5 size-4 text-muted-foreground" strokeWidth={1.75} />
                <div className="text-[13px] font-medium">{title}</div>
                <div className="mt-1 text-xs leading-snug text-muted-foreground">{body}</div>
              </div>
            ))}
          </div>
          <Button onClick={() => setOpen(true)} className="mt-7 h-11 w-full gap-1.5 sm:h-9 sm:w-auto">
            <Share2 className="size-4" /> Create your first assistant
          </Button>
          <div className={cn(MICRO, 'mt-6 tracking-[0.14em] opacity-70')}>citations · daily cap · revoke anytime</div>
        </div>
      )}

      {shares !== null && shares.length > 0 && (
        <div className={cn(MICRO, 'mb-2.5 flex items-center justify-between gap-3')}>
          <span>
            {shares.length} {shares.length === 1 ? 'assistant' : 'assistants'} · {live} live
          </span>
          <span className="max-sm:hidden">{fmt(weekTraffic)} messages this week</span>
        </div>
      )}

      <div className="space-y-3">
        {shares?.map((s) => {
          const [primary, ...also] = addressesOf(s)
          const armed = armedDelete === s.id
          return (
            <Card key={s.id} className="gap-0 p-0">
              <div className="px-4 pt-4 pb-4 sm:px-5">
                {/* Identity first: the monogram carries the status too - ink
                    while it answers, paper once it is revoked. */}
                <div className="flex items-start gap-3">
                  <span
                    className={cn(
                      'flex size-9 shrink-0 items-center justify-center rounded-lg font-display text-sm font-semibold',
                      s.revoked ? 'bg-secondary text-muted-foreground' : 'bg-foreground text-background',
                    )}
                    aria-hidden
                  >
                    {s.name.trim().charAt(0).toUpperCase() || '?'}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="truncate font-display text-[15px] font-semibold tracking-tight">{s.name}</span>
                      <StatusPill live={!s.revoked} />
                    </div>
                    <div className="mt-1 flex items-center gap-1.5 font-mono text-[10.5px] text-muted-foreground">
                      <span className="size-1.5 shrink-0 rounded-full" style={{ background: ACCENT }} aria-hidden />
                      {s.file_ids.length} {s.file_ids.length === 1 ? 'source' : 'sources'} · cap {fmt(s.daily_cap)}/day
                    </div>
                  </div>
                </div>

                {/* The address is the product: one field, copyable and
                    openable without hunting through a row of buttons. The
                    border alone delimits it - a fill would make it read as a
                    disabled input sitting on the card. */}
                <div className="mt-3.5 flex max-w-xl items-center gap-1 rounded-lg border border-border py-1 pr-1 pl-2.5">
                  {primary.own
                    ? <Globe className="size-3.5 shrink-0 text-muted-foreground" strokeWidth={1.75} />
                    : <Link2 className="size-3.5 shrink-0 text-muted-foreground" strokeWidth={1.75} />}
                  <code className={cn('min-w-0 flex-1 truncate font-mono text-xs', s.revoked && 'text-muted-foreground line-through decoration-muted-foreground/40')}>
                    {primary.label}
                  </code>
                  <button
                    onClick={() => copyAddress(`${s.id}:${primary.key}`, primary.url)}
                    className="flex size-9 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground sm:size-8"
                    aria-label={`Copy the link to ${s.name}`}
                  >
                    {copied === `${s.id}:${primary.key}` ? <Check className="size-3.5 text-[#3f7d54]" /> : <Copy className="size-3.5" />}
                  </button>
                  <a
                    href={primary.url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex size-9 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground sm:size-8"
                    aria-label={`Open ${s.name}`}
                  >
                    <ExternalLink className="size-3.5" />
                  </a>
                </div>

                {/* The other addresses are a desktop courtesy - a phone gets
                    the one that matters and nothing to scroll past. */}
                {also.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 max-sm:hidden">
                    <span className={MICRO}>also at</span>
                    {also.map((a) => (
                      <button
                        key={a.key}
                        onClick={() => copyAddress(`${s.id}:${a.key}`, a.url)}
                        className="group inline-flex max-w-[18rem] items-center gap-1.5 font-mono text-[10.5px] text-muted-foreground transition-colors hover:text-foreground"
                        aria-label={`Copy ${a.label}`}
                      >
                        <span className="truncate">{a.label}</span>
                        {copied === `${s.id}:${a.key}`
                          ? <Check className="size-3 shrink-0 text-[#3f7d54]" />
                          : <Copy className="size-3 shrink-0 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100" />}
                      </button>
                    ))}
                  </div>
                )}

                {/* Traffic, grouped and quiet: figures with labels instead of
                    a run-on line of numbers. */}
                <div className="mt-3.5 flex flex-wrap items-center gap-x-6 gap-y-2.5 rounded-lg bg-secondary/40 px-3.5 py-2.5">
                  <Stat label="Messages" value={fmt(s.requests)} />
                  <Stat label="This week" value={fmt(s.requests_7d)} />
                  <Stat label="Tokens" value={fmt(s.tokens)} className="max-sm:hidden" />
                  <Stat label="Spend" value={`$${s.spend_usd.toFixed(2)}`} />
                  <div className="ml-auto hidden text-right sm:block">
                    <div className={MICRO}>Last message</div>
                    <div className="mt-0.5 font-mono text-[13px] text-muted-foreground">
                      {s.last_ts ? formatDistanceToNowStrict(s.last_ts * 1000, { addSuffix: true }) : 'no traffic yet'}
                    </div>
                  </div>
                </div>

                {/* The upsell earns its place by being specific: their own
                    number, one action, no exclamation marks. */}
                {!s.hide_branding && s.requests_7d > 0 && (
                  <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-dashed border-border px-3.5 py-2.5">
                    <Lock className="size-3.5 shrink-0 text-muted-foreground" strokeWidth={1.75} />
                    <p className="min-w-0 flex-1 text-xs leading-relaxed text-muted-foreground">
                      <span className="text-foreground">&ldquo;Powered by Canonn&rdquo;</span> was shown ~{fmt(s.requests_7d)} times this week.
                    </p>
                    {paid ? (
                      <Button size="sm" variant="outline" className={cn(ROW_ACTION, 'max-sm:w-full')} onClick={() => openEdit(s)}>
                        Remove it
                      </Button>
                    ) : (
                      <Button size="sm" variant="outline" className={cn(ROW_ACTION, 'max-sm:w-full')} asChild>
                        <a href="#billing">Remove it</a>
                      </Button>
                    )}
                  </div>
                )}
              </div>

              {/* Actions recess into a footer: the two everyday ones on the
                  left, the irreversible one alone on the right, wordless
                  until it is armed. */}
              <div className="flex items-center gap-1 border-t border-border bg-secondary/25 px-2 py-2 sm:px-3">
                <Button size="sm" variant="ghost" className={ROW_ACTION} onClick={() => openEdit(s)}>
                  <SquarePen className="size-3.5" /> Edit
                </Button>
                <Button size="sm" variant="ghost" className={ROW_ACTION} onClick={() => toggleRevoke(s)}>
                  {s.revoked ? 'Re-enable' : 'Revoke'}
                </Button>
                <div className="flex-1" />
                <Button
                  size="sm"
                  variant="ghost"
                  className={cn(ROW_ACTION, 'text-muted-foreground hover:text-destructive', armed && 'bg-destructive/10 font-medium text-destructive')}
                  onClick={() => removeShare(s)}
                  aria-label={`Delete ${s.name}`}
                >
                  <Trash2 className="size-3.5" />
                  <span className={cn(!armed && 'sr-only')}>{armed ? 'Confirm delete' : 'Delete'}</span>
                </Button>
              </div>
            </Card>
          )
        })}
      </div>

      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent mobileSheet className="sm:max-w-md">
          <DialogHeader className={SHEET_HEAD}>
            <DialogTitle className="font-display">Edit assistant</DialogTitle>
            <DialogDescription>The link stays the same; changes apply to the next message.</DialogDescription>
          </DialogHeader>
          <div className={SHEET_BODY}>
            <div>
              <label className={LABEL}>Name</label>
              <Input value={editName} onChange={(e) => setEditName(e.target.value)} className={FIELD} maxLength={80} />
            </div>
            <div>
              <label className={LABEL}>Instructions</label>
              <textarea
                value={editInstructions}
                onChange={(e) => setEditInstructions(e.target.value)}
                rows={3}
                maxLength={2000}
                className="w-full resize-none rounded-lg border border-input bg-background p-2.5 text-[13px] leading-relaxed outline-none focus:border-foreground/40"
              />
            </div>
            <BrandingPanel
              paid={paid}
              slug={editSlug}
              onSlug={setEditSlug}
              hideBranding={editHideBranding}
              onHideBranding={setEditHideBranding}
              impressions={editing && !editing.hide_branding ? editing.requests_7d : 0}
              domain={paid || editing?.custom_domain ? domainField : null}
            />
            <div>
              <label className={LABEL}>Daily message cap</label>
              <Input value={editCap} onChange={(e) => setEditCap(e.target.value)} inputMode="numeric" className={cn(FIELD, 'w-28 font-mono text-xs')} />
            </div>
          </div>
          <div className={SHEET_FOOT}>
            <Button onClick={saveEdit} disabled={saving || !editName.trim()} className={ACTION}>
              {saving ? 'Saving…' : 'Save changes'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent mobileSheet className="sm:max-w-lg">
          <DialogHeader className={SHEET_HEAD}>
            <DialogTitle className="font-display">New assistant</DialogTitle>
            <DialogDescription>
              Customers who open the link chat with these sources only. Requests count on your account.
            </DialogDescription>
          </DialogHeader>

          <div className={SHEET_BODY}>
            <div>
              <label className={LABEL}>Name · shown to your customers</label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Acme Support" className={FIELD} maxLength={80} />
            </div>

            <div>
              <div className="mb-1.5 flex items-baseline justify-between gap-3">
                <span className={MICRO}>Sources</span>
                {files.length > 0 && (
                  <span className="font-mono text-[10.5px] text-muted-foreground">
                    {picked.size} of {files.length} selected
                  </span>
                )}
              </div>
              {files.length === 0 && (
                <p className="rounded-lg border border-dashed border-border p-3 text-xs text-muted-foreground">
                  No sources yet - add some in the Playground first.
                </p>
              )}
              {/* A phone scrolls the sheet, not a box inside it - nested
                  scrollers are the thing touch users cannot aim at. */}
              <div className="space-y-1 sm:max-h-44 sm:overflow-y-auto">
                {files.map((f) => (
                  <label
                    key={f.id}
                    className={cn(
                      'flex cursor-pointer items-center gap-2.5 rounded-lg border px-2.5 py-2.5 transition-colors sm:py-2',
                      picked.has(f.id) ? 'border-foreground/15 bg-secondary/60' : 'border-transparent hover:bg-secondary/40',
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={picked.has(f.id)}
                      onChange={() => togglePick(f.id)}
                      className="size-4 accent-[var(--foreground)] sm:size-3.5"
                    />
                    <span className="min-w-0 flex-1 truncate text-[13px]">{f.filename}</span>
                    <span className="shrink-0 font-mono text-[10.5px] text-muted-foreground">{f.chunk_count} passages</span>
                  </label>
                ))}
              </div>
            </div>

            <div>
              <label className={LABEL}>Instructions · optional</label>
              <textarea
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                rows={3}
                maxLength={2000}
                placeholder="Answer only from the documentation. For anything else, refer to support@acme.com."
                className="w-full resize-none rounded-lg border border-input bg-background p-2.5 text-[13px] leading-relaxed outline-none focus:border-foreground/40"
              />
            </div>

            <BrandingPanel
              paid={paid}
              slug={slug}
              onSlug={setSlug}
              hideBranding={hideBranding}
              onHideBranding={setHideBranding}
              impressions={0}
              domain={paid ? domainNote : null}
            />

            <div>
              <label className={LABEL}>Daily message cap</label>
              <Input value={cap} onChange={(e) => setCap(e.target.value)} inputMode="numeric" className={cn(FIELD, 'w-28 font-mono text-xs')} />
            </div>
          </div>

          <div className={SHEET_FOOT}>
            <Button onClick={save} disabled={!name.trim() || picked.size === 0 || saving} className={ACTION}>
              {saving ? 'Creating…' : 'Create and copy link'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

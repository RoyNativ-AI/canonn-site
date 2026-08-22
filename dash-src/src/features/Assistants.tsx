import { useCallback, useEffect, useState } from 'react'
import { formatDistanceToNowStrict } from 'date-fns'
import { Check, Copy, ExternalLink, Share2 } from 'lucide-react'
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

  const copyLink = (s: ShareRow) => {
    void navigator.clipboard.writeText(s.vanity_url || s.url)
    setCopied(s.id)
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

  return (
    <div>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-[22px] font-semibold tracking-tight">Assistants</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Pre-scoped chat links your customers can use - grounded in the sources you pick, on your account.
          </p>
        </div>
        <Button onClick={() => setOpen(true)} className="h-10 gap-1.5 sm:h-8">
          <Share2 className="size-4" /> New assistant
        </Button>
      </div>

      {shares === null && (
        <div className="space-y-3">
          {[0, 1].map((i) => <Skeleton key={i} className="h-20 w-full rounded-xl" />)}
        </div>
      )}

      {shares !== null && shares.length === 0 && (
        <Card className="flex flex-col items-center py-16 text-center">
          <Share2 className="mb-3 size-6 text-muted-foreground/40" strokeWidth={1.5} />
          <p className="text-sm font-medium">No assistants yet</p>
          <p className="mx-auto mt-1 max-w-sm text-xs text-muted-foreground">
            Pick sources, add instructions, get a link. Anyone who opens it chats with your data - with citations, without an account.
          </p>
          <Button size="sm" className="mt-4 h-9 sm:h-7" onClick={() => setOpen(true)}>Create your first</Button>
        </Card>
      )}

      <div className="space-y-3">
        {shares?.map((s) => (
          <Card key={s.id} className={cn('flex flex-col gap-3 p-4 sm:flex-row sm:items-center', s.revoked && 'opacity-55')}>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="truncate text-sm font-medium">{s.name}</span>
                {s.revoked && (
                  <span className="rounded-full border border-border px-2 py-0.5 font-mono text-[10.5px] text-muted-foreground">Revoked</span>
                )}
              </div>
              <div className="mt-1 font-mono text-[10.5px] text-muted-foreground">
                {s.vanity_url ? `${s.slug}.canonn.ai · ` : ''}{s.file_ids.length} {s.file_ids.length === 1 ? 'source' : 'sources'} · cap {s.daily_cap}/day
              </div>
              <div className="mt-0.5 font-mono text-[10.5px] text-muted-foreground">
                {fmt(s.requests)} {s.requests === 1 ? 'message' : 'messages'}
                {s.requests > 0 ? ` (${fmt(s.requests_7d)} this week) · ${fmt(s.tokens)} tokens · $${s.spend_usd.toFixed(2)}` : ''}
                {s.last_ts ? ` · active ${formatDistanceToNowStrict(s.last_ts * 1000, { addSuffix: true })}` : ' · no traffic yet'}
              </div>
              {!s.hide_branding && s.requests_7d > 0 && (
                <div className="mt-1 font-mono text-[10.5px] text-muted-foreground">
                  &ldquo;Powered by Canonn&rdquo; was shown ~{fmt(s.requests_7d)} times this week ·{' '}
                  {paid ? (
                    <button onClick={() => openEdit(s)} className="underline underline-offset-2 hover:text-foreground">remove it</button>
                  ) : (
                    <a href="#billing" className="underline underline-offset-2 hover:text-foreground">remove it</a>
                  )}
                </div>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-1.5 sm:shrink-0 sm:flex-nowrap">
              <Button size="sm" variant="outline" className="h-9 gap-1.5 font-mono text-xs sm:h-8" onClick={() => copyLink(s)}>
                {copied === s.id ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
                {copied === s.id ? 'Copied' : 'Copy link'}
              </Button>
              <Button size="sm" variant="ghost" className="h-9 px-2.5 sm:h-8 sm:px-2" asChild>
                <a href={s.vanity_url || s.url} target="_blank" rel="noreferrer" aria-label="Open assistant"><ExternalLink className="size-3.5" /></a>
              </Button>
              <Button size="sm" variant="ghost" className="h-9 text-xs sm:h-8" onClick={() => openEdit(s)}>
                Edit
              </Button>
              <Button size="sm" variant="ghost" className="h-9 text-xs sm:h-8" onClick={() => toggleRevoke(s)}>
                {s.revoked ? 'Re-enable' : 'Revoke'}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className={cn('h-9 text-xs text-destructive sm:h-8', armedDelete === s.id && 'bg-destructive/10 font-medium')}
                onClick={() => removeShare(s)}
              >
                {armedDelete === s.id ? 'Confirm?' : 'Delete'}
              </Button>
            </div>
          </Card>
        ))}
      </div>

      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent mobileSheet className="sm:max-w-md">
          <DialogHeader className={SHEET_HEAD}>
            <DialogTitle className="font-display">Edit assistant</DialogTitle>
            <DialogDescription>The link stays the same; changes apply to the next message.</DialogDescription>
          </DialogHeader>
          <div className={SHEET_BODY}>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Name</label>
              <Input value={editName} onChange={(e) => setEditName(e.target.value)} className={FIELD} maxLength={80} />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Instructions</label>
              <textarea
                value={editInstructions}
                onChange={(e) => setEditInstructions(e.target.value)}
                rows={3}
                maxLength={2000}
                className="w-full resize-none rounded-lg border border-input bg-background p-2.5 text-[13px] leading-relaxed outline-none focus:border-foreground/40"
              />
            </div>
            <div className="rounded-lg border border-border p-3">
              <div className="mb-2.5 flex items-center justify-between">
                <span className="font-mono text-[10.5px] tracking-[0.11em] text-muted-foreground uppercase">Premium</span>
                {!paid && (
                  <a href="#billing" className="text-xs font-medium underline underline-offset-2">Add credits to unlock</a>
                )}
              </div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Branded link</label>
              <div className="flex items-center gap-1.5">
                <Input value={editSlug} onChange={(e) => setEditSlug(e.target.value.toLowerCase())} placeholder="grammarly" disabled={!paid} className={cn(FIELD, 'font-mono text-xs')} maxLength={31} />
                <span className="shrink-0 font-mono text-xs text-muted-foreground">.canonn.ai</span>
              </div>
              <label className="mt-3.5 flex cursor-pointer items-center justify-between gap-3 py-1.5 sm:py-0">
                <span className="text-[13px]">Hide &ldquo;Powered by Canonn&rdquo;</span>
                <Switch checked={editHideBranding} disabled={!paid} onCheckedChange={setEditHideBranding} className="data-[state=checked]:bg-foreground" />
              </label>
              <div className="mt-3.5 border-t border-border pt-3 text-[13px] text-muted-foreground">
                Your own domain (chat.yourcompany.com) &mdash; connect it right after creating, under Edit.
              </div>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Daily message cap</label>
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
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Name (shown to your customers)</label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Acme Support" className={FIELD} maxLength={80} />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Sources</label>
              {files.length === 0 && (
                <p className="rounded-lg border border-dashed border-border p-3 text-xs text-muted-foreground">
                  No sources yet - add some in the Playground first.
                </p>
              )}
              {/* A phone scrolls the sheet, not a box inside it - nested
                  scrollers are the thing touch users cannot aim at. */}
              <div className="space-y-1 sm:max-h-44 sm:overflow-y-auto">
                {files.map((f) => (
                  <label key={f.id} className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-2.5 hover:bg-secondary/50 sm:py-1.5">
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
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Instructions (optional)</label>
              <textarea
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                rows={3}
                maxLength={2000}
                placeholder="Answer only from the documentation. For anything else, refer to support@acme.com."
                className="w-full resize-none rounded-lg border border-input bg-background p-2.5 text-[13px] leading-relaxed outline-none focus:border-foreground/40"
              />
            </div>

            <div className="rounded-lg border border-border p-3">
              <div className="mb-2.5 flex items-center justify-between">
                <span className="font-mono text-[10.5px] tracking-[0.11em] text-muted-foreground uppercase">Premium</span>
                {!paid && (
                  <a href="#billing" className="text-xs font-medium underline underline-offset-2">Add credits to unlock</a>
                )}
              </div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Branded link</label>
              <div className="flex items-center gap-1.5">
                <Input value={slug} onChange={(e) => setSlug(e.target.value.toLowerCase())} placeholder="grammarly" disabled={!paid} className={cn(FIELD, 'font-mono text-xs')} maxLength={31} />
                <span className="shrink-0 font-mono text-xs text-muted-foreground">.canonn.ai</span>
              </div>
              <label className="mt-3.5 flex cursor-pointer items-center justify-between gap-3 py-1.5 sm:py-0">
                <span className="text-[13px]">Hide &ldquo;Powered by Canonn&rdquo;</span>
                <Switch checked={hideBranding} disabled={!paid} onCheckedChange={setHideBranding} className="data-[state=checked]:bg-foreground" />
              </label>
              <div className="mt-3.5 border-t border-border pt-3">
                <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Your own domain</label>
                {!editing?.custom_domain && (
                  <div className="flex items-center gap-1.5">
                    <Input value={domainInput} onChange={(e) => setDomainInput(e.target.value.toLowerCase())} placeholder="chat.yourcompany.com" disabled={!paid} className={cn(FIELD, 'font-mono text-xs')} />
                    <Button size="sm" variant="outline" className={cn(FIELD, 'shrink-0 text-xs')} disabled={!paid || !domainInput.trim() || domainBusy} onClick={connectDomain}>
                      {domainBusy ? 'Connecting…' : 'Connect'}
                    </Button>
                  </div>
                )}
                {editing?.custom_domain && (
                  <div className="rounded-lg bg-secondary/50 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="min-w-0 truncate font-mono text-xs font-medium">{editing.custom_domain}</span>
                      {domainInfo?.ssl_status === 'active' ? (
                        <span className="inline-flex shrink-0 items-center gap-1.5 font-mono text-[10.5px] text-[#3f7d54]">
                          <span className="size-1.5 rounded-full bg-current" /> Connected
                        </span>
                      ) : (
                        <span className="inline-flex shrink-0 items-center gap-1.5 font-mono text-[10.5px] text-muted-foreground">
                          <span className="size-1.5 animate-pulse rounded-full bg-current" /> Verifying…
                        </span>
                      )}
                    </div>
                    {domainInfo?.ssl_status !== 'active' && (
                      <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                        Add one CNAME record at your DNS provider:{' '}
                        <code className="rounded bg-background px-1 py-0.5 font-mono text-[10.5px]">{editing.custom_domain}</code>
                        {' '}&rarr;{' '}
                        <code className="rounded bg-background px-1 py-0.5 font-mono text-[10.5px]">{domainInfo?.target ?? 'fallback.canonn.ai'}</code>
                        . We verify and issue the certificate automatically - this card turns green by itself.
                      </p>
                    )}
                    <button onClick={disconnectDomain} className="mt-2 text-xs text-muted-foreground underline underline-offset-2 hover:text-destructive">
                      Disconnect
                    </button>
                  </div>
                )}
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Daily message cap</label>
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

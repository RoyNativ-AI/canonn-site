import { useCallback, useEffect, useState } from 'react'
import { Check, Copy, ExternalLink, Share2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import {
  createShare, deleteShare, listFiles, listShares, revokeShare, updateShare,
  type KnowledgeFile, type ShareRow,
} from '@/lib/api'

// Shared assistants: a business pre-scopes sources and instructions, then
// hands customers one link (canonn.ai/c/#token). Creation can start here or
// from the Playground's Share button, which prefills the current scope.

/** The Playground drops file ids here before jumping to this screen. */
export const SHARE_PREFILL_KEY = 'assistants.prefill'

export function Assistants({ getToken }: { getToken: () => Promise<string | null> }) {
  const [shares, setShares] = useState<ShareRow[] | null>(null)
  const [files, setFiles] = useState<KnowledgeFile[]>([])
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [instructions, setInstructions] = useState('')
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [cap, setCap] = useState('500')
  const [saving, setSaving] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)
  // Edit dialog state, and the two-tap delete arm (first tap arms, second
  // deletes; it disarms itself after a moment).
  const [editing, setEditing] = useState<ShareRow | null>(null)
  const [editName, setEditName] = useState('')
  const [editInstructions, setEditInstructions] = useState('')
  const [editCap, setEditCap] = useState('500')
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
      const r = await withToken((t) => createShare(t, name.trim(), instructions.trim(), [...picked], parseInt(cap, 10) || 500))
      setOpen(false)
      setName('')
      setInstructions('')
      setPicked(new Set())
      refresh()
      await navigator.clipboard.writeText(r.url).catch(() => {})
      toast.success('Assistant created - link copied to your clipboard.')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not create the assistant.')
    } finally {
      setSaving(false)
    }
  }

  const copyLink = (s: ShareRow) => {
    void navigator.clipboard.writeText(s.url)
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
  }

  const saveEdit = async () => {
    if (!editing || saving) return
    setSaving(true)
    try {
      await withToken((t) => updateShare(t, editing.id, {
        name: editName.trim() || undefined,
        instructions: editInstructions,
        daily_cap: parseInt(editCap, 10) || undefined,
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
        <Button onClick={() => setOpen(true)} className="gap-1.5">
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
          <Button size="sm" className="mt-4" onClick={() => setOpen(true)}>Create your first</Button>
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
                {s.file_ids.length} {s.file_ids.length === 1 ? 'source' : 'sources'} · {s.requests} {s.requests === 1 ? 'message' : 'messages'} · cap {s.daily_cap}/day
                · created {new Date(s.created * 1000).toLocaleDateString()}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <Button size="sm" variant="outline" className="h-8 gap-1.5 font-mono text-xs" onClick={() => copyLink(s)}>
                {copied === s.id ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
                {copied === s.id ? 'Copied' : 'Copy link'}
              </Button>
              <Button size="sm" variant="ghost" className="h-8 px-2" asChild>
                <a href={s.url} target="_blank" rel="noreferrer" aria-label="Open assistant"><ExternalLink className="size-3.5" /></a>
              </Button>
              <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => openEdit(s)}>
                Edit
              </Button>
              <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => toggleRevoke(s)}>
                {s.revoked ? 'Re-enable' : 'Revoke'}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className={cn('h-8 text-xs text-destructive', armedDelete === s.id && 'bg-destructive/10 font-medium')}
                onClick={() => removeShare(s)}
              >
                {armedDelete === s.id ? 'Confirm?' : 'Delete'}
              </Button>
            </div>
          </Card>
        ))}
      </div>

      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display">Edit assistant</DialogTitle>
            <DialogDescription>The link stays the same; changes apply to the next message.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Name</label>
              <Input value={editName} onChange={(e) => setEditName(e.target.value)} className="h-9" maxLength={80} />
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
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Daily message cap</label>
              <Input value={editCap} onChange={(e) => setEditCap(e.target.value)} inputMode="numeric" className="h-9 w-28 font-mono text-xs" />
            </div>
            <Button onClick={saveEdit} disabled={saving || !editName.trim()} className="w-full">
              {saving ? 'Saving…' : 'Save changes'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-display">New assistant</DialogTitle>
            <DialogDescription>
              Customers who open the link chat with these sources only. Requests count on your account.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Name (shown to your customers)</label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Acme Support" className="h-9" maxLength={80} />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Sources</label>
              {files.length === 0 && (
                <p className="rounded-lg border border-dashed border-border p-3 text-xs text-muted-foreground">
                  No sources yet - add some in the Playground first.
                </p>
              )}
              <div className="max-h-44 space-y-1 overflow-y-auto">
                {files.map((f) => (
                  <label key={f.id} className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-secondary/50">
                    <input
                      type="checkbox"
                      checked={picked.has(f.id)}
                      onChange={() => togglePick(f.id)}
                      className="size-3.5 accent-[var(--foreground)]"
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

            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Daily message cap</label>
              <Input value={cap} onChange={(e) => setCap(e.target.value)} inputMode="numeric" className="h-9 w-28 font-mono text-xs" />
            </div>

            <Button onClick={save} disabled={!name.trim() || picked.size === 0 || saving} className="w-full">
              {saving ? 'Creating…' : 'Create and copy link'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

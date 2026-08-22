import { useState } from 'react'
import { useSession } from '@clerk/clerk-react'
import { Check, Copy, KeyRound, Pencil, ShieldCheck, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Plus, Terminal } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { API_BASE, createKey, renameKey, revokeKey, type Me } from '@/lib/api'
import { QuickStart } from '@/features/QuickStart'

export function Keys({ me, onChanged }: { me: Me | null; onChanged: () => void }) {
  const { session } = useSession()
  const [name, setName] = useState('')
  const [creating, setCreating] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [qsOpen, setQsOpen] = useState(false)
  const [freshKey, setFreshKey] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [urlCopied, setUrlCopied] = useState(false)
  const [renameFrom, setRenameFrom] = useState<string | null>(null)
  const [renameTo, setRenameTo] = useState('')
  const [renaming, setRenaming] = useState(false)

  async function handleRename() {
    const trimmed = renameTo.trim()
    if (!renameFrom || !trimmed || !session) return
    setRenaming(true)
    try {
      const token = await session.getToken()
      await renameKey(token!, renameFrom, trimmed)
      toast.success(`Renamed "${renameFrom}" to "${trimmed}".`)
      setRenameFrom(null)
      onChanged()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not rename the key.')
    } finally {
      setRenaming(false)
    }
  }

  async function handleCreate() {
    const trimmed = name.trim()
    if (!trimmed || !session) return
    setCreating(true)
    try {
      const token = await session.getToken()
      const res = await createKey(token!, trimmed)
      setCreateOpen(false)
      setFreshKey(res.key)
      setCopied(false)
      setName('')
      onChanged()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not create the key.')
    } finally {
      setCreating(false)
    }
  }

  async function handleRevoke(keyName: string) {
    if (!session) return
    try {
      const token = await session.getToken()
      await revokeKey(token!, keyName)
      toast.success(`Key "${keyName}" revoked.`)
      onChanged()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not revoke the key.')
    }
  }

  async function copyKey() {
    if (!freshKey) return
    await navigator.clipboard.writeText(freshKey)
    setCopied(true)
    toast.success('Key copied to clipboard.')
  }

  const keys = me?.keys ?? []
  const isAdmin = (me?.role ?? 'admin') === 'admin' || me?.role === 'owner'

  return (
    <div>
      <h1 className="mb-10 font-display text-[22px] font-semibold tracking-tight">API keys</h1>

      {/* Billing opens on the number you came for; this screen opens on the
          address you came for. Same shape: display sub-headline, mono
          micro-label, the value at size, one mono line of context. */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <div className="mb-2 font-display text-xl font-semibold">Call the API</div>
          <div className="font-mono text-xs tracking-[0.1em] text-muted-foreground uppercase">Base URL</div>
          <div className="mt-1 flex items-center gap-2">
            <span className="font-mono text-lg font-semibold tracking-tight [overflow-wrap:anywhere] sm:text-2xl">
              {API_BASE}
            </span>
            <button
              onClick={() => {
                void navigator.clipboard.writeText(API_BASE)
                setUrlCopied(true)
                setTimeout(() => setUrlCopied(false), 1500)
                toast.success('Base URL copied.')
              }}
              className="flex size-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground sm:size-7"
              aria-label="Copy base URL"
            >
              {urlCopied ? <Check className="size-4" /> : <Copy className="size-4" />}
            </button>
          </div>
          <p className="mt-2 font-mono text-xs text-muted-foreground">
            {me === null
              ? 'Loading your keys…'
              : `${keys.length} active key${keys.length === 1 ? '' : 's'}`}
            {' · '}OpenAI-compatible: point any SDK here and keep your existing code
          </p>
        </div>
        <div className="flex w-full flex-wrap gap-2 sm:w-auto">
          {isAdmin && (
            <Button size="lg" className="h-11 flex-1 sm:h-9 sm:flex-initial" onClick={() => setCreateOpen(true)}>
              <Plus className="size-4" /> Create key
            </Button>
          )}
          <Button size="lg" variant="outline" className="h-11 flex-1 sm:h-9 sm:flex-initial" onClick={() => setQsOpen(true)}>
            <Terminal className="size-4" /> Quick start
          </Button>
        </div>
      </div>

      {!isAdmin && (
        <p className="mt-6 rounded-xl border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
          Only organization admins can create or revoke keys. Ask your admin for access.
        </p>
      )}

      {/* One panel, hairline-separated rows: a handful of credentials is a
          list to read, not a grid to query. */}
      <Card className="mt-8 w-full py-0">
        <div className="border-b border-border px-4 py-3 font-mono text-[10.5px] tracking-[0.11em] text-muted-foreground uppercase sm:px-5">
          Your keys
        </div>

        {me === null && (
          <div className="divide-y divide-border">
            {[0, 1].map((i) => (
              <div key={`s${i}`} className="flex items-center gap-3 px-4 py-4 sm:gap-4 sm:px-5">
                <Skeleton className="size-10 shrink-0 rounded-xl" />
                <div className="min-w-0 flex-1 space-y-1.5">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-3 w-56" />
                </div>
              </div>
            ))}
          </div>
        )}

        {me !== null && keys.length === 0 && (
          <div className="p-4 sm:p-6">
            <div className="rounded-xl border border-dashed border-border px-6 py-12 text-center">
              <KeyRound className="mx-auto mb-3 size-6 text-muted-foreground/40" strokeWidth={1.5} />
              <p className="text-sm font-medium">No keys yet</p>
              <p className="mx-auto mt-1 max-w-sm text-xs text-muted-foreground">
                Create one and you will see it here, and its traffic under Usage and Logs.
              </p>
              {isAdmin && (
                <Button size="sm" className="mt-4 h-9 sm:h-7" onClick={() => setCreateOpen(true)}>
                  <Plus className="size-3.5" /> Create key
                </Button>
              )}
            </div>
          </div>
        )}

        <div className="divide-y divide-border">
          {keys.map((k) => (
            <div key={k.name} className="flex flex-wrap items-center gap-3 px-4 py-3.5 sm:gap-4 sm:px-5">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-secondary">
                <KeyRound className="size-4.5 text-muted-foreground" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{k.name}</div>
                {/* The prefix is all anyone can ever see again - it stays in
                    mono, next to the date, as the row's identity. */}
                <div className="mt-0.5 flex items-center gap-x-2 font-mono text-[10.5px] text-muted-foreground">
                  <span className="whitespace-nowrap">{k.prefix}…</span>
                  {/* The creation date is context, not identity: on a phone it
                      goes away rather than wrapping the row to three lines. */}
                  <span aria-hidden className="max-sm:hidden">·</span>
                  <span className="whitespace-nowrap max-sm:hidden">
                    {k.created
                      ? `created ${new Date(k.created * 1000).toLocaleString(undefined, {
                          day: '2-digit', month: '2-digit', year: 'numeric',
                          hour: '2-digit', minute: '2-digit', timeZoneName: 'short',
                        })}`
                      : 'created ·'}
                  </span>
                </div>
              </div>
              {isAdmin && (
                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    variant="ghost" size="sm"
                    className="h-9 font-mono text-xs text-muted-foreground hover:text-foreground sm:h-7"
                    onClick={() => { setRenameFrom(k.name); setRenameTo(k.name) }}
                  >
                    <Pencil className="size-3" /> rename
                  </Button>
                  {/* Revoking breaks live traffic, so it never shouts from the
                      row: a muted glyph that only turns crimson under the
                      pointer, with the confirmation carrying the warning. */}
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <button
                        className="flex size-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-destructive sm:size-7"
                        aria-label={`Revoke ${k.name}`}
                        title="Revoke key"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Revoke "{k.name}"?</AlertDialogTitle>
                        <AlertDialogDescription>
                          Any application still using this key will stop working immediately. This cannot be undone.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Keep it</AlertDialogCancel>
                        <AlertDialogAction onClick={() => handleRevoke(k.name)} className="bg-destructive hover:bg-destructive/90">
                          Revoke key
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              )}
            </div>
          ))}
        </div>
      </Card>

      <p className="mt-10 font-mono text-[10.5px] text-muted-foreground">
        Keys are stored hashed - a secret is shown once, at creation, and never again. Rotate by creating a new key and revoking the old one.
      </p>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-display">Create an API key</DialogTitle>
            <DialogDescription>Give it a name you will recognize in your logs.</DialogDescription>
          </DialogHeader>
          <Input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            placeholder="e.g. production"
            className="h-11 font-mono text-sm sm:h-8"
          />
          <Button onClick={handleCreate} disabled={creating || !name.trim()} className="h-11 w-full sm:h-8">
            {creating ? 'Creating…' : 'Create key'}
          </Button>
        </DialogContent>
      </Dialog>

      {/* Too tall to ever fit a phone as a centred dialog - it gets the sheet
          treatment: fixed header, the form scrolling under it. */}
      <Dialog open={qsOpen} onOpenChange={setQsOpen}>
        <DialogContent mobileSheet className="sm:max-w-4xl">
          <DialogHeader className="border-b border-border px-4 py-3.5 pr-12 sm:border-b-0 sm:pt-4 sm:pr-10 sm:pb-0">
            <DialogTitle className="font-display">Quick start</DialogTitle>
            <DialogDescription>
              Fill in your data and key, run it here, then copy a curl you can paste straight into Postman.
            </DialogDescription>
          </DialogHeader>
          <div className="overflow-y-auto px-4 py-4">
            <QuickStart />
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={renameFrom !== null} onOpenChange={(open) => !open && setRenameFrom(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-display">Rename "{renameFrom}"</DialogTitle>
            <DialogDescription>
              The key itself does not change - applications keep working, and your usage history follows the new name.
            </DialogDescription>
          </DialogHeader>
          <Input
            autoFocus
            value={renameTo}
            onChange={(e) => setRenameTo(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleRename()}
            placeholder="new name"
            className="h-11 font-mono text-sm sm:h-8"
          />
          <Button onClick={handleRename} disabled={renaming || !renameTo.trim() || renameTo.trim() === renameFrom} className="h-11 w-full sm:h-8">
            {renaming ? 'Renaming…' : 'Rename key'}
          </Button>
        </DialogContent>
      </Dialog>

      {/* The one screen a customer sees exactly once. It says so before it
          says anything else, gives the secret its own framed panel, and makes
          copying the single obvious thing to do. */}
      <Dialog open={freshKey !== null} onOpenChange={(open) => !open && setFreshKey(null)}>
        <DialogContent>
          <DialogHeader>
            <span className="flex items-center gap-1.5 font-mono text-[10.5px] tracking-[0.14em] text-[#3f7d54] uppercase">
              <ShieldCheck className="size-3.5" /> Shown once
            </span>
            <DialogTitle className="font-display text-xl leading-tight">Your new API key</DialogTitle>
            <DialogDescription>
              Copy it now and store it somewhere safe. For your security it is never displayed again — if it is
              lost, revoke this key and create another.
            </DialogDescription>
          </DialogHeader>
          <div className="overflow-hidden rounded-xl border border-[#3f7d54]/30 bg-[#3f7d54]/[0.06]">
            <div className="border-b border-[#3f7d54]/20 px-3.5 py-2 font-mono text-[10.5px] tracking-[0.14em] text-[#3f7d54] uppercase">
              Secret key
            </div>
            <div className="p-3.5 font-mono text-sm leading-relaxed break-all text-[#3f7d54] select-all">
              {freshKey}
            </div>
          </div>
          <Button onClick={copyKey} className="h-11 w-full sm:h-9">
            {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
            {copied ? 'Copied' : 'Copy key'}
          </Button>
          <p className="font-mono text-[10.5px] text-muted-foreground">
            Send it as <span className="text-foreground">Authorization: Bearer …</span> — never in a browser or a public repository.
          </p>
        </DialogContent>
      </Dialog>
    </div>
  )
}

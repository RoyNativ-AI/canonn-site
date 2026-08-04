import { useState } from 'react'
import { useSession } from '@clerk/clerk-react'
import { Check, Copy, KeyRound } from 'lucide-react'
import { toast } from 'sonner'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { createKey, revokeKey, type Me } from '@/lib/api'

export function Keys({ me, onChanged }: { me: Me | null; onChanged: () => void }) {
  const { session } = useSession()
  const [name, setName] = useState('')
  const [creating, setCreating] = useState(false)
  const [freshKey, setFreshKey] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  async function handleCreate() {
    const trimmed = name.trim()
    if (!trimmed || !session) return
    setCreating(true)
    try {
      const token = await session.getToken()
      const res = await createKey(token!, trimmed)
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

  return (
    <div>
      <h1 className="font-display text-[32px] font-semibold tracking-tight">API keys</h1>
      <p className="mb-8 text-sm text-muted-foreground">Create a key, copy it once, and call the API with it</p>

      <div className="mb-5 flex gap-2.5">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
          placeholder="Key name, e.g. production"
          className="max-w-md bg-card font-mono text-sm"
        />
        <Button onClick={handleCreate} disabled={creating || !name.trim()}>
          {creating ? 'Creating…' : 'Create key'}
        </Button>
      </div>

      <Card className="overflow-hidden py-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Key</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="w-24" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {keys.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="py-12 text-center">
                  <KeyRound className="mx-auto mb-2 size-6 text-muted-foreground/50" />
                  <span className="text-muted-foreground">No keys yet. Create your first above.</span>
                </TableCell>
              </TableRow>
            )}
            {keys.map((k) => (
              <TableRow key={k.name}>
                <TableCell className="font-medium">{k.name}</TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">{k.prefix}</TableCell>
                <TableCell className="font-mono text-xs">
                  {k.created ? new Date(k.created * 1000).toLocaleDateString() : '·'}
                </TableCell>
                <TableCell className="text-right">
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="ghost" size="sm" className="font-mono text-xs text-destructive hover:text-destructive">
                        revoke
                      </Button>
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
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <Dialog open={freshKey !== null} onOpenChange={(open) => !open && setFreshKey(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-display">Your new API key</DialogTitle>
            <DialogDescription>
              This is the only time it will be shown. Store it somewhere safe.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-xl border border-[#3f7d54]/30 bg-[#3f7d54]/5 p-4 font-mono text-sm break-all text-[#3f7d54]">
            {freshKey}
          </div>
          <Button onClick={copyKey} className="w-full">
            {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
            {copied ? 'Copied' : 'Copy key'}
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  )
}

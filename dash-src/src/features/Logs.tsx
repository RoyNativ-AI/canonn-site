import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { fmt, type Me } from '@/lib/api'

export function Logs({ me }: { me: Me | null }) {
  const rows = me?.recent ?? []
  return (
    <div>
      <h1 className="font-display text-[32px] font-semibold tracking-tight">Logs</h1>
      <p className="mb-8 text-sm text-muted-foreground">Your most recent requests</p>
      <Card className="overflow-hidden py-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Time</TableHead>
              <TableHead>Key</TableHead>
              <TableHead>Mode</TableHead>
              <TableHead className="text-right">Input</TableHead>
              <TableHead className="text-right">Output</TableHead>
              <TableHead className="text-right">Latency</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                  No requests yet. Create a key and make your first call.
                </TableCell>
              </TableRow>
            )}
            {rows.map((r, i) => (
              <TableRow key={i}>
                <TableCell className="font-mono text-xs">
                  {new Date(r.ts * 1000).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </TableCell>
                <TableCell>{r.key}</TableCell>
                <TableCell>
                  <Badge variant="outline" className="font-mono text-[10px]">{r.mode}</Badge>
                </TableCell>
                <TableCell className="text-right font-mono text-xs">{fmt(r.pt)}</TableCell>
                <TableCell className="text-right font-mono text-xs">{fmt(r.ct)}</TableCell>
                <TableCell className="text-right font-mono text-xs">{r.ms ? `${r.ms}ms` : '·'}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  )
}

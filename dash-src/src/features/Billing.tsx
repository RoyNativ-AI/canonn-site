import { CreditCard } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { type Me } from '@/lib/api'

export function Billing({ me }: { me: Me | null }) {
  return (
    <div>
      <h1 className="font-display text-[32px] font-semibold tracking-tight">Billing</h1>
      <p className="mb-8 text-sm text-muted-foreground">Usage-based billing at $1.20 / $6 per 1M tokens (input / output)</p>

      <div className="grid max-w-3xl gap-5 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="font-mono text-[10px] font-normal tracking-[0.1em] text-muted-foreground uppercase">
              Current period usage
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="font-display text-4xl font-semibold tracking-tight text-[#3f7d54]">
              ${(me?.spend_usd ?? 0).toFixed(2)}
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              {((me?.input_tokens ?? 0) / 1e6).toFixed(2)}M input · {((me?.output_tokens ?? 0) / 1e6).toFixed(2)}M output tokens
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 font-display text-lg">
              <CreditCard className="size-4.5" /> Payment method
            </CardTitle>
            <CardDescription>Connect a card to enable automatic monthly billing.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button disabled variant="outline">
              Connect card · coming soon
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

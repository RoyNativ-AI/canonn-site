import { useCallback, useEffect, useState } from 'react'
import { useSession, useUser } from '@clerk/clerk-react'
import { RefreshCw, Wallet } from 'lucide-react'
import { toast } from 'sonner'
import { loadStripe, type Stripe } from '@stripe/stripe-js'
import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  billingAutoRecharge, billingConfig, billingMe, billingTopup, fmt,
  type BillingMe, type Me,
} from '@/lib/api'

// Card fields are Stripe Elements styled as ours; the iframe inherits
// nothing, so every font and color is stated or it falls back to serif.
const ELEMENT_APPEARANCE = {
  theme: 'stripe' as const,
  variables: {
    colorPrimary: '#c96442',
    colorText: '#262625',
    colorTextSecondary: '#6f6b66',
    colorBackground: '#ffffff',
    borderRadius: '10px',
    fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
    fontSizeBase: '14px',
  },
}

const PRESETS = [10, 25, 50, 100]

function PayForm({ amount, onPaid }: { amount: number; onPaid: () => void }) {
  const stripe = useStripe()
  const elements = useElements()
  const [busy, setBusy] = useState(false)

  const pay = async () => {
    if (!stripe || !elements) return
    setBusy(true)
    try {
      const { error, paymentIntent } = await stripe.confirmPayment({
        elements,
        redirect: 'if_required',
      })
      if (error) throw new Error(error.message)
      if (paymentIntent?.status !== 'succeeded') throw new Error('payment did not complete - try again')
      onPaid()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Payment failed.')
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <PaymentElement />
      <Button onClick={pay} disabled={busy || !stripe} className="w-full">
        {busy ? 'Charging…' : `Add $${amount} credits`}
      </Button>
    </div>
  )
}

export function Billing({ me }: { me: Me | null }) {
  const { session } = useSession()
  const { user } = useUser()
  const [plan, setPlan] = useState<BillingMe | null>(null)
  const [amount, setAmount] = useState(25)
  const [custom, setCustom] = useState('')
  const [autoRecharge, setAutoRecharge] = useState(false)
  const [stripePromise, setStripePromise] = useState<Promise<Stripe | null> | null>(null)
  const [clientSecret, setClientSecret] = useState<string | null>(null)
  const [opening, setOpening] = useState(false)

  const refreshPlan = useCallback(async () => {
    if (!session) return
    const token = await session.getToken()
    if (!token) return
    try { setPlan(await billingMe(token)) } catch { /* summary is optional */ }
  }, [session])

  useEffect(() => { refreshPlan() }, [refreshPlan])

  const chosen = custom.trim() ? Number(custom) : amount
  const validAmount = Number.isFinite(chosen) && chosen >= 5 && chosen <= 2000

  const openPayModal = async () => {
    if (!session || !validAmount) return
    setOpening(true)
    try {
      const [{ publishable_key }, token] = await Promise.all([billingConfig(), session.getToken()])
      const email = user?.primaryEmailAddress?.emailAddress ?? ''
      const res = await billingTopup(token!, chosen, autoRecharge, email)
      setStripePromise(loadStripe(publishable_key))
      setClientSecret(res.client_secret)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Billing is not available right now.')
    } finally {
      setOpening(false)
    }
  }

  const handlePaid = () => {
    setClientSecret(null)
    toast.success(`$${chosen} added - the balance updates in a few seconds.`)
    // The balance moves when the webhook lands, not when the modal closes.
    setTimeout(refreshPlan, 2500)
    setTimeout(refreshPlan, 7000)
  }

  const toggleAuto = async () => {
    if (!session || !plan) return
    const token = await session.getToken()
    if (!token) return
    try {
      const next = !plan.auto_recharge
      await billingAutoRecharge(token, next)
      toast.success(next ? 'Auto top-up enabled.' : 'Auto top-up disabled.')
      refreshPlan()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not update auto top-up.')
    }
  }

  const balance = plan?.credit_usd ?? 0

  return (
    <div>
      <h1 className="font-display text-[32px] font-semibold tracking-tight">Credits</h1>
      <p className="mb-8 text-sm text-muted-foreground">
        Pay as you go: ${plan?.price_in_per_1m ?? 1.2} / ${plan?.price_out_per_1m ?? 6} per 1M tokens
        (input / output). No card: {fmt(plan?.free_tier_calls ?? 1000)} free calls a month.
      </p>

      <div className="grid max-w-4xl gap-5 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="font-mono text-[10px] font-normal tracking-[0.14em] text-muted-foreground uppercase">
              Total available
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="font-display text-5xl font-semibold tracking-tight">
              <span className="text-2xl text-muted-foreground">$</span>{balance.toFixed(2)}
            </div>
            <p className="mt-2 text-sm text-muted-foreground">Pay-as-you-go balance</p>
            <p className="mt-4 font-mono text-xs text-muted-foreground">
              This month: {fmt(plan?.used_calls_this_month ?? me?.requests ?? 0)} calls ·
              ${(plan?.spend_this_month_usd ?? 0).toFixed(2)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 font-display text-lg">
              <Wallet className="size-4.5" /> Buy credits
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2">
              {PRESETS.map((p) => (
                <button
                  key={p}
                  onClick={() => { setAmount(p); setCustom('') }}
                  className={`rounded-lg border px-4 py-2 font-mono text-sm transition-colors ${
                    !custom.trim() && amount === p
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-input text-muted-foreground hover:text-foreground'
                  }`}
                >
                  ${p}
                </button>
              ))}
              <Input
                value={custom}
                onChange={(e) => setCustom(e.target.value.replace(/[^0-9.]/g, ''))}
                placeholder="Custom"
                className="w-24 font-mono text-sm"
              />
            </div>
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={autoRecharge}
                onChange={(e) => setAutoRecharge(e.target.checked)}
                className="accent-[#c96442]"
              />
              Auto top-up ${validAmount ? chosen : '…'} when my balance drops below $5
            </label>
            <Button onClick={openPayModal} disabled={opening || !validAmount} className="w-full">
              {opening ? 'Preparing…' : validAmount ? `Add $${chosen} credits` : 'Enter $5 - $2000'}
            </Button>
          </CardContent>
        </Card>
      </div>

      {plan && (plan.auto_recharge || plan.auto_amount_usd > 0) && (
        <Card className="mt-5 max-w-4xl">
          <CardContent className="flex items-center justify-between py-4">
            <div className="flex items-center gap-2 text-sm">
              <RefreshCw className="size-4 text-muted-foreground" />
              Auto top-up is <b>{plan.auto_recharge ? 'enabled' : 'disabled'}</b>
              {plan.auto_recharge && <> - adds ${plan.auto_amount_usd.toFixed(0)} when the balance drops below $5</>}
            </div>
            <Button variant="outline" size="sm" onClick={toggleAuto}>
              {plan.auto_recharge ? 'Disable' : 'Enable'}
            </Button>
          </CardContent>
        </Card>
      )}

      {plan && plan.transactions.length > 0 && (
        <div className="mt-8 max-w-4xl">
          <h2 className="mb-3 font-display text-lg font-semibold">Recent transactions</h2>
          <Card className="overflow-hidden py-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {plan.transactions.map((t, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-mono text-xs">
                      {new Date(t.ts * 1000).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">{t.kind}</TableCell>
                    <TableCell className="text-right font-mono text-sm">${t.amount_usd.toFixed(2)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </div>
      )}

      <Dialog open={clientSecret !== null} onOpenChange={(open) => !open && setClientSecret(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-display">Add ${validAmount ? chosen : ''} credits</DialogTitle>
            <DialogDescription>
              {autoRecharge
                ? 'Charged now; the card is kept for automatic top-ups.'
                : 'One-time charge. Nothing recurring.'}
            </DialogDescription>
          </DialogHeader>
          {clientSecret && stripePromise && (
            <Elements stripe={stripePromise} options={{ clientSecret, appearance: ELEMENT_APPEARANCE }}>
              <PayForm amount={validAmount ? chosen : 0} onPaid={handlePaid} />
            </Elements>
          )}
        </DialogContent>
      </Dialog>

      <p className="mt-6 max-w-4xl font-mono text-[10.5px] text-muted-foreground">
        Card details are tokenised directly with our payment processor and never touch Canonn servers.
      </p>
    </div>
  )
}

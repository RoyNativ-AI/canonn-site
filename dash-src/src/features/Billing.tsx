import { useCallback, useEffect, useState } from 'react'
import { useSession, useUser } from '@clerk/clerk-react'
import { CreditCard, RefreshCw, Receipt, Wallet } from 'lucide-react'
import { toast } from 'sonner'
import { loadStripe, type Stripe } from '@stripe/stripe-js'
import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  billingAutoRecharge, billingCharge, billingConfig, billingMe, billingSavePm,
  billingSetupIntent, fmt, type BillingMe, type Me,
} from '@/lib/api'

// The Element renders in an iframe: nothing inherits, so fonts and colors
// are stated explicitly or the fields fall back to browser serif.
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
const LABEL = 'font-mono text-[10px] font-normal tracking-[0.14em] text-muted-foreground uppercase'

function SaveCardForm({ onSaved }: { onSaved: (pm: string) => void }) {
  const stripe = useStripe()
  const elements = useElements()
  const [busy, setBusy] = useState(false)
  const save = async () => {
    if (!stripe || !elements) return
    setBusy(true)
    try {
      const { error, setupIntent } = await stripe.confirmSetup({ elements, redirect: 'if_required' })
      if (error) throw new Error(error.message)
      const pm = typeof setupIntent?.payment_method === 'string'
        ? setupIntent.payment_method
        : setupIntent?.payment_method?.id
      if (!pm) throw new Error('card was not saved - try again')
      onSaved(pm)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save the card.')
      setBusy(false)
    }
  }
  return (
    <div className="space-y-4">
      <PaymentElement />
      <Button onClick={save} disabled={busy || !stripe} className="w-full">
        {busy ? 'Saving…' : 'Save card'}
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
  const [charging, setCharging] = useState(false)
  const [stripePromise, setStripePromise] = useState<Promise<Stripe | null> | null>(null)
  const [clientSecret, setClientSecret] = useState<string | null>(null)
  const [cardOpen, setCardOpen] = useState(false)
  const [arAmount, setArAmount] = useState('')
  const [arThreshold, setArThreshold] = useState('')

  const token = useCallback(async () => (session ? session.getToken() : null), [session])

  const refreshPlan = useCallback(async () => {
    const t = await token()
    if (!t) return
    try {
      const p = await billingMe(t)
      setPlan(p)
      setArAmount((v) => v || String(p.auto_amount_usd || 25))
      setArThreshold((v) => v || String(p.auto_threshold_usd || 5))
    } catch { /* summary is optional */ }
  }, [token])

  useEffect(() => { refreshPlan() }, [refreshPlan])

  const chosen = custom.trim() ? Number(custom) : amount
  const validAmount = Number.isFinite(chosen) && chosen >= 5 && chosen <= 2000

  const openCardModal = async () => {
    const t = await token()
    if (!t) return
    setCardOpen(true)
    try {
      const [{ publishable_key }, si] = await Promise.all([
        billingConfig(),
        billingSetupIntent(t, user?.primaryEmailAddress?.emailAddress ?? ''),
      ])
      setStripePromise(loadStripe(publishable_key))
      setClientSecret(si.client_secret)
    } catch (e) {
      setCardOpen(false)
      toast.error(e instanceof Error ? e.message : 'Billing is not available right now.')
    }
  }

  const handleCardSaved = async (pm: string) => {
    const t = await token()
    if (!t) return
    try {
      await billingSavePm(t, pm)
      toast.success('Card saved.')
      setCardOpen(false)
      setClientSecret(null)
      refreshPlan()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save the card.')
    }
  }

  const buyCredits = async () => {
    const t = await token()
    if (!t || !validAmount) return
    setCharging(true)
    try {
      await billingCharge(t, chosen)
      toast.success(`$${chosen} charged - the balance updates in a few seconds.`)
      setTimeout(refreshPlan, 2500)
      setTimeout(refreshPlan, 7000)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Charge failed.')
    } finally {
      setCharging(false)
    }
  }

  const saveAutoRecharge = async (enabled: boolean) => {
    const t = await token()
    if (!t) return
    try {
      await billingAutoRecharge(t, enabled, Number(arAmount) || undefined, Number(arThreshold) || undefined)
      toast.success(enabled ? 'Auto top-up saved.' : 'Auto top-up disabled.')
      refreshPlan()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not update auto top-up.')
    }
  }

  const balance = plan?.credit_usd ?? 0
  const hasCard = Boolean(plan?.card)

  return (
    <div>
      <h1 className="font-display text-[32px] font-semibold tracking-tight">Credits</h1>
      <p className="mb-8 text-sm text-muted-foreground">
        Pay as you go: ${plan?.price_in_per_1m ?? 1.2} / ${plan?.price_out_per_1m ?? 6} per 1M tokens
        (input / output). Without credits: {fmt(plan?.free_tier_calls ?? 1000)} free calls a month.
      </p>

      <div className="grid w-full gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader><CardTitle className={LABEL}>Total available</CardTitle></CardHeader>
          <CardContent>
            <div className="font-display text-7xl font-semibold tracking-tight">
              <span className="text-3xl text-muted-foreground">$</span>{balance.toFixed(2)}
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
              <CreditCard className="size-4.5" /> Payment method
            </CardTitle>
          </CardHeader>
          <CardContent>
            {hasCard ? (
              <div className="space-y-3">
                <div className="flex items-center gap-3 rounded-xl border border-border bg-secondary/50 px-4 py-3">
                  <span className="font-mono text-sm font-semibold uppercase">{plan!.card!.brand}</span>
                  <span className="font-mono text-sm text-muted-foreground">•••• {plan!.card!.last4}</span>
                  <span className="ml-auto font-mono text-xs text-muted-foreground">{plan!.card!.exp}</span>
                </div>
                <Button variant="outline" size="sm" onClick={openCardModal}>Replace card</Button>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Save a card once - buying credits becomes one click, and auto top-up becomes possible.
                </p>
                <Button onClick={openCardModal}>Add card</Button>
              </div>
            )}
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
                  className={`rounded-xl border px-5 py-2.5 font-mono text-base transition-colors ${
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
                className="w-28 font-mono text-base"
              />
            </div>
            {hasCard ? (
              <Button onClick={buyCredits} disabled={charging || !validAmount} className="w-full">
                {charging ? 'Charging…' : validAmount ? `Add $${chosen} credits` : 'Enter $5 - $2000'}
              </Button>
            ) : (
              <Button onClick={openCardModal} className="w-full">Add a card to buy credits</Button>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="mt-6 w-full">
        <CardContent className="flex flex-wrap items-center gap-4 py-4">
          <div className="flex items-center gap-2 text-sm font-medium">
            <RefreshCw className="size-4 text-muted-foreground" /> Auto top-up
          </div>
          <div className="flex items-center gap-2 text-sm">
            add $
            <Input value={arAmount} onChange={(e) => setArAmount(e.target.value.replace(/[^0-9.]/g, ''))} className="w-20 font-mono text-sm" />
            when balance drops below $
            <Input value={arThreshold} onChange={(e) => setArThreshold(e.target.value.replace(/[^0-9.]/g, ''))} className="w-16 font-mono text-sm" />
          </div>
          <div className="ml-auto flex items-center gap-2">
            {plan?.auto_recharge && (
              <span className="rounded-full border border-[#3f7d54]/30 bg-[#3f7d54]/10 px-3 py-1 font-mono text-[11px] text-[#3f7d54]">enabled</span>
            )}
            <Button
              variant={plan?.auto_recharge ? 'outline' : 'default'}
              size="sm"
              disabled={!hasCard}
              onClick={() => saveAutoRecharge(!(plan?.auto_recharge && !arAmount))}
            >
              {plan?.auto_recharge ? 'Update' : 'Enable'}
            </Button>
            {plan?.auto_recharge && (
              <Button variant="ghost" size="sm" onClick={() => saveAutoRecharge(false)}>Disable</Button>
            )}
          </div>
          {!hasCard && <p className="w-full font-mono text-[10.5px] text-muted-foreground">Requires a saved card.</p>}
        </CardContent>
      </Card>

      {plan && plan.transactions.length > 0 && (
        <div className="mt-10 w-full">
          <h2 className="mb-3 font-display text-lg font-semibold">Recent transactions</h2>
          <Card className="overflow-hidden py-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="text-right">Receipt</TableHead>
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
                    <TableCell className="text-right">
                      {t.receipt_url ? (
                        <a href={t.receipt_url} target="_blank" rel="noreferrer"
                           className="inline-flex items-center gap-1 font-mono text-xs text-primary hover:underline">
                          <Receipt className="size-3" /> Receipt
                        </a>
                      ) : <span className="font-mono text-xs text-muted-foreground">·</span>}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </div>
      )}

      <Dialog open={cardOpen} onOpenChange={(open) => { if (!open) { setCardOpen(false); setClientSecret(null) } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-display">Add a payment method</DialogTitle>
            <DialogDescription>Saved for one-click credit purchases and auto top-up. Nothing is charged now.</DialogDescription>
          </DialogHeader>
          {clientSecret && stripePromise
            ? (
              <Elements stripe={stripePromise} options={{ clientSecret, appearance: ELEMENT_APPEARANCE }}>
                <SaveCardForm onSaved={handleCardSaved} />
              </Elements>
            )
            : <p className="font-mono text-xs text-muted-foreground">Preparing the secure form…</p>}
        </DialogContent>
      </Dialog>

      <p className="mt-8 w-full font-mono text-[10.5px] text-muted-foreground">
        Card details are tokenised directly with our payment processor and never touch Canonn servers.
      </p>
    </div>
  )
}

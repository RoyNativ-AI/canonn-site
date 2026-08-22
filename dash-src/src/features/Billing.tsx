import { useCallback, useEffect, useState } from 'react'
import { useSession, useUser } from '@clerk/clerk-react'
import { CreditCard, FileText, BarChart3, Check, Plus, Receipt, RefreshCw, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { track } from '@/lib/analytics'
import { loadStripe, type Stripe } from '@stripe/stripe-js'
import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  billingAutoRecharge, billingCharge, billingConfig, billingListPms, billingMe,
  billingRemovePm, billingSavePm, billingSetupIntent, fmt,
  type BillingMe, type Me, type SavedCard,
  fetchInvoiceHtml,
  SITE_URL,
} from '@/lib/api'

// The Element renders in an iframe: nothing inherits, so fonts and colors
// are stated explicitly or the fields fall back to browser serif.
const ELEMENT_FONTS = [{ cssSrc: 'https://fonts.googleapis.com/css2?family=Schibsted+Grotesk:wght@400..700&display=swap' }]

const ELEMENT_APPEARANCE = {
  theme: 'stripe' as const,
  variables: {
    colorPrimary: '#1f1d1a',
    colorText: '#262625',
    colorTextSecondary: '#6f6b66',
    colorBackground: '#ffffff',
    borderRadius: '10px',
    fontFamily: "'Schibsted Grotesk', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
    fontSizeBase: '14px',
  },
}

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
      <Button onClick={save} disabled={busy || !stripe} className="h-11 w-full sm:h-8">
        {busy ? 'Saving…' : 'Save card'}
      </Button>
    </div>
  )
}

function CardChip({ card }: { card: NonNullable<BillingMe['card']> }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-lg border border-border bg-secondary/50 px-3 py-2">
      <span className="font-mono text-xs font-semibold uppercase">{card.brand}</span>
      <span className="font-mono text-xs text-muted-foreground">•••• {card.last4}</span>
    </span>
  )
}

export function Billing({ me }: { me: Me | null }) {
  const { session } = useSession()
  const { user } = useUser()
  const [plan, setPlan] = useState<BillingMe | null>(null)
  const [buyOpen, setBuyOpen] = useState(false)
  const [buyAmount, setBuyAmount] = useState('25')
  const [charging, setCharging] = useState(false)
  const [autoOpen, setAutoOpen] = useState(false)
  const [autoOn, setAutoOn] = useState(false)
  const [reaches, setReaches] = useState('5')
  const [topTo, setTopTo] = useState('30')
  const [cardOpen, setCardOpen] = useState(false)
  const [cardsOpen, setCardsOpen] = useState(false)
  const [cards, setCards] = useState<SavedCard[]>([])
  const [stripePromise, setStripePromise] = useState<Promise<Stripe | null> | null>(null)
  const [clientSecret, setClientSecret] = useState<string | null>(null)

  const token = useCallback(async () => (session ? session.getToken() : null), [session])

  const refreshPlan = useCallback(async () => {
    const t = await token()
    if (!t) return
    try {
      const p = await billingMe(t)
      setPlan(p)
      setAutoOn(p.auto_recharge)
      setReaches((v) => (v === '5' ? String(p.auto_threshold_usd || 5) : v))
      setTopTo((v) => (v === '30' ? String((p.auto_threshold_usd || 5) + (p.auto_amount_usd || 25)) : v))
    } catch { /* summary is optional */ }
  }, [token])

  const openInvoice = useCallback(async (iid: number) => {
    const t = await token()
    if (!t) return
    try {
      const html = await fetchInvoiceHtml(t, iid)
      const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }))
      window.open(url, '_blank')
      setTimeout(() => URL.revokeObjectURL(url), 60000)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not open the invoice.')
    }
  }, [token])

  const refreshCards = useCallback(async () => {
    const t = await token()
    if (!t) return
    try { setCards((await billingListPms(t)).cards) } catch { /* list is optional */ }
  }, [token])

  useEffect(() => { refreshPlan(); refreshCards() }, [refreshPlan, refreshCards])

  const hasCard = Boolean(plan?.card)
  const balance = plan?.credit_usd ?? 0
  const amount = Number(buyAmount)
  const validBuy = Number.isFinite(amount) && amount >= 5 && amount <= 2000
  const reachesN = Number(reaches)
  const topToN = Number(topTo)
  const reloadBy = Math.round((topToN - reachesN) * 100) / 100
  const validAuto = Number.isFinite(reachesN) && Number.isFinite(topToN) && reachesN >= 1 && reloadBy >= 5

  const openCardModal = async () => {
    const t = await token()
    if (!t) return
    setCardOpen(true)
    setClientSecret(null)
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
      track('card_saved')
      toast.success('Card saved.')
      setCardOpen(false)
      setClientSecret(null)
      refreshPlan()
      refreshCards()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save the card.')
    }
  }

  const makeDefault = async (pm: string) => {
    const t = await token()
    if (!t) return
    try {
      await billingSavePm(t, pm)
      toast.success('Primary card updated.')
      refreshPlan()
      refreshCards()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not set the primary card.')
    }
  }

  const removeCard = async (pm: string) => {
    const t = await token()
    if (!t) return
    try {
      await billingRemovePm(t, pm)
      toast.success('Card removed.')
      refreshPlan()
      refreshCards()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not remove the card.')
    }
  }

  const confirmBuy = async () => {
    const t = await token()
    if (!t || !validBuy) return
    setCharging(true)
    try {
      await billingCharge(t, amount)
      track('credit_added', { amount_usd: amount })
      toast.success(`$${amount} added - the balance updates in a few seconds.`)
      setBuyOpen(false)
      setTimeout(refreshPlan, 2500)
      setTimeout(refreshPlan, 7000)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Charge failed.')
    } finally {
      setCharging(false)
    }
  }

  const saveAuto = async () => {
    const t = await token()
    if (!t) return
    try {
      await billingAutoRecharge(t, autoOn, validAuto ? reloadBy : undefined, validAuto ? reachesN : undefined)
      toast.success(autoOn ? 'Auto-reload saved.' : 'Auto-reload disabled.')
      setAutoOpen(false)
      refreshPlan()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not update auto-reload.')
    }
  }

  return (
    <div>
      <h1 className="mb-10 font-display text-[22px] font-semibold tracking-tight">Billing</h1>

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="mb-2 font-display text-xl font-semibold">Pay as you go</div>
          <div className="font-mono text-xs tracking-[0.1em] text-muted-foreground uppercase">API credit balance</div>
          <div className="mt-1 font-display text-5xl font-semibold tracking-tight sm:text-6xl">
            <span className="text-3xl text-muted-foreground">$</span>{balance.toFixed(2)}
          </div>
          <p className="mt-2 font-mono text-xs text-muted-foreground">
            This month: {fmt(plan?.used_calls_this_month ?? me?.requests ?? 0)} calls · ${(plan?.spend_this_month_usd ?? 0).toFixed(2)} ·
            without credits: {fmt(plan?.free_tier_calls ?? 1000)} free calls / month
          </p>
        </div>
        <Button size="lg" className="h-11 w-full sm:h-9 sm:w-auto" onClick={() => (hasCard ? setBuyOpen(true) : openCardModal())}>
          Buy credits
        </Button>
      </div>

      <Card className="mt-6 w-full">
        <div className="flex flex-wrap items-center gap-3 px-4 py-4 sm:gap-4 sm:px-5">
          <RefreshCw className="size-4.5 text-muted-foreground" />
          <div className="flex-1">
            <div className="flex items-center gap-2 font-medium">
              Auto-reload credits
              <span className={`rounded px-1.5 py-0.5 font-mono text-[10.5px] ${plan?.auto_recharge ? 'bg-[#3f7d54]/15 text-[#3f7d54]' : 'bg-secondary text-muted-foreground'}`}>
                {plan?.auto_recharge ? 'ON' : 'OFF'}
              </span>
            </div>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {plan?.auto_recharge
                ? `When my balance reaches $${plan.auto_threshold_usd}, reload it by $${plan.auto_amount_usd.toFixed(0)}.`
                : 'Automatically add credits when your balance runs low.'}
            </p>
          </div>
          <Button variant="outline" className="h-11 w-full sm:h-8 sm:w-auto" onClick={() => setAutoOpen(true)}>Manage auto-reload</Button>
        </div>
      </Card>

      <div className="mt-10 grid w-full gap-x-10 gap-y-5 md:grid-cols-2">
        {[
          { icon: CreditCard, title: 'Payment methods', sub: cards.length ? `${cards.length} card${cards.length === 1 ? '' : 's'} on file - manage or add` : 'Add or change payment method', onClick: () => setCardsOpen(true) },
          { icon: FileText, title: 'Billing history', sub: plan && plan.transactions.length ? `${plan.transactions.length} top-up${plan.transactions.length === 1 ? '' : 's'} with receipts` : 'Receipts appear after your first purchase', onClick: () => {
            const el = document.getElementById('billing-history')
            if (el) el.scrollIntoView({ behavior: 'smooth' })
            else toast.info('No top-ups yet - your receipts will appear here after your first purchase.')
          } },
          { icon: BarChart3, title: 'Pricing', sub: 'View pricing and benchmarks', onClick: () => window.open(`${SITE_URL}/#plans`, '_blank') },
        ].map(({ icon: Icon, title, sub, onClick }) => (
          <button key={title} onClick={onClick} className="flex items-center gap-4 rounded-xl p-2 text-left transition-colors hover:bg-secondary/50">
            <span className="flex size-14 items-center justify-center rounded-xl bg-secondary">
              <Icon className="size-5.5" />
            </span>
            <span>
              <span className="block font-display text-lg font-semibold">{title}</span>
              <span className="block text-sm text-muted-foreground">{sub}</span>
            </span>
          </button>
        ))}
      </div>

      {plan && plan.transactions.length > 0 && (
        <div id="billing-history" className="mt-12 w-full">
          <h2 className="mb-3 font-display text-lg font-semibold">Billing history</h2>
          <Card className="overflow-hidden py-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="text-right">Receipt</TableHead>
                  <TableHead className="text-right">Invoice</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(plan?.transactions ?? []).map((t, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-mono text-xs">
                      {new Date(t.ts * 1000).toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
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
                    <TableCell className="text-right">
                      <button onClick={() => openInvoice(t.iid)}
                        className="inline-flex items-center gap-1 font-mono text-xs text-primary hover:underline">
                        <FileText className="size-3" /> Invoice
                      </button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </div>
      )}

      {/* Buy credits - amount plus the saved payment method, like the field pattern customers know. */}
      <Dialog open={buyOpen} onOpenChange={setBuyOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-display">Add to credit balance</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <div className="mb-1.5 text-sm font-medium">Amount to add</div>
              <div className="flex items-center gap-2 rounded-xl border border-input px-3">
                <span className="text-muted-foreground">$</span>
                <Input
                  value={buyAmount}
                  onChange={(e) => setBuyAmount(e.target.value.replace(/[^0-9.]/g, ''))}
                  className="h-11 border-0 px-0 font-mono text-base shadow-none focus-visible:ring-0 sm:h-8"
                />
              </div>
              <p className="mt-1 font-mono text-[10.5px] text-muted-foreground">Enter an amount between $5 and $2000</p>
            </div>
            <div>
              <div className="mb-1.5 text-sm font-medium">Payment method</div>
              {plan?.card && <CardChip card={plan.card} />}
              <button onClick={() => { setBuyOpen(false); openCardModal() }} className="mt-2 block text-sm text-primary hover:underline">
                + Add payment method
              </button>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" className="h-11 flex-1 sm:h-8 sm:flex-initial" onClick={() => setBuyOpen(false)}>Cancel</Button>
              <Button onClick={confirmBuy} disabled={charging || !validBuy} className="h-11 flex-1 sm:h-8 sm:flex-initial">
                {charging ? 'Charging…' : 'Continue'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Auto-reload - reaches / top-up-to with the computed charge, like OpenAI's. */}
      <Dialog open={autoOpen} onOpenChange={setAutoOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-display">Auto-reload credits</DialogTitle>
          </DialogHeader>
          <div className="space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium">Use auto-reload</div>
                <p className="text-xs text-muted-foreground">Automatically add credits when your balance runs low.</p>
              </div>
              <Switch checked={autoOn} onCheckedChange={setAutoOn} disabled={!hasCard} />
            </div>
            {!hasCard && <p className="font-mono text-[10.5px] text-muted-foreground">Requires a saved card - add one from the billing page first.</p>}
            <div className="space-y-3">
              {[
                { label: 'When my balance reaches:', value: reaches, set: setReaches },
                { label: 'Top up to:', value: topTo, set: setTopTo },
              ].map(({ label, value, set }) => (
                <div key={label} className="flex items-center justify-between gap-4">
                  <span className="text-sm">{label}</span>
                  <div className="flex w-32 shrink-0 items-center gap-1.5 rounded-xl border border-input px-3">
                    <span className="text-muted-foreground">$</span>
                    <Input value={value} onChange={(e) => set(e.target.value.replace(/[^0-9.]/g, ''))}
                           className="h-11 border-0 px-0 font-mono text-sm shadow-none focus-visible:ring-0 sm:h-8" />
                  </div>
                </div>
              ))}
              <div className="flex items-center justify-between border-t border-border pt-3 text-sm">
                <span className="text-muted-foreground">Amount charged:</span>
                <span className="font-mono">{validAuto ? `$${reloadBy.toFixed(2)}` : '—'}</span>
              </div>
              {!validAuto && <p className="font-mono text-[10.5px] text-muted-foreground">Top-up target must be at least $5 above the trigger.</p>}
            </div>
            {plan?.card && (
              <div className="flex items-center justify-between">
                <span className="text-sm">Payment method:</span>
                <CardChip card={plan.card} />
              </div>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="outline" className="h-11 flex-1 sm:h-8 sm:flex-initial" onClick={() => setAutoOpen(false)}>Cancel</Button>
              <Button onClick={saveAuto} disabled={autoOn && !validAuto} className="h-11 flex-1 sm:h-8 sm:flex-initial">Save</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={cardsOpen} onOpenChange={setCardsOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display">Payment methods</DialogTitle>
            <DialogDescription>Add cards, choose which one is charged, remove the ones you no longer use.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {cards.length === 0 && (
              <p className="font-mono text-xs text-muted-foreground">No cards on file yet.</p>
            )}
            {cards.map((c) => (
              <div key={c.id} className="flex items-center gap-3 rounded-xl border border-border px-4 py-3">
                {/* Wraps rather than truncates: on a phone the last four
                    digits are the only way to tell two cards apart. */}
                <span className="min-w-0 flex-1">
                  <span className="text-sm font-semibold capitalize">{c.brand}</span>
                  <span className="ml-2 font-mono text-sm whitespace-nowrap text-muted-foreground">•••• {c.last4}</span>
                  <span className="ml-2 font-mono text-xs whitespace-nowrap text-muted-foreground">{c.exp}</span>
                </span>
                {c.is_default
                  ? (
                    <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-[#3f7d54]/30 bg-[#3f7d54]/10 px-2.5 py-1 font-mono text-[10.5px] whitespace-nowrap text-[#3f7d54]">
                      <Check className="size-3" /> primary
                    </span>
                  )
                  : (
                    <Button variant="ghost" size="sm" className="h-9 shrink-0 font-mono text-xs whitespace-nowrap sm:h-7" onClick={() => makeDefault(c.id)}>
                      Make primary
                    </Button>
                  )}
                <button
                  onClick={() => removeCard(c.id)}
                  className="flex size-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:text-destructive sm:size-auto"
                  aria-label="Remove card"
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            ))}
            <Button variant="outline" className="h-11 w-full sm:h-8" onClick={() => { setCardsOpen(false); openCardModal() }}>
              <Plus className="size-4" /> Add a card
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={cardOpen} onOpenChange={(open) => { if (!open) { setCardOpen(false); setClientSecret(null) } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-display">Add a payment method</DialogTitle>
            <DialogDescription>Saved for credit purchases and auto-reload. Nothing is charged now.</DialogDescription>
          </DialogHeader>
          {clientSecret && stripePromise
            ? (
              <Elements stripe={stripePromise} options={{ clientSecret, appearance: ELEMENT_APPEARANCE, fonts: ELEMENT_FONTS }}>
                <SaveCardForm onSaved={handleCardSaved} />
              </Elements>
            )
            : <p className="font-mono text-xs text-muted-foreground">Preparing the secure form…</p>}
        </DialogContent>
      </Dialog>

      <p className="mt-10 font-mono text-[10.5px] text-muted-foreground">
        Card details are tokenised directly with our payment processor and never touch Canonn servers.
      </p>
    </div>
  )
}

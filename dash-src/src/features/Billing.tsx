import { useCallback, useEffect, useState } from 'react'
import { useSession, useUser } from '@clerk/clerk-react'
import { CreditCard, ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'
import { loadStripe, type Stripe } from '@stripe/stripe-js'
import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  billingConfig, billingMe, billingSetupIntent, billingSubscribe,
  fmt, type BillingMe, type Me,
} from '@/lib/api'

// Card fields are Stripe Elements styled as ours: the page, the copy, and the
// flow are Canonn end to end, and raw card data never touches our servers.
const ELEMENT_APPEARANCE = {
  theme: 'stripe' as const,
  variables: {
    colorPrimary: '#c96442',
    colorText: 'inherit',
    borderRadius: '10px',
    fontFamily: 'inherit',
  },
}

function CardForm({ onSaved }: { onSaved: (paymentMethod: string) => void }) {
  const stripe = useStripe()
  const elements = useElements()
  const [busy, setBusy] = useState(false)

  const save = async () => {
    if (!stripe || !elements) return
    setBusy(true)
    try {
      const { error, setupIntent } = await stripe.confirmSetup({
        elements,
        redirect: 'if_required',
      })
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
        {busy ? 'Saving…' : 'Save card and start plan'}
      </Button>
    </div>
  )
}

export function Billing({ me }: { me: Me | null }) {
  const { session } = useSession()
  const { user } = useUser()
  const [plan, setPlan] = useState<BillingMe | null>(null)
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

  const openCardForm = async () => {
    if (!session) return
    setOpening(true)
    try {
      const [{ publishable_key }, token] = await Promise.all([billingConfig(), session.getToken()])
      const email = user?.primaryEmailAddress?.emailAddress ?? ''
      const si = await billingSetupIntent(token!, email)
      setStripePromise(loadStripe(publishable_key))
      setClientSecret(si.client_secret)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Billing is not available right now.')
    } finally {
      setOpening(false)
    }
  }

  const handleSaved = async (paymentMethod: string) => {
    if (!session) return
    try {
      const token = await session.getToken()
      const res = await billingSubscribe(token!, paymentMethod)
      toast.success(
        res.trial_days > 0
          ? `Plan started - free for ${res.trial_days} days, cancel any time before the first charge.`
          : 'Plan started.',
      )
      setClientSecret(null)
      refreshPlan()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not start the plan.')
    }
  }

  const active = plan?.status === 'active' || plan?.status === 'trialing'
  const used = plan?.used_calls_this_month ?? me?.requests ?? 0

  return (
    <div>
      <h1 className="font-display text-[32px] font-semibold tracking-tight">Billing</h1>
      <p className="mb-8 text-sm text-muted-foreground">
        Free tier: 1,000 calls a month, no card. The Base plan is $990 a month with 500K calls
        included, then $1.20 per additional 1K - first {plan ? '14' : '14'} days free.
      </p>

      <div className="grid max-w-3xl gap-5 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="font-mono text-[10px] font-normal tracking-[0.1em] text-muted-foreground uppercase">
              This month
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="font-display text-4xl font-semibold tracking-tight text-[#3f7d54]">
              {fmt(used)} <span className="text-lg text-muted-foreground">calls</span>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              {active
                ? `of ${fmt(plan?.included_calls ?? 500000)} included in your plan`
                : `of ${fmt(1000)} on the free tier`}
            </p>
            <div className="mt-3 h-1.5 overflow-hidden rounded bg-secondary">
              <div
                className="h-full rounded bg-primary"
                style={{ width: `${Math.min(100, (used / (active ? (plan?.included_calls ?? 500000) : 1000)) * 100)}%` }}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 font-display text-lg">
              <CreditCard className="size-4.5" /> {active ? 'Your plan' : 'Start the Base plan'}
            </CardTitle>
            <CardDescription>
              {active
                ? plan?.status === 'trialing'
                  ? 'Base plan - in the free trial period.'
                  : 'Base plan - active.'
                : 'Save a card to lift the free-tier limit. 14 days free, cancel any time.'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {active && (
              <div className="flex items-center gap-2 text-sm text-[#3f7d54]">
                <ShieldCheck className="size-4" /> Billing is set up. Invoices arrive by email monthly.
              </div>
            )}
            {!active && !clientSecret && (
              <Button onClick={openCardForm} disabled={opening}>
                {opening ? 'Preparing…' : 'Add payment method'}
              </Button>
            )}
            {!active && clientSecret && stripePromise && (
              <Elements stripe={stripePromise} options={{ clientSecret, appearance: ELEMENT_APPEARANCE }}>
                <CardForm onSaved={handleSaved} />
              </Elements>
            )}
          </CardContent>
        </Card>
      </div>

      <p className="mt-6 max-w-3xl font-mono text-[10.5px] text-muted-foreground">
        Card details are tokenised directly with our payment processor and never touch Canonn servers.
      </p>
    </div>
  )
}

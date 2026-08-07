import { SignedIn, SignedOut, SignIn } from '@clerk/clerk-react'
import { Shell } from '@/features/Shell'

export default function App() {
  return (
    <>
      <SignedOut>
        <div className="grid min-h-screen lg:grid-cols-2">
          <div className="relative flex items-center justify-center p-8">
            <a href="/" className="absolute top-6 left-8 flex items-center gap-2.5 font-display text-lg font-semibold">
              <img src="/assets/canon-logo.png" alt="" className="size-8 rounded-lg" />
              Canonn
            </a>
            <SignIn
              forceRedirectUrl="/dashboard/"
              signUpForceRedirectUrl="/dashboard/"
              appearance={{
                variables: {
                  colorPrimary: '#c96442',
                  colorText: '#1f1d1a',
                  borderRadius: '12px',
                  fontFamily: "'Schibsted Grotesk', sans-serif",
                },
              }}
            />
          </div>
          <div className="relative hidden overflow-hidden bg-[linear-gradient(135deg,#26190f_0%,#171412_60%)] lg:flex lg:items-center lg:justify-center">
            <div className="relative z-10 max-w-md p-10 text-center">
              <img src="/assets/canon-mark.png?v=2" alt="" className="mx-auto mb-7 w-20 drop-shadow-[0_14px_30px_rgba(0,0,0,0.45)]" />
              <div className="font-display text-4xl leading-[1.1] font-semibold tracking-tight text-[#f3efe8]">
                The model that
                <br />
                <span className="text-[#e8b39e]">trusts your data.</span>
              </div>
              <div className="mt-9 rounded-2xl bg-[#fdfdfc] p-6 text-left shadow-[0_40px_90px_rgba(0,0,0,0.5)]">
                <div className="flex items-center gap-2.5 text-sm font-semibold text-[#1f1d1a]">
                  Canonn R1
                  <span className="rounded-full bg-[rgba(63,125,84,0.13)] px-2.5 py-0.5 font-mono text-[10px] font-medium text-[#3f7d54]">
                    ✓ grounded in your data
                  </span>
                </div>
                <p className="mt-2 text-sm text-[#403c36]">"Yes, SSO is included in the Business plan."</p>
                <div className="mt-3 flex items-baseline gap-2.5 font-mono">
                  <span className="text-3xl font-medium text-[#3f7d54]">91.9%</span>
                  <span className="text-[11px] text-[#7c766c]">grounded · production prompt</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </SignedOut>
      <SignedIn>
        <Shell />
      </SignedIn>
    </>
  )
}

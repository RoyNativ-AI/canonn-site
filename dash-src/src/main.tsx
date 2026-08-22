import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ClerkProvider } from '@clerk/clerk-react'
import { Toaster } from '@/components/ui/sonner'
import App from './App'
import './index.css'

const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY
if (!PUBLISHABLE_KEY) throw new Error('VITE_CLERK_PUBLISHABLE_KEY is not set')

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ClerkProvider publishableKey={PUBLISHABLE_KEY} afterSignOutUrl="/dashboard/">
      <App />
      <Toaster position="bottom-right" />
    </ClerkProvider>
  </StrictMode>,
)

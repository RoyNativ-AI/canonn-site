import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ClerkProvider } from '@clerk/clerk-react'
import { Toaster } from '@/components/ui/sonner'
import App from './App'
import './index.css'

const PUBLISHABLE_KEY = 'pk_live_Y2xlcmsuY2Fub25uLmFpJA'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ClerkProvider publishableKey={PUBLISHABLE_KEY} afterSignOutUrl="/dashboard/">
      <App />
      <Toaster position="bottom-right" />
    </ClerkProvider>
  </StrictMode>,
)

import { useState } from 'react'
import { Play } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { runDemo } from '@/lib/api'

const DEMO_DATA =
  'Single sign-on (SSO) is included in the Business plan and above.\nPriority support: Pro (24h email), Business (4h chat + email), Enterprise (1h SLA).'
const DEMO_Q = 'Which plans include priority support?'

export function QuickStart() {
  const [running, setRunning] = useState(false)
  const [out, setOut] = useState<string | null>(null)

  async function handleRun() {
    setRunning(true)
    setOut(null)
    try {
      const res = await runDemo(DEMO_DATA, DEMO_Q)
      setOut(`→ "${res.answer}"  (${res.seconds}s)`)
    } catch (e) {
      setOut(`✗ ${e instanceof Error ? e.message : 'failed'}`)
    } finally {
      setRunning(false)
    }
  }

  return (
    <Card className="overflow-hidden border-[#3a342e] bg-[#211d1a] py-0 text-[#d8d2c8]">
      <div className="flex items-center gap-1.5 border-b border-white/10 bg-[#26221e] px-4 py-2.5">
        <span className="size-2.5 rounded-full bg-[#ff5f57]" />
        <span className="size-2.5 rounded-full bg-[#febc2e]" />
        <span className="size-2.5 rounded-full bg-[#28c840]" />
        <span className="ml-2 font-mono text-[11px] text-white/40">quick start</span>
        <Button
          size="sm"
          onClick={handleRun}
          disabled={running}
          className="ml-auto h-7 gap-1.5 bg-[#c96442] px-3 font-mono text-[11px] text-white hover:bg-[#b4533a]"
        >
          <Play className="size-3" />
          {running ? 'Running…' : 'Run it now'}
        </Button>
      </div>
      <pre className="overflow-x-auto p-5 font-mono text-[12.5px] leading-relaxed">
{`curl https://api.canonn.ai/v1/chat/completions \\
  -H "Authorization: Bearer `}<b className="font-medium text-[#a9c9a4]">YOUR_KEY</b>{`" \\
  -d '{"model":"canonn-r1","messages":[
    {"role":"system","content":"YOUR DATA"},
    {"role":"user","content":"your question"}]}'`}
{out && (
  <>
    {'\n\n'}
    <span className={out.startsWith('✗') ? 'text-[#e08b6d]' : 'text-[#a9d8bb]'}>{out}</span>
  </>
)}
      </pre>
    </Card>
  )
}

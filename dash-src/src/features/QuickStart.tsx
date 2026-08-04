import { useState } from 'react'
import { Play } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { runDemo } from '@/lib/api'

const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n')

export function QuickStart() {
  const [data, setData] = useState('SSO is included in the Business plan and above.')
  const [question, setQuestion] = useState('Does Business include SSO?')
  const [running, setRunning] = useState(false)
  const [out, setOut] = useState<string | null>(null)

  async function handleRun() {
    if (!data.trim() || !question.trim()) return
    setRunning(true)
    setOut(null)
    try {
      const res = await runDemo(data, question)
      setOut(`→ "${res.answer}"  (${res.seconds}s)`)
    } catch (e) {
      setOut(`✗ ${e instanceof Error ? e.message : 'failed'}`)
    } finally {
      setRunning(false)
    }
  }

  return (
    <div className="space-y-2.5">
      <div className="grid gap-2.5 sm:grid-cols-2">
        <Input
          value={data}
          onChange={(e) => setData(e.target.value)}
          placeholder="Example data"
          className="bg-card font-mono text-xs"
        />
        <Input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleRun()}
          placeholder="Example question"
          className="bg-card font-mono text-xs"
        />
      </div>
      <Card className="overflow-hidden border-[#3a342e] bg-[#211d1a] py-0 text-[#d8d2c8]">
        <div className="flex items-center gap-1.5 border-b border-white/10 bg-[#26221e] px-3.5 py-2">
          <span className="size-2.5 rounded-full bg-[#ff5f57]" />
          <span className="size-2.5 rounded-full bg-[#febc2e]" />
          <span className="size-2.5 rounded-full bg-[#28c840]" />
          <span className="ml-2 font-mono text-[11px] text-white/40">quick start</span>
          <Button
            size="sm"
            onClick={handleRun}
            disabled={running || !data.trim() || !question.trim()}
            className="ml-auto h-6.5 gap-1 bg-[#c96442] px-2.5 font-mono text-[10.5px] text-white hover:bg-[#b4533a]"
          >
            <Play className="size-3" />
            {running ? 'Running…' : 'Run it now'}
          </Button>
        </div>
        <pre className="overflow-x-auto px-4 py-3.5 font-mono text-[11.5px] leading-[1.65]">
{`curl https://api.canonn.ai/v1/chat/completions \\
  -H "Authorization: Bearer `}<b className="font-medium text-[#a9c9a4]">YOUR_KEY</b>{`" \\
  -d '{"model":"canonn-r1","messages":[
    {"role":"system","content":"`}<span className="text-[#e8b39e]">{esc(data) || 'YOUR DATA'}</span>{`"},
    {"role":"user","content":"`}<span className="text-[#e8b39e]">{esc(question) || 'your question'}</span>{`"}]}'`}
{out && (
  <>
    {'\n\n'}
    <span className={out.startsWith('✗') ? 'text-[#e08b6d]' : 'text-[#a9d8bb]'}>{out}</span>
  </>
)}
        </pre>
      </Card>
    </div>
  )
}

// Word and PowerPoint text extraction in the browser. Both formats are zip
// archives of XML; the text lives in <w:t> (Word) and <a:t> (PowerPoint)
// runs, with paragraphs as <w:p> / <a:p>. Nothing leaves the tab.

import JSZip from 'jszip'

const decode = (s: string) =>
  s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")

function paragraphs(xml: string, para: string, run: string): string[] {
  const out: string[] = []
  for (const p of xml.matchAll(new RegExp(`<${para}\\b[\\s\\S]*?<\\/${para}>`, 'g'))) {
    const text = [...p[0].matchAll(new RegExp(`<${run}\\b[^>]*>([\\s\\S]*?)<\\/${run}>`, 'g'))].map((m) => decode(m[1])).join('')
    if (text.trim()) out.push(text.trim())
  }
  return out
}

export async function officeToText(file: File): Promise<string> {
  const zip = await JSZip.loadAsync(await file.arrayBuffer())
  const name = file.name.toLowerCase()
  if (name.endsWith('.docx')) {
    const doc = await zip.file('word/document.xml')?.async('string')
    if (!doc) throw new Error(`${file.name}: not a Word document`)
    // Tables: each cell is its own paragraph set; join cells with " | ".
    const text = paragraphs(doc, 'w:p', 'w:t').join('\n\n')
    if (!text) throw new Error(`${file.name}: no extractable text`)
    return text
  }
  if (name.endsWith('.pptx')) {
    const slides = Object.keys(zip.files)
      .filter((p) => /^ppt\/slides\/slide\d+\.xml$/.test(p))
      .sort((a, b) => Number(a.match(/\d+/)![0]) - Number(b.match(/\d+/)![0]))
    const parts: string[] = []
    for (const path of slides) {
      const xml = await zip.file(path)!.async('string')
      const lines = paragraphs(xml, 'a:p', 'a:t')
      if (lines.length) parts.push(`## Slide ${path.match(/\d+/)![0]}\n${lines.join('\n')}`)
    }
    if (!parts.length) throw new Error(`${file.name}: no extractable text`)
    return parts.join('\n\n')
  }
  throw new Error(`${file.name}: expected .docx or .pptx`)
}

/** OCR in the browser with Tesseract.js; the language pack is fetched from
 *  the Tesseract CDN on first use and cached by the browser. */
export async function imageToText(file: File, onProgress?: (p: number) => void): Promise<string> {
  const { createWorker } = await import('tesseract.js')
  const worker = await createWorker(['eng', 'heb'], 1, {
    logger: (m: { status: string; progress: number }) => { if (m.status === 'recognizing text') onProgress?.(m.progress) },
  })
  try {
    const { data } = await worker.recognize(file)
    const text = data.text.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim()
    if (!text) throw new Error(`${file.name}: no text recognised`)
    return text
  } finally {
    await worker.terminate()
  }
}

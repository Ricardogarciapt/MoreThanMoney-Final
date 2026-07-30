import { NextRequest, NextResponse } from 'next/server'
import { synthesizeSpeech } from '@/lib/lms-captions/tts'

// POST /api/live-sessions/tts  { text, voiceId? }  → áudio (mp3) na voz clonada Fish.
// Autenticado pelo segredo do worker (dobragem ao vivo). A key Fish fica só na Vercel.

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  const secret = process.env.LMS_CAPTION_WORKER_SECRET
  if (!secret || req.headers.get('x-caption-secret') !== secret) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }
  const body = (await req.json().catch(() => ({}))) as { text?: string; voiceId?: string }
  const text = (body.text || '').trim()
  if (!text) return NextResponse.json({ error: 'text obrigatório' }, { status: 400 })

  const out = await synthesizeSpeech(text, { voiceId: body.voiceId })
  if (!out) return NextResponse.json({ error: 'Falha no TTS Fish' }, { status: 502 })

  return new NextResponse(new Uint8Array(out.buffer), {
    status: 200,
    headers: { 'Content-Type': out.contentType, 'Cache-Control': 'no-store' },
  })
}

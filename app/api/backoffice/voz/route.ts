/**
 * VOZ → TEXTO para o backoffice. Recebe o áudio gravado no browser e devolve a transcrição.
 *
 * Groq Whisper (plano grátis, a mesma chave `GROQ_API_KEY` da cadeia de IA). A língua é detectada
 * — quem falar em inglês ou espanhol é ouvido nessa língua. O áudio NÃO se guarda em lado nenhum:
 * passa por aqui, vira texto e desaparece (RGPD: só o texto do comando chega ao registo).
 */
import { NextRequest, NextResponse } from 'next/server'
import { exigirCapacidade } from '@/lib/backoffice-sessao'

export const runtime = 'nodejs'

const MAX_BYTES = 8 * 1024 * 1024 // ~8 min de opus; um comando tem segundos
const MODELO = process.env.GROQ_WHISPER_MODEL?.trim() || 'whisper-large-v3-turbo'

export async function POST(request: NextRequest) {
  const ctx = await exigirCapacidade(request, 'bo.entrar')
  if (ctx instanceof NextResponse) return ctx

  const chave = process.env.GROQ_API_KEY?.trim()
  if (!chave) return NextResponse.json({ error: 'A transcrição não está configurada (falta GROQ_API_KEY).' }, { status: 503 })

  let audio: File | null = null
  try {
    const form = await request.formData()
    const f = form.get('audio')
    audio = f instanceof File ? f : null
  } catch {
    return NextResponse.json({ error: 'Pedido inválido.' }, { status: 400 })
  }
  if (!audio || audio.size === 0) return NextResponse.json({ error: 'Não chegou áudio.' }, { status: 400 })
  if (audio.size > MAX_BYTES) return NextResponse.json({ error: 'Gravação demasiado longa para um comando.' }, { status: 413 })

  const envio = new FormData()
  envio.append('file', audio, audio.name || 'comando.webm')
  envio.append('model', MODELO)
  envio.append('response_format', 'verbose_json')
  envio.append('temperature', '0')

  try {
    const r = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${chave}` },
      body: envio,
      signal: AbortSignal.timeout(30_000),
    })
    if (!r.ok) {
      console.error('[backoffice/voz] groq', r.status, (await r.text()).slice(0, 300))
      return NextResponse.json({ error: 'A transcrição falhou. Tenta outra vez.' }, { status: 502 })
    }
    const j = (await r.json()) as { text?: string; language?: string }
    const texto = (j.text ?? '').trim()
    if (!texto) return NextResponse.json({ error: 'Não se ouviu nada. Tenta outra vez mais perto do microfone.' }, { status: 422 })
    return NextResponse.json({ texto, lingua: j.language ?? null })
  } catch (e) {
    console.error('[backoffice/voz]', e)
    return NextResponse.json({ error: 'A transcrição demorou demasiado. Tenta outra vez.' }, { status: 504 })
  }
}

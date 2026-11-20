import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { checkRateLimit } from '@/lib/admin-api-helpers'
import { avisarAdmin } from '@/lib/primegate/verificacao'

export const dynamic = 'force-dynamic'

const MOTIVOS: Record<string, string> = {
  conversa: 'Quero falar contigo', aprender: 'Quero aprender', negocio: 'Tenho um negócio',
  trabalhar: 'Quero trabalhar convosco', parceria: 'Proposta de parceria',
}
const t = (v: unknown, n: number) => String(v ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, n)

// Formulário de contacto da página do Ricardo: grava, avisa o Ricardo no Telegram e responde já.
export async function POST(req: NextRequest) {
  const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'anon'
  if (!checkRateLimit('rg-contacto:' + ip, 5, 10 * 60_000).allowed) {
    return NextResponse.json({ ok: false, erro: 'Muitos pedidos seguidos. Tenta daqui a uns minutos.' }, { status: 429 })
  }
  let b: any = {}
  try { b = await req.json() } catch {}
  if (b?.empresa) return NextResponse.json({ ok: true }) // armadilha para robôs
  const nome = t(b?.nome, 120), email = t(b?.email, 160), telefone = t(b?.telefone, 40), mensagem = t(b?.mensagem, 2000)
  const motivo = MOTIVOS[b?.motivo] ? b.motivo : 'conversa'
  if (!nome || (!email && !telefone)) return NextResponse.json({ ok: false, erro: 'Diz-me o teu nome e um email ou telemóvel.' }, { status: 400 })
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return NextResponse.json({ ok: false, erro: 'O email não parece válido.' }, { status: 400 })
  if (!b?.consentimento) return NextResponse.json({ ok: false, erro: 'Precisamos do teu consentimento para responder.' }, { status: 400 })

  const db = getSupabaseAdmin()
  const { error } = await db.from('rg_contactos').insert({ nome, email: email || null, telefone: telefone || null, motivo, mensagem: mensagem || null, origem: t(b?.origem, 80) || 'landing' })
  if (error) return NextResponse.json({ ok: false, erro: 'Não consegui guardar. Tenta outra vez.' }, { status: 500 })
  try {
    await avisarAdmin(db, `📩 Novo contacto na tua página\n${nome} · ${MOTIVOS[motivo]}\n${[email, telefone].filter(Boolean).join(' · ')}${mensagem ? '\n«' + mensagem.slice(0, 400) + '»' : ''}\n\nVê em morethanmoney.pt/ricardogarcia/painel`)
  } catch {}
  return NextResponse.json({ ok: true })
}

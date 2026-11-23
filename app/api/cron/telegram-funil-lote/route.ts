/**
 * PÔR OS LEADS DO TELEGRAM PARADOS NO FUNIL DE CONVERSA (23/11/2026).
 *
 * Os leads do bot que ficaram sem seguimento (no grupo, pedido de sinais, novos, a qualificar)
 * recebem a abertura do funil: áudio + menu (rotas, pessoa, línguas). O áudio vai sem nome, para
 * ser UM só ficheiro de voz para todos (não gasta créditos por pessoa). Quem nunca abriu o bot não
 * pode receber (o Telegram responde 403): fica como estava e conta como «não alcançável».
 *
 *   GET ?chave=<whatsapp_diag_chave>[&limite=40][&desde=0][&ensaio=1]
 */
import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

async function autorizado(req: NextRequest): Promise<boolean> {
  const chave = req.nextUrl.searchParams.get('chave') ?? ''
  if (chave.length < 24) return false
  const { data } = await getSupabaseAdmin().from('site_settings').select('value').eq('key', 'whatsapp_diag_chave').maybeSingle()
  const guardada = (data?.value as { chave?: string } | null)?.chave
  return !!guardada && guardada === chave
}

export async function GET(req: NextRequest) {
  if (!(await autorizado(req))) return NextResponse.json({ ok: false, erro: 'nao_autorizado' }, { status: 401 })
  const limite = Math.min(120, Math.max(1, Number(req.nextUrl.searchParams.get('limite') ?? 40)))
  const ensaio = req.nextUrl.searchParams.get('ensaio') === '1'
  // Os inalcançáveis ficam no estágio antigo: `desde` salta-os em lotes curtos (a função tem tecto de tempo).
  const desde = Math.max(0, Number(req.nextUrl.searchParams.get('desde') ?? 0))
  const db = getSupabaseAdmin()
  const { data, error } = await db
    .from('telegram_leads')
    .select('chat_id, lang, stage')
    .in('stage', ['no_grupo', 'pedido_sinais', 'new', 'qualifying', 'routed'])
    .is('granted_at', null)
    .not('chat_id', 'like', 'wa:%')
    .not('chat_id', 'like', '-%')
    .order('updated_at', { ascending: false })
    .order('chat_id', { ascending: true })
    .range(desde, desde + limite - 1)
  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 })
  const leads = (data ?? []) as Array<{ chat_id: string; lang: string | null; stage: string | null }>
  if (ensaio) return NextResponse.json({ ok: true, ensaio: true, seriam: leads.length, porEtapa: leads.reduce<Record<string, number>>((a, l) => ((a[l.stage ?? '?'] = (a[l.stage ?? '?'] ?? 0) + 1), a), {}) })

  const { abrirFunilTelegram, linguaTelegram } = await import('@/lib/telegram/funil-conversa')
  let entraram = 0
  let naoAlcancaveis = 0
  for (const l of leads) {
    const ok = await abrirFunilTelegram(l.chat_id, '', linguaTelegram(l.lang)).catch(() => false)
    if (ok) entraram++
    else naoAlcancaveis++
    await new Promise((r) => setTimeout(r, 150))
  }
  return NextResponse.json({ ok: true, vistos: leads.length, entraram, naoAlcancaveis })
}

/**
 * Cron DIÁRIO dos carrosséis de entrega de valor (ordem do Ricardo, 06/11/2026).
 *
 * Todas as manhãs agenda um carrossel novo em cada perfil — @ricardogarciapt (19:00) e
 * @morethanmoney.pt (12:30) — e avisa o Ricardo por Telegram com a capa. Quem publica é o
 * cron ig-publish. Lógica em lib/carrossel-diario/motor.ts.
 *
 * ?perfil=ricardo|mtm só um perfil · ?forcar=1 agenda mesmo que já haja um hoje.
 */
import { NextRequest, NextResponse } from 'next/server'
import { isCronAuthorized } from '@/lib/cron-auth'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { getMtmcopyBotToken } from '@/lib/mtmcopy/telegram-bot'
import { agendarDia, type Resultado } from '@/lib/carrossel-diario/motor'
import { ARROBA, type Perfil } from '@/lib/carrossel-diario/tipos'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 300

async function adminChatId(): Promise<string> {
  try {
    const { data } = await getSupabaseAdmin().from('site_settings').select('value').eq('key', 'telegram_admin_chat_id').maybeSingle()
    const raw = data?.value
    const v =
      raw && typeof raw === 'object' && 'chat_id' in (raw as Record<string, unknown>)
        ? String((raw as Record<string, unknown>).chat_id)
        : String(raw ?? '').replace(/["\s]/g, '')
    return v || process.env.TELEGRAM_ADMIN_CHAT_ID?.trim() || '1446687230'
  } catch {
    return process.env.TELEGRAM_ADMIN_CHAT_ID?.trim() || '1446687230'
  }
}

async function avisar(r: Resultado) {
  const token = getMtmcopyBotToken()
  if (!token || r.estado === 'ja_havia' || r.estado === 'desligado') return
  const chat_id = await adminChatId()
  const hora = r.agendado_para
    ? new Date(r.agendado_para).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Lisbon' })
    : ''
  if (r.estado === 'agendado' && r.capa) {
    const caption = `🗂️ Carrossel do dia para ${ARROBA[r.perfil]} agendado para as ${hora} (${r.origem}).\nPara o travar, cancela-o em /admin/social antes dessa hora.`
    await fetch(`https://api.telegram.org/bot${token}/sendPhoto`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id, photo: r.capa, caption }),
    }).catch(() => {})
  } else {
    const text = `⚠️ Carrossel do dia para ${ARROBA[r.perfil]} NÃO foi agendado: ${r.motivo || 'motivo desconhecido'}.`
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id, text }),
    }).catch(() => {})
  }
}

export async function GET(request: NextRequest) {
  if (!isCronAuthorized(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const p = request.nextUrl.searchParams.get('perfil')
  const perfis: Perfil[] = p === 'ricardo' || p === 'mtm' ? [p] : ['mtm', 'ricardo']
  const forcar = request.nextUrl.searchParams.get('forcar') === '1'
  const resultados: Resultado[] = []
  for (const perfil of perfis) {
    let r: Resultado
    try {
      r = await agendarDia(perfil, { forcar })
    } catch (e) {
      r = { perfil, estado: 'falhou', motivo: e instanceof Error ? e.message : String(e) }
    }
    await avisar(r)
    resultados.push(r)
  }
  return NextResponse.json({ ok: resultados.every((r) => r.estado !== 'falhou'), resultados })
}

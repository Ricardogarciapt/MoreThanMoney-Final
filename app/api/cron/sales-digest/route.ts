import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { sendTelegramChannelMessage } from '@/lib/mtmcopy/telegram-bot'

/**
 * Digest diário da MÁQUINA DE VENDAS → chat de admin do Ricardo (supervisão).
 * Resume o que a máquina fez: leads no funil, acessos concedidos, conversões pagas, execução.
 * Autónomo, mas com o teu olho. Bearer CRON_SECRET (ou cron header). Correr 1x/dia.
 */
export const dynamic = 'force-dynamic'

const ADMIN_CHAT = () => process.env.TELEGRAM_ADMIN_CHAT_ID?.trim() || '1446687230'

function todayLisbon(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Lisbon' }).format(new Date())
}

async function authorized(req: NextRequest): Promise<boolean> {
  const secret = process.env.CRON_SECRET
  const auth = req.headers.get('authorization') || ''
  if (secret && auth === `Bearer ${secret}`) return true
  // Vercel Cron envia x-vercel-cron; aceita também.
  return Boolean(req.headers.get('x-vercel-cron'))
}

export async function GET(req: NextRequest) {
  if (!(await authorized(req))) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  const supabase = getSupabaseAdmin()
  const day = todayLisbon()
  const sinceIso = new Date(Date.now() - 24 * 3600 * 1000).toISOString()

  // 1) Funil Telegram — leads por etapa.
  const { data: leads } = await supabase.from('telegram_leads').select('stage, granted_at, username, created_at')
  const byStage: Record<string, number> = {}
  let novos24h = 0
  const grantedToday: string[] = []
  for (const l of leads ?? []) {
    byStage[l.stage || 'new'] = (byStage[l.stage || 'new'] || 0) + 1
    if (l.created_at && l.created_at >= sinceIso) novos24h++
    if (l.granted_at && String(l.granted_at).slice(0, 10) === day) grantedToday.push(String(l.username || '—'))
  }
  const stageLine = Object.entries(byStage).sort((a, b) => b[1] - a[1]).map(([s, n]) => `${s}:${n}`).join(' · ') || '—'

  // 2) Conversões pagas hoje (perfis Premium não-manuais atualizados hoje).
  const { count: pagosHoje } = await supabase
    .from('profiles')
    .select('id', { count: 'exact', head: true })
    .eq('subscription_status', 'active')
    .neq('subscription_platform', 'manual')
    .gte('updated_at', sinceIso)

  // 3) Corretora — clientes validados (broker_clients).
  const { count: brokerClients } = await supabase.from('broker_clients').select('uid', { count: 'exact', head: true })

  // 4) Sinais processados nas últimas 24h.
  const { count: sinais24h } = await supabase
    .from('tradingview_signals')
    .select('id', { count: 'exact', head: true })
    .gte('received_at', sinceIso)

  const msg =
    `🧭 <b>Máquina de Vendas — Digest ${day}</b>\n\n` +
    `📥 Funil Telegram: ${stageLine}\n` +
    `   novos leads (24h): <b>${novos24h}</b>\n` +
    `✅ Acessos concedidos hoje: <b>${grantedToday.length}</b>${grantedToday.length ? ` (${grantedToday.slice(0, 8).map((u) => (u === '—' ? u : '@' + u)).join(', ')})` : ''}\n` +
    `💳 Conversões Premium pagas (24h): <b>${pagosHoje ?? 0}</b>\n` +
    `🏦 Corretora validada (broker_clients): <b>${brokerClients ?? 0}</b>\n` +
    `📡 Sinais processados (24h): <b>${sinais24h ?? 0}</b>\n\n` +
    `⚙️ Autónomo. Precisa da tua supervisão só nos pontos-chave.`

  const r = await sendTelegramChannelMessage(ADMIN_CHAT(), msg, { parseMode: 'HTML' })
  return NextResponse.json({ ok: r.ok, sent: r.ok, day, novos24h, grantedToday: grantedToday.length })
}

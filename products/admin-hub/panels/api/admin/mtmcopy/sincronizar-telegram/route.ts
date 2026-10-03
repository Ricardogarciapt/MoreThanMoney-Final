import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { editTelegramChannelMessage } from '@/lib/mtmcopy/telegram-bot'

/**
 * Põe o Telegram a dizer o mesmo que o chat do site, para mensagens JÁ publicadas.
 *
 * Quando se corrige uma mensagem no site — como as nove que diziam «Stop loss» numa trade que
 * fechou protegida — a cópia no Telegram fica a dizer o contrário. Republicar não serve: o
 * membro receberia uma notificação nova de uma trade de há duas semanas, e a mensagem errada
 * continuava lá em cima. O que corrige sem enganar ninguém é EDITAR no lugar.
 *
 * O id da mensagem do Telegram não vive em `chat_messages` (é escrito depois do insert, noutra
 * tabela): vem de `tradingview_signals.telegram_message_id`, ligado pelo `chat_message_id`.
 *
 * Só edita — nunca envia. `dry=1` mostra o que faria sem tocar em nada.
 */

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function POST(req: NextRequest) {
  const segredo = process.env.CRON_SECRET
  if (!segredo || (req.headers.get('authorization') || '') !== `Bearer ${segredo}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const url = req.nextUrl
  const seco = url.searchParams.get('dry') === '1'
  const prefixo = url.searchParams.get('prefixo') ?? '🔒 Stop protegido'
  const limite = Math.min(Number(url.searchParams.get('limite') ?? 50) || 50, 200)

  const db = getSupabaseAdmin()
  const { data: msgs, error } = await db
    .from('chat_messages')
    .select('id, channel_slug, content, created_at')
    .like('content', `${prefixo}%`)
    .eq('is_deleted', false)
    .order('created_at', { ascending: true })
    .limit(limite)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const resultados: Array<Record<string, unknown>> = []
  for (const m of msgs ?? []) {
    const { data: sig } = await db
      .from('tradingview_signals')
      .select('telegram_message_id, telegram_chat_id')
      .eq('chat_message_id', m.id)
      .maybeSingle()

    const mid = sig?.telegram_message_id as number | null | undefined
    const chat = sig?.telegram_chat_id as string | null | undefined
    if (!mid || !chat) {
      // Sem id não há edição possível: um bot não consegue procurar uma mensagem antiga.
      resultados.push({ id: m.id, canal: m.channel_slug, estado: 'sem id de telegram' })
      continue
    }
    if (seco) {
      resultados.push({ id: m.id, canal: m.channel_slug, estado: 'editaria', telegram: mid })
      continue
    }
    const r = await editTelegramChannelMessage(String(chat), Number(mid), String(m.content ?? ''))
    resultados.push({
      id: m.id,
      canal: m.channel_slug,
      telegram: mid,
      estado: r.ok ? (r.unchanged ? 'já igual' : 'editada') : `falhou: ${r.error}`,
    })
  }

  return NextResponse.json({
    ok: true,
    seco,
    total: resultados.length,
    editadas: resultados.filter((r) => r.estado === 'editada').length,
    resultados,
  })
}

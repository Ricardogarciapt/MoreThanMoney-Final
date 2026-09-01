import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-api-helpers'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'

export const dynamic = 'force-dynamic'

/**
 * As conversas que o bot do Telegram está a ter com as pessoas.
 *
 * O bot corre no VPS e responde sozinho — até aqui não havia forma de ler o que ele andava a
 * dizer sem abrir a base de dados à mão. É assim que se descobre um bot a inventar: foi a ler
 * uma destas conversas que se viu o «+7.060€ documentados» a sair para um lead, um número
 * congelado a 30/06 e proibido desde 26/08.
 *
 * Lê `telegram_leads`: o `history` guarda a conversa toda, em pares role/texto.
 */

interface Turno { role?: string; text?: string }

export async function GET(req: NextRequest) {
  const guarda = await requireAdmin(req)
  if (guarda) return guarda

  const db = getSupabaseAdmin()
  const url = new URL(req.url)
  const procura = (url.searchParams.get('q') ?? '').trim().toLowerCase()
  const chatId = url.searchParams.get('chat')

  // Uma conversa em detalhe.
  if (chatId) {
    const { data } = await db
      .from('telegram_leads')
      .select('chat_id, username, first_name, stage, interesse, interest, source, tags, lang, message_count, history, created_at, updated_at, broker_uid, coupon_code, granted_at, mtmauto_passo')
      .eq('chat_id', chatId)
      .maybeSingle()
    if (!data) return NextResponse.json({ error: 'Conversa não encontrada' }, { status: 404 })
    return NextResponse.json({ conversa: data })
  }

  const { data, error } = await db
    .from('telegram_leads')
    .select('chat_id, username, first_name, stage, interesse, source, message_count, history, created_at, updated_at, granted_at')
    .order('updated_at', { ascending: false })
    .limit(200)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const lista = (data ?? []).map((l) => {
    const h = (l.history ?? []) as Turno[]
    const ultima = [...h].reverse().find((t) => (t.text ?? '').trim())
    return {
      chatId: l.chat_id,
      quem: l.username ? `@${l.username}` : (l.first_name || `#${l.chat_id}`),
      etapa: l.stage ?? null,
      interesse: l.interesse ?? null,
      origem: l.source ?? null,
      mensagens: l.message_count ?? h.length,
      // O último turno, para se perceber onde a conversa parou sem ter de a abrir.
      ultimoDe: ultima?.role === 'assistant' ? 'bot' : 'pessoa',
      ultimoTexto: (ultima?.text ?? '').slice(0, 160),
      validado: Boolean(l.granted_at),
      quando: l.updated_at ?? l.created_at,
    }
  })

  const filtrada = procura
    ? lista.filter((c) =>
        `${c.quem} ${c.ultimoTexto} ${c.etapa ?? ''} ${c.interesse ?? ''}`.toLowerCase().includes(procura),
      )
    : lista

  return NextResponse.json({
    conversas: filtrada,
    total: lista.length,
    // O bot é este — dizê-lo evita a dúvida de se estamos a ver as conversas do bot certo.
    bot: '@MoreThanMoney_aibot',
  })
}

/**
 * O CRM DO TELEGRAM no back-office (23/11/2026) — o par do CRM de WhatsApp.
 *
 * GET              → as conversas privadas do bot (leads), as mais recentes primeiro.
 * GET ?chat=<id>   → o histórico dessa conversa.
 * POST { chat, acao: 'responder', texto }                  → a equipa responde pelo bot (fica no livro).
 * POST { chat, acao: 'funil', passo: 'abrir'|'humano'|<rota> } → empurra o lead para um passo do funil.
 *
 * O Telegram não tem janela de 24 h: a equipa escreve quando quiser, sempre pelo bot oficial.
 */
import { NextRequest, NextResponse } from 'next/server'
import { exigirGestao } from '@/lib/backoffice-sessao'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { ROTAS_WA, type RotaWa } from '@/lib/vendas/guiao-whatsapp'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

type Lead = {
  chat_id: string; username: string | null; first_name: string | null; stage: string | null; interest: string | null
  lang: string | null; message_count: number | null; updated_at: string | null; created_at: string | null
  history: Array<{ role: string; text: string }> | null; broker_uid: string | null; granted_at: string | null
}

export async function GET(request: NextRequest) {
  const negado = (await exigirGestao(request, 'bo.gestao_crm')).negado
  if (negado) return negado
  const db = getSupabaseAdmin()
  const chat = request.nextUrl.searchParams.get('chat')
  if (chat) {
    const { data } = await db.from('telegram_leads').select('history').eq('chat_id', chat).maybeSingle()
    const { data: cliques } = await db.from('bot_avisos_enviados').select('chave, enviado_em').eq('tipo', 'wa-clique').eq('alvo', `tg:${chat}`).order('enviado_em', { ascending: false }).limit(10)
    return NextResponse.json({ ok: true, historico: (data?.history as Lead['history']) ?? [], cliques: cliques ?? [] })
  }
  const { data, error } = await db
    .from('telegram_leads')
    .select('chat_id, username, first_name, stage, interest, lang, message_count, updated_at, created_at, broker_uid, granted_at')
    .not('chat_id', 'like', 'wa:%')
    .not('chat_id', 'like', '-%')
    .order('updated_at', { ascending: false })
    .limit(150)
  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 })
  const lista = (data ?? []) as Lead[]
  const dia = Date.now() - 86_400_000
  return NextResponse.json({
    ok: true,
    resumo: {
      total: lista.length,
      hoje: lista.filter((l) => l.updated_at && Date.parse(l.updated_at) > dia).length,
      querPessoa: lista.filter((l) => l.stage === 'tg_humano').length,
      noFunil: lista.filter((l) => String(l.stage ?? '').startsWith('tg_')).length,
    },
    conversas: lista,
  })
}

export async function POST(request: NextRequest) {
  const sessao = await exigirGestao(request, 'bo.gestao_crm')
  if (sessao.negado) return sessao.negado
  const corpo = (await request.json().catch(() => null)) as { chat?: string; acao?: string; texto?: string; passo?: string } | null
  const chat = String(corpo?.chat ?? '').trim()
  if (!/^\d{3,20}$/.test(chat)) return NextResponse.json({ ok: false, porque: 'Conversa inválida.' }, { status: 400 })
  const db = getSupabaseAdmin()
  const { data: lead } = await db.from('telegram_leads').select('first_name, lang, history').eq('chat_id', chat).maybeSingle()
  if (!lead) return NextResponse.json({ ok: false, porque: 'Esta pessoa ainda não falou com o bot.' }, { status: 404 })
  const nome = String(lead.first_name ?? '').trim().split(/\s+/)[0] || ''
  const fx = await import('@/lib/telegram/funil-conversa')
  const lingua = fx.linguaTelegram(lead.lang)

  if (corpo?.acao === 'responder') {
    const texto = String(corpo.texto ?? '').trim().slice(0, 3500)
    if (!texto) return NextResponse.json({ ok: false, porque: 'Escreve a mensagem.' }, { status: 400 })
    const { enviarTelegramPorAgente } = await import('@/lib/agentes/mensagem-livro')
    const r = await enviarTelegramPorAgente({ chatId: chat, texto, funil: 'telegram:equipa' })
    if (!r.enviado) return NextResponse.json({ ok: false, porque: `O Telegram recusou: ${r.erro ?? 'sem descrição'}` }, { status: 502 })
    const hist = (Array.isArray(lead.history) ? lead.history : []) as Array<{ role: string; text: string }>
    await db.from('telegram_leads').update({ history: [...hist, { role: 'assistant', text: `[equipa] ${texto}` }].slice(-16), updated_at: new Date().toISOString() }).eq('chat_id', chat)
    return NextResponse.json({ ok: true })
  }

  if (corpo?.acao === 'funil') {
    const passo = String(corpo.passo ?? '')
    if (passo === 'abrir') await fx.abrirFunilTelegram(chat, nome, lingua)
    else if (passo === 'humano') await fx.pedirPessoaTelegram(chat, nome, lingua, 'a equipa passou para a fila dos setters')
    else if ((ROTAS_WA as readonly string[]).includes(passo)) await fx.enviarRotaTelegram(chat, passo as RotaWa, nome, lingua)
    else return NextResponse.json({ ok: false, porque: 'Passo do funil desconhecido.' }, { status: 400 })
    return NextResponse.json({ ok: true })
  }
  return NextResponse.json({ ok: false, porque: 'Ação desconhecida.' }, { status: 400 })
}

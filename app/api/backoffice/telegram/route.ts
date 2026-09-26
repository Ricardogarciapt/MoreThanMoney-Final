/**
 * O TELEGRAM DE QUEM TRABALHA NA EQUIPA — ver o estado, gerar o código, desligar.
 *
 * É esta rota que fecha o buraco: o motor do dia já sabia escrever a cada pessoa, mas
 * `backoffice_contactos` nasceu vazia e não havia forma nenhuma de a preencher. O trabalho era
 * preparado todas as manhãs e ninguém sabia que existia.
 *
 * PORQUE É QUE O CÓDIGO NASCE AQUI E NÃO NO BOT
 * Porque aqui a identidade JÁ está provada: quem chega a esta rota passou pelo login do site e o
 * `exigirCapacidade` confirmou a sessão e os papéis. O bot não autentica ninguém — recebe um segredo
 * que só a própria pessoa pôde ver. Se a ligação se fizesse pelo email escrito ao bot, qualquer
 * pessoa da equipa ligava-se à conta de um colega (o email sabe-se) e passava a receber o trabalho
 * dele e a ver o extracto dele, sem ele dar por nada.
 *
 * O CÓDIGO MOSTRA-SE UMA VEZ. Não há rota que o volte a ler: a tabela guarda o resumo (sha-256) e
 * não o código. Quem o perder gera outro — e gerar outro fecha o anterior.
 */
import { NextRequest, NextResponse } from 'next/server'
import { exigirCapacidade } from '@/lib/backoffice-sessao'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { criarCodigoDeLigacao } from '@/lib/backoffice-telegram'
import { VALIDADE_MINUTOS } from '@/lib/backoffice-telegram-codigo'

/** Um código de cada vez, com pausa. Vive em memória: não trava tudo, trava o dedo preso no botão. */
const ESPERA_MS = 10_000
const ultimo = new Map<string, number>()

/** O estado da ligação desta pessoa. Nunca devolve o código — esse mostra-se uma vez, no POST. */
export async function GET(request: NextRequest) {
  const ctx = await exigirCapacidade(request, 'bo.entrar')
  if (ctx instanceof NextResponse) return ctx

  const { data } = await getSupabaseAdmin()
    .from('backoffice_contactos')
    .select('telegram_chat_id, telegram_username, avisos_ligados, ligado_em')
    .eq('user_id', ctx.userId)
    .maybeSingle()

  const linha = data as {
    telegram_chat_id?: string | null
    telegram_username?: string | null
    avisos_ligados?: boolean
    ligado_em?: string | null
  } | null

  return NextResponse.json({
    ligado: Boolean(linha?.telegram_chat_id),
    // O username serve para a pessoa reconhecer QUAL dos seus Telegrams está ligado. O chat_id não
    // vai para o cliente: não lhe diz nada e é o identificador com que se fala com ela.
    username: linha?.telegram_username ?? null,
    avisos_ligados: linha?.avisos_ligados !== false,
    ligado_em: linha?.ligado_em ?? null,
    validade_minutos: VALIDADE_MINUTOS,
  })
}

/** Gera um código novo. Fecha os anteriores — ver `criarCodigoDeLigacao`. */
export async function POST(request: NextRequest) {
  const ctx = await exigirCapacidade(request, 'bo.entrar')
  if (ctx instanceof NextResponse) return ctx

  const agora = Date.now()
  const anterior = ultimo.get(ctx.userId) ?? 0
  if (agora - anterior < ESPERA_MS) {
    return NextResponse.json({ error: 'Espera uns segundos antes de gerar outro código.' }, { status: 429 })
  }
  ultimo.set(ctx.userId, agora)

  try {
    const { codigo, expiraEm } = await criarCodigoDeLigacao(getSupabaseAdmin(), ctx.userId)
    return NextResponse.json({ ok: true, codigo, expira_em: expiraEm, validade_minutos: VALIDADE_MINUTOS })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Não consegui gerar o código.' }, { status: 500 })
  }
}

/**
 * Desliga o Telegram desta conta, PELA ID DA SESSÃO.
 *
 * Não aceita chat_id no corpo de propósito: se aceitasse, qualquer pessoa da equipa desligava o
 * Telegram de um colega e deixava-o sem o resumo da manhã sem ele perceber porquê. A linha fica (sem
 * chat), para a preferência de avisos não se perder.
 */
export async function DELETE(request: NextRequest) {
  const ctx = await exigirCapacidade(request, 'bo.entrar')
  if (ctx instanceof NextResponse) return ctx

  const { error } = await getSupabaseAdmin()
    .from('backoffice_contactos')
    .update({ telegram_chat_id: null, ligado_em: null, atualizado_em: new Date().toISOString() })
    .eq('user_id', ctx.userId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

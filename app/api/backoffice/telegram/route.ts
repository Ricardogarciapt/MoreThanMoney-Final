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

  /**
   * O DONO PODE GERAR O CÓDIGO POR OUTRA PESSOA DA EQUIPA.
   *
   * Porque isto foi preciso: o fluxo normal obriga a pessoa a entrar no backoffice para gerar o
   * seu código. Só que quem ainda não tem o hábito de lá entrar é exactamente quem precisa de ser
   * ligado — hoje havia 25 e 20 tarefas à espera de duas pessoas que nunca abriram a página. O
   * arranque de uma equipa não se faz pedindo à equipa que já esteja dentro.
   *
   * Assim o Ricardo gera e manda-lhes o link; um toque liga.
   *
   * O QUE ISTO ABRE, e é preciso dizê-lo sem rodeios: quem tiver o link recebe o trabalho e vê o
   * extracto da pessoa a quem ele pertence. É por isso que só o dono o pode gerar por outrem, que
   * o código morre em 15 minutos, que serve uma vez só, e que gerar outro mata o anterior. Um link
   * reencaminhado por engano expira antes de ser um problema — mas quem o manda tem de saber que
   * o está a mandar à pessoa certa.
   */
  let paraQuem = ctx.userId
  if (ctx.admin) {
    let corpo: { user_id?: unknown } = {}
    try {
      corpo = (await request.json()) as { user_id?: unknown }
    } catch {
      // Sem corpo é o caso normal: o dono a gerar o dele.
    }
    if (typeof corpo.user_id === 'string' && corpo.user_id && corpo.user_id !== ctx.userId) {
      // Só para quem TEM papéis activos: um código para uma conta sem papéis não daria acesso a
      // nada, e pedi-lo é sinal de engano — melhor recusar do que ligar um chat a uma conta muda.
      const { data: temPapel } = await getSupabaseAdmin()
        .from('backoffice_papeis')
        .select('user_id')
        .eq('user_id', corpo.user_id)
        .is('retirado_at', null)
        .limit(1)
        .maybeSingle()
      if (!temPapel) {
        return NextResponse.json({ error: 'Essa pessoa não tem papéis activos no backoffice.' }, { status: 400 })
      }
      paraQuem = corpo.user_id
    }
  }

  const agora = Date.now()
  const anterior = ultimo.get(ctx.userId) ?? 0
  if (agora - anterior < ESPERA_MS) {
    return NextResponse.json({ error: 'Espera uns segundos antes de gerar outro código.' }, { status: 429 })
  }
  ultimo.set(ctx.userId, agora)

  try {
    const { codigo, expiraEm } = await criarCodigoDeLigacao(getSupabaseAdmin(), paraQuem)
    // O link de um toque vai já montado: escrever um código à mão é onde a adopção se perde.
    const bot = (process.env.TELEGRAM_BOT_USERNAME || 'MoreThanMoney_aibot').replace(/^@/, '')
    return NextResponse.json({
      ok: true,
      codigo,
      link: `https://t.me/${bot}?start=${codigo}`,
      para: paraQuem === ctx.userId ? 'proprio' : paraQuem,
      expira_em: expiraEm,
      validade_minutos: VALIDADE_MINUTOS,
    })
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

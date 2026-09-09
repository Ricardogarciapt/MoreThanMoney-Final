import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'

/**
 * Entrada dos bots SECUNDÁRIOS — hoje o @WifiMoney_byCR_bot. (Nasceu para o grupo Golden
 * Moves, que entretanto deixou de existir; fica como porta genérica de fontes futuras.)
 *
 * Porque é preciso outro webhook: cada bot tem o seu próprio fluxo de updates. O bot principal
 * não vê o que se escreve num grupo onde não está, por mais admin que o outro seja. Ligar a
 * fonte é ligar o fluxo DESTE bot, não emprestar-lhe o do outro.
 *
 * ⚠️ Um bot só recebe o que for escrito DEPOIS de entrar no grupo. Não há forma de um bot ir
 * buscar histórico — isso só uma sessão de utilizador consegue. O que aqui entra é o futuro.
 *
 * Este endpoint faz duas coisas e nada mais:
 *  1. regista o grupo em `mtmcopy_telegram_discovered`, para ele aparecer no admin e se lhe
 *     poder apontar uma rota;
 *  2. entrega a mensagem à rota que tiver esse chat — se não houver rota, fica-se pelo registo.
 *
 * Nunca executa por adivinhação: sem rota apontada a este chat, não abre ordem nenhuma.
 */


/**
 * O id do nosso bot, perguntado uma vez e guardado.
 *
 * Em caso de dúvida diz que NÃO é o próprio bot: um erro aqui não pode travar sinais
 * legítimos. O ciclo que isto previne exige o relay ligado, que hoje não está.
 */
let idDoBot: number | null | undefined
async function ehOProprioBot(autorId: number): Promise<boolean> {
  if (idDoBot === undefined) {
    idDoBot = null
    const tk = process.env.TELEGRAM_WIFIMONEY_TOKEN?.trim()
    if (tk) {
      try {
        const r = await fetch(`https://api.telegram.org/bot${tk}/getMe`)
        const j = (await r.json()) as { ok?: boolean; result?: { id?: number } }
        idDoBot = j?.ok && j.result?.id ? j.result.id : null
      } catch {
        idDoBot = null
      }
    }
  }
  return idDoBot != null && idDoBot === autorId
}

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function POST(req: NextRequest) {
  // O Telegram devolve o segredo que lhe demos no setWebhook. Sem ele, ignora-se em silêncio:
  // responder 401 a quem bate à porta é confirmar-lhe que a porta existe.
  const esperado = process.env.CRON_SECRET
  const recebido = req.headers.get('x-telegram-bot-api-secret-token')
  if (!esperado || recebido !== esperado) {
    return NextResponse.json({ ok: true })
  }

  const update = (await req.json().catch(() => ({}))) as any
  const msg = update?.message ?? update?.channel_post ?? update?.edited_message ?? null

  /**
   * Três formas de um grupo se dar a conhecer, por ordem de discrição.
   *
   * O caminho óbvio — escrever no grupo — nem sempre serve num grupo de terceiros:
   * mandar lá um "teste" é escrever à frente de toda a gente. Por isso:
   *
   *  · uma REAÇÃO a qualquer mensagem já existente basta (`message_reaction`), e não escreve
   *    nada no grupo;
   *  · REENCAMINHAR uma mensagem do grupo para outro sítio onde o bot esteja traz o id da
   *    origem em `forward_origin` — não deixa rasto nenhum no grupo de origem.
   *
   * Em qualquer dos casos só se REGISTA o grupo. Executar exige uma rota apontada a ele.
   */
  const reacao = update?.message_reaction ?? update?.message_reaction_count ?? null
  const origemReencaminhada =
    msg?.forward_origin?.chat ?? msg?.forward_from_chat ?? null

  const chat = msg?.chat ?? reacao?.chat
  if (!chat?.id) return NextResponse.json({ ok: true })

  // A origem de um reencaminhamento também se regista: é assim que um grupo onde o bot NÃO
  // está se dá a conhecer, sem lá se escrever nada.
  if (origemReencaminhada?.id && String(origemReencaminhada.id) !== String(chat.id)) {
    await getSupabaseAdmin()
      .from('mtmcopy_telegram_discovered')
      .upsert(
        {
          chat_id: String(origemReencaminhada.id),
          title: origemReencaminhada.title ?? null,
          username: origemReencaminhada.username ?? null,
        },
        { onConflict: 'chat_id' },
      )
      .then(() => {}, () => {})
  }

  const chatId = String(chat.id)
  const texto = msg ? String(msg.text ?? msg.caption ?? '').trim() : ''

  // 1) Descoberta: sempre, mesmo sem texto. É o que faz o grupo aparecer no admin.
  await getSupabaseAdmin()
    .from('mtmcopy_telegram_discovered')
    .upsert(
      { chat_id: chatId, title: chat.title ?? null, username: chat.username ?? null },
      { onConflict: 'chat_id' },
    )
    .then(() => {}, (e: unknown) => console.warn('[webhook-relay] descoberta falhou:', e))

  if (!texto) return NextResponse.json({ ok: true, descoberto: chatId })

  /**
   * GUARDA DO CICLO: nunca ler de volta o que fomos NÓS a escrever.
   *
   * Um chat pode ser ao mesmo tempo DESTINO de um relay nosso e FONTE lida por este bot
   * (aconteceu com o -1004343748070). Sem guarda, o nosso próprio relay voltaria a
   * entrar como sinal e o mesmo trade abria duas vezes, em duas contas, por dois caminhos.
   *
   * O guarda é ESTRUTURAL e não por texto: compara o autor com o próprio bot. Filtrar pelo
   * cabeçalho «🟡 Gold Did» funcionava até alguém mudar o cabeçalho nas definições — e nesse
   * dia o ciclo abria sem ninguém perceber porquê. Quem escreveu é um facto; o que escreveu é
   * uma convenção.
   *
   * O relay está desligado desde 20/08. Isto existe para o dia em que for religado.
   */
  if (msg?.from?.id && (await ehOProprioBot(msg.from.id))) {
    console.log(`[webhook-relay] ignorado: escrito pelo próprio bot em ${chatId}`)
    return NextResponse.json({ ok: true, ignorado: 'eco do proprio bot' })
  }

  // 2) Execução, só se houver rota apontada a este chat.
  try {
    const { executeSignalOnRouteProvider } = await import('@/lib/mtmcopy/processor')
    const r = await executeSignalOnRouteProvider({
      chatId,
      text: texto,
      telegramMessageId: msg.message_id,
    })
    console.log(`[webhook-relay] ${chatId} → ${r.ok ? 'executado' : 'sem execução'}: ${r.reason ?? r.provider ?? ''}`)
    return NextResponse.json({ ok: true, executado: r.ok, motivo: r.reason ?? null })
  } catch (e) {
    console.error('[webhook-relay] falhou:', e)
    return NextResponse.json({ ok: true, erro: e instanceof Error ? e.message : String(e) })
  }
}

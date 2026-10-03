/**
 * A PASSAGEM DO RADAR — o que corre uma vez por dia e deixa a lista pronta.
 *
 * Três trabalhos, por esta ordem, e nenhum deles fala com ninguém:
 *
 *   1. ARRUMAR — quem já está em `telegram_leads` deixa de ser prospeção e passa a seguimento.
 *      Sem isto a lista de «gente nova para abordar» enche-se de gente que já está a ser seguida,
 *      deixa de ser lida, e uma lista que não se lê é o mesmo que não existir.
 *
 *   2. MAPEAR — cruza os diálogos da conta pessoal (MTProto, só leitura) com os grupos onde o bot
 *      está, e grava o mapa em `prospecao_grupos`.
 *
 *   3. CONTAR — devolve o resumo para o painel e para o bot.
 *
 * Quando o serviço de diálogos não está configurado, o passo 2 faz-se na mesma com o que o BOT
 * sabe: metade do mapa é melhor do que nenhum, e a metade que falta fica dita em `avisoDoMapa`.
 */
import { classificarDialogos, lerDialogos, resumoDoMapa, type Dialogo, type PresencaDoBot } from './dialogos'
import { diagnosticoDeCobertura, listaPrioritaria, type ContactoPriorizado, type ContactoVisto } from './radar-contactos'

type Supa = {
  from: (t: string) => any // eslint-disable-line @typescript-eslint/no-explicit-any
}

export interface ResultadoDoRadar {
  contactos: { total: number; novos: number; arrumados: number }
  mapa: ReturnType<typeof resumoDoMapa>
  /** O que falta para o mapa estar completo. `null` quando está. */
  avisoDoMapa: string | null
  /** O radar está mesmo a ver, ou está cego? */
  cobertura: ReturnType<typeof diagnosticoDeCobertura>
}

/**
 * Quem entrou no funil sai da prospeção.
 *
 * A junção é `prospecao_contactos.tg_user_id` = `telegram_leads.chat_id`: numa conversa privada o
 * chat_id de uma pessoa É o id de utilizador dela. Não é evidente e é a razão por que isto casa.
 */
async function arrumarQuemJaEstaNoFunil(db: Supa): Promise<number> {
  const { data: leads } = await db.from('telegram_leads').select('chat_id')
  const ids = ((leads ?? []) as Array<{ chat_id: string }>)
    .map((l) => String(l.chat_id))
    .filter((id) => /^\d+$/.test(id))
  if (!ids.length) return 0

  const { data } = await db
    .from('prospecao_contactos')
    .update({ estado: 'no_funil', updated_at: new Date().toISOString() })
    .in('tg_user_id', ids)
    .neq('estado', 'no_funil')
    .select('tg_user_id')
  return ((data ?? []) as unknown[]).length
}

/** Onde o bot está, e quando lá viu tráfego pela última vez. */
async function presencaDoBot(db: Supa): Promise<PresencaDoBot[]> {
  const { data } = await db.from('mtmcopy_telegram_discovered').select('chat_id, last_message_at')
  return ((data ?? []) as Array<{ chat_id: string; last_message_at: string | null }>)
    // Conversas privadas com o bot não são grupos. O chat do dono estava a entrar no mapa.
    .filter((r) => String(r.chat_id).startsWith('-'))
    .map((r) => ({ chatId: String(r.chat_id), ultimaMensagemIso: r.last_message_at }))
}

/**
 * O mapa dos grupos, gravado.
 *
 * Quando o MTProto não responde, constrói-se o mapa só com o que o bot conhece — e esses são, por
 * definição, todos «nossos com bot». O mapa fica verdadeiro, apenas incompleto, e o aviso diz
 * exactamente o que falta: os grupos onde o dono está e o bot não, que são os que interessam.
 */
async function mapearGrupos(db: Supa): Promise<{ mapa: ReturnType<typeof resumoDoMapa>; aviso: string | null }> {
  const presenca = await presencaDoBot(db)
  const leitura = await lerDialogos()

  const dialogos: Dialogo[] = leitura.ok
    ? leitura.dialogos
    : await (async () => {
        const { data } = await db.from('mtmcopy_telegram_discovered').select('chat_id, title, chat_type')
        const linhas = ((data ?? []) as Array<{ chat_id: string; title: string | null; chat_type: string | null }>).filter(
          (r) => String(r.chat_id).startsWith('-'),
        )
        /**
         * Um grupo promovido a supergrupo deixa atrás o id antigo.
         *
         * O Telegram dá-lhe um chat_id novo e o velho fica morto, mas a tabela do bot guarda os
         * dois — e o mapa aparecia com o «Goldkiller Scanner» duas vezes, as duas paradas há 60
         * dias. Não é um grupo esquecido: é o fantasma do mesmo. Quando há um supergrupo com o
         * mesmo título, o `group` antigo não entra.
         */
        const titulosDeSupergrupo = new Set(
          linhas.filter((r) => r.chat_type === 'supergroup' && r.title).map((r) => String(r.title)),
        )
        return linhas
          .filter((r) => !(r.chat_type === 'group' && r.title && titulosDeSupergrupo.has(String(r.title))))
          .map((r) => ({
            chatId: String(r.chat_id),
            titulo: r.title ?? 'sem título',
            tipo: r.chat_type ?? 'supergroup',
            // O bot só está onde nós o pusemos: se está lá, o grupo é nosso.
            souAdmin: true,
            membros: null,
          }))
      })()

  const classificados = classificarDialogos(dialogos, presenca)

  if (classificados.length) {
    const agora = new Date().toISOString()
    const fonte = leitura.ok ? 'mtproto' : 'bot'
    await db.from('prospecao_grupos').upsert(
      classificados.map((g) => ({
        chat_id: g.chatId,
        titulo: g.titulo,
        tipo: g.tipo,
        membros: g.membros,
        nosso: g.papel === 'nosso',
        ultima_atividade: g.diasParado != null ? new Date(Date.now() - g.diasParado * 86_400_000).toISOString() : null,
        fonte,
        nota: g.leitura,
        atualizado_at: agora,
      })),
      { onConflict: 'chat_id' },
    )

    /**
     * Varrer o que esta passagem já não viu.
     *
     * Sem isto o mapa só cresce: um grupo de que se sai, ou o id morto de um grupo promovido a
     * supergrupo, ficam lá para sempre a dizer que estão parados há sessenta dias. Um mapa que
     * acumula fantasmas deixa de se acreditar, e a lista de «grupos a esfriar» — que é a parte
     * accionável — enche-se de coisas que não existem.
     *
     * Só se apaga o que veio da MESMA fonte: num dia em que o MTProto não responda e se caia para
     * o mapa do bot, os grupos de terceiros ficam onde estão em vez de desaparecerem e voltarem.
     */
    await db.from('prospecao_grupos').delete().eq('fonte', fonte).lt('atualizado_at', agora)
  }

  return {
    mapa: resumoDoMapa(classificados),
    aviso: leitura.ok
      ? null
      : `${leitura.motivo} Sem isso, o mapa só vê os ${classificados.length} grupos onde o bot já está — ficam de fora exactamente os grupos onde mandas e o sistema não vê nada.`,
  }
}

/** Uma passagem completa. Não envia nada, a ninguém. */
export async function correrRadarProspecao(supabase: unknown): Promise<ResultadoDoRadar> {
  const db = supabase as Supa

  const arrumados = await arrumarQuemJaEstaNoFunil(db)
  const { mapa, aviso } = await mapearGrupos(db)

  const { data: contactos } = await db.from('prospecao_contactos').select('estado, mensagens, entradas, grupos')
  const linhas = (contactos ?? []) as Array<{ estado: string; mensagens: number; entradas: number; grupos: string[] }>

  return {
    contactos: {
      total: linhas.length,
      novos: linhas.filter((c) => c.estado === 'novo').length,
      arrumados,
    },
    mapa,
    avisoDoMapa: aviso,
    cobertura: diagnosticoDeCobertura({
      contactos: linhas.length,
      comMensagens: linhas.filter((c) => c.mensagens > 0).length,
      comEntradas: linhas.filter((c) => c.entradas > 0).length,
      gruposVistos: mapa.nossos + mapa.terceiros,
    }),
  }
}

/** A lista priorizada, lida da base. É isto que o painel e o bot mostram. */
export async function lerListaPrioritaria(supabase: unknown, limite = 25): Promise<ContactoPriorizado[]> {
  const db = supabase as Supa
  const { data } = await db
    .from('prospecao_contactos')
    .select('*')
    .in('estado', ['novo', 'abordado'])
    .order('ultimo_visto_at', { ascending: false })
    .limit(300)

  const contactos: ContactoVisto[] = ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
    tgUserId: String(r.tg_user_id),
    username: (r.username as string) ?? null,
    firstName: (r.first_name as string) ?? null,
    grupos: (r.grupos as string[]) ?? [],
    mensagens: Number(r.mensagens ?? 0),
    entradas: Number(r.entradas ?? 0),
    saidas: Number(r.saidas ?? 0),
    primeiroVistoIso: (r.primeiro_visto_at as string) ?? null,
    ultimoVistoIso: (r.ultimo_visto_at as string) ?? null,
    estado: String(r.estado ?? 'novo'),
  }))

  return listaPrioritaria(contactos, { limite })
}

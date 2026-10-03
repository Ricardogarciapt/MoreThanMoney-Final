/**
 * O LIVRO DAS MENSAGENS DOS AGENTES — a parte que toca na base e na rede.
 *
 * A decisão de QUE código leva uma mensagem está toda em `mensagem-saida.ts` e é pura. Aqui está
 * só o que não se consegue testar sem credenciais: ler o dono do post comentado, gravar a linha,
 * e — no Telegram — enviar.
 *
 * ═══ A REGRA QUE ESTE FICHEIRO EXISTE PARA IMPOR ═══════════════════════════════════════════
 *
 * Decisão do dono, 01/10/2026: a capacidade de enviar MANTÉM-SE. O que este ficheiro acrescenta é
 * que ela deixa rasto. Três consequências práticas, e as três são a mesma:
 *
 *  · uma mensagem que sai sem ficar escrita é uma mensagem que, no dia em que correr mal, ninguém
 *    sabe o que dizia;
 *  · uma RECUSA que não fica escrita é um silêncio sem explicação no dia em que alguém pergunta
 *    porque é que a mensagem não chegou (é a lição de `lib/whatsapp-mensageiro.ts`);
 *  · uma mensagem sem código é receita que não se liga a ninguém — e a regra das 48 h
 *    (`lib/agentes/vida.ts`) pára o agente por isso, com um motivo que parece sólido.
 *
 * ═══ GRAVAR NUNCA DEITA O ENVIO ABAIXO ═════════════════════════════════════════════════════
 *
 * Herdado de `whatsapp-mensageiro.ts`, e por boa razão: isto corre dentro de webhooks. Um erro
 * aqui dava 500 a todos os updates do bot, o Telegram passava a reenviar tudo, e o funil inteiro
 * parava por causa de uma linha de registo. Por isso o erro é engolido — mas é BARULHENTO, e diz
 * o que tentou escrever. Um `console.error` que não diz o que falhou é indistinguível de silêncio.
 */
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { normalizar } from './atribuicao'
import { agenteDoPilar } from './marca-conteudo'
import { prepararMensagem, separarCarga, type CanalDeSaida, type MensagemPreparada } from './mensagem-saida'

/** O tecto do que se guarda de uma mensagem. Igual ao do livro do WhatsApp, para os dois baterem. */
const TECTO_TEXTO = 4000

export interface LinhaDoLivro {
  canal: CanalDeSaida
  /** `chat_id` no Telegram, E.164 no WhatsApp, `comment_id`/handle no Instagram. */
  destino: string
  /** Que porta do código enviou: 'telegram:followup', 'instagram:setter'… */
  funil?: string | null
  tipo?: 'texto' | 'template' | 'resposta_publica' | 'dm'
  /** O que foi dito. É a razão principal de isto existir. */
  texto?: string | null
  estado: 'enviada' | 'recusada' | 'falhou'
  /** O código curto mais a frase em português. Em português porque é o que o Ricardo lê. */
  motivo?: string | null
  /** `wa_message_id`, `message_id` do Telegram, `comment_id` do Instagram. */
  referencia?: string | null
  /** A decisão de `prepararMensagem`, quando houve uma. */
  marcacao?: Pick<MensagemPreparada, 'codigo' | 'marcados' | 'motivo'> | null
}

/**
 * Escreve uma linha no livro. Nunca lança.
 *
 * Os NOMES DAS COLUNAS SÃO OS DA TABELA, e isto não é um aviso teórico: `whatsapp-mensageiro.ts`
 * escreveu `numero`/`corpo`/`codigo` durante MESES em colunas chamadas `telefone`/`texto` e numa
 * que não existia. O insert falhava a 100%, o livro esteve vazio sem uma única queixa, e tudo
 * respondia 200. Um typecheck não apanha isto — para o TypeScript o objecto do `insert` é um
 * objecto qualquer. Só a tabela sabe, e por isso `mensagem-livro.check.ts` PERGUNTA À TABELA.
 */
export async function registarMensagemDeAgente(l: LinhaDoLivro): Promise<void> {
  try {
    const { error } = await getSupabaseAdmin().from('agentes_mensagens').insert({
      canal: l.canal,
      agente_codigo: l.marcacao?.codigo ?? null,
      agente_motivo: l.marcacao?.motivo ?? null,
      destino: l.destino,
      funil: l.funil ?? null,
      tipo: l.tipo ?? 'texto',
      texto: (l.texto ?? '').slice(0, TECTO_TEXTO) || null,
      links_marcados: l.marcacao?.marcados ?? 0,
      estado: l.estado,
      motivo: l.motivo ?? null,
      referencia: l.referencia ?? null,
    })
    if (error) {
      console.error(
        `[agentes/livro] NÃO GRAVOU (${l.canal} → ${l.destino}, ${l.estado}): ${error.message}` +
          (error.details ? ` · ${error.details}` : '') +
          ' — confere os nomes das colunas contra a tabela (npx tsx lib/agentes/mensagem-livro.check.ts).',
      )
    }
  } catch (e) {
    console.error('[agentes/livro] não gravou:', e instanceof Error ? e.message : e)
  }
}

/**
 * DE QUEM É O POST QUE A PESSOA COMENTOU.
 *
 * É daqui que o setter e o funil do Instagram tiram o dono da resposta, e é a atribuição CERTA:
 * a pessoa não veio do funil, veio daquele post. Dar o crédito ao funil era dá-lo ao carteiro.
 *
 * `social_scheduled_posts.published_media_id` é o id que a Graph API devolve quando o post é
 * publicado, e é o mesmo `media_id` que vem no comentário. Os posts anteriores à migração 168 não
 * têm `agente_codigo` — e a resposta certa aí é `null`, para o motivo ser `post_sem_dono` em vez
 * de se inventar um dono para 181 publicações que já saíram sem código nenhum.
 */
export async function agenteDoPostComentado(mediaId: unknown): Promise<string | null> {
  const id = String(mediaId ?? '').trim()
  if (!id) return null
  try {
    const { data } = await getSupabaseAdmin()
      .from('social_scheduled_posts')
      .select('agente_codigo, pillar')
      .eq('published_media_id', id)
      .limit(1)
      .maybeSingle()
    const linha = data as { agente_codigo?: string; pillar?: string } | null
    const gravado = normalizar(linha?.agente_codigo)
    if (gravado) return gravado

    /**
     * SEM CÓDIGO GRAVADO, CAI-SE NO PILAR — e isto não é inventar um dono.
     *
     * A 01/10 há 181 posts PUBLICADOS e zero com `agente_codigo`: a coluna nasceu na migração 168
     * e o cron que a escreve (`content-draft`) só corre às 04:20. Sem este degrau, toda a resposta
     * do funil do Instagram ficaria `post_sem_dono` durante os dias que os posts novos levam a ser
     * publicados e comentados — ou seja, a medição só começava depois de o caminho já estar feito.
     *
     * `AGENTE_POR_PILAR` é a MESMA lista de decisões do dono que o conteúdo usa, e `pillar` está
     * preenchido nos posts antigos. Ler dali é aplicar uma decisão que já existe, não adivinhar: um
     * pilar sem agente declarado continua a devolver `null`, e continua a não cair no CEO.
     */
    return agenteDoPilar(linha?.pillar)
  } catch {
    // Não conseguir ler trata-se como «não há dono», nunca como um dono qualquer. O caminho
    // conservador perde uma atribuição; o outro credita receita a quem não a fez.
    return null
  }
}

/**
 * O CÓDIGO QUE VEIO NO DEEP-LINK FICA NO LEAD.
 *
 * É o passo que fecha Instagram → bot → grupo. O webhook chama isto a cada `/start` que traga
 * carga, e daí para a frente o código acompanha a pessoa: a ingestão da manhã leva o lead ao
 * pipeline (`lib/backoffice-dia-ingestao.ts`) e o `?ag=` no browser leva-o à compra.
 *
 * O ÚLTIMO CLIQUE GANHA, e é a mesma escolha que `lib/agentes/atribuicao.ts` já fez para o
 * browser — de propósito, para as duas pontas não darem respostas diferentes sobre a mesma
 * pessoa. O primeiro-ganha premiava quem a apanhasse primeiro mesmo que outro agente tivesse
 * feito o trabalho que a decidiu.
 *
 * Devolve o que ficou escrito, ou `null` se não havia nada a escrever.
 */
export async function marcarAgenteNoLead(chatId: unknown, codigo: unknown): Promise<string | null> {
  const chat = String(chatId ?? '').trim()
  const c = normalizar(codigo)
  if (!chat || !c) return null
  try {
    const { error } = await getSupabaseAdmin()
      .from('telegram_leads')
      .upsert(
        { chat_id: chat, agente_codigo: c, agente_origem: 'start', updated_at: new Date().toISOString() },
        { onConflict: 'chat_id' },
      )
    if (error) {
      console.error(`[agentes/livro] código ${c} NÃO ficou no lead ${chat}: ${error.message}`)
      return null
    }
    return c
  } catch (e) {
    console.error('[agentes/livro] código não ficou no lead:', e instanceof Error ? e.message : e)
    return null
  }
}

/**
 * O `/start` do bot, lido de uma vez: o token do funil e o código, com o código já gravado.
 *
 * Existe para o webhook ter UMA linha a chamar em vez de três, porque a ordem importa e é fácil
 * de trocar: separar a carga TEM de vir antes de se comparar o token com os reservados ou de o
 * procurar em `mentor_profiles`. Sem isso, `lead_ag_AG_SCANNER` não é `lead` — não está nos
 * reservados, vai fazer uma consulta à toa à tabela dos mentores, e o deep-link do funil deixa de
 * ser um deep-link do funil.
 */
export async function lerStartDeAgente(payload: unknown, chatId: unknown): Promise<{ token: string; codigo: string | null }> {
  const { token, codigo } = separarCarga(payload)
  if (codigo) await marcarAgenteNoLead(chatId, codigo)
  return { token, codigo }
}

// ── Enviar pelo Telegram, com rasto ──────────────────────────────────────────────────────────────

export interface EnvioTelegram {
  chatId: string
  texto: string
  /** A chave do funil em `AGENTE_POR_FUNIL`. */
  funil: string
  /** O código decidido por quem chama (herdado de um post, escolhido por uma pessoa). Ganha ao funil. */
  codigoExplicito?: unknown
  /** Quem chama tentou herdar de um post e o post não tem dono — para o motivo ser o certo. */
  herancaFalhou?: boolean
  parseMode?: 'HTML' | 'Markdown'
}

export interface ResultadoTelegram {
  enviado: boolean
  /** O texto que REALMENTE saiu, já marcado. Quem chama precisa dele para o histórico do lead. */
  texto: string
  marcacao: MensagemPreparada
  erro?: string
}

/**
 * O caminho com rasto para uma mensagem de agente no Telegram.
 *
 * NÃO substitui `sendTelegramChannelMessage` nem o embrulha às escondidas: há 60 sítios a chamá-lo
 * e a maioria são sinais para canais, que não são mensagens de agente e não têm nada a ver com
 * atribuição. Embrulhar tudo enchia o livro com publicações de sinais e tornava o número inútil —
 * que é a forma mais rápida de uma lista deixar de se ler.
 *
 * Esta porta é para o que o dono mandou crescer: as mensagens que falam com PESSOAS e as levam ao
 * grupo ou ao produto. Cada caminho desses passa a chamá-la em vez do envio cru, e o livro passa a
 * ter só o que importa.
 */
export async function enviarTelegramPorAgente(p: EnvioTelegram): Promise<ResultadoTelegram> {
  const marcacao = prepararMensagem({
    canal: 'telegram',
    texto: p.texto,
    funil: p.funil,
    codigoExplicito: p.codigoExplicito,
    herancaFalhou: p.herancaFalhou,
  })

  const { sendTelegramChannelMessage } = await import('@/lib/mtmcopy/telegram-bot')
  const r = await sendTelegramChannelMessage(p.chatId, marcacao.texto, { parseMode: p.parseMode })

  await registarMensagemDeAgente({
    canal: 'telegram',
    destino: p.chatId,
    funil: p.funil,
    tipo: 'texto',
    texto: marcacao.texto,
    // 'falhou' e não 'recusada': aqui a decisão foi tomada e o que correu mal foi o Telegram ou a
    // rede. Confundir as duas fazia procurar uma avaria onde está uma regra a funcionar.
    estado: r.ok ? 'enviada' : 'falhou',
    motivo: r.ok ? null : (r.error ?? 'o Telegram recusou, sem descrição'),
    referencia: r.messageId != null ? String(r.messageId) : null,
    marcacao,
  })

  return { enviado: r.ok, texto: marcacao.texto, marcacao, ...(r.ok ? {} : { erro: r.error }) }
}

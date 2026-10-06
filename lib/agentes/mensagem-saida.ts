/**
 * UMA MENSAGEM QUE SAI DE UM AGENTE — a decisão, antes de haver rede.
 *
 * ═══ A DECISÃO DO DONO QUE ISTO SERVE ══════════════════════════════════════════════════════
 *
 * 01/10/2026, palavras dele: «eles devem-se focar em usar as minhas redes sociais, etc, para
 * efectivamente mandar mensagens, crescer os grupos de Telegram, com o MTM System etc. NÃO
 * RETIRES A CAPACIDADE DE MANDAR MENSAGEM.»
 *
 * Este ficheiro não trava nada. O que faz é a diferença entre «os agentes mandam mensagens» ser
 * uma frase e ser um facto verificável: cada mensagem que sai leva o código de quem a mandou, e
 * cada mensagem que sai fica escrita com o resultado. As duas coisas são a mesma coisa vista de
 * dois lados — sem código, a receita não se liga a ninguém; sem registo, no dia em que uma
 * mensagem correr mal não há o que foi dito.
 *
 * ═══ O BURACO, MEDIDO A 01/10 ══════════════════════════════════════════════════════════════
 *
 * `lib/agentes/marca-conteudo.ts` fechou isto para o CONTEÚDO (as legendas). As MENSAGENS
 * continuavam de fora, e são o canal que o dono acabou de mandar usar:
 *
 *  · Telegram — `sendTelegramChannelMessage` (`lib/mtmcopy/telegram-bot.ts:165`) é a porta por
 *    onde sai tudo: funil, follow-up, broker-gate, acolhimento de grupo. NÃO ESCREVE NADA em
 *    tabela nenhuma. `telegram_messages` parece o livro e não é — é o espelho das mensagens que
 *    ENTRAM nos canais (`message_id`/`channel_id`/`timestamp`, tudo NOT NULL), e é lida pelas
 *    funcionalidades de sinais. Escrever saídas lá dentro era a mesma proximidade de nomes que
 *    `lib/whatsapp-colunas.check.ts` existe para apanhar.
 *  · WhatsApp — `whatsapp_mensagens` é um livro a sério (direcção, estado, motivo), e não tem
 *    coluna nenhuma que diga QUEM mandou.
 *  · Instagram — `ig_setter_rascunhos` e `ig_dm_log` guardam o texto e o erro, e também não dizem
 *    de quem foi.
 *
 * Resultado: três canais a enviar, e zero mensagens atribuíveis a um agente.
 *
 * ═══ PORQUE É QUE ISTO É PURO ══════════════════════════════════════════════════════════════
 *
 * Porque errar aqui não dá erro — dá um link que abre e não mede, ou um link que não abre. Os dois
 * casos foram encontrados a ler o código que já existe, e os dois estão na guarda:
 *
 *  1. **A pontuação da frase colada ao código** (herdado de `marca-conteudo.ts`).
 *  2. **O hífen do código a matar um deep-link do Telegram.** O `/start` do bot é lido por
 *     `app/api/telegram/webhook/route.ts` com `/^\/start\s+([a-zA-Z0-9_]+)$/` — SEM hífen. Um
 *     `?start=lead_ag_AG-SAAS` não casa com nada: a pessoa carrega no link que veio do Instagram,
 *     o bot responde «não conheço esse comando», e o lead morre à porta. Por isso o código viaja
 *     com o hífen trocado por `_` (ver `juntarCarga`), e a guarda prova o caso mau.
 */
import { marcarConteudo, type Marcacao, type MotivoSemCodigo } from './marca-conteudo'
import { normalizar, pareceCodigoDeAgente } from './atribuicao'
import { AG } from './codigos'

/** Por onde é que a mensagem sai. É o que decide o livro e o que se pode marcar. */
export type CanalDeSaida = 'telegram' | 'whatsapp' | 'instagram'

/**
 * QUEM É O DONO DE CADA FUNIL DE MENSAGENS.
 *
 * Igual em espírito ao `AGENTE_POR_PILAR` do conteúdo, e deliberadamente curto: só está aqui o
 * que tem dono DECLARÁVEL, com a razão escrita. Inventar um dono é inventar um número — e a
 * regra de vida das 48 h (`lib/agentes/vida.ts`) salvaria esse agente com dinheiro que não é dele.
 *
 * A maioria dos funis NÃO está aqui de propósito, e não é esquecimento: o setter do Instagram e o
 * closer em DM respondem ao que a pessoa comentou, e o dono certo é o do POST que ela comentou —
 * `social_scheduled_posts.agente_codigo`, que a migração 168 passou a escrever. Esse herda-se por
 * `codigoExplicito` em vez de se adivinhar aqui, porque adivinhar dava o crédito ao funil em vez
 * de o dar a quem escreveu o post que trouxe a pessoa.
 */
export const AGENTE_POR_FUNIL: Readonly<Record<string, string>> = Object.freeze({
  /**
   * O follow-up de reactivação no Telegram (`lib/telegram-lead-followup.ts`). Desde 06/10 (F4)
   * empurra o próximo passo PAGO da escada (Membro → corretora), não o teste da app — por isso
   * é do AG-FORMACAO e já não do AG-SAAS. Ver `lib/vendas/escada-followup.ts` (AGENTE_DO_PASSO).
   */
  'telegram:followup': AG.FORMACAO,

  /**
   * ═══ DESDE 06/10: NENHUM LINK DA MÁQUINA SAI SEM CÓDIGO ═══════════════════════════════════
   *
   * A regra anterior («sem dono declarado, sai sem código») deu zero usos de `?ag=` e os sete
   * agentes «em_risco» por falta de MEDIÇÃO. O dono decidiu: todo o link sai assinado. A herança
   * continua a ganhar — o `codigoExplicito` (dono do post comentado, código do lead) passa à
   * frente disto — e estas linhas são só o que vale quando a herança falha.
   *
   * A procura é por PREFIXO (ver `agenteDoFunil`): `instagram:funil:copytrading` cai em
   * `instagram:funil`, que é como os funis por palavra-chave se chamam.
   */
  // O bot do Telegram (respostas do closer a quem escreveu) — vendas de formação.
  'telegram:closer': AG.FORMACAO,
  'telegram:funil': AG.FORMACAO,
  // Instagram: o setter e o funil por palavra-chave respondem a um post; sem dono no post, o canal.
  'instagram:setter': AG.SOCIAL,
  'instagram:funil': AG.SOCIAL,
  // A DM a sério, com uma pessoa a responder, é do closer.
  'instagram:dm-closer': AG.CLOSER,
  'whatsapp:funil': AG.CLOSER,
  // Recuperação de checkout por email.
  'email:recuperacao-checkout': AG.EMAIL,
})

/**
 * O dono de um funil, procurado do mais específico para o mais largo: `a:b:c` → `a:b:c`, `a:b`.
 * Nunca chega a `a` sozinho — um canal inteiro não é um funil, e dar-lhe dono por omissão
 * escondia funis novos que ainda ninguém decidiu de quem são.
 */
export function agenteDoFunil(funil: unknown): string | null {
  const partes = String(funil ?? '').trim().split(':').filter(Boolean)
  for (let n = partes.length; n >= 2; n--) {
    const c = AGENTE_POR_FUNIL[partes.slice(0, n).join(':')]
    if (c) return normalizar(c)
  }
  return null
}

/** Porque é que uma mensagem saiu sem código. Os três primeiros vêm de `marca-conteudo.ts`. */
export type MotivoSemCodigoMensagem =
  | MotivoSemCodigo
  /** O funil não tem dono declarado em `AGENTE_POR_FUNIL` e não veio código de fora. */
  | 'funil_sem_agente'
  /** Herdava do post comentado, e esse post não tem dono (é anterior à migração 168, ou o pilar não tem agente). */
  | 'post_sem_dono'

export interface MensagemPreparada {
  canal: CanalDeSaida
  /** O código que ficou nos links, ou `null` com o motivo escrito. */
  codigo: string | null
  /** O texto a enviar. Igual ao que entrou quando não houve nada a marcar. */
  texto: string
  /** Quantos sítios do texto levaram o código: links nossos + deep-links do bot. */
  marcados: number
  /** Escrito sempre que `codigo` é `null` OU `marcados` é 0. */
  motivo?: MotivoSemCodigoMensagem
}

// ── O deep-link do bot do Telegram ───────────────────────────────────────────────────────────────

/**
 * O prefixo que separa o token do funil do código do agente, dentro do `start`.
 *
 * O Telegram dá UM só parâmetro `start`, e o funil já o usa para dizer de onde vem a pessoa
 * (`lead`, `broker`, `mtmauto`…). O código do agente tem de caber no mesmo valor sem apagar o
 * token — se apagasse, quem vem do Instagram para a corretora caía nas boas-vindas genéricas em
 * vez dos passos da validação, e tinha de procurar outra vez o que já tinha pedido.
 */
const SEPARADOR_CARGA = '_ag_'

/** Tecto do `start` do Telegram. Acima disto a Meta… não: é o Telegram que corta, em silêncio. */
export const LIMITE_CARGA = 64

/**
 * Junta o token do funil e o código do agente num `start` que o Telegram aceita E que o nosso
 * webhook sabe ler.
 *
 * ═══ O HÍFEN, QUE É O CASO MAU ═════════════════════════════════════════════════════════════
 *
 * `app/api/telegram/webhook/route.ts` lê o token com `/^\/start\s+([a-zA-Z0-9_]+)$/`. O hífen não
 * está lá. Um código `AG-SAAS` escrito tal e qual faz o `match` falhar, e falhar o `match` não
 * cai nas boas-vindas: cai no fim da cadeia de `else`, que responde «não conheço esse comando».
 * Ou seja, o link que o agente emitiu no Instagram leva a pessoa ao bot para ela ser mandada
 * embora. É a pior falha possível neste caminho — e não dá erro em sítio nenhum.
 *
 * Por isso o hífen viaja como `_`. A volta é unívoca porque a forma do código
 * (`pareceCodigoDeAgente`) não permite `_` lá dentro: o primeiro `_` do código é sempre o hífen.
 *
 * Devolve só o token quando o código não presta ou quando a carga não caberia: um link sem
 * medição continua a funcionar, um link cortado não.
 */
export function juntarCarga(token: string, codigo: unknown): string {
  const t = String(token ?? '').trim()
  const c = normalizar(codigo)
  if (!t) return ''
  if (!c) return t
  const carga = `${t}${SEPARADOR_CARGA}${c.replace('-', '_')}`
  // Perder a medição é mau; perder o token do funil é pior. Entre os dois, fica o token.
  return carga.length <= LIMITE_CARGA ? carga : t
}

/**
 * Separa o que veio no `start`: o token do funil e, se lá estiver, o código do agente.
 *
 * O webhook TEM de chamar isto antes de comparar o token com o `RESERVED_START` ou de o procurar
 * em `mentor_profiles`. Sem isto, `lead_ag_AG_SAAS` não é `lead`: não está nos reservados, vai
 * fazer uma consulta à toa à tabela dos mentores, e o deep-link do funil deixa de ser um
 * deep-link do funil. O token sai sempre intacto, mesmo quando o código é lixo — um código mal
 * formado não pode custar a entrada a quem clicou.
 */
export function separarCarga(payload: unknown): { token: string; codigo: string | null } {
  const p = String(payload ?? '').trim()
  const i = p.lastIndexOf(SEPARADOR_CARGA)
  if (i < 0) return { token: p, codigo: null }
  const token = p.slice(0, i)
  // De volta ao hífen: o primeiro `_` do código é o que `juntarCarga` trocou.
  const bruto = p.slice(i + SEPARADOR_CARGA.length).replace('_', '-')
  const codigo = normalizar(bruto)
  // Carga irreconhecível: devolve-se o payload INTEIRO como token, não o pedaço antes do
  // separador. Um `start` que por acaso contenha `_ag_` e não seja nosso continua a ser ele mesmo
  // — cortá-lo transformava um token de mentor válido num token que não existe.
  return codigo ? { token, codigo } : { token: p, codigo: null }
}

/**
 * Reconhece os links do bot nas mensagens e legendas.
 *
 * O nome do bot vem de fora (`MTMCOPY_BOT_USERNAME`) e já mudou uma vez, por isso o padrão aceita
 * qualquer nome de bot: o que o identifica é `t.me/<algo>` com um `?start=`, ou sem nada. O que
 * NÃO se toca são os links de convite (`t.me/+AbC…` e `t.me/joinchat/…`) — esses levam a pessoa
 * direita a um grupo e não passam pelo bot, logo não há `start` onde pôr código.
 */
const PADRAO_BOT = /(?<![\w.@/-])(https?:\/\/)?t\.me\/(?!\+|joinchat\/)([A-Za-z0-9_]{3,64})(?:\?start=([A-Za-z0-9_-]{1,64}))?/gi

/**
 * Põe o código do agente nos deep-links do bot de um texto.
 *
 * É o que fecha o caminho Instagram → Telegram → grupo: a resposta pública do funil do Instagram
 * leva `t.me/<bot>?start=lead`, e a pessoa que carrega nele chega ao bot sem nada que diga de
 * onde veio. Com o código na carga, o `/start` escreve-o no lead (`telegram_leads.agente_codigo`)
 * e o crédito acompanha a pessoa até ao grupo e até à compra.
 *
 * Um link do bot SEM `?start=` recebe `?start=ag_<CODE>`: um `start` só com o código é um token
 * que não está nos reservados, e `separarCarga` devolve token vazio — o webhook cai nas
 * boas-vindas, que é exactamente o que já fazia antes de haver código. Idempotente: um link que
 * já traga carga de agente não se marca outra vez nem se sobrepõe.
 */
export function marcarLinksDoBot(texto: unknown, codigo: unknown): { texto: string; marcados: number } {
  const t = typeof texto === 'string' ? texto : String(texto ?? '')
  const c = normalizar(codigo)
  if (!c || !t) return { texto: t, marcados: 0 }

  let marcados = 0
  const saida = t.replace(PADRAO_BOT, (achado, esquema: string | undefined, bot: string, start: string | undefined) => {
    // Já tem carga de agente (nossa ou escrita à mão): não se duplica nem se rouba o crédito a um
    // código que alguém escolheu escrever.
    if (start && start.includes(SEPARADOR_CARGA)) return achado
    const carga = juntarCarga(start ?? 'ag', c)
    // `juntarCarga` devolve só o token quando não couber. Nesse caso não há nada a mudar, e dizer
    // que se marcou era contar uma medição que não existe.
    if (carga === (start ?? 'ag')) return achado
    marcados += 1
    // O esquema reescreve-se tal como veio (`https://`, `http://` ou nada): forçar `https://` num
    // link que a pessoa escreveu sem ele muda o texto que ela vai ler.
    return `${esquema ?? ''}t.me/${bot}?start=${carga}`
  })
  return { texto: saida, marcados }
}

// ── A decisão completa ───────────────────────────────────────────────────────────────────────────

export interface PedidoDeMarcacao {
  canal: CanalDeSaida
  texto: unknown
  /**
   * A chave do funil em `AGENTE_POR_FUNIL`. Usa-se só quando não há `codigoExplicito` — e a
   * maioria dos funis não está lá, de propósito.
   */
  funil?: string
  /**
   * O código decidido por quem chama: herdado do post comentado, ou escolhido por uma pessoa.
   * GANHA sempre ao funil.
   */
  codigoExplicito?: unknown
  /**
   * Quem chama tentou herdar do post e o post não tem dono. Serve para o motivo ser
   * `post_sem_dono` em vez de `funil_sem_agente` — a diferença entre «este post é antigo» e
   * «este funil não tem dono» é a diferença entre esperar e decidir.
   */
  herancaFalhou?: boolean
}

/**
 * O que uma mensagem leva, e — quando não leva nada — porquê.
 *
 * Marca os dois tipos de ligação, e marca-os pela mesma razão: `marcarConteudo` trata os links do
 * nosso domínio (`morethanmoney.pt/...`), `marcarLinksDoBot` trata o deep-link do Telegram. Um
 * texto pode ter os dois, e tem-nos de facto — o funil do Instagram manda `/register` a uns e o
 * bot a outros.
 *
 * `marcados: 0` COM código é uma mensagem que não mede nada, e tem de se ver: é o caso de uma
 * resposta que só diz «escreve-me por privado». «AG-SAAS, 0 €» parece um agente mau; «AG-SAAS,
 * sem link nosso onde medir» é a verdade.
 */
export function prepararMensagem(p: PedidoDeMarcacao): MensagemPreparada {
  const bruto = typeof p.texto === 'string' ? p.texto : String(p.texto ?? '')

  const explicito = p.codigoExplicito != null && String(p.codigoExplicito).trim() !== ''
  const doFunil = explicito ? null : agenteDoFunil(p.funil)

  // Sem dono nenhum: não se inventa, e o motivo distingue as duas razões de não haver.
  if (!explicito && !doFunil) {
    return {
      canal: p.canal,
      codigo: null,
      texto: bruto,
      marcados: 0,
      motivo: p.herancaFalhou ? 'post_sem_dono' : 'funil_sem_agente',
    }
  }

  // Um código explícito MAL FORMADO não cai em silêncio para o funil: quem o passou acredita que
  // está a atribuir àquele agente, e o crédito ia para outro sem ninguém dar por nada. É a mesma
  // decisão de `marcarConteudo`, e delega-se nele para haver uma regra só.
  const comLinksNossos: Marcacao = marcarConteudo({
    legenda: bruto,
    codigoExplicito: explicito ? p.codigoExplicito : doFunil,
  })
  if (!comLinksNossos.codigo) {
    return { canal: p.canal, codigo: null, texto: bruto, marcados: 0, motivo: comLinksNossos.motivo }
  }

  const comBot = marcarLinksDoBot(comLinksNossos.legenda, comLinksNossos.codigo)
  const marcados = comLinksNossos.marcados + comBot.marcados

  return {
    canal: p.canal,
    codigo: comLinksNossos.codigo,
    texto: comBot.texto,
    marcados,
    ...(marcados === 0 ? { motivo: 'sem_link_nosso' as const } : {}),
  }
}

/**
 * O código de um agente é utilizável como carga de deep-link?
 *
 * Existe para quem monta links à mão (o painel, o estúdio) poder perguntar antes de os publicar,
 * em vez de descobrir com um lead a bater à porta fechada.
 */
export function cargaUtilizavel(token: string, codigo: unknown): boolean {
  if (!pareceCodigoDeAgente(normalizar(codigo))) return false
  return juntarCarga(token, codigo) !== String(token ?? '').trim()
}

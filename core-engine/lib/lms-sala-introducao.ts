/**
 * A SALA «INTRODUÇÃO» — a única sala do LMS que nunca vai ao ar.
 *
 * Existe por dois motivos que não cabiam numa sala normal:
 *  • mostra a playlist «Como usar a MoreThanMoney», que é o curso de arranque de quem entrou hoje;
 *  • recebe um ingest de OBS do Ricardo, cuja gravação segue o caminho normal do DVR mas sobe ao
 *    YouTube para uma playlist própria, «MTM Introdução».
 *
 * E há uma regra que vale mais do que as duas: ela NUNCA aparece «em direto». Nem no lobby, nem na
 * app, nem numa notificação. Quem transmite para ela está a gravar, não a dar uma sessão — e uma
 * sala de gravação a piscar «AO VIVO» na app de toda a gente seria um alarme falso por cada vez
 * que o Ricardo quisesse regravar um vídeo.
 *
 * A trava está na coluna `nunca_ao_vivo` e é aplicada nas três rotas que ligam uma sala (admin,
 * presença do educador, WHIP) — ou seja, a base de dados nunca chega a guardar `is_live = true`.
 * É de propósito: a app iOS nativa lê a tabela diretamente e não passa por nenhuma rota nossa.
 * Desde a migração 101 há ainda uma CHECK na tabela que recusa `nunca_ao_vivo and is_live`, o que
 * fecha o último caminho que restava — uma escrita à mão na consola do Supabase.
 *
 * E há uma terceira peça, a que faz a sala funcionar: quem a OPERA não é quem nela APARECE. A sala
 * continua sem educador (é isso que a mantém fora dos cartões e do lobby), e a permissão de a
 * ligar vive na coluna `operador_educator_id` — ver `podeOperarSala` no fim deste ficheiro.
 */

import { getSupabaseAdmin } from '@/lib/admin-api-helpers'

/** Nome de sistema da sala (coluna `chave_sistema`). Não mudar — está na migração 100. */
export const CHAVE_SALA_INTRODUCAO = 'introducao'

/**
 * CAPA DA SALA — TROCAR AQUI.
 *
 * Um sítio só: a migração 100 semeia a sala com este mesmo endereço e o site cai nele quando a
 * sala não tem imagem própria. Para pôr outra capa há dois caminhos, ambos únicos:
 *  (a) substituir o ficheiro no Supabase Storage (bucket `lms-assets`, `salas/introducao-capa.png`)
 *      — não é preciso deploy nem mexer no código;
 *  (b) carregar outra imagem no campo da sala em /admin?tab=education, que ganha a esta constante.
 * Mudar esta linha só é preciso se a capa passar a viver noutro sítio.
 */
export const CAPA_SALA_INTRODUCAO =
  'https://iwscxotvmtkphajmasof.supabase.co/storage/v1/object/public/lms-assets/salas/introducao-capa.png'

/** Playlist do YouTube que recebe as GRAVAÇÕES desta sala (≠ playlist do curso). */
export const PLAYLIST_YOUTUBE_INTRODUCAO = 'MTM Introdução'

export type SalaIntroducao = {
  id: string
  titulo: string
  descricao: string | null
  capa: string
  /** URL da playlist do curso («Como usar a MoreThanMoney»), se o admin já a colou. */
  playlistUrl: string | null
  playlistTitulo: string
}

type Cache = { em: number; valor: SalaIntroducao | null }
let cache: Cache | null = null
/** A sala muda de meses a meses; o Supabase está frágil. Cinco minutos chegam e sobram. */
const TTL_MS = 5 * 60 * 1000

/** Leitura indexada (chave_sistema é único) e em cache — nunca por render. */
export async function lerSalaIntroducao(forcar = false): Promise<SalaIntroducao | null> {
  if (!forcar && cache && Date.now() - cache.em < TTL_MS) return cache.valor

  try {
    const supabase = getSupabaseAdmin()
    const { data } = await supabase
      .from('lms_streams')
      .select('id, title, description, thumbnail_url, square_image_url, playlist_url, playlist_title')
      .eq('chave_sistema', CHAVE_SALA_INTRODUCAO)
      .maybeSingle()

    const valor: SalaIntroducao | null = data
      ? {
          id: String(data.id),
          titulo: (data.title as string) || 'Introdução',
          descricao: (data.description as string) ?? null,
          capa:
            ((data.square_image_url as string) || '').trim() ||
            ((data.thumbnail_url as string) || '').trim() ||
            CAPA_SALA_INTRODUCAO,
          playlistUrl: ((data.playlist_url as string) || '').trim() || null,
          playlistTitulo: ((data.playlist_title as string) || '').trim() || 'Como usar a MoreThanMoney',
        }
      : null

    cache = { em: Date.now(), valor }
    return valor
  } catch {
    // Uma falha de leitura não pode partir a página: devolve o que houver em cache, ou nada.
    return cache?.valor ?? null
  }
}

export function limparCacheSalaIntroducao(): void {
  cache = null
}

/**
 * Esta sala pode ficar «ao vivo»?
 *
 * Chamada só quando alguém tenta LIGAR uma sala (raro), e por chave primária — o Supabase não
 * sente isto. A pergunta é feita na escrita, e não na leitura, de propósito: o que interessa é que
 * a base de dados nunca guarde `is_live = true` para estas salas, porque há clientes (a app iOS
 * nativa) que a leem diretamente e nunca veriam um filtro nosso.
 */
export async function salaNuncaVaiAoVivo(streamId: string): Promise<boolean> {
  if (!streamId) return false
  try {
    const supabase = getSupabaseAdmin()
    const { data } = await supabase
      .from('lms_streams')
      .select('nunca_ao_vivo')
      .eq('id', streamId)
      .maybeSingle()
    return Boolean(data?.nunca_ao_vivo)
  } catch {
    // Coluna ainda não aplicada (migração 100 por correr) → comportamento antigo, sem travar salas.
    return false
  }
}

/** Mensagem única, para não haver duas versões da mesma recusa. */
export const RECUSA_SALA_NUNCA_AO_VIVO =
  'Esta sala é de gravação (Introdução): nunca pode ficar em direto. A transmissão é gravada e segue para o DVR/YouTube na mesma.'

/**
 * QUEM OPERA ≠ QUEM APARECE.
 *
 * A sala «Introdução» não tem educador de propósito: o dono não quer aparecer como formador dela
 * nos cartões, no lobby nem na app. Mas alguém tem de a poder ligar. É para isso que existe
 * `operador_educator_id` (migração 101) — permissão de operação, sem crédito de formador.
 *
 * Esta pergunta é feita ANTES de qualquer escrita, e a escrita seguinte fica filtrada só pelo
 * `id` da sala. A alternativa era um `.or(...)` no próprio update, mas aí a identidade de quem
 * age passa a viver dentro de uma string de filtro: uma vírgula a mais nessa string e o update
 * deixa de estar preso a esta pessoa. Preferimos uma leitura a mais (por chave primária, que o
 * Supabase nem sente) e a regra escrita aqui, em TypeScript, à vista de quem a rever.
 */
export function podeOperarSala(
  sala: { educator_id?: string | null; operador_educator_id?: string | null } | null | undefined,
  educatorId: string | null | undefined,
): boolean {
  // Sem identidade não há autorização — e nunca por comparação de nulos: uma sala sem educador
  // não pode ser operada por «ninguém».
  if (!sala || !educatorId) return false
  return sala.educator_id === educatorId || sala.operador_educator_id === educatorId
}

/** O que a base devolve quando se pergunta «que salas é que esta pessoa opera?». */
export type SalaOperavel = { id: string; educator_id?: string | null; operador_educator_id?: string | null }

/**
 * As salas que esta pessoa opera, de uma lista já lida.
 *
 * Separada da leitura de propósito: quem decide é `podeOperarSala`, em TypeScript, e não o filtro
 * que foi para a base. O filtro serve só para não trazer a tabela inteira; se um dia ficar largo
 * de mais (uma vírgula a mais no `.or(...)`, o erro clássico), esta passagem corta o que ele
 * trouxe a mais. A regra está escrita uma vez só e é aplicada duas.
 */
export function salasOperadasPor(salas: SalaOperavel[] | null | undefined, educatorId: string | null | undefined): string[] {
  if (!educatorId) return []
  return (salas ?? []).filter((s) => podeOperarSala(s, educatorId)).map((s) => s.id)
}

/**
 * Os ids das salas que esta pessoa opera — educadas por ela OU operadas por ela.
 *
 * Existe para as GRAVAÇÕES. O DVR guarda uma linha por SALA (`lms_dvr_jobs.stream_id` é único) e
 * copia para lá o `educator_id` da sala. Numa sala de gravação como a «Introdução» esse campo é
 * null de propósito — ela não tem formador — e por isso o painel do studio, que filtrava por
 * `educator_id`, nunca lhe mostrava a gravação: ele gravava, o vídeo subia ao YouTube, e o painel
 * continuava vazio.
 *
 * A gravação pertence à SALA, não a um educador. Passar a perguntar «que salas é que esta pessoa
 * pode operar?» resolve o caso sem mexer no significado de `educator_id`, que continua a querer
 * dizer QUEM APARECE — e é isso que mantém a sala fora dos cartões, do lobby e da app.
 *
 * Duas leituras em vez de uma junção: a primeira é por índice (`lms_streams_operador_idx` e o
 * educador), a segunda é um `in` sobre uma lista de meia dúzia de ids. O Supabase não sente.
 */
export async function idsDasSalasQueOpera(educatorId: string | null | undefined): Promise<string[]> {
  if (!educatorId) return []
  try {
    const supabase = getSupabaseAdmin()
    const { data } = await supabase
      .from('lms_streams')
      .select('id, educator_id, operador_educator_id')
      .or(`educator_id.eq.${educatorId},operador_educator_id.eq.${educatorId}`)
    return salasOperadasPor(data as SalaOperavel[] | null, educatorId)
  } catch {
    // Coluna ainda não aplicada, ou Supabase em baixo: sem salas em vez de rebentar o painel.
    return []
  }
}

/**
 * O que a presença pode mexer no estado de uma sala.
 *
 * Está aqui, numa função pura, porque é o sítio onde a invariante se prova: numa sala de gravação
 * os campos devolvidos NUNCA contêm `is_live: true` — contêm `is_live: false`, que também repara
 * uma linha estragada à mão. E `notificar` é falso, porque não há sessão nenhuma para anunciar.
 */
export function decidirEstadoDaSala(entrada: {
  nuncaAoVivo: boolean
  querIniciar: boolean
  querParar: boolean
  agora?: string
}): { campos: Record<string, unknown>; notificar: boolean } {
  const agora = entrada.agora || new Date().toISOString()
  const campos: Record<string, unknown> = {}

  if (entrada.nuncaAoVivo) {
    // Gravar não é transmitir: o que se liga e desliga é a marca de gravação.
    if (entrada.querIniciar) {
      campos.is_live = false
      campos.gravacao_iniciada_em = agora
    }
    if (entrada.querParar) {
      campos.is_live = false
      campos.gravacao_iniciada_em = null
    }
    return { campos, notificar: false }
  }

  if (entrada.querIniciar) {
    campos.is_live = true
    campos.live_started_at = agora
    campos.live_ended_at = null
  }
  if (entrada.querParar) {
    campos.is_live = false
    campos.live_ended_at = agora
  }

  return { campos, notificar: Boolean(entrada.querIniciar) }
}

/**
 * Título de UMA gravação da sala de gravação («Introdução»), escrito no studio antes de carregar
 * em «Iniciar transmissão». Serve para organizar: cada vídeo sobe com o seu nome, sempre para a
 * mesma playlist.
 *
 * O YouTube recusa títulos com mais de 100 caracteres ou com `<`/`>` — e recusa o upload inteiro,
 * não só o título. Por isso limpa-se aqui, antes de chegar à base. Vazio = null (o vídeo fica com
 * o nome da sala, como até agora).
 */
export function normalizarTituloGravacao(valor: unknown): string | null {
  if (typeof valor !== 'string') return null
  const limpo = valor.replace(/[<>]/g, '').replace(/\s+/g, ' ').trim()
  if (!limpo) return null
  return limpo.length > 100 ? limpo.slice(0, 100).trimEnd() : limpo
}

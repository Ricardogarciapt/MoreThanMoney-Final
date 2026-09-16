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

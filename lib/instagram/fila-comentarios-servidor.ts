import type { SupabaseClient } from '@supabase/supabase-js'
import { chamarIA } from '@/lib/ia/chamar'
import { filtroFrescoPostgrest } from './radar-frescura'
import {
  AGENTE_DA_FILA,
  PONTUACAO_MINIMA,
  SISTEMA_COMENTARIO,
  TECTO_DIARIO,
  arrumarComentario,
  avaliarComentario,
  diaDeLisboa,
  pedidoDoPost,
  quantosPodeEscrever,
  registoDePublicado,
  taxaDeResposta,
  type EstadoFila,
} from './fila-comentarios'

/**
 * A parte da fila que fala com a IA e com a base.
 *
 * Nada aqui fala com o Instagram. Lê-se o que o radar já guardou (`ig_radar_prospetos`), escreve-se
 * o comentário, guarda-se na fila. Publicar é sempre o dono, à mão — a guarda
 * `fila-comentarios.check.ts` lê este ficheiro e falha se aparecer um caminho que publique.
 */

/**
 * Escreve o comentário para um post do radar. É a função do botão «Escrever comentário» e a do
 * Prospector: o mesmo texto de sistema, as mesmas regras, a mesma recusa.
 *
 * Duas tentativas. Se a primeira trouxer link, pitch ou cliché, a segunda leva o motivo da recusa
 * no pedido. Se a segunda também falhar, não se guarda nada: um comentário mau na fila é pior do
 * que um a menos, porque o dono cola-o sem ler.
 */
export async function escreverComentarioRadar(p: { hashtag?: string | null; legenda?: string | null }): Promise<string> {
  let evitar: string[] | undefined
  for (let tentativa = 0; tentativa < 2; tentativa++) {
    const r = await chamarIA({
      tarefa: 'social-radar',
      // 200 cortava o comentário a meio (06/10: «…o valor que essa sala realmente»): os modelos
      // com raciocínio gastam tokens a pensar antes de escrever. Folga larga; o tamanho mede-se no texto.
      maxTokens: 1024,
      preferencia: 'qualidade',
      sistema: SISTEMA_COMENTARIO,
      mensagens: [{ role: 'user', content: pedidoDoPost(p, evitar) }],
    })
    const texto = arrumarComentario(r.texto ?? '')
    const a = avaliarComentario(texto)
    if (a.ok) return texto
    evitar = a.problemas
  }
  throw new Error(`O comentário saiu fora das regras: ${(evitar ?? []).join('; ')}`)
}

/** Quantos já se prepararam hoje (dia de Lisboa) — é o que conta para o tecto. */
async function preparadosHoje(db: SupabaseClient): Promise<number> {
  const { count } = await db
    .from('ig_fila_comentarios')
    .select('id', { count: 'exact', head: true })
    .eq('dia', diaDeLisboa())
  return count ?? 0
}

/**
 * Uma passagem do Prospector: pega nos melhores cartões ainda por tratar e deixa-lhes o
 * comentário pronto, sem passar o tecto do dia.
 */
export async function prepararFila(
  db: SupabaseClient,
  porPassagem?: number,
): Promise<{ preparados: number; recusados: number; jaHoje: number; erros: string[] }> {
  const jaHoje = await preparadosHoje(db)
  const quantos = quantosPodeEscrever(jaHoje, porPassagem)
  const erros: string[] = []
  if (quantos <= 0) return { preparados: 0, recusados: 0, jaHoje, erros }

  // Os melhores primeiro, e os frescos à frente dos populares quando empatam.
  const { data: candidatos } = await db
    .from('ig_radar_prospetos')
    .select('id, media_id, permalink, hashtag, legenda, pontuacao, origem')
    .eq('estado', 'pendente')
    .gte('pontuacao', PONTUACAO_MINIMA)
    .not('permalink', 'is', null)
    // Só posts recentes: comentar uma publicação de há um mês não apanha conversa nenhuma.
    .or(filtroFrescoPostgrest())
    .order('pontuacao', { ascending: false })
    .order('encontrado_em', { ascending: false })
    .limit(quantos * 3)

  let preparados = 0
  let recusados = 0
  for (const c of candidatos ?? []) {
    if (preparados >= quantos) break
    try {
      const comentario = await escreverComentarioRadar(c)
      const { error } = await db.from('ig_fila_comentarios').insert({
        prospeto_id: c.id,
        media_id: String(c.media_id),
        permalink: c.permalink,
        hashtag: c.hashtag,
        comentario,
        escrito_por: AGENTE_DA_FILA,
      })
      if (error) {
        // O trigger do tecto fala por aqui: parar, não insistir.
        if (/tecto/i.test(error.message)) break
        erros.push(`${c.media_id}: ${error.message}`)
        continue
      }
      // Sai da lista do radar: já tem dono, que é a fila.
      await db.from('ig_radar_prospetos').update({ estado: 'na_fila', visto_em: new Date().toISOString() }).eq('id', c.id)
      preparados++
    } catch (e) {
      recusados++
      erros.push(`${c.media_id}: ${e instanceof Error ? e.message : 'erro'}`)
    }
  }
  return { preparados, recusados, jaHoje, erros }
}

export interface ItemFila {
  id: string
  media_id: string
  permalink: string | null
  hashtag: string | null
  comentario: string
  escrito_por: string
  estado: EstadoFila
  criado_em: string
  aberto_em: string | null
}

/** O que o modo «Fila» mostra: os itens por fazer e os contadores. */
export async function lerFila(db: SupabaseClient) {
  const hoje = diaDeLisboa()
  const inicioHoje = new Date(`${hoje}T00:00:00Z`)
  // Meia-noite de Lisboa em UTC: o fuso é 0 ou +1, e um intervalo de 25 h apanha os dois casos
  // sem contar o dia anterior — o filtro fino faz-se a seguir pelo próprio dia de Lisboa.
  const desde = new Date(inicioHoje.getTime() - 3_600_000).toISOString()

  const [{ data: itens }, { data: publicadosRecentes }, { count: respondidosTotal }, { count: publicadosTotal }, { count: preparadosHojeN }] =
    await Promise.all([
      db
        .from('ig_fila_comentarios')
        .select('id, media_id, permalink, hashtag, comentario, escrito_por, estado, criado_em, aberto_em')
        .in('estado', ['aberto', 'pronto'])
        // Um «aberto» é o que ficou a meio: vem primeiro, para se fechar antes de abrir outro.
        .order('estado', { ascending: true })
        .order('criado_em', { ascending: true })
        .limit(40),
      db.from('ig_fila_comentarios').select('publicado_em').eq('estado', 'publicado').gte('publicado_em', desde),
      db.from('ig_fila_comentarios').select('id', { count: 'exact', head: true }).eq('estado', 'publicado').not('respondeu_em', 'is', null),
      db.from('ig_fila_comentarios').select('id', { count: 'exact', head: true }).eq('estado', 'publicado'),
      db.from('ig_fila_comentarios').select('id', { count: 'exact', head: true }).eq('dia', hoje),
    ])

  const publicadosHoje = (publicadosRecentes ?? []).filter(
    (r) => r.publicado_em && diaDeLisboa(new Date(String(r.publicado_em))) === hoje,
  ).length

  // Ainda não há ligação post → DM/comentário de volta (a API de hashtags não diz quem é o
  // autor do post). Enquanto nenhuma linha tiver `respondeu_em`, a taxa diz que não se mede.
  const mede = (respondidosTotal ?? 0) > 0
  const lista = (itens ?? []) as ItemFila[]

  return {
    itens: lista,
    contadores: {
      prontos: lista.filter((i) => i.estado === 'pronto' || i.estado === 'aberto').length,
      publicadosHoje,
      preparadosHoje: preparadosHojeN ?? 0,
      tecto: TECTO_DIARIO,
      taxaResposta: taxaDeResposta(publicadosTotal ?? 0, respondidosTotal ?? 0, mede),
      taxaMede: mede,
    },
  }
}

/** «Próximo»: o dono abriu o post. Só regista; o copiar e o abrir são no browser dele. */
export async function marcarAberto(db: SupabaseClient, id: string) {
  await db
    .from('ig_fila_comentarios')
    .update({ estado: 'aberto', aberto_em: new Date().toISOString() })
    .eq('id', id)
    .in('estado', ['pronto', 'aberto'])
}

/** «Publiquei»: o dono publicou à mão. Fica quem escreveu, a hora e o post. */
export async function marcarPublicado(db: SupabaseClient, id: string) {
  const { data: item } = await db
    .from('ig_fila_comentarios')
    .select('estado, media_id, permalink, prospeto_id')
    .eq('id', id)
    .maybeSingle()
  if (!item) throw new Error('Comentário desconhecido')
  const registo = registoDePublicado(item as { estado: EstadoFila; media_id: string; permalink: string | null })
  const { error } = await db.from('ig_fila_comentarios').update(registo).eq('id', id)
  if (error) throw new Error(error.message)
  await db.from('ig_radar_prospetos').update({ estado: 'usado', visto_em: registo.publicado_em }).eq('id', item.prospeto_id)
  return registo
}

/** «Saltar»: passa ao seguinte. O post sai do radar para não voltar à fila amanhã. */
export async function marcarSaltado(db: SupabaseClient, id: string) {
  const { data: item } = await db.from('ig_fila_comentarios').select('prospeto_id').eq('id', id).maybeSingle()
  await db
    .from('ig_fila_comentarios')
    .update({ estado: 'saltado', saltado_em: new Date().toISOString() })
    .eq('id', id)
    .in('estado', ['pronto', 'aberto'])
  if (item?.prospeto_id) {
    await db.from('ig_radar_prospetos').update({ estado: 'ignorado', visto_em: new Date().toISOString() }).eq('id', item.prospeto_id)
  }
}

/**
 * O SETTER — a parte que toca na base e, se a deixarem, no Instagram.
 *
 * A decisão de O QUE dizer está toda em `setter-persona.ts`, que é puro e testado. Aqui está só o
 * que não se pode testar sem rede: ler o interruptor, redigir com o modelo, gravar o rascunho e —
 * apenas quando o dono ligar — enviar.
 *
 * ═══ ISTO NASCE DESLIGADO ═══════════════════════════════════════════════════════════════════
 *
 * Três interruptores em `site_settings.ig_setter_persona`, os três em `false` (migração 144):
 *
 *   redigir        — escreve rascunhos e não envia NADA. É o modo de sombra: o dono lê o que sairia.
 *   enviar_publica — a fase 1 (resposta pública) sai sozinha.
 *   enviar_dm      — a fase 2 (a DM) sai sozinha.
 *
 * Separados porque ligar a redacção é reversível e ligar o envio não é: a Meta dá UMA private reply
 * por comentário, e uma mensagem mal enviada não tem segunda tentativa — o comentário fica queimado.
 *
 * ═══ O QUE ESTE MÓDULO NÃO MEXE ═════════════════════════════════════════════════════════════
 *
 * O funil por palavra-chave (`funnel.ts`, tabela `ig_leads`) e o agradecimento automático
 * (`engage.ts`, `ig_engagement_log`) ficam exactamente como estão. Foram aprovados pelo dono e
 * funcionam. Este módulo só olha para o que eles DEIXAM PASSAR: as pessoas que comentaram a sério
 * sem escrever nenhuma palavra de campanha — 5 em 30 dias, e nenhuma chegou a ser lead.
 */

import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { prepararMensagem } from '@/lib/agentes/mensagem-saida'
import { agenteDoPostComentado, registarMensagemDeAgente } from '@/lib/agentes/mensagem-livro'
import { pensar } from '@/lib/funis-ia'
import { isAutoPublishBlocked } from './publish'
import { ehDaCasa, handlesDaCasa } from './setter-casa'
import {
  classificar,
  podeMandarDm,
  guiaoFase1,
  guiaoFase2,
  LIMITES,
  RESERVA_FASE1_COM_DM,
  RESERVA_FASE1_SEM_DM,
  RESERVA_FASE2,
  type MotivoSemDm,
} from './setter-persona'

const CHAVE = 'ig_setter_persona'
const GRAPH = 'https://graph.facebook.com/v21.0'

export interface Interruptor {
  redigir: boolean
  enviar_publica: boolean
  enviar_dm: boolean
}

/** Desligado é o estado por omissão, e é-o em TODOS os caminhos de erro deste ficheiro. */
const DESLIGADO: Interruptor = { redigir: false, enviar_publica: false, enviar_dm: false }

let cache: { em: number; v: Interruptor } | null = null
const CACHE_MS = 30_000

/**
 * Lê o interruptor.
 *
 * Duas coisas que já custaram tempo nesta casa e que estão aqui de propósito:
 *
 * 1. `value` tanto vem como objecto como string JSON, conforme quem o escreveu. Ler só o objecto
 *    faz uma configuração guardada não ter efeito nenhum, em silêncio.
 * 2. Falhar a leitura devolve DESLIGADO, nunca o contrário. Uma base em baixo não pode ser motivo
 *    para uma automação de vendas começar a escrever a pessoas.
 */
export async function lerInterruptor(): Promise<Interruptor> {
  if (cache && Date.now() - cache.em < CACHE_MS) return cache.v
  try {
    const { data } = await getSupabaseAdmin()
      .from('site_settings')
      .select('value')
      .eq('key', CHAVE)
      .maybeSingle()
    const bruto = typeof data?.value === 'string' ? JSON.parse(data.value) : data?.value
    const v: Interruptor = {
      redigir: bruto?.redigir === true,
      enviar_publica: bruto?.enviar_publica === true,
      enviar_dm: bruto?.enviar_dm === true,
    }
    cache = { em: Date.now(), v }
    return v
  } catch {
    cache = { em: Date.now(), v: DESLIGADO }
    return DESLIGADO
  }
}

export interface ComentarioParaSetter {
  commentId: string
  mediaId: string
  igAccountId: string
  igUsername: string
  commenter: string | null
  texto: string
  /** A data do comentário, como a Graph API a devolve. Sem ela, a DM não sai. */
  timestamp: string | null
  /** O comentador é uma das nossas contas? */
  ehNossa: boolean
  legendaDoPost: string
}

export type Resultado =
  | 'desligado'
  | 'ignorado'
  /** É gente nossa — cliente, equipa ou parceiro. Ver `setter-casa.ts`. */
  | 'da_casa'
  | 'ja_tratado'
  | 'encerrado'
  | 'rascunho'
  | 'publica_enviada'
  | 'dm_enviada'
  | 'erro'

/** As colunas que descrevem o comentário, iguais em todos os estados por que ele pode passar. */
function baseDoComentario(c: ComentarioParaSetter) {
  return {
    comment_id: c.commentId,
    media_id: c.mediaId,
    ig_account_id: c.igAccountId,
    ig_username: c.igUsername,
    commenter: c.commenter,
    comment_text: (c.texto || '').slice(0, 500),
  }
}

async function gpost(path: string, params: Record<string, string>, token: string) {
  const body = new URLSearchParams({ ...params, access_token: token })
  const r = await fetch(`${GRAPH}/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })
  const json = await r.json().catch(() => ({}))
  return { ok: r.ok, json } as { ok: boolean; json: any }
}

/**
 * Trata um comentário que o funil por palavra-chave não reclamou.
 *
 * Devolve o que fez, para o cron poder contar — e para o tecto por corrida
 * ({@link LIMITES.NOSSO_TECTO_POR_CORRIDA}) ser aplicado por quem chama, que é quem sabe quantos já
 * foram nesta volta.
 */
export async function tratarComentario(
  c: ComentarioParaSetter,
  token: string,
): Promise<Resultado> {
  const chaves = await lerInterruptor()
  if (!chaves.redigir) return 'desligado'

  const classe = classificar({ texto: c.texto, ehNossa: c.ehNossa })
  if (classe === 'ignorar') return 'ignorado'

  const db = getSupabaseAdmin()

  /**
   * Já passámos por este comentário? Então não se volta a tocar nele.
   *
   * Não é só poupança de chamadas: a private reply é ÚNICA por comentário. Um segundo rascunho do
   * mesmo comentário convida quem estiver a ver a lista a aprovar duas vezes a mesma mensagem — e
   * a segunda ia falhar, com a marca a apanhar um erro da Meta por insistência.
   */
  const { data: existente } = await db
    .from('ig_setter_rascunhos')
    .select('comment_id')
    .eq('comment_id', c.commentId)
    .maybeSingle()
  if (existente) return 'ja_tratado'

  /**
   * É GENTE NOSSA? Então não se aborda — e a guarda está aqui, ANTES de se redigir.
   *
   * Está antes de propósito: redigir é gastar um pedido ao modelo, mas sobretudo é deixar na lista
   * um rascunho de venda com o nome de um cliente, à espera que alguém carregue em enviar por
   * distração. A exclusão não pode ser o último passo de uma coisa que já parece pronta.
   *
   * No dia em que isto foi escrito, a fila TODA do Instagram era uma pessoa: `ruipaulo.fxcripto`,
   * que é o Rui Rodrigues, sub-IB e cliente. Ligar o envio sem esta linha tinha como primeiro acto
   * queimar a única private reply de seis comentários dele para lhe vender o que ele já tem.
   *
   * Um conjunto vazio significa «não consegui saber» — e aí `ehDaCasa` devolve `true` para quem não
   * tem handle, e nada se envia a quem não se conseguiu identificar. Ver `setter-casa.ts`.
   */
  const fora = await handlesDaCasa(db)
  if (ehDaCasa(c.commenter, fora)) {
    await db.from('ig_setter_rascunhos').upsert(
      {
        ...baseDoComentario(c),
        estado: 'descartado',
        passo: 'da_casa',
        dm_possivel: false,
        dm_motivo: null,
        decidido_em: new Date().toISOString(),
      },
      { onConflict: 'comment_id' },
    )
    return 'da_casa'
  }

  const comentadoEm = c.timestamp ? new Date(c.timestamp) : null
  const horas =
    comentadoEm && !Number.isNaN(comentadoEm.getTime())
      ? (Date.now() - comentadoEm.getTime()) / 3_600_000
      : null

  const base = { ...baseDoComentario(c), comentado_em: comentadoEm && !Number.isNaN(comentadoEm.getTime()) ? comentadoEm.toISOString() : null }

  /**
   * A pessoa disse que não quer. Fica registado e ACABOU.
   *
   * O registo não é burocracia: é o que impede que ela volte a aparecer numa lista de rascunhos
   * daqui a um mês e alguém lhe escreva por distração. Um não tem de sobreviver à memória de quem
   * está a olhar para o ecrã.
   */
  if (classe === 'encerrar') {
    await db.from('ig_setter_rascunhos').upsert(
      { ...base, estado: 'encerrado', passo: 'encerrar', dm_possivel: false, dm_motivo: null, decidido_em: new Date().toISOString() },
      { onConflict: 'comment_id' },
    )
    return 'encerrado'
  }

  // A conta pessoal do Ricardo nunca escreve sozinha — ver isAutoPublishBlocked em ./publish.
  const contaEscreve = !isAutoPublishBlocked(c.igAccountId)
  const dm = podeMandarDm({
    horasDesdeComentario: horas,
    jaRespondidoEmPrivado: false,
    contaPodeEscreverSozinha: contaEscreve,
  })

  /**
   * A fase 1 é redigida SABENDO se a fase 2 vai sair.
   *
   * É a ordem que interessa e é fácil de trocar sem dar por isso: escrever «mandei-te por privado»
   * e só depois descobrir que a janela dos 7 dias fechou deixa uma promessa não cumprida debaixo do
   * post, à frente de toda a audiência da pessoa.
   */
  let textoPublico =
    (await pensar({
      objetivo: guiaoFase1(dm.pode),
      modo: 'responder',
      ramos: [],
      doCliente: `Post: "${(c.legendaDoPost || '').slice(0, 160)}"\nComentário: "${c.texto.slice(0, 300)}"`,
      reserva: dm.pode ? RESERVA_FASE1_COM_DM : RESERVA_FASE1_SEM_DM,
    })).texto ?? (dm.pode ? RESERVA_FASE1_COM_DM : RESERVA_FASE1_SEM_DM)

  let textoDm: string | null = dm.pode
    ? (await pensar({
        objetivo: guiaoFase2('entrega'),
        modo: 'responder',
        ramos: [],
        doCliente: `Post: "${(c.legendaDoPost || '').slice(0, 160)}"\nComentário: "${c.texto.slice(0, 300)}"`,
        reserva: RESERVA_FASE2,
      })).texto ?? RESERVA_FASE2
    : null

  /**
   * O DONO DESTA RESPOSTA É O DONO DO POST QUE A PESSOA COMENTOU.
   *
   * Não é o setter: o setter responde ao que ela escreveu, mas quem a trouxe foi aquele post. Dar
   * o crédito ao funil era dá-lo ao carteiro — e é por isso que `AGENTE_POR_FUNIL`
   * (lib/agentes/mensagem-saida.ts) deliberadamente NÃO tem uma entrada para o setter.
   *
   * Marca-se o texto já redigido em vez de o mandar redigir com o código lá dentro: o modelo não
   * tem de saber nada disto, e um link que ele escrevesse à mão podia vir com o código colado ao
   * ponto final da frase — o caso que `lib/agentes/atribuicao.ts` documenta e que faz a atribuição
   * desaparecer sem erro.
   */
  const donoDoPost = await agenteDoPostComentado(c.mediaId)
  const marcadaPublica = prepararMensagem({
    canal: 'instagram',
    texto: textoPublico,
    funil: 'instagram:setter',
    codigoExplicito: donoDoPost,
    herancaFalhou: !donoDoPost,
  })
  const marcadaDm = textoDm
    ? prepararMensagem({
        canal: 'instagram',
        texto: textoDm,
        funil: 'instagram:setter',
        codigoExplicito: donoDoPost,
        herancaFalhou: !donoDoPost,
      })
    : null

  textoPublico = marcadaPublica.texto
  textoDm = marcadaDm ? marcadaDm.texto : null

  const linha = {
    ...base,
    texto_publico: textoPublico,
    texto_dm: textoDm,
    // Fica no rascunho para quem REVÊ poder ver se a mensagem mede alguma coisa antes de aprovar
    // — do mesmo modo que a linha «📊 Agente:» do `content-draft`. Zero marcados com código é uma
    // mensagem que não mede nada, e é diferente de uma mensagem sem dono.
    agente_codigo: marcadaPublica.codigo,
    agente_links_marcados: marcadaPublica.marcados + (marcadaDm?.marcados ?? 0),
    dm_possivel: dm.pode,
    dm_motivo: dm.motivo as MotivoSemDm | null,
    passo: 'entrega',
    estado: 'rascunho' as string,
    erro: null as string | null,
    enviado_em: null as string | null,
  }

  // ── Daqui para baixo só corre se o dono tiver ligado o envio. Por omissão, para aqui. ──
  const erros: string[] = []
  let enviouPublica = false
  let enviouDm = false

  /**
   * O ENVIO FICA ESCRITO NO LIVRO DO AGENTE, e não só no rascunho.
   *
   * O rascunho já guardava o texto e o erro — mas guarda-os POR COMENTÁRIO, e a pergunta que o
   * dono vai fazer não é «o que aconteceu a este comentário»: é «o que é que os agentes mandaram
   * ontem, e quanto disso saiu». Essa não se responde a partir de uma tabela com uma linha por
   * comentário do Instagram. Ver `agentes_mensagens` (migração 171).
   *
   * E é aqui que o limite do dono fica medido em vez de ser uma promessa: `enviar_dm` está `true`
   * em produção e ninguém escreve o estado `'aprovado'`, por decisão dele de 01/10. O que isso
   * significa é que as DMs saem sem passar por uma pessoa — e passa a haver registo de cada uma.
   */
  if (chaves.enviar_publica && contaEscreve) {
    const r = await gpost(`${c.commentId}/replies`, { message: textoPublico }, token)
    if (r.ok) enviouPublica = true
    else erros.push(`publica: ${String(r.json?.error?.message ?? 'erro').slice(0, 150)}`)
    await registarMensagemDeAgente({
      canal: 'instagram',
      destino: c.commenter ?? c.commentId,
      funil: 'instagram:setter',
      tipo: 'resposta_publica',
      texto: textoPublico,
      estado: r.ok ? 'enviada' : 'falhou',
      motivo: r.ok ? null : String(r.json?.error?.message ?? 'erro').slice(0, 300),
      referencia: c.commentId,
      marcacao: marcadaPublica,
    })
  }

  if (chaves.enviar_dm && dm.pode && textoDm) {
    const r = await gpost(`${c.commentId}/private_replies`, { message: textoDm }, token)
    if (r.ok) enviouDm = true
    else erros.push(`dm: ${String(r.json?.error?.message ?? 'erro').slice(0, 150)}`)
    await registarMensagemDeAgente({
      canal: 'instagram',
      destino: c.commenter ?? c.commentId,
      funil: 'instagram:setter',
      tipo: 'dm',
      texto: textoDm,
      estado: r.ok ? 'enviada' : 'falhou',
      motivo: r.ok ? null : String(r.json?.error?.message ?? 'erro').slice(0, 300),
      referencia: c.commentId,
      marcacao: marcadaDm ?? marcadaPublica,
    })
  }

  if (enviouPublica || enviouDm) {
    linha.estado = 'enviado'
    linha.enviado_em = new Date().toISOString()
  }
  if (erros.length) linha.erro = erros.join(' | ')

  const { error } = await db.from('ig_setter_rascunhos').upsert(linha, { onConflict: 'comment_id' })
  if (error) return 'erro'

  if (enviouDm) return 'dm_enviada'
  if (enviouPublica) return 'publica_enviada'
  return erros.length ? 'erro' : 'rascunho'
}

export interface ResumoDoSetter {
  ligado: Interruptor
  vistos: number
  rascunhos: number
  encerrados: number
  publicasEnviadas: number
  dmsEnviadas: number
  ignorados: number
  /** Comentários que eram de gente nossa e por isso não se tocou. */
  daCasa: number
  jaTratados: number
  erros: number
  /** Chegou ao nosso tecto por corrida? Se sim, ficou coisa por tratar — volta na próxima volta. */
  atingiuTecto: boolean
}

export function resumoVazio(ligado: Interruptor): ResumoDoSetter {
  return {
    ligado,
    vistos: 0,
    rascunhos: 0,
    encerrados: 0,
    publicasEnviadas: 0,
    dmsEnviadas: 0,
    ignorados: 0,
    daCasa: 0,
    jaTratados: 0,
    erros: 0,
    atingiuTecto: false,
  }
}

/** Conta um resultado no resumo. O tecto conta só o que CUSTA uma acção, não o que se ignorou. */
export function contar(r: ResumoDoSetter, resultado: Resultado): void {
  r.vistos++
  if (resultado === 'rascunho') r.rascunhos++
  else if (resultado === 'encerrado') r.encerrados++
  else if (resultado === 'publica_enviada') r.publicasEnviadas++
  else if (resultado === 'dm_enviada') r.dmsEnviadas++
  else if (resultado === 'ignorado') r.ignorados++
  else if (resultado === 'da_casa') r.daCasa++
  else if (resultado === 'ja_tratado') r.jaTratados++
  else if (resultado === 'erro') r.erros++
}

/** Já se fez nesta corrida tudo o que o nosso tecto permite? */
export function chegouAoTecto(r: ResumoDoSetter): boolean {
  const feitos = r.rascunhos + r.publicasEnviadas + r.dmsEnviadas
  return feitos >= LIMITES.NOSSO_TECTO_POR_CORRIDA
}

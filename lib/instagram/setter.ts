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
 *   enviar_dm      — (desde 06/10 SEM efeito) a DM nunca sai sozinha: fica `pendente` e só sai
 *                    depois de aprovada (/admin/social/leads ou `aprovar_envio` na API do agente).
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
import { isAutoPublishBlocked, tokenForAccount } from './publish'
import { podeSair } from '@/lib/envios-aprovacao'
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
    estado: 'pendente' as string,
    erro: null as string | null,
    enviado_em: null as string | null,
    publica_enviada_em: null as string | null,
  }

  // ── Daqui para baixo: a resposta PÚBLICA pode sair (a pessoa comentou); a DM NUNCA sai aqui. ──
  const erros: string[] = []
  let enviouPublica = false

  /**
   * A RESPOSTA PÚBLICA SAI SOZINHA — quem começou foi a pessoa, ao comentar.
   *
   * É debaixo do comentário dela, à vista, e é uma resposta ao que ela escreveu. Por isso passa
   * por `podeSair` como `resposta_publica_a_comentario` e não precisa de aprovação (regra de
   * 06/10, `lib/envios-aprovacao.ts`). Continua a depender do interruptor `enviar_publica` e da
   * conta poder escrever sozinha (a pessoal do Ricardo nunca).
   */
  if (chaves.enviar_publica && contaEscreve && podeSair({ tipo: 'resposta_publica_a_comentario' }).pode) {
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

  /**
   * A DM FICA PENDENTE. Sempre. (06/10, conformidade)
   *
   * Até aqui, com `enviar_dm: true` em produção, a DM saía sem passar por ninguém — o degrau
   * `aprovado` existia no esquema e não no caminho (`lib/agentes/desbloqueio.ts`,
   * `ig_setter_sem_aprovado`). A pessoa comentou; não pediu uma conversa privada. Por isso a DM é
   * iniciativa da máquina e fica `pendente` até alguém a aprovar no /admin/social/leads ou pela
   * API do agente (`aprovar_envio`). Quem a envia é `enviarRascunhoAprovado`, e só a partir de
   * `aprovado`.
   *
   * Sem DM possível, o rascunho só fica pendente se a resposta pública ainda não saiu (para quem
   * aprovar a poder mandar); se já saiu, está `enviado` e não há mais nada a decidir.
   */
  linha.publica_enviada_em = enviouPublica ? new Date().toISOString() : null
  const temDmPorDecidir = dm.pode && !!textoDm
  if (temDmPorDecidir || !enviouPublica) {
    linha.estado = 'pendente'
  } else {
    linha.estado = 'enviado'
    linha.enviado_em = new Date().toISOString()
  }
  if (erros.length) linha.erro = erros.join(' | ')

  const { error } = await db.from('ig_setter_rascunhos').upsert(linha, { onConflict: 'comment_id' })
  if (error) return 'erro'

  if (enviouPublica && !temDmPorDecidir) return 'publica_enviada'
  return erros.length ? 'erro' : 'rascunho'
}

// ── O envio do que foi APROVADO ──────────────────────────────────────────────────────────────────

export interface ResultadoDoAprovado {
  ok: boolean
  estado: string
  erro?: string
}

/**
 * Envia um rascunho do setter que uma pessoa aprovou. É o ÚNICO caminho por onde sai a DM.
 *
 * Lê o estado da base (não confia em quem chama) e pergunta a `podeSair` como `dm_setter`: só
 * `aprovado` passa. A janela dos 7 dias volta a medir-se AGORA — um rascunho aprovado tarde
 * demais já não tem a private reply, e tentar só gastava um erro da Meta.
 */
export async function enviarRascunhoAprovado(commentId: string): Promise<ResultadoDoAprovado> {
  const db = getSupabaseAdmin()
  const { data: r } = await db.from('ig_setter_rascunhos').select('*').eq('comment_id', commentId).maybeSingle()
  if (!r) return { ok: false, estado: 'desconhecido', erro: 'rascunho não encontrado' }
  const row = r as Record<string, any>

  const decisao = podeSair({ tipo: 'dm_setter', estado: row.estado })
  if (!decisao.pode) return { ok: false, estado: String(row.estado), erro: decisao.porque }

  const token = await tokenForAccount(String(row.ig_account_id))
  if (!token) return { ok: false, estado: String(row.estado), erro: 'sem token da conta' }

  const contaEscreve = !isAutoPublishBlocked(row.ig_account_id)
  const erros: string[] = []
  let saiuAlguma = false
  const marcacaoGuardada = {
    codigo: (row.agente_codigo ?? null) as string | null,
    marcados: Number(row.agente_links_marcados ?? 0),
  }

  if (!row.publica_enviada_em && row.texto_publico && contaEscreve) {
    const p = await gpost(`${commentId}/replies`, { message: String(row.texto_publico) }, token)
    if (p.ok) saiuAlguma = true
    else erros.push(`publica: ${String(p.json?.error?.message ?? 'erro').slice(0, 150)}`)
    await registarMensagemDeAgente({
      canal: 'instagram', destino: row.commenter ?? commentId, funil: 'instagram:setter', tipo: 'resposta_publica',
      texto: String(row.texto_publico), estado: p.ok ? 'enviada' : 'falhou',
      motivo: p.ok ? null : String(p.json?.error?.message ?? 'erro').slice(0, 300), referencia: commentId,
      marcacao: marcacaoGuardada,
    })
    if (p.ok) await db.from('ig_setter_rascunhos').update({ publica_enviada_em: new Date().toISOString() }).eq('comment_id', commentId)
  }

  if (row.dm_possivel && row.texto_dm) {
    const horas = row.comentado_em ? (Date.now() - new Date(row.comentado_em).getTime()) / 3_600_000 : null
    const dm = podeMandarDm({ horasDesdeComentario: horas, jaRespondidoEmPrivado: false, contaPodeEscreverSozinha: contaEscreve })
    if (!dm.pode) {
      erros.push(`dm: ${dm.motivo}`)
    } else {
      const d = await gpost(`${commentId}/private_replies`, { message: String(row.texto_dm) }, token)
      if (d.ok) saiuAlguma = true
      else erros.push(`dm: ${String(d.json?.error?.message ?? 'erro').slice(0, 150)}`)
      await registarMensagemDeAgente({
        canal: 'instagram', destino: row.commenter ?? commentId, funil: 'instagram:setter', tipo: 'dm',
        texto: String(row.texto_dm), estado: d.ok ? 'enviada' : 'falhou',
        motivo: d.ok ? null : String(d.json?.error?.message ?? 'erro').slice(0, 300), referencia: commentId,
        marcacao: marcacaoGuardada,
      })
    }
  }

  const estado = saiuAlguma ? 'enviado' : 'falhou'
  await db
    .from('ig_setter_rascunhos')
    .update({
      estado,
      enviado_em: saiuAlguma ? new Date().toISOString() : null,
      erro: erros.length ? erros.join(' | ') : null,
    })
    .eq('comment_id', commentId)
    .eq('estado', 'aprovado')
  return { ok: saiuAlguma, estado, ...(erros.length ? { erro: erros.join(' | ') } : {}) }
}

/**
 * Corre os aprovados que ficaram por enviar (a aprovação tenta logo; isto apanha o que falhou
 * por rede). Chamado pelo cron `ig-funnel`. Nunca toca em `pendente`.
 */
export async function enviarAprovadosPendentes(limite = 10): Promise<number> {
  const { data } = await getSupabaseAdmin()
    .from('ig_setter_rascunhos')
    .select('comment_id')
    .eq('estado', 'aprovado')
    .limit(limite)
  let n = 0
  for (const r of data ?? []) {
    const x = await enviarRascunhoAprovado(String((r as { comment_id: string }).comment_id))
    if (x.ok) n++
  }
  return n
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

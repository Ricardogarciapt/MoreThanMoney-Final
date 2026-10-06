/**
 * OS AGENTES DE VENDAS NO PIPELINE DO BACKOFFICE — o catálogo FECHADO e as regras, puros.
 *
 * ═══ O QUE ISTO É (06/10/2026) ═════════════════════════════════════════════════════════════
 *
 * O backoffice (backoffice.morethanmoney.pt → /backoffice) é onde a equipa humana trabalha os
 * negócios de `vendas_negocios`: oito etapas (lead → contactado → qualificado → marcado → no_show →
 * apresentado → ganho/perdido), cinco lugares humanos por negócio (prospector, setter, closer, team
 * leader, afiliado — FK para `profiles`, é por eles que nascem as comissões) e a BOLSA (negócios sem
 * nenhum humano, que qualquer pessoa pode pegar).
 *
 * A partir de agora os agentes de vendas (Prospector, Setter, Closer, Email, Social, Vendedora)
 * trabalham ali também, pela rota do motor (`POST /api/admin/agentes/motor {acao:'pipeline'}`), e
 * SÓ pelas acções deste catálogo. Um agente não é uma pessoa: fica em `vendas_negocios.agente_id`,
 * nunca numa das cinco colunas humanas, e não recebe comissão.
 *
 * ═══ AS REGRAS, cada uma com o caso mau que impede ═══════════════════════════════════════
 *
 *  1. CATÁLOGO FECHADO. O que não está em `ACCOES_PIPELINE` é recusado — e não há «apagar», nem
 *     «ganho» (a venda nasce do pagamento confirmado), nem preços, nem reembolsos, nem permissões.
 *  2. NEGÓCIO DE UM HUMANO = SÓ NOTAS. Basta um humano numa das cinco colunas (pegou, ou foi posto
 *     lá) para o negócio ser dele: o agente pode juntar uma nota, e mais nada. Sem isto, um agente
 *     punha em «perdido» a reunião que o closer marcou por telefone.
 *  3. UM NEGÓCIO DA BOLSA trabalhado por OUTRO agente também não se mexe (só notas): dois agentes a
 *     mover o mesmo lead davam um histórico que ninguém consegue ler.
 *  4. TECTO DIÁRIO por agente, contado no REGISTO (`vendas_agentes_accoes`, ok=true). Sem registo
 *     lido, não há acção: um tecto que não se conseguiu contar é um tecto que não existe.
 *  5. CADA ACÇÃO FICA REGISTADA com antes e depois — e a recusa também.
 *  6. NENHUMA MENSAGEM SAI DAQUI. «rascunho_mensagem» guarda texto; o envio continua a passar por
 *     `decidirContacto` (acção «contacto» da mesma rota) e pela fila.
 *
 * Ser puro é o que permite provar tudo em segundos: `npx tsx lib/agentes/pipeline-agentes.check.ts`.
 */
import { ESTADOS_PIPELINE, ehEstadoPipeline, type EstadoPipeline } from '@/lib/backoffice-vista'
import { PAPEIS, type Papel } from '@/lib/backoffice-papeis'

/** O catálogo FECHADO. Não existe aqui nenhuma acção de apagar, e a guarda prova-o. */
export const ACCOES_PIPELINE = [
  'criar_lead',          // lead novo, com ORIGEM declarada
  'assumir',             // o agente fica responsável por um negócio da bolsa
  'qualificar',          // pontuação 0–100 + porquê (colunas do agente, nunca a `nota`)
  'nota',                // nota no registo — a única acção permitida num negócio de um humano
  'mudar_etapa',         // mover (nunca para «ganho»)
  'criar_tarefa',        // tarefa do próprio agente
  'fechar_tarefa',       // feita ou cancelada (cancelar não é apagar)
  'agendar_followup',    // tarefa com prazo, ligada ao negócio, com rascunho opcional
  'passar_a_humano',     // põe uma pessoa com esse papel no lugar vago e dá-lhe uma tarefa
  'registar_actividade', // o que se fez (pesquisa, tentativa de contacto…)
  'rascunho_mensagem',   // texto preparado — NÃO envia
] as const
export type AccaoPipeline = (typeof ACCOES_PIPELINE)[number]

export function ehAccaoPipeline(v: unknown): v is AccaoPipeline {
  return typeof v === 'string' && (ACCOES_PIPELINE as readonly string[]).includes(v)
}

/** As únicas acções permitidas num negócio que é de um humano (regra 2). */
export const ACCOES_EM_NEGOCIO_HUMANO: readonly AccaoPipeline[] = ['nota']

/** Etapas para onde um agente NÃO move: «ganho» é o closer humano + pagamento confirmado. */
export const ETAPAS_PROIBIDAS_A_AGENTES: readonly EstadoPipeline[] = ['ganho']

/** Origens declaradas aceites para um lead criado por um agente. */
export const ORIGENS_DECLARADAS = [
  'instagram', 'telegram', 'email', 'whatsapp', 'site', 'corretora', 'b2b', 'indicacao', 'evento', 'outro',
] as const

export const TIPOS_DE_ACTIVIDADE = ['pesquisa', 'contacto_tentado', 'resposta_recebida', 'analise', 'reuniao_preparada', 'outro'] as const
export const CANAIS_DE_RASCUNHO = ['email', 'telegram', 'whatsapp', 'instagram', 'sms', 'chamada'] as const

export const TECTO_DIA_PADRAO = 40

/** Os agentes de vendas (e os filhos deles: AG-SETTER-1, AG-SETTER-1-2…). */
export const AGENTES_DE_VENDAS = ['AG-PROSPECTOR', 'AG-SETTER', 'AG-CLOSER', 'AG-EMAIL', 'AG-SOCIAL', 'AG-FORMACAO'] as const
export type AgenteDeVendas = (typeof AGENTES_DE_VENDAS)[number]

/** O código-raiz de um agente (o filho herda o papel do pai). `null` se não for de vendas. */
export function raizDeVendas(codigo: unknown): AgenteDeVendas | null {
  if (typeof codigo !== 'string') return null
  const c = codigo.trim().toUpperCase()
  for (const r of AGENTES_DE_VENDAS) {
    if (c === r || (c.startsWith(r + '-') && /^(-\d{1,3}){1,4}$/.test(c.slice(r.length)))) return r
  }
  return null
}

/** O nome com que o agente aparece no backoffice, ao lado dos humanos. */
export const NOME_DO_AGENTE: Record<AgenteDeVendas, string> = {
  'AG-PROSPECTOR': 'Prospector',
  'AG-SETTER': 'Setter',
  'AG-CLOSER': 'Closer',
  'AG-EMAIL': 'Email',
  'AG-SOCIAL': 'Social',
  'AG-FORMACAO': 'Vendedora',
}

/** As etapas da bolsa que cada agente vê no seu retrato. */
export const ETAPAS_DO_AGENTE: Record<AgenteDeVendas, readonly EstadoPipeline[]> = {
  'AG-PROSPECTOR': ['lead'],
  // 06/10 (dono): o Setter também qualifica directamente os leads — os 107 abertos estavam todos em «lead».
  'AG-SETTER': ['lead', 'contactado', 'qualificado'],
  'AG-CLOSER': ['marcado', 'no_show', 'apresentado'],
  'AG-EMAIL': ['lead', 'contactado', 'qualificado', 'no_show'],
  'AG-SOCIAL': ['lead', 'contactado'],
  'AG-FORMACAO': ['lead', 'contactado', 'qualificado', 'marcado', 'no_show', 'apresentado'],
}

/** As cinco colunas humanas. Uma preenchida = negócio de um humano. */
export const COLUNAS_HUMANAS = ['prospector_id', 'setter_id', 'closer_id', 'team_leader_id', 'afiliado_id'] as const
const COLUNA_DO_PAPEL: Record<Papel, (typeof COLUNAS_HUMANAS)[number]> = {
  prospector: 'prospector_id',
  setter: 'setter_id',
  closer: 'closer_id',
  team_leader: 'team_leader_id',
  afiliado: 'afiliado_id',
}
/** Papéis para os quais um agente pode passar um negócio (afiliado não: é quem divulga). */
export const PAPEIS_DE_PASSAGEM: readonly Papel[] = ['prospector', 'setter', 'closer', 'team_leader']

export interface NegocioParaAgente {
  id: string
  nome?: string
  estado: string
  agente_id: string | null
  agente_pontuacao?: number | null
  agente_qualificacao?: string | null
  prospector_id: string | null
  setter_id: string | null
  closer_id: string | null
  team_leader_id: string | null
  afiliado_id: string | null
}

export interface TarefaParaAgente {
  id: string
  estado: string
  agente_id: string | null
  responsavel_id: string | null
  negocio_id: string | null
}

export function ehDeHumano(n: NegocioParaAgente): boolean {
  return COLUNAS_HUMANAS.some((c) => typeof n[c] === 'string' && n[c]!.length > 0)
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export function ehUuid(v: unknown): v is string {
  return typeof v === 'string' && UUID.test(v)
}

function texto(v: unknown, max: number): string | null {
  if (typeof v !== 'string') return null
  const t = v.trim()
  return t.length === 0 ? null : t.slice(0, max)
}

function dia(v: unknown): string | null {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null
  return Number.isFinite(Date.parse(`${v}T00:00:00Z`)) ? v : null
}

// ═══════════════════════ O PLANO ═══════════════════════

/** O que a rota escreve. Nada aqui é «delete» — o tipo não tem por onde. */
export interface PlanoPipeline {
  accao: AccaoPipeline
  negocioInsert?: Record<string, unknown>
  negocioUpdate?: { id: string; campos: Record<string, unknown> }
  tarefaInsert?: Record<string, unknown>
  /** Segunda tarefa (a do humano, na passagem). */
  tarefaInsertHumano?: Record<string, unknown>
  tarefaUpdate?: { id: string; campos: Record<string, unknown> }
  evento?: Record<string, unknown>
  antes: Record<string, unknown> | null
  depois: Record<string, unknown> | null
  texto: string | null
  negocioId: string | null
  tarefaId: string | null
}

export type ResultadoPipeline = { ok: true; plano: PlanoPipeline } | { ok: false; erro: string; codigo: number }

export interface ContextoPipeline {
  agenteId: string
  agenteCodigo: string
  /** Estado do agente em `agentes_equipa`. Só «vivo» e «em_risco» trabalham. */
  agenteEstado: string
  /** Acções ok=true deste agente hoje. `null` = não se conseguiu contar → recusa. */
  usadosHoje: number | null
  tecto: number
  negocio?: NegocioParaAgente | null
  tarefa?: TarefaParaAgente | null
  /** Para «passar_a_humano»: os papéis activos da pessoa indicada (lidos de backoffice_papeis). */
  papeisDaPessoa?: readonly string[]
  /** Para «criar_lead»: já existe um negócio com este email/telegram? (id) */
  duplicadoDe?: string | null
  agora?: Date
}

const nao = (erro: string, codigo = 400): ResultadoPipeline => ({ ok: false, erro, codigo })

/**
 * ⭐ A DECISÃO. Recebe o pedido do agente e o que a rota leu da base; devolve o plano ou a recusa.
 */
export function decidirAccaoPipeline(pedido: Record<string, unknown>, ctx: ContextoPipeline): ResultadoPipeline {
  const accao = pedido.accao
  if (!ehAccaoPipeline(accao)) {
    return nao(`Acção «${String(accao)}» fora do catálogo do pipeline (${ACCOES_PIPELINE.join(', ')}).`)
  }
  if (!ehUuid(ctx.agenteId)) return nao('Agente sem id válido.')
  if (!raizDeVendas(ctx.agenteCodigo)) return nao('Só os agentes de vendas trabalham no pipeline.', 403)
  if (!['vivo', 'em_risco'].includes(ctx.agenteEstado)) return nao('Agente fora de jogo — não trabalha.', 409)
  if (ctx.usadosHoje === null || !Number.isFinite(ctx.usadosHoje)) {
    return nao('Não se leu o registo de hoje — o tecto diário não se pode verificar, por isso não se faz nada.', 503)
  }
  if (ctx.usadosHoje >= ctx.tecto) return nao(`Tecto diário atingido (${ctx.tecto} acções no pipeline).`, 429)

  const agora = ctx.agora ?? new Date()
  const ag = ctx.agenteId
  const base = { negocioId: null as string | null, tarefaId: null as string | null }

  // ─── acções que não precisam de negócio existente ───
  if (accao === 'criar_lead') {
    const nome = texto(pedido.nome, 120)
    if (!nome) return nao('Um lead precisa de nome.')
    const origem = texto(pedido.origem, 30)
    if (!origem || !(ORIGENS_DECLARADAS as readonly string[]).includes(origem)) {
      return nao(`Origem obrigatória e declarada: ${ORIGENS_DECLARADAS.join(', ')}.`)
    }
    const fonte = texto(pedido.fonte, 300)
    if (!fonte || fonte.length < 5) return nao('Diz de onde veio este lead em «fonte» (o post, a conversa, a lista) — sem isso a origem não é declarada.')
    const email = texto(pedido.email, 200)
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return nao('Email inválido.')
    const telegram = texto(pedido.telegram_username, 64)
    const instagram = texto(pedido.instagram_handle, 64)
    const telefone = texto(pedido.telefone, 40)
    if (!email && !telegram && !instagram && !telefone) return nao('Um lead precisa de pelo menos um contacto (email, telegram, instagram ou telefone).')
    if (ctx.duplicadoDe) return nao(`Já existe um negócio com este contacto (${ctx.duplicadoDe}). Trabalha esse.`, 409)
    const linha = {
      nome,
      origem,
      email: email ? email.toLowerCase() : null,
      telefone,
      telegram_username: telegram ? telegram.replace(/^@/, '') : null,
      instagram_handle: instagram ? instagram.replace(/^@/, '') : null,
      pack_previsto: texto(pedido.pack_previsto, 60),
      interesse: texto(pedido.interesse, 200),
      estado: 'lead',
      agente_id: ag,
      criado_por: null,
    }
    return {
      ok: true,
      plano: {
        ...base,
        accao,
        negocioInsert: linha,
        evento: { de: null, para: 'lead', por: null, agente_id: ag, nota: `Lead criado pelo agente ${ctx.agenteCodigo} (origem ${origem}: ${fonte}).` },
        antes: null,
        depois: linha,
        texto: fonte,
      },
    }
  }

  if (accao === 'criar_tarefa') {
    const titulo = texto(pedido.titulo, 160)
    if (!titulo) return nao('Uma tarefa precisa de título.')
    const prazo = pedido.prazo === undefined || pedido.prazo === null || pedido.prazo === '' ? null : dia(pedido.prazo)
    if (pedido.prazo && !prazo) return nao('Prazo no formato AAAA-MM-DD.')
    let negocioId: string | null = null
    if (pedido.negocio_id !== undefined && pedido.negocio_id !== null && pedido.negocio_id !== '') {
      if (!ctx.negocio || ctx.negocio.id !== pedido.negocio_id) return nao('Negócio não encontrado.', 404)
      negocioId = ctx.negocio.id
    }
    const linha = {
      titulo,
      descricao: texto(pedido.descricao, 2000),
      responsavel_id: null,
      agente_id: ag,
      negocio_id: negocioId,
      prazo,
      estado: 'aberta',
      criado_por: null,
    }
    return { ok: true, plano: { ...base, negocioId, accao, tarefaInsert: linha, antes: null, depois: linha, texto: titulo } }
  }

  if (accao === 'fechar_tarefa') {
    const t = ctx.tarefa
    if (!t || t.id !== pedido.tarefa_id) return nao('Tarefa não encontrada.', 404)
    if (t.agente_id !== ag) return nao('Só fechas as tuas tarefas. As das pessoas são delas.', 403)
    const para = pedido.estado === 'cancelada' ? 'cancelada' : pedido.estado === 'feita' ? 'feita' : null
    if (!para) return nao('Estado da tarefa: «feita» ou «cancelada» (cancelar não é apagar).')
    if (t.estado !== 'aberta') return nao('A tarefa já não está aberta.', 409)
    const campos = { estado: para, feita_em: para === 'feita' ? agora.toISOString() : null, atualizado_em: agora.toISOString() }
    return {
      ok: true,
      plano: { ...base, negocioId: t.negocio_id, tarefaId: t.id, accao, tarefaUpdate: { id: t.id, campos }, antes: { estado: t.estado }, depois: { estado: para }, texto: texto(pedido.porque, 500) },
    }
  }

  // ─── daqui para baixo, tudo é sobre um negócio que existe ───
  const n = ctx.negocio
  if (!n || !ehUuid(pedido.negocio_id) || n.id !== pedido.negocio_id) return nao('Negócio não encontrado.', 404)
  const humano = ehDeHumano(n)
  const deOutroAgente = !!n.agente_id && n.agente_id !== ag
  if ((humano || deOutroAgente) && !ACCOES_EM_NEGOCIO_HUMANO.includes(accao)) {
    return nao(
      humano
        ? 'Este negócio é de um humano: um agente só pode juntar notas.'
        : 'Este negócio já está com outro agente: só podes juntar notas.',
      403,
    )
  }
  const comNegocio = { ...base, negocioId: n.id }

  if (accao === 'nota' || accao === 'registar_actividade' || accao === 'rascunho_mensagem') {
    const t = texto(pedido.texto, 4000)
    if (!t || t.length < 3) return nao('Falta o texto.')
    let depois: Record<string, unknown> = { texto: t }
    if (accao === 'registar_actividade') {
      const tipo = texto(pedido.tipo, 40)
      if (!tipo || !(TIPOS_DE_ACTIVIDADE as readonly string[]).includes(tipo)) return nao(`Tipo de actividade: ${TIPOS_DE_ACTIVIDADE.join(', ')}.`)
      depois = { tipo, texto: t }
    }
    if (accao === 'rascunho_mensagem') {
      const canal = texto(pedido.canal, 20)
      if (!canal || !(CANAIS_DE_RASCUNHO as readonly string[]).includes(canal)) return nao(`Canal do rascunho: ${CANAIS_DE_RASCUNHO.join(', ')}.`)
      depois = { canal, texto: t, enviado: false }
    }
    return { ok: true, plano: { ...comNegocio, accao, antes: null, depois, texto: t } }
  }

  if (accao === 'assumir') {
    if (n.agente_id === ag) return nao('Já és o agente deste negócio.', 409)
    const campos = { agente_id: ag, atualizado_em: agora.toISOString() }
    return {
      ok: true,
      plano: {
        ...comNegocio,
        accao,
        negocioUpdate: { id: n.id, campos },
        evento: { de: n.estado, para: n.estado, por: null, agente_id: ag, nota: `O agente ${ctx.agenteCodigo} assumiu este negócio da bolsa.` },
        antes: { agente_id: null },
        depois: { agente_id: ag },
        texto: null,
      },
    }
  }

  // As restantes exigem que o agente seja o responsável do negócio (assumir primeiro).
  if (n.agente_id !== ag) return nao('Assume primeiro o negócio (acção «assumir») — só mexes no que é teu.', 403)

  if (accao === 'qualificar') {
    const p = Number(pedido.pontuacao)
    if (!Number.isInteger(p) || p < 0 || p > 100) return nao('Pontuação inteira de 0 a 100.')
    const porque = texto(pedido.porque, 1000)
    if (!porque) return nao('Uma pontuação sem porquê não ensina nada: escreve «porque».')
    const campos = { agente_pontuacao: p, agente_qualificacao: porque, atualizado_em: agora.toISOString() }
    return {
      ok: true,
      plano: {
        ...comNegocio,
        accao,
        negocioUpdate: { id: n.id, campos },
        antes: { agente_pontuacao: n.agente_pontuacao ?? null, agente_qualificacao: n.agente_qualificacao ?? null },
        depois: { agente_pontuacao: p, agente_qualificacao: porque },
        texto: porque,
      },
    }
  }

  if (accao === 'mudar_etapa') {
    const para = pedido.para
    if (!ehEstadoPipeline(para)) return nao(`Etapa desconhecida. As etapas são: ${ESTADOS_PIPELINE.join(', ')}.`)
    if (ETAPAS_PROIBIDAS_A_AGENTES.includes(para)) return nao('Um agente não dá negócios por ganhos: isso é o pagamento confirmado + o closer.', 403)
    if (n.estado === para) return nao('O negócio já está nessa etapa.', 409)
    if (n.estado === 'ganho') return nao('Um negócio ganho não se reabre por um agente.', 403)
    const motivo = texto(pedido.motivo_perda, 500)
    if (para === 'perdido' && !motivo) return nao('Para dar por perdido tem de ficar escrito porquê (motivo_perda).')
    const campos = {
      estado: para,
      motivo_perda: para === 'perdido' ? motivo : null,
      fechado_em: para === 'perdido' ? agora.toISOString() : null,
      atualizado_em: agora.toISOString(),
    }
    const nota = texto(pedido.nota, 500)
    return {
      ok: true,
      plano: {
        ...comNegocio,
        accao,
        negocioUpdate: { id: n.id, campos },
        evento: { de: n.estado, para, por: null, agente_id: ag, nota: nota ? `${ctx.agenteCodigo}: ${nota}` : `Movido pelo agente ${ctx.agenteCodigo}.` },
        antes: { estado: n.estado },
        depois: { estado: para, motivo_perda: campos.motivo_perda },
        texto: nota,
      },
    }
  }

  if (accao === 'agendar_followup') {
    const prazo = dia(pedido.prazo)
    if (!prazo) return nao('Um follow-up precisa de prazo (AAAA-MM-DD).')
    const hoje = agora.toISOString().slice(0, 10)
    const limite = new Date(agora.getTime() + 90 * 86_400_000).toISOString().slice(0, 10)
    if (prazo < hoje) return nao('O prazo do follow-up já passou.')
    if (prazo > limite) return nao('Follow-up a mais de 90 dias não é follow-up: cria uma tarefa.')
    const titulo = texto(pedido.titulo, 160) ?? `Follow-up: ${n.nome ?? 'negócio'}`
    const linha = {
      titulo,
      descricao: texto(pedido.descricao, 2000),
      rascunho: texto(pedido.rascunho, 4000),
      responsavel_id: null,
      agente_id: ag,
      negocio_id: n.id,
      prazo,
      estado: 'aberta',
      criado_por: null,
    }
    return { ok: true, plano: { ...comNegocio, accao, tarefaInsert: linha, antes: null, depois: linha, texto: titulo } }
  }

  // passar_a_humano
  const pessoa = pedido.pessoa_id
  if (!ehUuid(pessoa)) return nao('Indica a pessoa (pessoa_id).')
  const papel = pedido.papel
  if (typeof papel !== 'string' || !(PAPEIS as readonly string[]).includes(papel) || !PAPEIS_DE_PASSAGEM.includes(papel as Papel)) {
    return nao(`Papel da passagem: ${PAPEIS_DE_PASSAGEM.join(', ')}.`)
  }
  if (!(ctx.papeisDaPessoa ?? []).includes(papel)) return nao('Essa pessoa não tem esse papel activo no backoffice.', 403)
  const porque = texto(pedido.porque, 1000)
  if (!porque) return nao('Diz porque é preciso uma pessoa — é o que ela lê primeiro.')
  const coluna = COLUNA_DO_PAPEL[papel as Papel]
  const campos = { [coluna]: pessoa, atualizado_em: agora.toISOString() }
  const tarefaHumano = {
    titulo: `Passado pelo agente ${ctx.agenteCodigo}: ${n.nome ?? 'negócio'}`.slice(0, 160),
    descricao: porque,
    rascunho: texto(pedido.rascunho, 4000),
    responsavel_id: pessoa,
    agente_id: null,
    negocio_id: n.id,
    papel,
    prazo: dia(pedido.prazo) ?? agora.toISOString().slice(0, 10),
    estado: 'aberta',
    criado_por: null,
  }
  return {
    ok: true,
    plano: {
      ...comNegocio,
      accao,
      negocioUpdate: { id: n.id, campos },
      tarefaInsertHumano: tarefaHumano,
      evento: { de: n.estado, para: n.estado, por: null, agente_id: ag, nota: `Atribuição: ${papel} passa a ser uma pessoa (passagem do agente ${ctx.agenteCodigo}). ${porque}`.slice(0, 900) },
      antes: { [coluna]: null },
      depois: { [coluna]: pessoa },
      texto: porque,
    },
  }
}

/** A linha do registo — escrita SEMPRE, aceite ou recusada. */
export function linhaDoRegisto(
  pedido: Record<string, unknown>,
  ctx: { agenteId: string; agenteCodigo: string },
  r: ResultadoPipeline,
  ids: { negocioId?: string | null; tarefaId?: string | null } = {},
): Record<string, unknown> {
  const accao = ehAccaoPipeline(pedido.accao) ? pedido.accao : 'fora_do_catalogo'
  const pedidoLimpo = Object.fromEntries(
    Object.entries(pedido).map(([k, v]) => [k, typeof v === 'string' ? v.slice(0, 600) : v]),
  )
  if (r.ok) {
    return {
      agente_id: ctx.agenteId,
      agente_codigo: ctx.agenteCodigo,
      accao,
      ok: true,
      negocio_id: ids.negocioId ?? r.plano.negocioId,
      tarefa_id: ids.tarefaId ?? r.plano.tarefaId,
      antes: r.plano.antes,
      depois: r.plano.depois,
      texto: r.plano.texto,
      pedido: pedidoLimpo,
    }
  }
  return {
    agente_id: ctx.agenteId,
    agente_codigo: ctx.agenteCodigo,
    accao,
    ok: false,
    erro: r.erro.slice(0, 500),
    // Só ids que a rota LEU da base (FK): um uuid inventado pelo agente partia a escrita do registo.
    negocio_id: ids.negocioId ?? null,
    tarefa_id: ids.tarefaId ?? null,
    antes: null,
    depois: null,
    texto: null,
    pedido: pedidoLimpo,
  }
}

/** Dias desde a última mexida. */
export function diasDesde(iso: string | null | undefined, agora: Date = new Date()): number | null {
  if (!iso) return null
  const t = Date.parse(iso)
  return Number.isFinite(t) ? Math.floor((agora.getTime() - t) / 86_400_000) : null
}

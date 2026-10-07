/**
 * O LADO DA BASE dos agentes no pipeline: ler o contexto, chamar a decisão pura
 * (`pipeline-agentes.ts`), escrever o plano e REGISTAR. Só é chamado pela rota do motor
 * (`/api/admin/agentes/motor`, acções «pipeline» e «pipeline_ler»).
 *
 * As escritas de negócio levam a condição «ainda sem humano» no próprio UPDATE: se uma pessoa
 * pegou no negócio entre a leitura e a escrita, o UPDATE não apanha linha nenhuma e a acção é
 * recusada — o humano ganha sempre a corrida.
 */
import { lerConfigOs, orcamentoPipelineDb } from './os/os-db'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  COLUNAS_HUMANAS, ETAPAS_DO_AGENTE, TECTO_DIA_PADRAO, decidirAccaoPipeline, diasDesde, ehUuid,
  linhaDoRegisto, raizDeVendas, type ContextoPipeline, type NegocioParaAgente, type TarefaParaAgente,
} from './pipeline-agentes'

const COLS_NEGOCIO =
  'id, nome, estado, agente_id, agente_pontuacao, agente_qualificacao, prospector_id, setter_id, closer_id, team_leader_id, afiliado_id, origem, pack_previsto, atualizado_em, criado_em'

function inicioDoDia(agora = new Date()): string {
  const d = new Date(agora)
  d.setUTCHours(0, 0, 0, 0)
  return d.toISOString()
}

export async function tectoDiario(db: SupabaseClient, agenteId?: string): Promise<number> {
  // OS v2 (07/10): tecto dinâmico por agente (chão 40 sem dados, tecto duro 150, limitado pelo trabalho que existe).
  if (agenteId && (await lerConfigOs(db)).ligado) {
    const o = await orcamentoPipelineDb(db, agenteId)
    return o.valor
  }
  const { data } = await db.from('site_settings').select('value').eq('key', 'agentes_motor').maybeSingle()
  let v: unknown = data?.value
  if (typeof v === 'string') {
    try { v = JSON.parse(v) } catch { v = null }
  }
  const t = Number((v as { pipeline_tecto_dia?: unknown } | null)?.pipeline_tecto_dia)
  return Number.isInteger(t) && t > 0 && t <= 500 ? t : TECTO_DIA_PADRAO
}

export async function usadosHoje(db: SupabaseClient, agenteId: string): Promise<number | null> {
  const { count, error } = await db
    .from('vendas_agentes_accoes')
    .select('id', { count: 'exact', head: true })
    .eq('agente_id', agenteId)
    .eq('ok', true)
    .gte('criado_em', inicioDoDia())
  return error ? null : (count ?? 0)
}

export async function executarAccaoPipeline(
  db: SupabaseClient,
  agenteId: string,
  pedido: Record<string, unknown>,
  opcoes: { ensaio?: boolean } = {},
): Promise<{ ok: boolean; erro?: string; status: number; negocio_id?: string | null; tarefa_id?: string | null; aviso?: string; ensaio?: boolean }> {
  if (!ehUuid(agenteId)) return { ok: false, erro: 'agente_id inválido', status: 400 }
  const { data: ag } = await db.from('agentes_equipa').select('id, chave_receita, estado').eq('id', agenteId).maybeSingle()
  if (!ag) return { ok: false, erro: 'Agente inexistente.', status: 404 }
  const agente = ag as { id: string; chave_receita: string | null; estado: string }
  const codigo = String(agente.chave_receita ?? '')

  const ctx: ContextoPipeline = {
    agenteId,
    agenteCodigo: codigo,
    agenteEstado: agente.estado,
    usadosHoje: await usadosHoje(db, agenteId),
    tecto: await tectoDiario(db, agenteId),
  }

  let negocioLido: string | null = null
  let tarefaLida: string | null = null
  if (ehUuid(pedido.negocio_id)) {
    const { data } = await db.from('vendas_negocios').select(COLS_NEGOCIO).eq('id', pedido.negocio_id).maybeSingle()
    ctx.negocio = (data ?? null) as NegocioParaAgente | null
    if (ctx.negocio) negocioLido = ctx.negocio.id
  }
  if (ehUuid(pedido.tarefa_id)) {
    const { data } = await db.from('vendas_tarefas').select('id, estado, agente_id, responsavel_id, negocio_id').eq('id', pedido.tarefa_id).maybeSingle()
    ctx.tarefa = (data ?? null) as TarefaParaAgente | null
    if (ctx.tarefa) tarefaLida = ctx.tarefa.id
  }
  if (pedido.accao === 'passar_a_humano' && ehUuid(pedido.pessoa_id)) {
    const { data } = await db.from('backoffice_papeis').select('papel').eq('user_id', pedido.pessoa_id).is('retirado_at', null)
    ctx.papeisDaPessoa = ((data ?? []) as Array<{ papel: string }>).map((r) => r.papel)
  }
  if (pedido.accao === 'criar_lead') {
    const email = typeof pedido.email === 'string' ? pedido.email.trim().toLowerCase() : ''
    const tg = typeof pedido.telegram_username === 'string' ? pedido.telegram_username.trim().replace(/^@/, '') : ''
    const ig = typeof pedido.instagram_handle === 'string' ? pedido.instagram_handle.trim().replace(/^@/, '') : ''
    for (const [col, v] of [['email', email], ['telegram_username', tg], ['instagram_handle', ig]] as const) {
      if (!v || ctx.duplicadoDe) continue
      const { data } = await db.from('vendas_negocios').select('id').ilike(col, v).limit(1)
      if ((data ?? []).length > 0) ctx.duplicadoDe = String((data as Array<{ id: string }>)[0].id)
    }
  }

  const r = decidirAccaoPipeline(pedido, ctx)
  const registar = async (linha: Record<string, unknown>) => {
    if (opcoes.ensaio) return null
    const { error } = await db.from('vendas_agentes_accoes').insert(linha)
    return error?.message ?? null
  }

  if (!r.ok) {
    const e = await registar(linhaDoRegisto(pedido, ctx, r, { negocioId: negocioLido, tarefaId: tarefaLida }))
    return { ok: false, erro: r.erro, status: r.codigo, aviso: e ? `registo da recusa falhou: ${e}` : undefined }
  }
  if (opcoes.ensaio) return { ok: true, status: 200, ensaio: true, negocio_id: r.plano.negocioId, tarefa_id: r.plano.tarefaId }

  const p = r.plano
  let negocioId = p.negocioId
  let tarefaId = p.tarefaId

  if (p.negocioInsert) {
    const { data, error } = await db.from('vendas_negocios').insert(p.negocioInsert).select('id').single()
    if (error || !data) return { ok: false, erro: `Não gravou o lead: ${error?.message}`, status: 500 }
    negocioId = String((data as { id: string }).id)
  }

  if (p.negocioUpdate) {
    let q = db.from('vendas_negocios').update(p.negocioUpdate.campos).eq('id', p.negocioUpdate.id)
    // O humano ganha a corrida: se alguém pegou entretanto, nada é escrito.
    for (const c of COLUNAS_HUMANAS) q = q.is(c, null)
    q = p.accao === 'assumir' ? q.is('agente_id', null) : q.eq('agente_id', agenteId)
    const { data, error } = await q.select('id')
    if (error) return { ok: false, erro: error.message, status: 500 }
    if ((data ?? []).length !== 1) {
      const recusa = { ok: false as const, erro: 'O negócio mudou entretanto (uma pessoa ou outro agente pegou nele). Nada foi escrito.', codigo: 409 }
      await registar(linhaDoRegisto(pedido, ctx, recusa, { negocioId: negocioLido }))
      return { ok: false, erro: recusa.erro, status: 409 }
    }
  }

  if (p.tarefaInsert) {
    const { data, error } = await db.from('vendas_tarefas').insert(p.tarefaInsert).select('id').single()
    if (error || !data) return { ok: false, erro: `Não gravou a tarefa: ${error?.message}`, status: 500 }
    tarefaId = String((data as { id: string }).id)
  }
  if (p.tarefaInsertHumano) {
    const { data, error } = await db.from('vendas_tarefas').insert(p.tarefaInsertHumano).select('id').single()
    if (!error && data) tarefaId = String((data as { id: string }).id)
  }
  if (p.tarefaUpdate) {
    const { error } = await db
      .from('vendas_tarefas')
      .update(p.tarefaUpdate.campos)
      .eq('id', p.tarefaUpdate.id)
      .eq('agente_id', agenteId)
      .eq('estado', 'aberta')
    if (error) return { ok: false, erro: error.message, status: 500 }
  }
  let aviso: string | undefined
  if (p.evento && negocioId) {
    const { error } = await db.from('vendas_negocio_eventos').insert({ ...p.evento, negocio_id: negocioId })
    if (error) aviso = `histórico: ${error.message}`
  }
  const e = await registar(linhaDoRegisto(pedido, ctx, r, { negocioId, tarefaId }))
  if (e) aviso = `${aviso ? aviso + '; ' : ''}REGISTO FALHOU: ${e}`
  return { ok: true, status: 200, negocio_id: negocioId, tarefa_id: tarefaId, aviso }
}

/**
 * A PARTE DO PIPELINE QUE CABE A UM AGENTE — entra no retrato do motor antes de cada ciclo.
 */
export async function retratoPipeline(db: SupabaseClient, agenteId: string, opcoes: { diasParado?: number } = {}) {
  if (!ehUuid(agenteId)) return { ok: false, erro: 'agente_id inválido' }
  const { data: ag } = await db.from('agentes_equipa').select('id, chave_receita, estado').eq('id', agenteId).maybeSingle()
  const raiz = raizDeVendas((ag as { chave_receita?: string } | null)?.chave_receita)
  if (!ag || !raiz) return { ok: false, erro: 'Não é um agente de vendas.' }
  const diasParado = Math.max(1, Math.min(60, Number(opcoes.diasParado) || 3))
  const agora = new Date()
  const hoje = agora.toISOString().slice(0, 10)

  const [meus, bolsa, tarefas, tecto, usados, humanos] = await Promise.all([
    db.from('vendas_negocios').select(COLS_NEGOCIO).eq('agente_id', agenteId).not('estado', 'in', '(ganho,perdido)').order('atualizado_em', { ascending: true }).limit(60),
    (() => {
      let q = db.from('vendas_negocios').select('id, nome, estado, origem, pack_previsto, atualizado_em').is('agente_id', null).in('estado', [...ETAPAS_DO_AGENTE[raiz]])
      for (const c of COLUNAS_HUMANAS) q = q.is(c, null)
      return q.order('atualizado_em', { ascending: false }).limit(15)
    })(),
    db.from('vendas_tarefas').select('id, titulo, negocio_id, prazo, estado').eq('agente_id', agenteId).eq('estado', 'aberta').order('prazo', { ascending: true, nullsFirst: false }).limit(40),
    tectoDiario(db, agenteId),
    usadosHoje(db, agenteId),
    db.from('backoffice_papeis').select('user_id, papel').is('retirado_at', null).in('papel', ['prospector', 'setter', 'closer', 'team_leader']).limit(200),
  ])

  const lista = ((meus.data ?? []) as unknown as Array<NegocioParaAgente & { atualizado_em: string; origem: string | null; pack_previsto: string | null }>)
  const deHumanoAgora = lista.filter((n) => COLUNAS_HUMANAS.some((c) => n[c]))
  const resumo = (n: (typeof lista)[number]) => ({
    id: n.id, nome: n.nome, estado: n.estado, origem: n.origem, pack: n.pack_previsto, pontuacao: n.agente_pontuacao ?? null,
    dias_parado: diasDesde(n.atualizado_em, agora), de_humano: COLUNAS_HUMANAS.some((c) => n[c]),
  })
  const ts = (tarefas.data ?? []) as Array<{ id: string; titulo: string; negocio_id: string | null; prazo: string | null }>

  const idsHumanos = [...new Set(((humanos.data ?? []) as Array<{ user_id: string }>).map((h) => h.user_id))]
  const nomes: Record<string, string> = {}
  if (idsHumanos.length > 0) {
    const { data } = await db.from('profiles').select('id, full_name').in('id', idsHumanos)
    for (const p of (data ?? []) as Array<{ id: string; full_name: string | null }>) nomes[p.id] = p.full_name || '—'
  }
  const porPessoa = new Map<string, string[]>()
  for (const h of (humanos.data ?? []) as Array<{ user_id: string; papel: string }>) {
    porPessoa.set(h.user_id, [...(porPessoa.get(h.user_id) ?? []), h.papel])
  }

  return {
    ok: !meus.error && !tarefas.error,
    agente: raiz,
    dias_parado: diasParado,
    tecto_dia: tecto,
    usados_hoje: usados,
    meus_negocios: lista.filter((n) => !deHumanoAgora.includes(n)).map(resumo),
    parados: lista.filter((n) => (diasDesde(n.atualizado_em, agora) ?? 0) >= diasParado).map(resumo),
    agora_de_humano_so_notas: deHumanoAgora.map(resumo),
    bolsa_para_ti: (bolsa.data ?? []).map((n) => ({ ...(n as Record<string, unknown>), dias_parado: diasDesde((n as { atualizado_em: string }).atualizado_em, agora) })),
    tarefas_abertas: ts,
    tarefas_vencidas: ts.filter((t) => t.prazo && t.prazo < hoje),
    humanos_para_passagem: [...porPessoa.entries()].map(([id, papeis]) => ({ id, nome: nomes[id] ?? '—', papeis })),
    erros: [meus.error?.message, bolsa.error?.message, tarefas.error?.message].filter(Boolean),
  }
}

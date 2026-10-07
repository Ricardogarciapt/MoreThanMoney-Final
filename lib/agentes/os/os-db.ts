/**
 * OS v2 — a parte com base de dados. Tudo o que DECIDE está nos módulos puros ao lado
 * (objectivos, orcamento, proof-score, ciclo-vida, clonagem, ceo-economico) e é provado em
 * `os.check.ts`. Aqui só se LÊ, se monta e se ESCREVE o que eles mandaram.
 *
 * Nada aqui apaga: arquivar é mudar o ciclo/estado e gravar a ficha em agentes_arquivo (a base
 * recusa DELETE em agentes_equipa, agentes_arquivo e agentes_genealogia — migração 202).
 */
import { validarReescrita } from '../instrucoes-guarda'
import { pareceCodigoDeAgente } from '../atribuicao'
import { CHAO_SEGURO, lerObjectivos, type CanalContacto, type Objectivos } from './objectivos'
import {
  orcamentoB2B, orcamentoHistorias, orcamentoPipeline, orcamentoPosts, tectosContacto, type Orcamento, type Sinais, type TectosDinamicos,
} from './orcamento'
import { calcularProof, lerConfigProof, valorMarginal, type ConfigProof, type Familia, type Medidas, type Proof } from './proof-score'
import {
  CICLOS_QUE_TRABALHAM, ciclosDiaPedidos, estadoLegado, lerConfigCiclo, transicao, type Ciclo, type ConfigCiclo,
} from './ciclo-vida'
import { decidirNinhada, planearClonagem, type AgenteClonavel, type TipoVariacao } from './clonagem'
import { montarPnl, validarAccaoCeo, type AlvoAgente, type Pnl } from './ceo-economico'

type Db = { from: (t: string) => any }

export interface Quota {
  /** Ciclos/dia que a subscrição aguenta hoje (motor/regras.py `capacidade_ciclos`). */
  capacidade: number
  usadosHoje: number
  limiteBatido24h: boolean
}

export interface ConfigOs {
  ligado: boolean
  ciclo: ConfigCiclo
  proof: ConfigProof
  objectivos: Objectivos
}

export async function lerConfigOs(db: Db): Promise<ConfigOs> {
  const { data } = await db.from('site_settings').select('key, value').in('key', ['agentes_os_v2', 'agentes_proof', 'os_objectivos'])
  const m = new Map<string, unknown>(((data ?? []) as Array<{ key: string; value: unknown }>).map((r) => [r.key, r.value]))
  let os: Record<string, unknown> = {}
  try { os = (typeof m.get('agentes_os_v2') === 'string' ? JSON.parse(String(m.get('agentes_os_v2'))) : m.get('agentes_os_v2') ?? {}) as Record<string, unknown> } catch { os = {} }
  return {
    // Na dúvida, o caminho NOVO só corre com o interruptor explícito.
    ligado: os.ligado === true,
    ciclo: lerConfigCiclo(os),
    proof: lerConfigProof(m.get('agentes_proof')),
    objectivos: lerObjectivos(m.get('os_objectivos')),
  }
}

export function quotaSegura(q: Partial<Quota> | null | undefined): Quota {
  const cap = Number(q?.capacidade)
  return {
    capacidade: Number.isFinite(cap) && cap > 0 ? Math.floor(cap) : CHAO_SEGURO.claudeCiclosDia,
    usadosHoje: Math.max(0, Number(q?.usadosHoje) || 0),
    limiteBatido24h: q?.limiteBatido24h === true,
  }
}

/** Custo de oportunidade de um ciclo do claude -p, em €: subscrição mensal ÷ ciclos do mês. */
export function custoCicloEur(o: Objectivos, q: Quota): number {
  return Number((o.recursos.custoSubscricaoMensalEur / Math.max(1, q.capacidade * 30)).toFixed(4))
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// Medir
// ─────────────────────────────────────────────────────────────────────────────────────────────

export interface LinhaOs {
  id: string
  nome: string
  papel?: string | null
  pilar: string
  pai_id?: string | null
  estado: string
  pausado?: boolean | null
  instrucoes?: string | null
  orcamento?: number | string | null
  gasto?: number | string | null
  receita?: number | string | null
  chave_receita?: string | null
  criado_em: string
  ciclo: Ciclo
  ciclo_desde: string | null
  ciclo_meta: { tentativas?: number; reteste?: boolean } | null
  familia: string | null
  especializacao: string | null
  geracao: number | null
  dna: Record<string, unknown> | null
  efemero: boolean | null
  missao_id: string | null
  proof_score: number | string | null
  proof_banda: string | null
  proof_amostra_ok: boolean | null
  recursos_mult: number | string | null
  clonagem_validada_em: string | null
  dominante: boolean | null
  morto_em?: string | null
  causa_morte?: string | null
}

const COLUNAS =
  'id, nome, papel, pilar, pai_id, estado, pausado, instrucoes, orcamento, gasto, receita, chave_receita, criado_em, ' +
  'ciclo, ciclo_desde, ciclo_meta, familia, especializacao, geracao, dna, efemero, missao_id, proof_score, proof_banda, ' +
  'proof_amostra_ok, recursos_mult, clonagem_validada_em, dominante, morto_em, causa_morte'

const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0)
const eCeo = (a: Pick<LinhaOs, 'pilar' | 'pai_id'>) => a.pilar === 'ceo' && !String(a.pai_id ?? '').trim()
const dia = (iso: string) => String(iso).slice(0, 10)

export interface MedidaAgente extends Medidas {
  ciclos: number
  erros: number
  clientes: number
}

/**
 * Lê, numa janela, tudo o que mede valor por agente. Cada leitura que falhar fica em `erros` e
 * conta como «não medido» — e o ciclo de vida NÃO arquiva ninguém numa passagem com leituras em
 * falta (ver correrOs).
 */
export async function medir(db: Db, agentes: LinhaOs[], cfg: ConfigOs, quota: Quota, agora: Date): Promise<{ medidas: Map<string, MedidaAgente>; erros: string[] }> {
  const erros: string[] = []
  const janela = cfg.proof.janelaDias
  const desde = new Date(agora.getTime() - janela * 86_400_000).toISOString()
  const desde90 = new Date(agora.getTime() - 90 * 86_400_000).toISOString()
  const porCodigo = new Map(agentes.map((a) => [String(a.chave_receita ?? '').toUpperCase(), a.id]))
  const vd = cfg.proof.valorDiferido
  const custoCiclo = custoCicloEur(cfg.objectivos, quota)

  const ler = async (nome: string, q: Promise<{ data: unknown; error: { message?: string } | null }>) => {
    const r = await q
    if (r.error) { erros.push(`${nome}: ${r.error.message ?? 'erro'}`); return [] as Array<Record<string, unknown>> }
    return (r.data ?? []) as Array<Record<string, unknown>>
  }

  const [vendas, eventos, negEventos, accoes, b2bResp, b2bEnv, envios, posts] = await Promise.all([
    ler('vendas_vendas', db.from('vendas_vendas').select('agente_codigo, valor_cents, pago_em, comprador_id').is('estornada_em', null).gte('pago_em', desde90).not('agente_codigo', 'is', null)),
    ler('agentes_eventos', db.from('agentes_eventos').select('agente_id, tipo, valor, detalhe, criado_em').in('tipo', ['ciclo', 'gastou']).gte('criado_em', desde)),
    ler('vendas_negocio_eventos', db.from('vendas_negocio_eventos').select('agente_id, para, em').not('agente_id', 'is', null).in('para', ['qualificado', 'marcado', 'apresentado']).gte('em', desde)),
    ler('vendas_agentes_accoes', db.from('vendas_agentes_accoes').select('agente_id, accao, ok, criado_em').gte('criado_em', desde)),
    ler('b2b_prospectos', db.from('b2b_prospectos').select('agente, respondeu_em').gte('respondeu_em', desde)),
    ler('b2b_envios', db.from('b2b_envios').select('agente, decisao, erro, criado_em').eq('decisao', 'sai').gte('criado_em', desde)),
    ler('agentes_envios', db.from('agentes_envios').select('agente_id, enviado_em, erro').not('enviado_em', 'is', null).gte('enviado_em', desde)),
    ler('social_scheduled_posts', db.from('social_scheduled_posts').select('agente_codigo, status, updated_at').eq('status', 'published').not('agente_codigo', 'is', null).gte('updated_at', desde)),
  ])

  const medidas = new Map<string, MedidaAgente>()
  const diasValor = new Map<string, Set<string>>()
  const idDe = (codigo: unknown) => porCodigo.get(String(codigo ?? '').toUpperCase())
  for (const a of agentes) {
    const idade = (agora.getTime() - Date.parse(a.criado_em)) / 3_600_000
    medidas.set(a.id, {
      familia: (a.familia ?? (eCeo(a) ? 'CEO' : 'SALES')) as Familia,
      idadeHoras: Number.isFinite(idade) ? idade : 0,
      receitaEur: 0, vendas: 0, custoEur: 0, oportunidades: 0, convertidos: 0,
      diasComValor: 0, diasJanela: janela, retencao: null, diferidoEur: 0, ciclos: 0, erros: 0, clientes: 0,
    })
    diasValor.set(a.id, new Set())
  }
  const m = (id: string | undefined) => (id ? medidas.get(id) : undefined)
  const marcarDia = (id: string | undefined, iso: unknown) => { if (id && iso) diasValor.get(id)?.add(dia(String(iso))) }

  // Receita e retenção (a receita é SÓ a do código do agente: nunca a dos filhos).
  const compradores = new Map<string, Map<string, string[]>>()
  for (const v of vendas) {
    const id = idDe(v.agente_codigo)
    const x = m(id)
    if (!x || !id) continue
    const quando = String(v.pago_em)
    const comp = String(v.comprador_id ?? '')
    if (comp) {
      const porComp = compradores.get(id) ?? new Map<string, string[]>()
      porComp.set(comp, [...(porComp.get(comp) ?? []), quando])
      compradores.set(id, porComp)
    }
    if (quando < desde) continue
    x.receitaEur += num(v.valor_cents) / 100
    x.vendas += 1
    x.convertidos += 1
    marcarDia(id, quando)
  }
  for (const [id, porComp] of compradores) {
    const x = m(id)
    if (!x) continue
    x.clientes = porComp.size
    const limite = new Date(agora.getTime() - 35 * 86_400_000).toISOString()
    let elegiveis = 0
    let renovaram = 0
    for (const datas of porComp.values()) {
      const ord = [...datas].sort()
      if (ord[0]! > limite) continue
      elegiveis++
      if (ord.length > 1) renovaram++
    }
    x.retencao = elegiveis > 0 ? renovaram / elegiveis : null
  }
  // Custo (quota do claude -p como custo de oportunidade + gasto registado) e erro.
  for (const e of eventos) {
    const x = m(String(e.agente_id))
    if (!x) continue
    if (e.tipo === 'ciclo') {
      x.ciclos += 1
      x.custoEur += custoCiclo
      if (/SEM CONTRATO|session limit|erro/i.test(String(e.detalhe ?? '').slice(0, 200))) x.erros += 1
    } else x.custoEur += Math.abs(num(e.valor))
  }
  // Valor diferido medido.
  for (const e of negEventos) {
    const id = String(e.agente_id)
    const x = m(id)
    if (!x) continue
    const p = String(e.para) as 'qualificado' | 'marcado' | 'apresentado'
    x.diferidoEur += vd[p] ?? 0
    marcarDia(id, e.em)
  }
  for (const e of accoes) {
    const id = String(e.agente_id)
    const x = m(id)
    if (!x || e.ok !== true) continue
    if (e.accao === 'criar_lead') { x.diferidoEur += vd.lead; x.oportunidades += 1; marcarDia(id, e.criado_em) }
    if (e.accao === 'assumir') x.oportunidades += 1
  }
  for (const p of b2bResp) { const id = idDe(p.agente); const x = m(id); if (x) { x.diferidoEur += vd.resposta_b2b; marcarDia(id, p.respondeu_em) } }
  for (const e of b2bEnv) { const x = m(idDe(e.agente)); if (x) x.oportunidades += 1 }
  for (const e of envios) { const x = m(String(e.agente_id)); if (x) x.oportunidades += 1 }
  for (const p of posts) {
    const id = idDe(p.agente_codigo)
    const x = m(id)
    if (!x) continue
    x.diferidoEur += vd.post_publicado
    x.oportunidades += 1
    marcarDia(id, p.updated_at)
  }
  for (const [id, s] of diasValor) { const x = m(id); if (x) x.diasComValor = s.size }
  for (const x of medidas.values()) {
    x.receitaEur = Number(x.receitaEur.toFixed(2))
    x.custoEur = Number(x.custoEur.toFixed(2))
    x.diferidoEur = Number(x.diferidoEur.toFixed(2))
  }
  return { medidas, erros }
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// A passagem do OS: medir → proof → ciclo de vida → competição → clonagem → memória
// ─────────────────────────────────────────────────────────────────────────────────────────────

export interface ResultadoOs {
  ok: boolean
  ensaio: boolean
  ligado: boolean
  transicoes: Array<{ nome: string; de: Ciclo; para: Ciclo; porque: string }>
  proofs: Array<{ nome: string; score: number; banda: string; amostraOk: boolean; valorMarginal: number }>
  arquivados: string[]
  dominantes: string[]
  clonagem: { nascidos: string[]; esperam: Array<{ nome: string; porque: string }>; capacidade: unknown }
  erros: string[]
}

export function fichaDoArquivo(a: LinhaOs, x: MedidaAgente | undefined, descendentes: Array<{ geracao: number; proof: number | null }>) {
  const melhor = [...descendentes].sort((p, q) => (q.proof ?? -1) - (p.proof ?? -1))[0]
  const custo = x?.custoEur ?? 0
  return {
    receita_total: num(a.receita),
    receita_janela: x?.receitaEur ?? 0,
    clones: descendentes.filter((d) => d.geracao === Number(a.geracao ?? 0) + 1).length,
    descendentes: descendentes.length,
    melhor_geracao: melhor ? melhor.geracao : null,
    roi_medio: custo > 0 ? Number((((x?.receitaEur ?? 0) - custo) / custo).toFixed(3)) : null,
    proof_final: a.proof_score == null ? null : num(a.proof_score),
    familia: a.familia,
    geracao: a.geracao,
  }
}

export async function correrOs(
  db: Db,
  opcoes: { ensaio?: boolean; agora?: Date; quota?: Partial<Quota> | null; clonar?: boolean } = {},
): Promise<ResultadoOs> {
  const ensaio = opcoes.ensaio === true
  const agora = opcoes.agora ?? new Date()
  const quota = quotaSegura(opcoes.quota)
  const cfg = await lerConfigOs(db)
  const res: ResultadoOs = { ok: true, ensaio, ligado: cfg.ligado, transicoes: [], proofs: [], arquivados: [], dominantes: [], clonagem: { nascidos: [], esperam: [], capacidade: null }, erros: [] }

  const { data: linhas, error } = await db.from('agentes_equipa').select(COLUNAS)
  if (error) return { ...res, ok: false, erros: [`agentes_equipa: ${error.message}`] }
  const agentes = (linhas ?? []) as LinhaOs[]
  const { medidas, erros: errosMedir } = await medir(db, agentes, cfg, quota, agora)
  res.erros.push(...errosMedir)
  const leituraCompleta = errosMedir.length === 0

  const { data: missoes } = await db.from('os_missoes').select('id, estado, prazo')
  const missaoAberta = new Map<string, boolean>(((missoes ?? []) as Array<{ id: string; estado: string; prazo: string | null }>).map((x) => [
    x.id, x.estado === 'aberta' && !(x.prazo && Date.parse(x.prazo) < agora.getTime()),
  ]))
  // Missões que passaram o prazo fecham-se (os workers passam a IDLE pela transição).
  for (const x of (missoes ?? []) as Array<{ id: string; estado: string; prazo: string | null }>) {
    if (x.estado === 'aberta' && x.prazo && Date.parse(x.prazo) < agora.getTime() && !ensaio) {
      await db.from('os_missoes').update({ estado: 'concluida', fechada_em: agora.toISOString() }).eq('id', x.id)
    }
  }

  const { data: gen } = await db.from('agentes_genealogia').select('pai_id, filho_id, ninhada_id, geracao, variacao, variacao_texto, decidida_em, criado_em')
  const genealogia = (gen ?? []) as Array<{ pai_id: string; filho_id: string; ninhada_id: string; geracao: number; variacao: string; variacao_texto: string | null; decidida_em: string | null; criado_em: string }>

  // 1. Proof + transição de cada agente.
  const proofs = new Map<string, Proof & { vm: number }>()
  for (const a of agentes) {
    const x = medidas.get(a.id)!
    const p = calcularProof(x, cfg.proof)
    const vm = valorMarginal(x, cfg.proof)
    proofs.set(a.id, { ...p, vm })
    res.proofs.push({ nome: a.nome, score: p.score, banda: p.banda, amostraOk: p.amostraOk, valorMarginal: vm })

    const t = transicao({
      ciclo: a.ciclo, cicloDesde: a.ciclo_desde, meta: a.ciclo_meta ?? {}, ceo: eCeo(a),
      pausadoPeloDono: a.pausado === true || a.estado === 'parado' || (a.estado === 'pausado' && a.ciclo !== 'IDLE'),
      idadeHoras: x.idadeHoras, efemero: a.efemero === true,
      missaoAberta: a.missao_id ? (missaoAberta.get(a.missao_id) ?? false) : null,
      valorMarginal: vm, banda: p.banda, amostraOk: p.amostraOk,
      escalarValidado: !!a.clonagem_validada_em,
    }, agora, cfg.ciclo)

    // Com leituras em falta não se arquiva ninguém nesta passagem (valor não lido ≠ valor zero).
    if (t.para === 'ARCHIVED' && !leituraCompleta) {
      res.erros.push(`${a.nome}: arquivo adiado — leituras em falta (${errosMedir.join('; ').slice(0, 160)})`)
      continue
    }
    if (ensaio) {
      if (t.muda) res.transicoes.push({ nome: a.nome, de: a.ciclo, para: t.para, porque: t.porque })
      continue
    }

    const mud: Record<string, unknown> = {
      proof_score: p.score, proof_banda: p.banda, proof_amostra_ok: p.amostraOk, proof_em: agora.toISOString(),
      ciclo_meta: { ...(a.ciclo_meta ?? {}), tentativas: t.meta.tentativas, reteste: t.meta.reteste }, atualizado_em: agora.toISOString(),
    }
    if (t.muda) {
      if (t.para === 'ARCHIVED') {
        const desc = genealogia.filter((g) => g.pai_id === a.id).map((g) => ({ geracao: g.geracao, proof: proofs.get(g.filho_id)?.score ?? null }))
        const { data: evs } = await db.from('agentes_eventos').select('tipo, valor, detalhe, criado_em').eq('agente_id', a.id).order('criado_em', { ascending: true }).limit(5000)
        const { error: eArq } = await db.from('agentes_arquivo').insert({
          agente_id: a.id, nome: a.nome, codigo: a.chave_receita ?? null, pai_id: a.pai_id ?? null, pilar: a.pilar,
          nasceu_em: a.criado_em, morto_em: agora.toISOString(), causa_morte: t.porque,
          receita_total: num(a.receita), gasto_total: num(a.gasto), orcamento: num(a.orcamento), instrucoes: a.instrucoes ?? null,
          linha: a as unknown as Record<string, unknown>, eventos: evs ?? [], tipo: 'arquivo', ficha: fichaDoArquivo(a, x, desc),
        })
        if (eArq) { res.erros.push(`${a.nome}: ficha não gravada (${eArq.message}) — NÃO arquivado`); continue }
        mud.arquivado_em = agora.toISOString()
        mud.arquivado_porque = t.porque
        res.arquivados.push(a.nome)
      }
      mud.ciclo = t.para
      mud.ciclo_desde = agora.toISOString()
      // O estado antigo segue o ciclo, excepto onde o dono mandou (pausado/parado ficam).
      if (!(a.estado === 'parado' || a.pausado === true) && a.estado !== 'morto') mud.estado = estadoLegado(t.para)
      if (t.para === 'SCALING' || t.para === 'ACTIVE') mud.clonagem_validada_em = t.para === 'ACTIVE' ? null : a.clonagem_validada_em
      res.transicoes.push({ nome: a.nome, de: a.ciclo, para: t.para, porque: t.porque })
    }
    const { error: eUp } = await db.from('agentes_equipa').update(mud).eq('id', a.id)
    if (eUp) { res.erros.push(`${a.nome}: não gravado (${eUp.message})`); continue }
    if (t.muda) {
      await db.from('agentes_eventos').insert({ agente_id: a.id, tipo: t.para === 'ARCHIVED' ? 'arquivado' : 'ciclo_estado', valor: vm, detalhe: `${a.ciclo} → ${t.para}: ${t.porque}`.slice(0, 4000) })
      a.ciclo = t.para
    }

    // Memória económica.
    const conv = x.oportunidades > 0 ? x.convertidos / x.oportunidades : null
    const hist = { em: agora.toISOString(), ciclo: a.ciclo, proof: p.score, banda: p.banda, vm, receita: x.receitaEur, custo: x.custoEur }
    const { data: memAnt } = await db.from('agentes_memoria').select('historico').eq('agente_id', a.id).maybeSingle()
    const historico = [...(((memAnt as { historico?: unknown[] } | null)?.historico ?? []) as unknown[]), hist].slice(-60)
    await db.from('agentes_memoria').upsert({
      agente_id: a.id,
      missao: String((a.dna ?? {}).missao ?? a.papel ?? ''),
      competencias: [a.familia, a.especializacao].filter(Boolean),
      canais: Array.isArray((a.dna ?? {}).canais) ? ((a.dna ?? {}).canais as string[]) : [],
      janela_dias: cfg.proof.janelaDias,
      custo_eur: x.custoEur, receita_eur: x.receitaEur, margem_eur: Number((x.receitaEur - x.custoEur).toFixed(2)),
      diferido_eur: x.diferidoEur, valor_marginal_eur: vm, vendas: x.vendas, oportunidades: x.oportunidades,
      conversao: conv, cac_eur: x.clientes > 0 ? Number((x.custoEur / x.clientes).toFixed(2)) : null,
      ltv_eur: x.clientes > 0 ? Number((x.receitaEur / x.clientes).toFixed(2)) : null,
      taxa_resposta: null, taxa_erro: x.ciclos > 0 ? Number((x.erros / x.ciclos).toFixed(3)) : null,
      confianca: Number(Math.min(1, (x.vendas + x.oportunidades / 10) / 10).toFixed(2)),
      historico,
      politicas: { recursos_mult: num(a.recursos_mult) || 1, ciclos_dia_pedidos: ciclosDiaPedidos(a.ciclo, num(a.recursos_mult) || 1, eCeo(a)) },
      atualizado_em: agora.toISOString(),
    })
  }

  // 2. Competição: ninhadas cuja janela de prova acabou → DNA dominante.
  const ninhadas = new Map<string, typeof genealogia>()
  for (const g of genealogia) if (!g.decidida_em) ninhadas.set(g.ninhada_id, [...(ninhadas.get(g.ninhada_id) ?? []), g])
  for (const [nid, gs] of ninhadas) {
    const nasceu = Date.parse(gs[0]!.criado_em)
    if (agora.getTime() - nasceu < cfg.proof.janelaDias * 86_400_000) continue
    const paiId = gs[0]!.pai_id
    const d = decidirNinhada(
      { id: paiId, proof: proofs.get(paiId)?.score ?? 0 },
      gs.map((g) => ({ id: g.filho_id, nome: agentes.find((a) => a.id === g.filho_id)?.nome ?? g.filho_id, proof: proofs.get(g.filho_id)?.score ?? 0, amostraOk: proofs.get(g.filho_id)?.amostraOk ?? false, variacao: g.variacao })),
    )
    if (ensaio) { if (d.dominanteId) res.dominantes.push(d.porque); continue }
    await db.from('agentes_genealogia').update({ decidida_em: agora.toISOString(), decisao: d.porque }).eq('ninhada_id', nid)
    if (d.dominanteId) {
      await db.from('agentes_genealogia').update({ dominante: true }).eq('filho_id', d.dominanteId)
      await db.from('agentes_equipa').update({ dominante: true }).eq('id', d.dominanteId)
      await db.from('agentes_eventos').insert({ agente_id: d.dominanteId, tipo: 'dominante', detalhe: d.porque })
      res.dominantes.push(d.porque)
    }
  }

  // 3. Clonagem pela quota.
  const filhosDe = (id: string) => agentes.filter((a) => a.pai_id === id)
  const { data: muts } = await db.from('agentes_instrucoes_versoes').select('id, agente_id, mutacao, mutacao_angulo').eq('estado', 'mutacao_proposta').order('criado_em', { ascending: false }).limit(200)
  const mutDe = new Map<string, AgenteClonavel['mutacaoProposta']>()
  for (const mm of (muts ?? []) as Array<{ id: string; agente_id: string; mutacao: string | null; mutacao_angulo: string | null }>) {
    if (mutDe.has(mm.agente_id) || !mm.mutacao) continue
    const tipo = (['hook', 'cta', 'publico', 'oferta', 'canal'] as const).find((x) => x === mm.mutacao_angulo) ?? 'canal'
    mutDe.set(mm.agente_id, { tipo, texto: mm.mutacao, id: mm.id })
  }
  const clonaveis: AgenteClonavel[] = agentes.map((a) => {
    const p = proofs.get(a.id)!
    const ninhadaEmProva = genealogia.some((g) => g.pai_id === a.id && !g.decidida_em)
    return {
      id: a.id, nome: a.nome, codigo: String(a.chave_receita ?? ''), ciclo: a.ciclo, ceo: eCeo(a), geracao: Number(a.geracao ?? 0),
      familia: String(a.familia ?? 'SALES'), especializacao: a.especializacao, instrucoes: String(a.instrucoes ?? ''),
      proof: p.score, banda: p.banda, amostraOk: p.amostraOk, recursosMult: num(a.recursos_mult) || 1,
      clonagemValidada: !!a.clonagem_validada_em, mutacaoProposta: mutDe.get(a.id) ?? null, ninhadaEmProva,
      variacoesUsadas: filhosDe(a.id).map((f) => String(f.instrucoes ?? '')), filhos: filhosDe(a.id).length,
      codigosUsados: agentes.map((x) => String(x.chave_receita ?? '')),
    }
  })
  const plano = planearClonagem({
    agentes: clonaveis, config: cfg.proof, capacidadeCiclosDia: quota.limiteBatido24h ? Math.min(quota.capacidade, quota.usadosHoje) : quota.capacidade,
    pareceCodigo: pareceCodigoDeAgente,
    validarInstrucoes: (antes, depois) => { const v = validarReescrita({ antes, depois }); return { aceita: v.aceita, texto: v.texto, motivo: v.motivo } },
    agora,
  })
  res.clonagem.esperam = plano.esperam
  res.clonagem.capacidade = plano.capacidade
  // O CLONER é o motor (sabe a quota). O cron mede e transita, mas não clona: duas passagens
  // seguidas não podem fazer nascer a mesma ninhada duas vezes.
  if (opcoes.clonar === false) {
    res.clonagem.esperam = [{ nome: '—', porque: 'Passagem sem clonagem (cron): o cloner é o motor, que conhece a quota.' }]
  } else if (!ensaio) {
    for (const n of plano.ninhadas) {
      const ninhadaId = crypto.randomUUID()
      const pai = agentes.find((a) => a.id === n.paiId)!
      for (const c of n.clones) {
        const { data: novo, error: eNovo } = await db.from('agentes_equipa').insert({
          nome: c.nome, papel: pai.papel ?? `Clone de ${pai.nome}`, pilar: pai.pilar, pai_id: pai.id, estado: 'vivo',
          instrucoes: c.instrucoes, orcamento: 5, chave_receita: c.codigo,
          mutacao: c.variacaoTexto, mutacao_origem: c.origemVariacao === 'pai' ? 'pai' : c.origemVariacao === 'catalogo' ? 'catalogo' : null,
          ciclo: 'PROVING', ciclo_desde: agora.toISOString(), familia: c.familia, especializacao: c.especializacao, geracao: c.geracao,
          dna: { ...(pai.dna ?? {}), pai: pai.chave_receita, geracao: c.geracao, variacao: c.variacao, variacao_texto: c.variacaoTexto, tracking: c.codigo },
        }).select('id').single()
        if (eNovo || !novo) { res.erros.push(`${c.nome}: não nasceu (${eNovo?.message ?? 'sem id'})`); continue }
        const filhoId = String((novo as { id: string }).id)
        res.clonagem.nascidos.push(c.nome)
        const { error: eCup } = await db.from('coupons').insert({
          code: c.codigo, type: 'atribuicao', discount_value: 0, is_active: true, max_uses: null,
          description: `Atribuição — ${c.nome} (clone de ${pai.nome}, geração ${c.geracao}). Não dá desconto.`,
        })
        if (eCup) res.erros.push(`${c.nome}: cupão ${c.codigo} não criado (${eCup.message})`)
        await db.from('agentes_genealogia').insert({
          pai_id: pai.id, filho_id: filhoId, ninhada_id: ninhadaId, geracao: c.geracao,
          variacao: c.variacao as TipoVariacao, variacao_texto: c.variacaoTexto, origem_variacao: c.origemVariacao, proof_pai: n.proof,
        })
        await db.from('agentes_eventos').insert([
          { agente_id: filhoId, tipo: 'nasceu', valor: 5, detalhe: `Clone G${c.geracao} de ${pai.nome} (proof ${n.proof}, ${n.banda}); variação ${c.variacao}${c.variacaoTexto ? ': ' + c.variacaoTexto : ''}. Código ${c.codigo}.` },
          { agente_id: pai.id, tipo: 'clonou', valor: n.proof, detalhe: `Nasceu ${c.nome} (${c.codigo}, variação ${c.variacao}).` },
        ])
        await db.from('agentes_instrucoes_versoes').insert({
          agente_id: filhoId, autor: 'reproducao', instrucoes_antes: null, instrucoes_depois: c.instrucoes,
          porque: `Clonagem (OS v2): ${pai.nome} proof ${n.proof} (${n.banda}).`, aceita: true,
          veredicto: 'Instruções do pai + variação, validadas pela guarda.', estado: 'activa', mutacao: c.variacaoTexto, mutacao_angulo: null,
        })
        if (c.propostaId) await db.from('agentes_instrucoes_versoes').update({ estado: 'mutacao_usada' }).eq('id', c.propostaId)
      }
      await db.from('agentes_equipa').update({ clonagem_validada_em: null }).eq('id', n.paiId)
    }
  } else {
    res.clonagem.nascidos = plano.ninhadas.flatMap((n) => n.clones.map((c) => `${c.nome} (ensaio)`))
  }

  res.ok = res.erros.length === 0
  return res
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// P&L do CEO
// ─────────────────────────────────────────────────────────────────────────────────────────────

export async function pnl(db: Db, quotaIn?: Partial<Quota> | null, agora: Date = new Date()): Promise<{ ok: boolean; pnl?: Pnl; erros: string[] }> {
  const quota = quotaSegura(quotaIn)
  const cfg = await lerConfigOs(db)
  const d7 = new Date(agora.getTime() - 7 * 86_400_000).toISOString()
  const d30 = new Date(agora.getTime() - 30 * 86_400_000).toISOString()
  const erros: string[] = []
  const ler = async (nome: string, q: Promise<{ data: unknown; error: { message?: string } | null; count?: number | null }>) => {
    const r = await q
    if (r.error) erros.push(`${nome}: ${r.error.message}`)
    return r
  }
  const [vendas, ciclos, leads, funil, envios, b2bEnv, b2bResp, ags] = await Promise.all([
    ler('vendas', db.from('vendas_vendas').select('valor_cents, pago_em, agente_codigo, comprador_id').is('estornada_em', null).gte('pago_em', d30)),
    ler('ciclos', db.from('agentes_eventos').select('id', { count: 'exact', head: true }).eq('tipo', 'ciclo').gte('criado_em', d7)),
    ler('leads', db.from('vendas_negocios').select('id', { count: 'exact', head: true }).gte('criado_em', d7)),
    ler('funil', db.from('vendas_negocios').select('estado').not('estado', 'in', '(ganho,perdido)')),
    ler('envios', db.from('agentes_envios').select('id', { count: 'exact', head: true }).not('enviado_em', 'is', null).gte('enviado_em', d7)),
    ler('b2b_envios', db.from('b2b_envios').select('id', { count: 'exact', head: true }).eq('decisao', 'sai').gte('criado_em', d7)),
    ler('b2b_resp', db.from('b2b_prospectos').select('id', { count: 'exact', head: true }).gte('respondeu_em', d7)),
    ler('agentes', db.from('agentes_equipa').select('chave_receita, ciclo, proof_score, proof_banda, familia')),
  ])
  const vs = ((vendas.data ?? []) as Array<{ valor_cents: number; pago_em: string; agente_codigo: string | null; comprador_id: string | null }>)
  const v7 = vs.filter((v) => v.pago_em >= d7)
  const f: Record<string, number> = {}
  for (const r of (funil.data ?? []) as Array<{ estado: string }>) f[r.estado] = (f[r.estado] ?? 0) + 1
  const { data: mem } = await db.from('agentes_memoria').select('agente_id, valor_marginal_eur')
  const vmPor = new Map(((mem ?? []) as Array<{ agente_id: string; valor_marginal_eur: number }>).map((x) => [x.agente_id, num(x.valor_marginal_eur)]))
  const hoje = agora
  const diasNoMes = new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth() + 1, 0)).getUTCDate()
  const p = montarPnl({
    receita7dEur: v7.reduce((s, v) => s + num(v.valor_cents) / 100, 0),
    receita30dEur: vs.reduce((s, v) => s + num(v.valor_cents) / 100, 0),
    receitaAtribuida7dEur: v7.filter((v) => v.agente_codigo).reduce((s, v) => s + num(v.valor_cents) / 100, 0),
    vendas7d: v7.length,
    clientesNovos7d: new Set(v7.map((v) => v.comprador_id).filter(Boolean)).size,
    ciclos7d: num(ciclos.count),
    custoCicloEur: custoCicloEur(cfg.objectivos, quota),
    gastoPago7dEur: 0,
    leads7d: num(leads.count),
    funil: f,
    envios7d: num(envios.count) + num(b2bEnv.count),
    respostas7d: num(b2bResp.count),
    errosCiclo7d: 0,
    objectivoMensalEur: cfg.objectivos.receitaMensalEur,
    diaDoMes: hoje.getUTCDate(),
    diasNoMes,
    agentes: ((ags.data ?? []) as Array<{ chave_receita: string; ciclo: string; proof_score: number | null; proof_banda: string | null; familia: string | null }>).map((a) => ({
      codigo: a.chave_receita, ciclo: a.ciclo, proof: a.proof_score == null ? null : num(a.proof_score), banda: a.proof_banda,
      valorMarginal: vmPor.get(a.chave_receita) ?? 0, familia: a.familia,
    })),
    quota,
  })
  return { ok: erros.length === 0, pnl: p, erros }
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// Acções do CEO e pedidos de clonagem
// ─────────────────────────────────────────────────────────────────────────────────────────────

async function alvoPorCodigo(db: Db, codigo: unknown): Promise<(AlvoAgente & { linha: LinhaOs }) | null> {
  const c = String(codigo ?? '').trim().toUpperCase()
  if (!c) return null
  const { data } = await db.from('agentes_equipa').select(COLUNAS).eq('chave_receita', c).maybeSingle()
  if (!data) return null
  const a = data as LinhaOs
  return { id: a.id, codigo: c, ceo: eCeo(a), ciclo: a.ciclo, proof: a.proof_score == null ? null : num(a.proof_score), banda: a.proof_banda, amostraOk: a.proof_amostra_ok === true, linha: a }
}

export async function executarAccaoCeo(
  db: Db,
  ceoId: string,
  accao: string,
  p: Record<string, unknown>,
  opcoes: { ensaio?: boolean; quota?: Partial<Quota> | null; agora?: Date } = {},
): Promise<{ ok: boolean; motivo: string; efeito?: Record<string, unknown>; status: number }> {
  const agora = opcoes.agora ?? new Date()
  const ensaio = opcoes.ensaio === true
  const quota = quotaSegura(opcoes.quota)
  const { data: ceo } = await db.from('agentes_equipa').select('id, pilar, pai_id').eq('id', ceoId).maybeSingle()
  if (!ceo || !eCeo(ceo as LinhaOs)) return { ok: false, motivo: 'Só o CEO (topo) usa o catálogo do CEO.', status: 403 }

  const alvo = await alvoPorCodigo(db, p.agente_codigo)
  const { data: pop } = await db.from('agentes_equipa').select('ciclo, recursos_mult, pilar, pai_id')
  const procura = ((pop ?? []) as Array<{ ciclo: Ciclo; recursos_mult: number; pilar: string; pai_id: string | null }>)
    .filter((a) => CICLOS_QUE_TRABALHAM.includes(a.ciclo))
    .reduce((s, a) => s + ciclosDiaPedidos(a.ciclo, num(a.recursos_mult) || 1, eCeo(a)), 0)
  let missaoAberta = false
  if (accao === 'fechar_missao' && p.missao_id) {
    const { data: ms } = await db.from('os_missoes').select('estado').eq('id', String(p.missao_id)).maybeSingle()
    missaoAberta = (ms as { estado?: string } | null)?.estado === 'aberta'
  }
  const d = validarAccaoCeo(accao, p, {
    alvo, capacidadeLivreCiclosDia: quota.capacidade - procura, ciclosPorWorkerDia: ciclosDiaPedidos('ACTIVE', 1, false), missaoAberta,
  })
  const registar = async (detalhe: string) => {
    if (!ensaio) await db.from('agentes_eventos').insert({ agente_id: ceoId, tipo: 'ceo_accao', detalhe: `${accao}: ${detalhe}`.slice(0, 4000) })
  }
  if (!d.ok) { await registar(`RECUSADA — ${d.motivo}`); return { ok: false, motivo: d.motivo, status: 400 } }
  if (ensaio) return { ok: true, motivo: d.motivo, efeito: d.efeito, status: 200 }

  if (accao === 'alocar_recursos' && alvo) {
    await db.from('agentes_equipa').update({ recursos_mult: d.efeito!.recursos_mult }).eq('id', alvo.id)
    await db.from('agentes_eventos').insert({ agente_id: alvo.id, tipo: 'recursos', valor: Number(d.efeito!.recursos_mult), detalhe: `CEO: ${String(p.porque ?? '')}`.slice(0, 2000) })
  } else if (accao === 'escalar' && alvo) {
    const upd: Record<string, unknown> = { clonagem_validada_em: agora.toISOString() }
    if (d.efeito!.modo === 'recursos') upd.recursos_mult = Math.min(3, (num(alvo.linha.recursos_mult) || 1) * 1.5)
    await db.from('agentes_equipa').update(upd).eq('id', alvo.id)
    await db.from('agentes_eventos').insert({ agente_id: alvo.id, tipo: 'clonagem_validada', valor: alvo.proof, detalhe: `CEO validou (${d.efeito!.modo}): ${String(p.porque ?? '')}`.slice(0, 2000) })
  } else if ((accao === 'suspender' || accao === 'retomar') && alvo) {
    await db.from('agentes_equipa').update({ ciclo: d.efeito!.ciclo, ciclo_desde: agora.toISOString(), estado: estadoLegado(d.efeito!.ciclo as Ciclo) }).eq('id', alvo.id)
    await db.from('agentes_eventos').insert({ agente_id: alvo.id, tipo: 'ciclo_estado', detalhe: `CEO ${accao}: ${String(p.porque ?? '')}`.slice(0, 2000) })
  } else if (accao === 'arquivar' && alvo) {
    const a = alvo.linha
    const { data: evs } = await db.from('agentes_eventos').select('tipo, valor, detalhe, criado_em').eq('agente_id', a.id).order('criado_em', { ascending: true }).limit(5000)
    const porque = `Arquivado pelo CEO: ${String(p.porque)}`
    const { error: eArq } = await db.from('agentes_arquivo').insert({
      agente_id: a.id, nome: a.nome, codigo: a.chave_receita ?? null, pai_id: a.pai_id ?? null, pilar: a.pilar, nasceu_em: a.criado_em,
      morto_em: agora.toISOString(), causa_morte: porque, receita_total: num(a.receita), gasto_total: num(a.gasto), orcamento: num(a.orcamento),
      instrucoes: a.instrucoes ?? null, linha: a as unknown as Record<string, unknown>, eventos: evs ?? [], tipo: 'arquivo', ficha: fichaDoArquivo(a, undefined, []),
    })
    if (eArq) return { ok: false, motivo: `Ficha não gravada (${eArq.message}) — não arquivado.`, status: 500 }
    await db.from('agentes_equipa').update({ ciclo: 'ARCHIVED', ciclo_desde: agora.toISOString(), estado: 'arquivado', arquivado_em: agora.toISOString(), arquivado_porque: porque }).eq('id', a.id)
    await db.from('agentes_eventos').insert({ agente_id: a.id, tipo: 'arquivado', detalhe: porque.slice(0, 2000) })
  } else if (accao === 'fechar_missao') {
    await db.from('os_missoes').update({ estado: 'concluida', fechada_em: agora.toISOString(), resultado: { porque: p.porque ?? null } }).eq('id', String(p.missao_id))
  } else if (accao === 'criar_missao') {
    const base = await alvoPorCodigo(db, p.base_codigo)
    const aprovados = Number(d.efeito!.workers_aprovados)
    const prazoH = Math.min(24 * 14, Math.max(6, Number(p.prazo_horas) || 72))
    const { data: m, error: eM } = await db.from('os_missoes').insert({
      titulo: String(p.titulo).slice(0, 200), objectivo: String(p.objectivo ?? '').slice(0, 2000), kpi: String(p.kpi).slice(0, 500),
      familia: base?.linha.familia ?? null, especializacao: base?.linha.especializacao ?? null, base_agente_id: base?.id ?? null,
      workers_pedidos: d.efeito!.workers_pedidos, workers_aprovados: aprovados, prazo: new Date(agora.getTime() + prazoH * 3_600_000).toISOString(),
      porque: String(p.porque ?? '').slice(0, 2000),
    }).select('id').single()
    if (eM || !m) return { ok: false, motivo: `Missão não criada (${eM?.message}).`, status: 500 }
    const missaoId = String((m as { id: string }).id)
    const nascidos: string[] = []
    if (base && !base.ceo && aprovados > 0) {
      const { data: todos } = await db.from('agentes_equipa').select('chave_receita')
      const usados = new Set(((todos ?? []) as Array<{ chave_receita: string }>).map((x) => String(x.chave_receita ?? '').toUpperCase()))
      const raiz = String(base.codigo).replace(/^AG-/, '')
      let k = 0
      for (let i = 0; i < aprovados; i++) {
        let codigo = `AG-${raiz}-W${++k}`
        while (usados.has(codigo)) codigo = `AG-${raiz}-W${++k}`
        if (!pareceCodigoDeAgente(codigo)) break
        const instr = `${String(base.linha.instrucoes ?? '').trim()}\n\nWORKER EFÉMERO da missão «${String(p.titulo)}» (KPI: ${String(p.kpi)}). Acabada a missão ficas IDLE e depois arquivado. O TEU CÓDIGO é ${codigo}: põe-no em todos os links (?ag=${codigo}).`
        const g = validarReescrita({ antes: base.linha.instrucoes ?? '', depois: instr })
        if (!g.aceita) break
        usados.add(codigo)
        const { data: w } = await db.from('agentes_equipa').insert({
          nome: `${base.linha.nome} · W${k}`, papel: `Worker: ${String(p.titulo).slice(0, 80)}`, pilar: base.linha.pilar, pai_id: base.id, estado: 'vivo',
          instrucoes: g.texto, orcamento: 0, chave_receita: codigo, ciclo: 'ACTIVE', ciclo_desde: agora.toISOString(),
          familia: base.linha.familia, especializacao: base.linha.especializacao, geracao: Number(base.linha.geracao ?? 0) + 1,
          dna: { ...(base.linha.dna ?? {}), missao: String(p.titulo), worker: true, tracking: codigo }, efemero: true, missao_id: missaoId,
        }).select('id').single()
        if (!w) break
        const wid = String((w as { id: string }).id)
        nascidos.push(codigo)
        await db.from('coupons').insert({ code: codigo, type: 'atribuicao', discount_value: 0, is_active: true, max_uses: null, description: `Atribuição — worker ${codigo} (missão ${String(p.titulo).slice(0, 60)}). Não dá desconto.` })
        await db.from('agentes_genealogia').insert({ pai_id: base.id, filho_id: wid, ninhada_id: missaoId, geracao: Number(base.linha.geracao ?? 0) + 1, variacao: 'missao', variacao_texto: String(p.titulo), origem_variacao: 'ceo', proof_pai: base.proof, decidida_em: agora.toISOString(), decisao: 'worker de missão (não compete)' })
        await db.from('agentes_eventos').insert({ agente_id: wid, tipo: 'worker', detalhe: `Worker da missão «${String(p.titulo)}» (KPI ${String(p.kpi)}).` })
      }
    }
    await registar(`missão ${missaoId}: ${d.motivo} Nasceram ${nascidos.join(', ') || 'nenhum'}.`)
    return { ok: true, motivo: d.motivo, efeito: { ...d.efeito, missao_id: missaoId, workers: nascidos }, status: 200 }
  }
  await registar(d.motivo)
  return { ok: true, motivo: d.motivo, efeito: d.efeito, status: 200 }
}

/** REQUEST_CLONING: o agente pede, com evidência. O CEO valida pela acção «escalar». */
export async function pedirClonagem(db: Db, agenteId: string, evidencia: string, ensaio = false): Promise<{ ok: boolean; motivo: string }> {
  const { data } = await db.from('agentes_equipa').select('id, nome, ciclo, proof_score, proof_amostra_ok, pilar, pai_id').eq('id', agenteId).maybeSingle()
  if (!data) return { ok: false, motivo: 'Agente inexistente.' }
  const a = data as { nome: string; ciclo: Ciclo; proof_score: number | null; proof_amostra_ok: boolean; pilar: string; pai_id: string | null }
  if (eCeo(a)) return { ok: false, motivo: 'O CEO não se clona.' }
  if (!CICLOS_QUE_TRABALHAM.includes(a.ciclo)) return { ok: false, motivo: `Em ${a.ciclo} não se pede clonagem.` }
  const motivo = `Pedido de clonagem de ${a.nome} (proof ${a.proof_score ?? '—'}, amostra ${a.proof_amostra_ok ? 'sim' : 'não'}): ${evidencia}`.slice(0, 3000)
  if (!ensaio) await db.from('agentes_eventos').insert({ agente_id: agenteId, tipo: 'clonagem_pedida', valor: a.proof_score, detalhe: motivo })
  return { ok: true, motivo: a.proof_amostra_ok ? 'Registado: o CEO valida no próximo ciclo.' : 'Registado, mas sem amostra mínima o CEO não pode validar ainda.' }
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// Orçamentos dinâmicos com dados da base
// ─────────────────────────────────────────────────────────────────────────────────────────────

function porDia(linhas: Array<Record<string, unknown>>, campo: string): number {
  const c = new Map<string, number>()
  for (const l of linhas) { const d = dia(String(l[campo] ?? '')); c.set(d, (c.get(d) ?? 0) + 1) }
  return Math.max(0, ...c.values())
}

export async function tectosContactoDb(db: Db, agenteId: string | null): Promise<TectosDinamicos & { objectivos: Objectivos }> {
  const cfg = await lerConfigOs(db)
  const desde = new Date(Date.now() - 14 * 86_400_000).toISOString()
  const desde7 = new Date(Date.now() - 7 * 86_400_000).toISOString()
  const [{ data: env }, { data: excl }] = await Promise.all([
    db.from('agentes_envios').select('agente_id, canal, enviado_em, erro').not('enviado_em', 'is', null).gte('enviado_em', desde),
    db.from('contacto_exclusao').select('canal_origem, pedido_em').gte('pedido_em', desde),
  ])
  const linhas = (env ?? []) as Array<{ agente_id: string; canal: string; enviado_em: string; erro: string | null }>
  const queixas = (excl ?? []) as Array<{ canal_origem: string | null }>
  const sinaisPorCanal: Partial<Record<CanalContacto, Sinais>> = {}
  for (const c of ['email', 'sms', 'whatsapp', 'telegram', 'instagram', 'chamada', 'linkedin'] as CanalContacto[]) {
    const l = linhas.filter((x) => String(x.canal).toLowerCase() === c)
    sinaisPorCanal[c] = {
      tentativas: l.length, sucessos: null, erros: l.filter((x) => x.erro).length,
      queixas: queixas.filter((q) => String(q.canal_origem ?? '').toLowerCase() === c).length,
      maxDia7d: porDia(l.filter((x) => x.enviado_em >= desde7) as unknown as Array<Record<string, unknown>>, 'enviado_em'),
    }
  }
  const meus = agenteId ? linhas.filter((x) => x.agente_id === agenteId) : linhas
  const t = tectosContacto(sinaisPorCanal, { tentativas: meus.length, sucessos: null, erros: meus.filter((x) => x.erro).length }, cfg.objectivos)
  return { ...t, objectivos: cfg.objectivos }
}

export async function orcamentoB2BDb(db: Db): Promise<Orcamento> {
  const cfg = await lerConfigOs(db)
  const desde = new Date(Date.now() - 14 * 86_400_000).toISOString()
  const desde7 = new Date(Date.now() - 7 * 86_400_000).toISOString()
  const [{ data: env }, { count: resp }, { count: excl }, { count: prontos }] = await Promise.all([
    db.from('b2b_envios').select('criado_em, erro').eq('decisao', 'sai').gte('criado_em', desde),
    db.from('b2b_prospectos').select('id', { count: 'exact', head: true }).gte('respondeu_em', desde),
    db.from('contacto_exclusao').select('identificador', { count: 'exact', head: true }).eq('canal_origem', 'email').gte('pedido_em', desde),
    db.from('b2b_prospectos').select('id', { count: 'exact', head: true }).in('estado', ['novo', 'contactado']),
  ])
  const l = (env ?? []) as Array<{ criado_em: string; erro: string | null }>
  return orcamentoB2B({
    tentativas: l.length, sucessos: num(resp), erros: l.filter((x) => x.erro).length, queixas: num(excl),
    maxDia7d: porDia(l.filter((x) => x.criado_em >= desde7) as unknown as Array<Record<string, unknown>>, 'criado_em'),
    procuraLegal: prontos == null ? null : num(prontos),
  }, cfg.objectivos)
}

export async function orcamentoSocialDb(db: Db): Promise<{ posts: Orcamento; historias: Orcamento }> {
  const cfg = await lerConfigOs(db)
  const desde = new Date(Date.now() - 14 * 86_400_000).toISOString()
  const [{ data: ps }, { count: leadsIg }] = await Promise.all([
    db.from('social_scheduled_posts').select('status, media_type, updated_at').in('status', ['published', 'failed', 'error']).gte('updated_at', desde),
    db.from('vendas_negocios').select('id', { count: 'exact', head: true }).eq('origem', 'instagram').gte('criado_em', desde),
  ])
  const l = (ps ?? []) as Array<{ status: string; media_type: string }>
  const pub = l.filter((x) => x.status === 'published')
  const posts = pub.filter((x) => x.media_type !== 'STORIES')
  const hist = pub.filter((x) => x.media_type === 'STORIES')
  const errosP = l.filter((x) => x.status !== 'published' && x.media_type !== 'STORIES').length
  return {
    posts: orcamentoPosts({ tentativas: posts.length + errosP, sucessos: num(leadsIg), erros: errosP }, cfg.objectivos),
    historias: orcamentoHistorias({ tentativas: hist.length, sucessos: null, erros: l.filter((x) => x.status !== 'published' && x.media_type === 'STORIES').length }),
  }
}

export async function orcamentoPipelineDb(db: Db, agenteId: string): Promise<Orcamento> {
  const desde = new Date(Date.now() - 14 * 86_400_000).toISOString()
  const [{ data: acc }, { count: abertos }] = await Promise.all([
    db.from('vendas_agentes_accoes').select('ok').eq('agente_id', agenteId).gte('criado_em', desde),
    db.from('vendas_negocios').select('id', { count: 'exact', head: true }).eq('agente_id', agenteId).not('estado', 'in', '(ganho,perdido)'),
  ])
  const l = (acc ?? []) as Array<{ ok: boolean }>
  const ok = l.filter((x) => x.ok).length
  return orcamentoPipeline({
    tentativas: l.length, sucessos: ok, erros: l.length - ok,
    // A procura é o trabalho que existe: ~4 acções por negócio aberto + 20 de folga para a bolsa/leads novos.
    procuraLegal: abertos == null ? null : num(abertos) * 4 + 20,
  })
}

export async function orcamentos(db: Db, quota?: Partial<Quota> | null) {
  const [contacto, b2b, social] = await Promise.all([tectosContactoDb(db, null), orcamentoB2BDb(db), orcamentoSocialDb(db)])
  return { contacto, b2b, social, quota: quotaSegura(quota) }
}

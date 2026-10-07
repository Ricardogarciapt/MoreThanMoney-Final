/**
 * ORÇAMENTOS DINÂMICOS (OS v2, 07/10/2026) — puro. Substitui os números fixos (40 por agente,
 * 30/15/… por canal, 20 B2B, 2 posts, 40 acções de pipeline) por um cálculo a partir de sinais.
 *
 * A FÓRMULA (igual para todas as dimensões; só mudam os sinais e os tectos):
 *
 *   sem dados (amostra < amostraMin):  valor = min(chão seguro, tecto duro, procura) × reputação
 *   com dados:                         valor = min(tecto duro, procura, warm-up,
 *                                                 round(chão × desempenho × reputação))
 *
 *   desempenho = clamp(0,5 ; 2,5 ; taxaSuavizada / taxaRef)
 *                taxaSuavizada = (sucessos + priorPeso × taxaRef) / (tentativas + priorPeso)
 *                (média bayesiana: com pouca amostra fica perto de 1 — não reage a ruído)
 *   reputação  = 1    se erros < 2 % e queixas < 0,1 %   (erros só a partir de 3; queixas sobre ≥ 100 envios)
 *                0,5  se erros < 5 % e queixas < 0,3 %   (limiar das regras da Google para remetentes)
 *                0    acima disso — PÁRA o canal, mesmo abaixo do chão (a segurança ganha ao chão)
 *   warm-up    = ceil(1,5 × máximo enviado num dia dos últimos 7) — nunca mais de +50 %/dia
 *   procura    = quantos destinatários com BASE LEGAL há de facto (null = não limita)
 *
 * O que nunca acontece (guarda: os.check.ts):
 *   · passar o tecto duro externo (TECTOS_DUROS) nem o valor que o dono baixou;
 *   · passar a procura legal (não há orçamento para contactar quem não tem base legal);
 *   · sem dados, sair do chão seguro (o fixo antigo).
 */
import { CHAO_SEGURO, TECTOS_DUROS, type CanalContacto, type Objectivos } from './objectivos'

export interface Sinais {
  /** Tentativas medidas na janela (envios, posts publicados, acções). */
  tentativas: number
  /** Sucessos medidos (respostas, leads, acções aceites). null = não se mede (desempenho neutro 1). */
  sucessos: number | null
  /** Erros técnicos (bounces, falhas de publicação, recusas). */
  erros?: number
  /** Queixas / pedidos de saída / marcados como spam. */
  queixas?: number
  /** Máximo enviado num só dia nos últimos 7 (warm-up). null = sem histórico. */
  maxDia7d?: number | null
  /** Destinatários com base legal disponíveis. null/undefined = não se mediu (não limita). */
  procuraLegal?: number | null
}

export interface ParamOrcamento {
  chao: number
  tectoDuro: number
  taxaRef: number
  amostraMin?: number
  priorPeso?: number
  /** Se o warm-up se aplica (email). */
  warmup?: boolean
}

export interface Orcamento {
  valor: number
  base: 'sem_dados' | 'dados'
  desempenho: number
  reputacao: number
  limitadoPor: 'tecto_duro' | 'procura' | 'warmup' | 'formula' | 'reputacao' | 'chao'
  porque: string
}

const clamp = (min: number, max: number, x: number) => Math.min(max, Math.max(min, x))
const n0 = (x: unknown) => (Number.isFinite(Number(x)) && Number(x) > 0 ? Number(x) : 0)

export function reputacao(s: Sinais): number {
  const t = n0(s.tentativas)
  if (t <= 0) return 1
  // Amostras minúsculas não fazem alarme: 1 falha em 2 publicações é ruído. Erros só contam a partir
  // de 3; as queixas contam sempre, mas sobre pelo menos 100 envios (1 queixa em 10 envios ≠ 10 %).
  const e = n0(s.erros) >= 3 ? n0(s.erros) / t : 0
  const q = n0(s.queixas) / Math.max(t, 100)
  if (e < 0.02 && q < 0.001) return 1
  if (e < 0.05 && q < 0.003) return 0.5
  return 0
}

export function calcularOrcamento(s: Sinais, p: ParamOrcamento): Orcamento {
  const tecto = Math.max(0, Math.floor(n0(p.tectoDuro)))
  const chao = Math.min(Math.max(0, Math.floor(n0(p.chao))), tecto)
  const amostraMin = p.amostraMin ?? 20
  const prior = p.priorPeso ?? 20
  const rep = reputacao(s)
  const procura = s.procuraLegal == null ? null : Math.max(0, Math.floor(n0(s.procuraLegal)))
  const t = n0(s.tentativas)

  if (tecto === 0) {
    return { valor: 0, base: t < amostraMin ? 'sem_dados' : 'dados', desempenho: 1, reputacao: rep, limitadoPor: 'tecto_duro', porque: 'Tecto duro externo é zero (canal fechado).' }
  }
  if (rep === 0) {
    return { valor: 0, base: t < amostraMin ? 'sem_dados' : 'dados', desempenho: 1, reputacao: 0, limitadoPor: 'reputacao', porque: 'Reputação em alarme (erros ≥ 5 % ou queixas ≥ 0,3 %): o canal pára até baixar.' }
  }

  if (t < amostraMin) {
    let v = Math.floor(chao * rep)
    let por: Orcamento['limitadoPor'] = rep < 1 ? 'reputacao' : 'chao'
    if (procura != null && procura < v) { v = procura; por = 'procura' }
    return { valor: v, base: 'sem_dados', desempenho: 1, reputacao: rep, limitadoPor: por, porque: `Sem dados (${t} < ${amostraMin}): chão seguro ${chao}${rep < 1 ? ' × reputação ' + rep : ''}.` }
  }

  const ref = n0(p.taxaRef) || 0.01
  const suave = (n0(s.sucessos) + prior * ref) / (t + prior)
  // Sem medida de sucesso o desempenho é neutro: não se sobe nem se castiga o que não se mede.
  const desempenho = s.sucessos == null ? 1 : Number(clamp(0.5, 2.5, suave / ref).toFixed(3))
  const formula = Math.round(chao * desempenho * rep)
  let v = formula
  let por: Orcamento['limitadoPor'] = 'formula'
  if (p.warmup && s.maxDia7d != null) {
    const w = Math.max(chao, Math.ceil(1.5 * n0(s.maxDia7d)))
    if (w < v) { v = w; por = 'warmup' }
  }
  if (procura != null && procura < v) { v = procura; por = 'procura' }
  if (v > tecto) { v = tecto; por = 'tecto_duro' }
  v = Math.max(0, Math.floor(v))
  return {
    valor: v, base: 'dados', desempenho, reputacao: rep, limitadoPor: por,
    porque: `chão ${chao} × desempenho ${desempenho} × reputação ${rep} = ${formula}; limitado por ${por} → ${v} (tecto duro ${tecto}).`,
  }
}

/** O tecto duro efectivo: a constante, ou menos se o dono o baixou em os_objectivos.tectos. */
export function tectoEfectivo(constante: number, doDono?: number): number {
  return doDono != null && Number.isFinite(doDono) ? Math.min(constante, Math.max(0, doDono)) : constante
}

// ── As dimensões concretas ────────────────────────────────────────────────────────────────

export function orcamentoContactoCanal(canal: CanalContacto, s: Sinais, o?: Objectivos): Orcamento {
  const duro = TECTOS_DUROS.contactoPorCanalDia[canal] ?? 0
  const tecto = canal === 'email' ? Math.min(duro, tectoEfectivo(TECTOS_DUROS.emailTotalDia, o?.tectos.emailTotalDia)) : duro
  return calcularOrcamento(s, { chao: CHAO_SEGURO.contactoPorCanalDia[canal] ?? 0, tectoDuro: tecto, taxaRef: 0.05, warmup: canal === 'email' })
}

export function orcamentoContactoAgente(s: Sinais, o?: Objectivos): Orcamento {
  return calcularOrcamento(s, {
    chao: CHAO_SEGURO.contactoPorAgenteDia,
    tectoDuro: tectoEfectivo(TECTOS_DUROS.contactoPorAgenteDia, o?.tectos.contactoPorAgenteDia),
    taxaRef: 0.05,
  })
}

export function orcamentoB2B(s: Sinais, o?: Objectivos): Orcamento {
  return calcularOrcamento(s, { chao: CHAO_SEGURO.b2bDia, tectoDuro: tectoEfectivo(TECTOS_DUROS.b2bDia, o?.tectos.b2bDia), taxaRef: 0.02, warmup: true })
}

export function orcamentoPosts(s: Sinais, o?: Objectivos): Orcamento {
  return calcularOrcamento(s, { chao: CHAO_SEGURO.postsDiaConta, tectoDuro: tectoEfectivo(TECTOS_DUROS.postsDiaConta, o?.tectos.postsDiaConta), taxaRef: 0.5, amostraMin: 14 })
}

export function orcamentoHistorias(s: Sinais): Orcamento {
  return calcularOrcamento(s, { chao: CHAO_SEGURO.historiasDiaConta, tectoDuro: TECTOS_DUROS.historiasDiaConta, taxaRef: 0.5, amostraMin: 14 })
}

/**
 * Pipeline: aqui a procura é o trabalho que existe (negócios do agente + bolsa) e o desempenho é a
 * taxa de acções ACEITES pelo site (as recusadas são o «erro»). Sem dados: 40, o fixo antigo.
 */
export function orcamentoPipeline(s: Sinais): Orcamento {
  return calcularOrcamento(s, { chao: CHAO_SEGURO.pipelinePorAgenteDia, tectoDuro: TECTOS_DUROS.pipelinePorAgenteDia, taxaRef: 0.8, amostraMin: 30 })
}

export interface TectosDinamicos {
  porAgenteDia: number
  porCanalDia: Partial<Record<CanalContacto, number>>
  explicacao: Record<string, string>
}

/** Junta os orçamentos de contacto no formato `Tectos` de contacto-inicial.ts. */
export function tectosContacto(
  sinaisPorCanal: Partial<Record<CanalContacto, Sinais>>,
  sinaisAgente: Sinais,
  o?: Objectivos,
): TectosDinamicos {
  const porCanalDia: Partial<Record<CanalContacto, number>> = {}
  const explicacao: Record<string, string> = {}
  for (const c of Object.keys(TECTOS_DUROS.contactoPorCanalDia) as CanalContacto[]) {
    const r = orcamentoContactoCanal(c, sinaisPorCanal[c] ?? { tentativas: 0, sucessos: 0 }, o)
    porCanalDia[c] = r.valor
    explicacao[c] = r.porque
  }
  const a = orcamentoContactoAgente(sinaisAgente, o)
  explicacao.agente = a.porque
  return { porAgenteDia: a.valor, porCanalDia, explicacao }
}

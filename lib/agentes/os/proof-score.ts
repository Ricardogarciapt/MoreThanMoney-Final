/**
 * PROOF SCORE (OS v2 — Agent Cloning Engine, decisão do dono 07/10/2026) — puro.
 *
 * Um número de 0 a 100 por agente, sobre uma JANELA, que decide observar → testar → clonar →
 * escalar. Os pesos e os limiares vivem em `site_settings.agentes_proof` (nunca fixos no código);
 * estes são só os valores por omissão.
 *
 *   score = 100 × Σ peso_i × componente_i / Σ peso_i         (componentes em [0, 1])
 *
 *   receita       r / (r + receitaRef)                        (satura: 150 € ≈ 0,5)
 *   margem        (r − custo) / r, em [0, 1]; 0 sem receita
 *   conversão     média bayesiana (convertidos + prior×p0)/(oportunidades + prior), ÷ alvo, máx 1
 *   consistência  dias com valor / dias da janela
 *   retenção      clientes atribuídos que renovaram / clientes elegíveis; 0,5 quando não se mede
 *   custo         custoRef / (custoRef + custo)               (mais barato → mais perto de 1)
 *
 * AMOSTRA MÍNIMA (anti-ruído): sem ≥ N vendas, ≥ M dias com valor, ≥ idade mínima e o resultado
 * MEDIDO da família, o score fica limitado a 69 — nunca chega à banda de clonar. Uma venda isolada
 * não clona ninguém (guarda: os.check.ts).
 */

export type Familia = 'CEO' | 'SALES' | 'CONTENT' | 'GROWTH' | 'CUSTOMER' | 'PRODUCT' | 'TRADING'

export type Banda = 'observar' | 'testar' | 'candidato' | 'clonar' | 'escalar'

export interface Pesos {
  receita: number
  margem: number
  conversao: number
  consistencia: number
  retencao: number
  custo: number
}

export interface ConfigProof {
  janelaDias: number
  pesos: Pesos
  pesosPorFamilia: Partial<Record<Familia, Partial<Pesos>>>
  amostra: { vendasMin: number; diasComValorMin: number; idadeHorasMin: number }
  referencias: { receitaEur: number; custoEur: number; conversaoAlvo: number; conversaoPrior: number; priorPeso: number }
  bandas: { testar: number; candidato: number; clonar: number; escalar: number }
  clones: { clonar: number; escalar: number }
  /** Quanto vale (estimativa da casa, a recalibrar com dados) cada passo diferido medido, em €. */
  valorDiferido: { lead: number; qualificado: number; marcado: number; apresentado: number; resposta_b2b: number; post_publicado: number }
  /** Peso do valor diferido no valor marginal (0–1): é estimado, não é dinheiro. */
  pesoDiferido: number
}

export const CONFIG_PROOF_PADRAO: ConfigProof = {
  janelaDias: 14,
  pesos: { receita: 30, margem: 20, conversao: 15, consistencia: 15, retencao: 10, custo: 10 },
  pesosPorFamilia: {
    CONTENT: { receita: 20, margem: 10, conversao: 25, consistencia: 25, retencao: 5, custo: 15 },
    CUSTOMER: { receita: 20, margem: 15, conversao: 15, consistencia: 15, retencao: 25, custo: 10 },
  },
  amostra: { vendasMin: 3, diasComValorMin: 2, idadeHorasMin: 72 },
  referencias: { receitaEur: 150, custoEur: 15, conversaoAlvo: 0.05, conversaoPrior: 0.02, priorPeso: 20 },
  bandas: { testar: 50, candidato: 70, clonar: 85, escalar: 95 },
  clones: { clonar: 3, escalar: 5 },
  valorDiferido: { lead: 0.5, qualificado: 2, marcado: 8, apresentado: 15, resposta_b2b: 5, post_publicado: 1 },
  pesoDiferido: 0.5,
}

/**
 * As famílias cujo resultado se MEDE em vendas. PRODUCT e TRADING não vendem: o trabalho deles é
 * diferido (código em produção, análise). Sem resultado medido não chegam à banda de clonar por
 * conta própria — o CEO pode propor, e a clonagem delas fica para quando houver medição.
 * TRADING é só análise e propostas: a execução continua nos motores com guardrails.
 */
export const FAMILIAS_COM_RESULTADO_MEDIDO: readonly Familia[] = ['SALES', 'CONTENT', 'GROWTH', 'CUSTOMER']

function obj(v: unknown): Record<string, unknown> {
  try {
    const o = typeof v === 'string' ? JSON.parse(v) : v
    return o && typeof o === 'object' ? (o as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}
const pos = (x: unknown, d: number) => (Number.isFinite(Number(x)) && Number(x) >= 0 ? Number(x) : d)

export function lerConfigProof(valor: unknown): ConfigProof {
  const v = obj(valor)
  const d = CONFIG_PROOF_PADRAO
  const p = obj(v.pesos)
  const pesos: Pesos = {
    receita: pos(p.receita, d.pesos.receita), margem: pos(p.margem, d.pesos.margem), conversao: pos(p.conversao, d.pesos.conversao),
    consistencia: pos(p.consistencia, d.pesos.consistencia), retencao: pos(p.retencao, d.pesos.retencao), custo: pos(p.custo, d.pesos.custo),
  }
  const somaPesos = Object.values(pesos).reduce((s, x) => s + x, 0)
  const am = obj(v.amostra)
  const rf = obj(v.referencias)
  const bd = obj(v.bandas)
  const cl = obj(v.clones)
  const vd = obj(v.valor_diferido)
  const pf = obj(v.pesos_por_familia)
  const porFam: ConfigProof['pesosPorFamilia'] = { ...d.pesosPorFamilia }
  for (const [k, w] of Object.entries(pf)) porFam[k as Familia] = obj(w) as Partial<Pesos>
  // Os limiares têm de ficar por ordem; se não ficarem, valem os decididos.
  const bandas = {
    testar: pos(bd.testar, d.bandas.testar), candidato: pos(bd.candidato, d.bandas.candidato),
    clonar: pos(bd.clonar, d.bandas.clonar), escalar: pos(bd.escalar, d.bandas.escalar),
  }
  const ordenadas = bandas.testar < bandas.candidato && bandas.candidato < bandas.clonar && bandas.clonar < bandas.escalar && bandas.escalar <= 100
  return {
    janelaDias: Math.max(3, pos(v.janela_dias, d.janelaDias)),
    pesos: somaPesos > 0 ? pesos : d.pesos,
    pesosPorFamilia: porFam,
    // A amostra mínima nunca desce abaixo de 2 vendas: uma venda isolada não clona, nem por setting.
    amostra: {
      vendasMin: Math.max(2, Math.floor(pos(am.vendas_min, d.amostra.vendasMin))),
      diasComValorMin: Math.max(2, Math.floor(pos(am.dias_com_valor_min, d.amostra.diasComValorMin))),
      idadeHorasMin: Math.max(48, pos(am.idade_horas_min, d.amostra.idadeHorasMin)),
    },
    referencias: {
      receitaEur: pos(rf.receita_eur, d.referencias.receitaEur) || d.referencias.receitaEur,
      custoEur: pos(rf.custo_eur, d.referencias.custoEur) || d.referencias.custoEur,
      conversaoAlvo: pos(rf.conversao_alvo, d.referencias.conversaoAlvo) || d.referencias.conversaoAlvo,
      conversaoPrior: pos(rf.conversao_prior, d.referencias.conversaoPrior),
      priorPeso: pos(rf.prior_peso, d.referencias.priorPeso),
    },
    bandas: ordenadas ? bandas : d.bandas,
    clones: {
      clonar: Math.max(2, Math.min(6, Math.floor(pos(cl.clonar, d.clones.clonar)))),
      escalar: Math.max(2, Math.min(6, Math.floor(pos(cl.escalar, d.clones.escalar)))),
    },
    valorDiferido: {
      lead: pos(vd.lead, d.valorDiferido.lead), qualificado: pos(vd.qualificado, d.valorDiferido.qualificado),
      marcado: pos(vd.marcado, d.valorDiferido.marcado), apresentado: pos(vd.apresentado, d.valorDiferido.apresentado),
      resposta_b2b: pos(vd.resposta_b2b, d.valorDiferido.resposta_b2b), post_publicado: pos(vd.post_publicado, d.valorDiferido.post_publicado),
    },
    pesoDiferido: Math.min(1, pos(v.peso_diferido, d.pesoDiferido)),
  }
}

export interface Medidas {
  familia: Familia
  idadeHoras: number
  /** € de receita atribuída (vendas_vendas.agente_codigo) na janela. Nunca a dos filhos. */
  receitaEur: number
  /** Nº de vendas atribuídas na janela. */
  vendas: number
  /** € de custo (quota do claude -p como custo de oportunidade + gasto registado). */
  custoEur: number
  /** Oportunidades trabalhadas (envios que saíram, leads criados, negócios assumidos, posts). */
  oportunidades: number
  /** Convertidos (vendas, ou leads para CONTENT). */
  convertidos: number
  diasComValor: number
  diasJanela: number
  /** null = não se mede para este agente. */
  retencao: number | null
  /** € de valor diferido medido (pipeline, leads, B2B, posts), antes do peso. */
  diferidoEur: number
}

export interface Proof {
  score: number
  banda: Banda
  amostraOk: boolean
  componentes: Pesos
  porque: string
}

export function bandaDe(score: number, c: ConfigProof = CONFIG_PROOF_PADRAO): Banda {
  if (score >= c.bandas.escalar) return 'escalar'
  if (score >= c.bandas.clonar) return 'clonar'
  if (score >= c.bandas.candidato) return 'candidato'
  if (score >= c.bandas.testar) return 'testar'
  return 'observar'
}

export function calcularProof(m: Medidas, c: ConfigProof = CONFIG_PROOF_PADRAO): Proof {
  const r = Math.max(0, m.receitaEur)
  const custo = Math.max(0, m.custoEur)
  const rf = c.referencias
  const comp: Pesos = {
    receita: r / (r + rf.receitaEur),
    margem: r > 0 ? Math.max(0, Math.min(1, (r - custo) / r)) : 0,
    conversao: Math.min(1, ((Math.max(0, m.convertidos) + rf.priorPeso * rf.conversaoPrior) / (Math.max(0, m.oportunidades) + rf.priorPeso)) / rf.conversaoAlvo),
    consistencia: m.diasJanela > 0 ? Math.max(0, Math.min(1, m.diasComValor / m.diasJanela)) : 0,
    retencao: m.retencao == null ? 0.5 : Math.max(0, Math.min(1, m.retencao)),
    custo: rf.custoEur / (rf.custoEur + custo),
  }
  // Sem nenhuma actividade, o prior da conversão não pode dar pontos a quem não trabalhou.
  if (m.oportunidades <= 0 && m.convertidos <= 0) comp.conversao = 0
  const w: Pesos = { ...c.pesos, ...(c.pesosPorFamilia[m.familia] ?? {}) } as Pesos
  const soma = Object.values(w).reduce((s, x) => s + Math.max(0, Number(x) || 0), 0) || 1
  let score = (100 * (Object.keys(comp) as Array<keyof Pesos>).reduce((s, k) => s + Math.max(0, Number(w[k]) || 0) * comp[k], 0)) / soma
  score = Math.round(score * 10) / 10

  const motivos: string[] = []
  if (m.vendas < c.amostra.vendasMin) motivos.push(`${m.vendas} venda(s) < ${c.amostra.vendasMin}`)
  if (m.diasComValor < c.amostra.diasComValorMin) motivos.push(`${m.diasComValor} dia(s) com valor < ${c.amostra.diasComValorMin}`)
  if (m.idadeHoras < c.amostra.idadeHorasMin) motivos.push(`${Math.floor(m.idadeHoras)} h de vida < ${c.amostra.idadeHorasMin} h`)
  if (!FAMILIAS_COM_RESULTADO_MEDIDO.includes(m.familia)) motivos.push(`a família ${m.familia} ainda não tem resultado medido em vendas`)
  const amostraOk = motivos.length === 0
  const tectoSemAmostra = c.bandas.candidato - 1
  if (!amostraOk && score > tectoSemAmostra) score = tectoSemAmostra
  const banda = bandaDe(score, c)
  return {
    score,
    banda,
    amostraOk,
    componentes: Object.fromEntries(Object.entries(comp).map(([k, x]) => [k, Number(x.toFixed(3))])) as unknown as Pesos,
    porque: amostraOk
      ? `Proof ${score} (${banda}) sobre ${c.janelaDias} dias: ${r.toFixed(2)} € em ${m.vendas} venda(s), custo ${custo.toFixed(2)} €.`
      : `Proof ${score} (${banda}) — amostra insuficiente (${motivos.join('; ')}): limitado a ${tectoSemAmostra}, não clona.`,
  }
}

/** Valor marginal na janela: receita + diferido pesado − custo. É o que decide UNDERPERFORMING. */
export function valorMarginal(m: Pick<Medidas, 'receitaEur' | 'custoEur' | 'diferidoEur'>, c: ConfigProof = CONFIG_PROOF_PADRAO): number {
  return Number((Math.max(0, m.receitaEur) + c.pesoDiferido * Math.max(0, m.diferidoEur) - Math.max(0, m.custoEur)).toFixed(2))
}

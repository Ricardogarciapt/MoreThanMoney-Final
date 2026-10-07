/**
 * CICLO DE VIDA ECONÓMICO (OS v2, 07/10/2026) — puro. Substitui «48 h sem receita → morre».
 *
 *   PROVING ──(valor>0)──▶ ACTIVE ──(proof ≥ candidato, amostra)──▶ PROVEN ──(proof ≥ escalar)──▶ SCALING
 *      │                    │  ▲                                     │                              │
 *      │             (valor≤0)  └────────────(valor>0)───────────────┴──────(valor≤0)───────────────┘
 *      ▼                    ▼
 *   UNDERPERFORMING ──(48 h)──▶ MUTATING ──(48 h)──▶ PROVING (reteste, 72 h)
 *                                   ▲                       │ valor ≤ 0
 *                                   └─── tentativa < 2 ─────┤
 *                                                           └─ 2 tentativas falhadas ─▶ ARCHIVED
 *   SUSPENDED = pausa (dono, ou o CEO pela acção «suspender»); IDLE = worker sem missão → ARCHIVED.
 *
 * O que nunca muda (guarda: os.check.ts):
 *   · ARCHIVED não apaga nada: muda o estado, grava a ficha em agentes_arquivo, a genealogia fica;
 *   · o CEO (topo: pilar ceo e sem pai) nunca passa a ARCHIVED — no máximo UNDERPERFORMING;
 *   · ARCHIVED não volta sozinho: só o dono o restaura;
 *   · uma pausa do dono (pausado/parado) ganha a qualquer transição automática.
 *
 * O tempo mínimo para arquivar um agente que NUNCA cria valor é ~12 dias (48+48+72+48+72 h) — não
 * 48 h. O valor medido inclui o diferido (pipeline avançado, leads, respostas B2B, posts com ?ag=),
 * não só a receita atribuída.
 */

export type Ciclo =
  | 'ACTIVE' | 'PROVING' | 'PROVEN' | 'SCALING' | 'MUTATING' | 'UNDERPERFORMING' | 'SUSPENDED' | 'ARCHIVED' | 'IDLE'

export const CICLOS: readonly Ciclo[] = ['ACTIVE', 'PROVING', 'PROVEN', 'SCALING', 'MUTATING', 'UNDERPERFORMING', 'SUSPENDED', 'ARCHIVED', 'IDLE']

/** Os que trabalham (o motor acorda-os, pela quota). */
export const CICLOS_QUE_TRABALHAM: readonly Ciclo[] = ['ACTIVE', 'PROVING', 'PROVEN', 'SCALING', 'MUTATING', 'UNDERPERFORMING']

/**
 * Ritmo (minutos entre ciclos) e por isso ciclos/dia que cada estado PEDE. O motor só lhos dá se a
 * quota chegar (motor/regras.py, por prioridade de Proof Score). `recursos_mult` (do CEO) divide o
 * ritmo, entre 0,25 e 3.
 */
export const RITMO_MIN: Record<Ciclo, number> = {
  SCALING: 30, PROVEN: 60, ACTIVE: 90, PROVING: 90, MUTATING: 120, UNDERPERFORMING: 180,
  SUSPENDED: 0, ARCHIVED: 0, IDLE: 0,
}

export function ciclosDiaPedidos(ciclo: Ciclo, recursosMult = 1, ceo = false): number {
  if (ceo && CICLOS_QUE_TRABALHAM.includes(ciclo)) return 24
  const r = RITMO_MIN[ciclo]
  if (!r) return 0
  const m = Math.min(3, Math.max(0.25, Number(recursosMult) || 1))
  return Math.ceil((24 * 60) / (r / m))
}

/** Mapa para a coluna antiga `estado` (o motor, o painel e as rotas antigas continuam a ler). */
export function estadoLegado(c: Ciclo): 'vivo' | 'em_risco' | 'pausado' | 'arquivado' {
  if (c === 'ARCHIVED' || c === 'IDLE') return c === 'ARCHIVED' ? 'arquivado' : 'pausado'
  if (c === 'SUSPENDED') return 'pausado'
  if (c === 'UNDERPERFORMING' || c === 'MUTATING') return 'em_risco'
  return 'vivo'
}

export interface ConfigCiclo {
  gracaHoras: number
  underHoras: number
  mutatingHoras: number
  retesteHoras: number
  tentativasMax: number
  idleHoras: number
}

export const CONFIG_CICLO_PADRAO: ConfigCiclo = {
  gracaHoras: 72, underHoras: 48, mutatingHoras: 48, retesteHoras: 72, tentativasMax: 2, idleHoras: 24,
}

export function lerConfigCiclo(v: unknown): ConfigCiclo {
  let o: Record<string, unknown> = {}
  try { o = (typeof v === 'string' ? JSON.parse(v) : (v ?? {})) as Record<string, unknown> } catch { o = {} }
  const c = (o.ciclo && typeof o.ciclo === 'object' ? o.ciclo : o) as Record<string, unknown>
  const d = CONFIG_CICLO_PADRAO
  // Mínimos duros: nenhum setting volta a uma régua de 48 h para arquivar.
  const n = (x: unknown, def: number, min: number) => (Number.isFinite(Number(x)) && Number(x) >= min ? Number(x) : def)
  return {
    gracaHoras: n(c.graca_horas, d.gracaHoras, 24),
    underHoras: n(c.under_horas, d.underHoras, 24),
    mutatingHoras: n(c.mutating_horas, d.mutatingHoras, 24),
    retesteHoras: n(c.reteste_horas, d.retesteHoras, 48),
    tentativasMax: Math.floor(n(c.tentativas_max, d.tentativasMax, 1)),
    idleHoras: n(c.idle_horas, d.idleHoras, 6),
  }
}

export interface EntradaCiclo {
  ciclo: Ciclo
  /** Desde quando está neste estado (ISO). */
  cicloDesde: string | null
  meta: { tentativas?: number; reteste?: boolean }
  ceo: boolean
  pausadoPeloDono: boolean
  idadeHoras: number
  efemero: boolean
  /** Para workers: a missão ainda está aberta? */
  missaoAberta: boolean | null
  valorMarginal: number
  banda: 'observar' | 'testar' | 'candidato' | 'clonar' | 'escalar'
  amostraOk: boolean
  /** O CEO validou escalar este agente (acção «escalar»). */
  escalarValidado?: boolean
}

export interface Transicao {
  para: Ciclo
  meta: { tentativas: number; reteste: boolean }
  muda: boolean
  porque: string
}

const horasDesde = (iso: string | null, agora: Date) => {
  const t = iso ? Date.parse(iso) : NaN
  return Number.isFinite(t) ? (agora.getTime() - t) / 3_600_000 : Infinity
}

export function transicao(e: EntradaCiclo, agora: Date = new Date(), c: ConfigCiclo = CONFIG_CICLO_PADRAO): Transicao {
  const tent = Math.max(0, Math.floor(Number(e.meta?.tentativas ?? 0)))
  const ret = e.meta?.reteste === true
  const fica = (porque: string): Transicao => ({ para: e.ciclo, meta: { tentativas: tent, reteste: ret }, muda: false, porque })
  const vai = (para: Ciclo, porque: string, meta?: Partial<Transicao['meta']>): Transicao => {
    const destino = e.ceo && para === 'ARCHIVED' ? 'UNDERPERFORMING' : para
    return {
      para: destino,
      meta: { tentativas: meta?.tentativas ?? tent, reteste: meta?.reteste ?? ret },
      muda: destino !== e.ciclo,
      porque: e.ceo && para === 'ARCHIVED'
        ? `${porque} — mas é o CEO: imortal, fica UNDERPERFORMING à vista e continua medido.`
        : porque,
    }
  }

  if (e.ciclo === 'ARCHIVED') return fica('Arquivado — só o dono restaura. Nada foi apagado.')
  if (e.pausadoPeloDono) return e.ciclo === 'SUSPENDED' ? fica('Suspenso pelo dono.') : vai('SUSPENDED', 'Pausa do dono: a supervisão ganha à regra.')
  if (e.ciclo === 'SUSPENDED') return fica('Suspenso — volta só por decisão (dono ou CEO).')

  const noEstado = horasDesde(e.cicloDesde, agora)

  // Workers efémeros: a missão acabou → IDLE → (idle h) → ARCHIVED.
  if (e.efemero) {
    if (e.ciclo === 'IDLE') {
      if (e.missaoAberta) return vai('ACTIVE', 'A missão voltou a ter trabalho.')
      return noEstado >= c.idleHoras ? vai('ARCHIVED', `Worker IDLE há ${Math.floor(noEstado)} h sem missão — arquivado (nada apagado).`) : fica('Worker IDLE à espera de missão.')
    }
    if (e.missaoAberta === false) return vai('IDLE', 'A missão terminou: o worker fica IDLE.')
  }
  if (e.ciclo === 'IDLE') return e.missaoAberta ? vai('ACTIVE', 'Missão aberta.') : fica('IDLE.')

  if (e.idadeHoras < c.gracaHoras) {
    return e.ciclo === 'PROVING' ? fica(`Em prova: ${Math.floor(e.idadeHoras)} h de ${c.gracaHoras} h de graça.`) : vai('PROVING', 'Recém-nascido: em prova.')
  }

  // Valor que justifica escalar/clonar (só com amostra — nunca por uma venda isolada).
  if (e.amostraOk && (e.banda === 'escalar' || (e.escalarValidado && (e.banda === 'clonar' || e.banda === 'candidato')))) {
    return e.ciclo === 'SCALING' ? fica('A escalar: proof alto com amostra.') : vai('SCALING', `Proof na banda ${e.banda} com amostra${e.escalarValidado ? ' e validado pelo CEO' : ''}: SCALING.`, { tentativas: 0, reteste: false })
  }
  if (e.amostraOk && (e.banda === 'clonar' || e.banda === 'candidato')) {
    return e.ciclo === 'PROVEN' ? fica(`Provado (banda ${e.banda}).`) : vai('PROVEN', `Proof na banda ${e.banda} com amostra: PROVEN.`, { tentativas: 0, reteste: false })
  }

  if (e.valorMarginal > 0) {
    if (e.ciclo === 'ACTIVE') return fica(`Activo: valor marginal ${e.valorMarginal.toFixed(2)} € na janela.`)
    return vai('ACTIVE', `${ret ? 'Passou o reteste' : 'Cria valor'}: ${e.valorMarginal.toFixed(2)} € de valor marginal (receita + diferido − custo).`, { tentativas: 0, reteste: false })
  }

  // Sem valor marginal.
  const sem = `valor marginal ${e.valorMarginal.toFixed(2)} € (receita + diferido − custo)`
  switch (e.ciclo) {
    case 'ACTIVE':
    case 'PROVEN':
    case 'SCALING':
      return vai('UNDERPERFORMING', `Sem valor: ${sem}. Menos recursos; se continuar ${c.underHoras} h, muta.`)
    case 'PROVING':
      if (!ret) return vai('UNDERPERFORMING', `Acabou a graça sem valor: ${sem}.`)
      if (noEstado < c.retesteHoras) return fica(`Em reteste (${Math.floor(noEstado)} h de ${c.retesteHoras} h): ${sem}.`)
      if (tent >= c.tentativasMax) return vai('ARCHIVED', `Falhou ${tent} reteste(s) depois de mutar: ${sem}. Arquivado — a ficha e a genealogia ficam.`)
      return vai('MUTATING', `Reteste falhado (${tent}/${c.tentativasMax}): ${sem}. Muta outra vez.`, { tentativas: tent + 1, reteste: false })
    case 'UNDERPERFORMING':
      if (noEstado < c.underHoras) return fica(`Underperforming há ${Math.floor(noEstado)} h de ${c.underHoras} h: ${sem}.`)
      return vai('MUTATING', `${Math.floor(noEstado)} h sem valor: muta (propõe versão/mutação; recursos a metade).`, { tentativas: tent + 1, reteste: false })
    case 'MUTATING':
      if (noEstado < c.mutatingHoras) return fica(`A mutar (${Math.floor(noEstado)} h de ${c.mutatingHoras} h).`)
      return vai('PROVING', 'Mutação feita: volta a prova (reteste).', { reteste: true })
    default:
      return fica('Sem regra para este estado.')
  }
}

/** Família e especialização dos 12 agentes de 07/10 (a migração 202 grava o mesmo). */
export const FAMILIA_INICIAL: Record<string, { familia: string; especializacao: string }> = {
  'CEO-MTM': { familia: 'CEO', especializacao: 'Motor económico' },
  'AG-SETTER': { familia: 'SALES', especializacao: 'Setter' },
  'AG-CLOSER': { familia: 'SALES', especializacao: 'Closer' },
  'AG-FORMACAO': { familia: 'SALES', especializacao: 'Closer' },
  'AG-PROSPECTOR': { familia: 'SALES', especializacao: 'B2B' },
  'AG-EMAIL': { familia: 'CUSTOMER', especializacao: 'Retention' },
  'AG-LMS': { familia: 'CUSTOMER', especializacao: 'Onboarding' },
  'AG-SOCIAL': { familia: 'CONTENT', especializacao: 'Creative' },
  'AG-SCANNER': { familia: 'TRADING', especializacao: 'Scanner' },
  'AG-TRADER': { familia: 'TRADING', especializacao: 'Strategy' },
  'AG-SAAS': { familia: 'PRODUCT', especializacao: 'Development' },
  'AG-SITE': { familia: 'PRODUCT', especializacao: 'QA' },
}

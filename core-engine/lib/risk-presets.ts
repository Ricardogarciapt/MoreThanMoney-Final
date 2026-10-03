/**
 * Os perfis de risco — o "Default strategy" do MTM Auto, disponível também no Tap to Trade.
 *
 * Um preset não é decoração: escolher um escreve MESMO os valores na conta. Guardar o nome sem
 * aplicar os números seria a pior versão disto — o cliente pensa que mudou de perfil e continua
 * a arriscar o mesmo.
 *
 * Os números são os MESMOS de `lib/presets.ts` da app MTM Auto. Duas listas com o mesmo nome e
 * valores diferentes seriam pior do que não ter presets: o cliente escolhia "MTM II · Balanced"
 * num sítio e arriscava outra coisa no outro.
 *
 * `personalizado` existe para o caso honesto: assim que se mexe num valor à mão, a conta deixa
 * de corresponder a um preset e dizer o contrário era mentir.
 */

export type IdPreset = 'conservador' | 'equilibrado' | 'agressivo' | 'prop' | 'personalizado'

export interface Preset {
  id: IdPreset
  nome: string
  descricao: string
  riscoPct: number
  riscoMaxPct: number
  maxPosicoes: number
  beAtivo: boolean
  beGatilho: number
  trailingAtivo: boolean
  /** TP1 · TP2 · TP3 — têm de somar 100. */
  saidasPct: [number, number, number]
}

export const PRESETS: Preset[] = [
  {
    id: 'conservador',
    nome: 'MTM I · Conservador',
    descricao: 'Risco pequeno, break-even cedo, quase tudo fora no primeiro alvo.',
    riscoPct: 0.5,
    riscoMaxPct: 1,
    maxPosicoes: 5,
    beAtivo: true,
    beGatilho: 1,
    trailingAtivo: true,
    saidasPct: [60, 25, 15],
  },
  {
    id: 'equilibrado',
    nome: 'MTM II · Equilibrado',
    descricao: 'O da casa: 1% por trade, break-even no TP1 e uma fatia a correr com trailing.',
    riscoPct: 1,
    riscoMaxPct: 2,
    maxPosicoes: 10,
    beAtivo: true,
    beGatilho: 1,
    trailingAtivo: true,
    saidasPct: [50, 30, 20],
  },
  {
    id: 'agressivo',
    nome: 'MTM III · Agressivo',
    descricao: 'Mais risco por trade e break-even mais tarde — corridas maiores, quedas maiores.',
    riscoPct: 2,
    riscoMaxPct: 3,
    maxPosicoes: 20,
    beAtivo: true,
    beGatilho: 2,
    trailingAtivo: true,
    saidasPct: [35, 30, 35],
  },
  {
    id: 'prop',
    nome: 'Conta financiada',
    descricao: 'Feito para passar e manter uma conta financiada: risco mínimo, parciais cedo, teto duro.',
    riscoPct: 0.25,
    riscoMaxPct: 0.5,
    maxPosicoes: 3,
    beAtivo: true,
    beGatilho: 1,
    trailingAtivo: true,
    saidasPct: [34, 33, 33],
  },
]

export function preset(id: string | null | undefined): Preset | null {
  return PRESETS.find((p) => p.id === id) ?? null
}

/** O preset que corresponde aos valores actuais — ou 'personalizado'. */
export function presetDosValores(v: {
  riscoPct: number
  riscoMaxPct: number
  saidasPct: number[]
  maxPosicoes?: number
  beGatilho?: number
}): IdPreset {
  const igual = PRESETS.find(
    (p) =>
      Math.abs(p.riscoPct - v.riscoPct) < 0.001 &&
      Math.abs(p.riscoMaxPct - v.riscoMaxPct) < 0.001 &&
      // Max posições e gatilho do break-even só entram na comparação quando a conta os tem: uma
      // ligação de Tap to Trade não guarda nenhum dos dois, e exigi-los dava sempre
      // "personalizado" a quem tinha acabado de escolher um preset.
      (v.maxPosicoes == null || p.maxPosicoes === v.maxPosicoes) &&
      (v.beGatilho == null || p.beGatilho === v.beGatilho) &&
      p.saidasPct.join(',') === v.saidasPct.slice(0, 3).join(','),
  )
  return igual?.id ?? 'personalizado'
}

/**
 * O preset traduzido para as colunas de uma ligação do site (`mtmcopy_connections`).
 *
 * A tabela do Tap to Trade não tem todos os campos do MTM Auto — não guarda máximo de posições
 * nem o alvo que dispara o break-even, porque quem carrega no botão é a pessoa. Aplica-se o que
 * existe: risco, teto, repartição das saídas e trailing.
 */
export function presetParaLigacao(p: Preset): Record<string, unknown> {
  return {
    t2t_lot_mode: 'risk_percent',
    t2t_lot_value: p.riscoPct,
    max_risk_percent: p.riscoMaxPct,
    exit_pct_tp1: p.saidasPct[0],
    exit_pct_tp2: p.saidasPct[1],
    exit_pct_tp3: p.saidasPct[2],
    auto_trailing_stop: p.trailingAtivo,
  }
}

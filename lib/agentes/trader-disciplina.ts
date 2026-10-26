/**
 * A DISCIPLINA DO AGENTE TRADER — o método do «day-trader-skill», traduzido para esta casa.
 *
 * ═══ DE ONDE VEM ═══════════════════════════════════════════════════════════════════════════
 *
 * O pacote público github.com/Jakeschincariol/day-trader-skill (MIT, revisto a 26/10/2026: só lê
 * dados públicos, não envia chaves a lado nenhum, nunca abre ordens sozinho) tem onze skills para
 * acções americanas. Os dados dele (Yahoo, Nasdaq, SEC) não servem para ouro, forex e índices, mas
 * o MÉTODO serve, e é isso que vem para aqui, peça a peça:
 *
 *  · `trader-timemachine` → {@link vantagemPorCombo}: antes de arriscar, olhar para todas as vezes
 *    que a MESMA estratégia deu sinal no MESMO símbolo e ver o que aconteceu de facto. Aqui não se
 *    simula nada: a amostra são as posições fechadas das contas SIM da casa (`agente_trader_vantagem`,
 *    migração 213). Sem amostra suficiente, ou com resultado negativo, não se abre;
 *  · `trader-risk` → {@link riscoRecompensa} e {@link travaoDiario}: recompensa mínima face ao
 *    risco, e um limite de perda do dia que fecha a porta até amanhã;
 *  · `trader-budget` → o tamanho continua a vir de `abrirSinalNaConta` (lote por 1000 da conta),
 *    que já é risco proporcional ao saldo;
 *  · `trader-broker` (papel por omissão, nunca sem o sim do dono) → já era a regra deste agente:
 *    `contaSegura()` em `trader.ts`.
 *
 * ═══ PORQUE É QUE ISTO É O QUE O TORNA LUCRATIVO ═══════════════════════════════════════════
 *
 * Medido a 26/10/2026 nas contas SIM (60 dias): a maior parte das combinações estratégia+símbolo
 * fecha a perder, mesmo com taxa de acerto alta — o lucro dos ganhos pequenos não paga os stops.
 * Abrir tudo o que chega é somar essas perdas. O agente passa a abrir só onde há vantagem MEDIDA,
 * e fica de fora onde não há. Ficar de fora também é uma decisão lucrativa.
 *
 * Nenhum número aqui é inventado: o limiar é configurável e a prova vem da base.
 */

/** Uma linha de `agente_trader_vantagem`: o histórico real de uma estratégia num símbolo. */
export interface HistoricoCombo {
  estrategia: string
  symbol: string
  /** Posições fechadas (fora das estatísticas excluídas). */
  n: number
  ganhos: number
  /** Soma do PnL em dinheiro. */
  pnl: number
  /** Soma do risco inicial (entrada→SL × lote) em dinheiro. */
  risco: number
  /** Soma de pnl/risco por posição (R por trade) e dos seus quadrados — para média e desvio. */
  somaR: number
  somaR2: number
}

export interface Vantagem {
  estrategia: string
  symbol: string
  n: number
  /** Taxa de acerto MEDIDA, 0..1. */
  acerto: number
  /** R médio por trade. */
  rMedio: number
  /** Erro padrão do R médio. Com amostra pequena é grande, e é por isso que conta. */
  erroPadrao: number
  pnl: number
  aprovada: boolean
  porque: string
}

/** A régua por omissão. Muda-se em `site_settings.agente_trader` sem tocar no código. */
export const REGUA_PADRAO = {
  /** Mínimo de posições fechadas para se acreditar no número. */
  minAmostra: 20,
  /** R médio por trade mínimo (0,05 = ganhar 5% do risco por trade, em média). */
  minRMedio: 0.05,
  /** Quantos erros padrão abaixo da média ainda têm de ficar acima de zero. 0 = desligado. */
  margemErros: 0,
  /** Recompensa até ao último TP, em múltiplos do risco. */
  minRR: 1,
  /** Perda do dia (fracção do saldo) que fecha a porta até amanhã. */
  perdaDiariaMax: 0.02,
} as const

export type Regua = { -readonly [K in keyof typeof REGUA_PADRAO]: number }

/** Lê a régua de `site_settings.agente_trader`, aceitando só números finitos e não negativos. */
export function lerRegua(bruto: unknown): Regua {
  const r: Regua = { ...REGUA_PADRAO }
  const fonte = (bruto && typeof bruto === 'object' ? (bruto as Record<string, unknown>).regua : null) as
    | Record<string, unknown>
    | null
  if (!fonte || typeof fonte !== 'object') return r
  for (const k of Object.keys(r) as (keyof Regua)[]) {
    const v = Number(fonte[k])
    if (fonte[k] != null && Number.isFinite(v) && v >= 0) r[k] = v
  }
  return r
}

export const chaveCombo = (estrategia: string, symbol: string) =>
  `${String(estrategia).trim().toLowerCase()}|${String(symbol).trim().toUpperCase()}`

/**
 * A MÁQUINA DO TEMPO, com o passado real em vez de simulado — pura.
 *
 * Aprova uma combinação só se as TRÊS coisas forem verdade: amostra suficiente, dinheiro positivo
 * (a soma do PnL, que é o que paga contas) e R médio acima do mínimo, menos a margem de erro. A
 * soma do PnL entra porque o R médio sozinho engana: muitos ganhos pequenos e poucos stops grandes
 * dão R médio positivo e conta a descer.
 */
export function vantagemPorCombo(linhas: HistoricoCombo[], regua: Regua = { ...REGUA_PADRAO }): Map<string, Vantagem> {
  const mapa = new Map<string, Vantagem>()
  for (const l of linhas) {
    const n = Math.max(0, Number(l.n) || 0)
    const rMedio = n > 0 ? (Number(l.somaR) || 0) / n : 0
    const variancia = n > 1 ? Math.max(0, ((Number(l.somaR2) || 0) - n * rMedio * rMedio) / (n - 1)) : Infinity
    const erroPadrao = n > 1 ? Math.sqrt(variancia / n) : Infinity
    const pnl = Number(l.pnl) || 0
    const acerto = n > 0 ? (Number(l.ganhos) || 0) / n : 0

    let aprovada = false
    let porque: string
    if (n < regua.minAmostra) {
      porque = `Amostra curta: ${n} de ${regua.minAmostra} trades fechados.`
    } else if (pnl <= 0) {
      porque = `Histórico a perder dinheiro: ${pnl.toFixed(2)} em ${n} trades.`
    } else if (rMedio - regua.margemErros * erroPadrao < regua.minRMedio) {
      porque = `Vantagem fraca: ${rMedio.toFixed(3)}R por trade (mínimo ${regua.minRMedio}R).`
    } else {
      aprovada = true
      porque = `Vantagem medida: ${rMedio.toFixed(3)}R por trade, ${(acerto * 100).toFixed(1)}% de acerto em ${n} trades.`
    }
    mapa.set(chaveCombo(l.estrategia, l.symbol), {
      estrategia: l.estrategia, symbol: l.symbol, n, acerto, rMedio, erroPadrao, pnl, aprovada, porque,
    })
  }
  return mapa
}

/**
 * RECOMPENSA FACE AO RISCO — pura. Usa o TP mais distante na direcção certa: é o alvo do sinal.
 * Devolve `null` quando não dá para medir (sem entrada, sem SL, sem TP do lado certo).
 */
export function riscoRecompensa(s: { direcao: 'buy' | 'sell'; entrada?: number | null; sl?: number | null; tps?: number[] | null }): number | null {
  const e = Number(s.entrada)
  const sl = Number(s.sl)
  if (!Number.isFinite(e) || !Number.isFinite(sl) || s.entrada == null || s.sl == null) return null
  const sentido = s.direcao === 'buy' ? 1 : -1
  const risco = (e - sl) * sentido
  if (!(risco > 0)) return null
  const alvos = (s.tps ?? []).map(Number).filter((t) => Number.isFinite(t) && (t - e) * sentido > 0)
  if (!alvos.length) return null
  const melhor = Math.max(...alvos.map((t) => (t - e) * sentido))
  return melhor / risco
}

/** O TRAVÃO DO DIA — puro. `true` quando a perda realizada de hoje já passou o limite. */
export function travaoDiario(pnlHoje: number, saldo: number, regua: Pick<Regua, 'perdaDiariaMax'> = REGUA_PADRAO): boolean {
  if (!(saldo > 0) || !(regua.perdaDiariaMax > 0)) return false
  return pnlHoje <= -regua.perdaDiariaMax * saldo
}

/** As métricas do próprio agente, em papel. Só factos: o que fechou e o que deu. */
export interface MetricasAgente {
  fechadas: number
  ganhos: number
  acerto: number | null
  pnl: number
  /** Σpnl / Σrisco — quantos riscos inteiros ganhou (ou perdeu) no total. */
  rTotal: number | null
  pnlHoje: number
}

export function metricasDoAgente(
  posicoes: Array<{ estado?: string | null; pnl?: number | string | null; risco_inicial?: number | string | null; fechada_em?: string | null }>,
  agora: Date = new Date(),
): MetricasAgente {
  const fechadas = posicoes.filter((p) => String(p.estado ?? '') === 'fechada')
  const hoje = agora.toISOString().slice(0, 10)
  let pnl = 0, risco = 0, ganhos = 0, pnlHoje = 0
  for (const p of fechadas) {
    const v = Number(p.pnl) || 0
    pnl += v
    risco += Math.abs(Number(p.risco_inicial) || 0)
    if (v > 0) ganhos++
    if (String(p.fechada_em ?? '').slice(0, 10) === hoje) pnlHoje += v
  }
  return {
    fechadas: fechadas.length,
    ganhos,
    acerto: fechadas.length ? ganhos / fechadas.length : null,
    pnl: Math.round(pnl * 100) / 100,
    rTotal: risco > 0 ? Math.round((pnl / risco) * 1000) / 1000 : null,
    pnlHoje: Math.round(pnlHoje * 100) / 100,
  }
}

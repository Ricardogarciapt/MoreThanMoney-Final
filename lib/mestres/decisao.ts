/**
 * A DECISÃO LIVE / SOMBRA / PARADO de cada evento de uma rota do motor — e as guardas que só impedem
 * ABRIR (pausa, exposição, atraso, conta bloqueada). Puro e testado (__tests__/mestres.check.ts).
 *
 * Ordem das fechaduras (a primeira que fecha decide):
 *   kill-switch → PARADO (nada é enviado, nem saídas; os eventos esperam na fila)
 *   global desligado · estratégia desligada · rota inactiva/por aprovar → PARADO
 *   estratégia em sombra → SOMBRA
 *   estratégia em live   → LIVE só com: live desbloqueado na instalação + MESTRES_ESCRITA=1 no processo
 *                          + conta em live + CopyFactory cortada (se a estratégia a tinha)
 *                          + (conta MTM Auto → mtm-auto já não executa esta estratégia)
 *                          Falta alguma → SOMBRA, com o motivo registado.
 *
 * Pausas NÃO param as saídas: uma conta pausada pelo cliente, uma rota com `pausada_motivo`, uma conta
 * bloqueada por falhas ou acima do limite de exposição deixam de ABRIR, mas parciais, BE, trailing e
 * fechos continuam — parar a gestão de uma posição aberta é pior do que não a ter aberto.
 */
import type { ConfigGlobalMestres, ContaMestres, EstrategiaMestre, ModoDecidido } from './tipos'

export interface EntradaDecisao {
  global: ConfigGlobalMestres
  /** MESTRES_ESCRITA=1 no processo do VPS */
  escritaNoProcesso: boolean
  estrategia: EstrategiaMestre | null
  conta: ContaMestres | null
  rota: { ativa: boolean; estado: string; tipo_rota?: string | null; destino_ref: string }
}

export interface Decisao {
  modo: ModoDecidido
  motivo: string
}

export function decidirModo(e: EntradaDecisao): Decisao {
  if (e.global.kill) return { modo: 'parado', motivo: 'kill-switch accionado' }
  if (!e.global.ligado) return { modo: 'parado', motivo: 'motor das mestres desligado (site_settings.mestres_motor.ligado)' }
  if (!e.estrategia) return { modo: 'parado', motivo: 'estratégia sem mestre nossa (mestres_estrategias)' }
  const modoEstrategia = e.rota.tipo_rota === 't2t' ? e.estrategia.t2tModo : e.estrategia.modo
  if (modoEstrategia === 'desligado') return { modo: 'parado', motivo: `estratégia ${e.estrategia.slug} desligada` }
  if (!e.rota.ativa || e.rota.estado !== 'aprovada') return { modo: 'parado', motivo: 'rota inactiva ou por aprovar' }
  if (modoEstrategia === 'sombra') return { modo: 'sombra', motivo: 'estratégia em sombra' }

  const faltas: string[] = []
  if (!e.global.liveDesbloqueado) faltas.push('live não desbloqueado na instalação')
  if (!e.escritaNoProcesso) faltas.push('MESTRES_ESCRITA≠1 no VPS')
  if (!e.conta || e.conta.modo !== 'live') faltas.push('conta em sombra')
  if (e.estrategia.copyfactoryIds.length && !e.estrategia.copyfactoryCortadoEm) faltas.push('CopyFactory por cortar')
  if (/^auto:/.test(e.rota.destino_ref) && !(e.estrategia.incluirMtmauto && e.estrategia.mtmautoCortadoEm)) {
    faltas.push('mtm-auto ainda executa esta estratégia')
  }
  if (faltas.length) return { modo: 'sombra', motivo: `live pedido, mas: ${faltas.join('; ')}` }
  return { modo: 'live', motivo: 'live' }
}

// ── guardas de ABERTURA (as saídas passam sempre) ───────────────────────────

/** Uma abertura mais velha do que o limite (fila parada, kill levantado, VPS reiniciado) não se envia. */
export function aberturaAtrasada(origemEm: string | null | undefined, criadoEm: string, agora: number, maxS: number): string | null {
  const base = Date.parse(origemEm ?? criadoEm)
  if (!Number.isFinite(base)) return null
  const atraso = (agora - base) / 1000
  return atraso > maxS ? `abertura com ${Math.round(atraso)} s de atraso (máximo ${maxS} s) — não se entra a meio do movimento` : null
}

export interface PosicaoAbertaConta {
  volume: number
  /** risco em % da equity no momento da abertura (null = sem SL/sem valor do tick) */
  riscoPct: number | null
}

export interface LimitesExposicao {
  maxPosicoes: number
  maxRiscoTotalPct: number
  maxLoteTotal: number | null
}

/**
 * Limite de exposição da CONTA (somado entre todas as estratégias e o T2T do motor). Uma posição sem
 * risco conhecido (sem SL à corretora — Equity Edge) conta pelo pior caso configurado: não se lhe dá
 * risco zero, porque zero seria abrir tudo sem limite.
 */
export function motivoExposicao(
  abertas: PosicaoAbertaConta[],
  novo: { volume: number; riscoPct: number | null },
  l: LimitesExposicao,
  riscoDesconhecidoPct = 2,
): string | null {
  if (abertas.length + 1 > l.maxPosicoes) return `limite de ${l.maxPosicoes} posições abertas na conta`
  const risco = (x: number | null) => (x != null && Number.isFinite(x) && x >= 0 ? x : riscoDesconhecidoPct)
  const total = abertas.reduce((s, p) => s + risco(p.riscoPct), 0) + risco(novo.riscoPct)
  if (total > l.maxRiscoTotalPct + 1e-9) return `risco total ${total.toFixed(2)}% acima do limite de ${l.maxRiscoTotalPct}% da conta`
  if (l.maxLoteTotal != null) {
    const lotes = abertas.reduce((s, p) => s + p.volume, 0) + novo.volume
    if (lotes > l.maxLoteTotal + 1e-9) return `${lotes.toFixed(2)} lotes abertos acima do limite de ${l.maxLoteTotal}`
  }
  return null
}

/** Risco em % da equity de uma posição: distância ao SL × valor de 1,0 de preço por lote × lotes. */
export function riscoPctDaPosicao(p: { volume: number; distanciaSl: number | null; valorPorPrecoPorLote: number | null; equity: number | null }): number | null {
  if (!(p.distanciaSl != null && p.distanciaSl > 0 && p.valorPorPrecoPorLote != null && p.valorPorPrecoPorLote > 0 && p.equity != null && p.equity > 0)) return null
  return (p.distanciaSl * p.valorPorPrecoPorLote * p.volume) / p.equity * 100
}

// ── falhas e alertas ─────────────────────────────────────────────────────────

export interface ResultadoFalhas {
  falhasSeguidas: number
  /** true só na falha que atinge N (um alerta, não um por falha) */
  alertar: boolean
  /** true só na falha que atinge o limite de bloqueio */
  bloquear: boolean
}

/**
 * Contagem de falhas SEGUIDAS numa conta. Um sucesso põe a zero. Alerta ao chegar a `n`; bloqueia as
 * ABERTURAS ao chegar a `bloqueio` (0 = nunca bloqueia sozinho). Recusas da corretora por regra do
 * cliente (símbolo inexistente, lote abaixo do mínimo) não são falhas técnicas — o chamador decide.
 */
export function aposResultado(falhasAntes: number, sucesso: boolean, n: number, bloqueio: number): ResultadoFalhas {
  if (sucesso) return { falhasSeguidas: 0, alertar: false, bloquear: false }
  const f = falhasAntes + 1
  return { falhasSeguidas: f, alertar: n > 0 && f === n, bloquear: bloqueio > 0 && f === bloqueio }
}

/** Erro técnico (conta a falha) vs recusa por regra (não conta). */
export function eFalhaTecnica(erro: string | null | undefined): boolean {
  if (!erro) return false
  return !/não existe no destino|abaixo de metade do mínimo|fora do filtro|máximo de \d+ posições|limite de|risco total|atraso|duplicad|não aceite|pausad|bloqueada/i.test(erro)
}

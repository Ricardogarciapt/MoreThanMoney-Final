/**
 * O desempenho de uma estratégia MTM Auto — tal e qual a app MTM Auto o mostra.
 *
 * ── Porque é que isto existe ──────────────────────────────────────────────────────────────────
 * A mesma estratégia tinha TRÊS números na MTM System e um quarto na MTM Auto:
 *   - cartão da app-mobile  → reposição contra velas (`/api/mtm-auto/desempenho`, 35,1% no GoldKiller);
 *   - retrato (webview + nativo iOS) → leitura própria da conta provider, com um mapa de contas
 *     que já tinha divergido do da MTM Auto (Sensei/Aurum apontavam a contas que a MTM Auto largou);
 *   - MTM Auto → `/api/auto/providers` (71,4% no GoldKiller, «sem histórico» no Sensei).
 * O cliente via 35% num ecrã e 71% no outro para a mesma estratégia, no mesmo dia.
 *
 * ── A regra ───────────────────────────────────────────────────────────────────────────────────
 * Quem manda é a MTM Auto. A MTM System pede-lhe o catálogo (`/api/auto/providers`, com o mesmo
 * token do cliente) e esta função só TRADUZ a linha dela para o formato dos ecrãs da MTM System.
 * Não recalcula nada: recalcular é exactamente o que fez os números divergirem.
 *
 * ── Os 90 dias (desde 2026-09-18) ─────────────────────────────────────────────────────────────
 * A linha da MTM Auto já não é só a conta de execução actual: são as trades REAIS fechadas nos
 * últimos 90 dias de TODAS as contas que executaram a estratégia (actual + anteriores + copiadoras
 * + execuções da app), sem duplicados, parciais pesadas (mtm-auto `lib/desempenho-90d.ts`). Para
 * aqui não muda nada: continua-se a traduzir, não a recalcular.
 * As contas SIMULADAS nunca vêm nos números principais. Quando uma estratégia só tem simuladas
 * em 90 dias, a MTM Auto manda-as em `simuladas` e o principal fica «sem histórico»; aqui passam
 * tal e qual no campo `simuladas` do retrato — os ecrãs NÃO as mostram (decisão de apresentação
 * por tomar com o dono).
 *
 * ── O que nunca sai daqui ─────────────────────────────────────────────────────────────────────
 * Dinheiro. Só percentagem, contagens, fator de lucro e pips (a curva da MTM Auto já vem em pips).
 * O campo `pips` do catálogo NÃO se usa: é a soma de `mtmauto_signals` (tudo-ou-nada, sem
 * parciais) e a própria MTM Auto não o mostra — mostra o acumulado da curva.
 */

/** A linha de uma estratégia em `GET /api/auto/providers` da MTM Auto (só o que se lê aqui). */
export interface ProvedorMtmAuto {
  id: string
  nome?: string | null
  sinais?: number | null
  fechados?: number | null
  ganhos?: number | null
  perdas?: number | null
  breakeven?: number | null
  winrate?: number | null
  fatorLucro?: number | null
  daContaProvider?: boolean | null
  curva?: Array<{ quando: string; pips: number; acumulado: number }> | null
  /** De onde vieram os números principais (contas reais, 90 dias). Informação, não se mostra. */
  historico90d?: { contas: number; porFonte: Record<string, number>; desde: string } | null
  /** Só contas SIMULADAS, e só quando não há nenhuma trade real em 90 dias. */
  simuladas?: MetricasSimuladas | null
}

/** Métricas de contas SIMULADAS (motor sim). Nunca juntas às reais. Nunca dinheiro. */
export interface MetricasSimuladas {
  origem: 'simulada'
  trades: number
  ganhos: number
  perdas: number
  breakeven: number
  winrate: number | null
  fatorLucro: number | null
  pips: number
  curva: Array<{ quando: string; pips: number; acumulado: number }>
  contas: number
  desde: string
}

/** O retrato que os ecrãs da MTM System (webview e nativo iOS) desenham. */
export interface DesempenhoEstrategia {
  origem: 'provider' | 'sinais'
  contaProvider: string | null
  sinais: number
  fechados: number
  ganhos: number
  perdas: number
  breakeven: number
  /** A MESMA percentagem da MTM Auto. `null` = sem histórico — nunca um zero inventado. */
  winrate: number | null
  fatorLucro: number | null
  /** Pips acumulados da curva da MTM Auto; `null` sem curva. */
  pips: number | null
  curva: Array<{ quando: string; pips: number; acumulado: number }>
  esteveEmLucro: number
  alvos: { alvo: string; acertos: number }[]
  /**
   * Sempre `true` numa estratégia MTM Auto: a medição é a da MTM Auto (por posição, com as
   * parciais). Sem histórico, as caixas saem com «—» e zeros verdadeiros (0 trades fechadas), e o
   * iOS nativo (que não se muda sem build nova) mostra «Sem trades fechadas» em vez de calcular
   * «0% dos sinais estiveram em lucro» sobre sinais que ainda não fecharam.
   */
  medicaoFiavel: boolean
  porqueNaoFiavel: string | null
  /** Veio do catálogo da MTM Auto — para quem quiser verificar a origem. */
  fonte: 'mtm-auto'
  /**
   * Métricas de contas SIMULADAS, só quando a estratégia não tem trades reais em 90 dias. Os
   * números acima continuam «sem histórico» — estas NUNCA se somam a eles. `null` = nenhuma.
   */
  simuladas?: MetricasSimuladas | null
}

/** A parte simulada da linha, validada (só números; nunca dinheiro). */
export function simuladasDoCatalogo(p: ProvedorMtmAuto | null | undefined): MetricasSimuladas | null {
  const s = p?.simuladas
  if (!s || s.origem !== 'simulada' || !(num(s.trades) > 0)) return null
  const fin = (v: unknown) => (v != null && Number.isFinite(Number(v)) ? Number(v) : null)
  return {
    origem: 'simulada',
    trades: num(s.trades),
    ganhos: num(s.ganhos),
    perdas: num(s.perdas),
    breakeven: num(s.breakeven),
    winrate: fin(s.winrate),
    fatorLucro: fin(s.fatorLucro),
    pips: num(s.pips),
    curva: Array.isArray(s.curva) ? s.curva.filter((x) => x && Number.isFinite(Number(x.acumulado))) : [],
    contas: num(s.contas),
    desde: String(s.desde ?? ''),
  }
}

export const SEM_HISTORICO = 'Sem histórico suficiente'

const num = (v: unknown): number => (Number.isFinite(Number(v)) ? Number(v) : 0)

/**
 * Tem histórico medido? Exactamente a condição da MTM Auto: há percentagem e há trades fechadas.
 * Sem limiar próprio — um limiar aqui voltava a esconder na MTM System o que a MTM Auto mostra.
 */
export function temHistorico(p: ProvedorMtmAuto | null | undefined): boolean {
  if (!p) return false
  return p.winrate != null && Number.isFinite(Number(p.winrate)) && num(p.fechados) > 0
}

/** O texto curto do cartão: «71,4% de acerto · 7 trades» ou «Sem histórico suficiente». */
export function resumoDoCartao(p: ProvedorMtmAuto | null | undefined): string {
  if (!p || !temHistorico(p)) return SEM_HISTORICO
  const pct = String(Number(p.winrate)).replace('.', ',')
  const n = num(p.fechados)
  return `${pct}% de acerto · ${n} ${n === 1 ? 'trade' : 'trades'}`
}

/** A linha da MTM Auto → o retrato da MTM System. `null` (não se leu) ≠ «sem histórico». */
export function desempenhoDoCatalogo(p: ProvedorMtmAuto): DesempenhoEstrategia {
  const curva = Array.isArray(p.curva)
    ? p.curva.filter((x) => x && Number.isFinite(Number(x.acumulado)))
    : []
  const ultimo = curva.length ? Number(curva[curva.length - 1]!.acumulado) : null
  const com = temHistorico(p)
  return {
    origem: p.daContaProvider ? 'provider' : 'sinais',
    contaProvider: p.daContaProvider ? (p.nome ?? null) : null,
    sinais: num(p.sinais),
    fechados: com ? num(p.fechados) : 0,
    ganhos: com ? num(p.ganhos) : 0,
    perdas: com ? num(p.perdas) : 0,
    breakeven: com ? num(p.breakeven) : 0,
    winrate: com ? Number(p.winrate) : null,
    fatorLucro: com && p.fatorLucro != null && Number.isFinite(Number(p.fatorLucro)) ? Number(p.fatorLucro) : null,
    pips: com && ultimo != null ? Math.round(ultimo * 10) / 10 : null,
    curva: com ? curva : [],
    esteveEmLucro: com ? num(p.ganhos) : 0,
    alvos: [],
    medicaoFiavel: true,
    porqueNaoFiavel: com
      ? null
      : `${SEM_HISTORICO}: esta estratégia ainda não tem trades fechadas medidas na app MTM Auto.`,
    fonte: 'mtm-auto',
    // Só quando NÃO há histórico real (é o que a MTM Auto garante; aqui repete-se a guarda).
    simuladas: com ? null : simuladasDoCatalogo(p),
  }
}

const MTM_AUTO = process.env.MTM_AUTO_BASE_URL?.trim() || 'https://mtm-auto.vercel.app'

/**
 * O catálogo da MTM Auto, com o token do cliente (filtrado pela equipa dele, como lá).
 * `null` = a MTM Auto não respondeu — quem chama diz «não deu para ler», não «sem histórico».
 */
export async function lerCatalogoMtmAuto(token: string): Promise<ProvedorMtmAuto[] | null> {
  try {
    const r = await fetch(`${MTM_AUTO}/api/auto/providers`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
      signal: AbortSignal.timeout(25_000),
    })
    if (!r.ok) return null
    const j = (await r.json().catch(() => null)) as { providers?: ProvedorMtmAuto[] } | null
    return Array.isArray(j?.providers) ? j!.providers! : null
  } catch {
    return null
  }
}

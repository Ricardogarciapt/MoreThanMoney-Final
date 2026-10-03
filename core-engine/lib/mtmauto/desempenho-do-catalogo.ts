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
 * tal e qual no campo `simuladas` do retrato. Desde 24/09 os ecrãs MOSTRAM-nas — separadas, com a
 * etiqueta da origem e a ressalva do preço, nunca somadas ao real. O porquê e as regras estão em
 * `retratoSimulado`, mais abaixo.
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

// ── histórico SIMULADO: quando é que aparece, e com que ressalva ──────────────────────────────

/**
 * ── Porque é que as simuladas passaram a aparecer (decisão do dono, 24/09) ────────────────────
 * As contas-mestre das estratégias próprias da MTM Auto (Edge, King, Wolf, Scanner) nasceram a
 * 15/09 já como contas MTM Funded SIMULADAS. Pela regra acima — «as simuladas nunca vêm nos
 * números principais» — essas estratégias ficavam com «sem histórico» e ficariam assim para
 * sempre: não há nenhuma conta real a executá-las, e não vai passar a haver.
 *
 * Havia duas saídas e nenhuma terceira: ou «sem histórico» até ao fim dos tempos, ou o número
 * simulado à vista. O dono escolheu a segunda. O que NÃO muda é o que o número é:
 *
 *  1. continua MEDIDO — são as posições fechadas que o motor `sim` abriu e fechou, com as
 *     parciais pesadas, tal como no lado real. Nenhum valor fixo, nenhuma média construída;
 *  2. continua SEPARADO — nunca se soma ao histórico real nem lhe faz média. Quem tem os dois
 *     vê os dois, com a etiqueta de cada um, pela mesma razão por que o `historico-auditado.ts`
 *     põe «conta pessoal com gestão manual» ao lado do regime de hoje em vez de os misturar;
 *  3. continua DITO — o cartão e o retrato escrevem de onde vem. Um número simulado sem a
 *     palavra «simulado» ao lado é um número real aos olhos de quem o lê.
 */

/**
 * Até quando é que os preços de entrada do motor `sim` estavam viciados a favor da casa.
 *
 * O defeito vivia no preenchimento das contas em motor `sim` (`lib/mtmfunded/precos/*`): a
 * entrada saía melhor do que o mercado dava, em 6 de cada 7 trades. Tudo o que o motor abriu
 * ANTES desta hora está inflacionado — e é justamente o caso de todo o histórico simulado que
 * hoje existe (as mestres abriram a 15/09).
 *
 * O valor é o mesmo de `FRONTEIRA_VIES_PRECO` em `lib/pips-proof.ts`, onde a nota da prova já
 * nasceu; está repetido aqui porque este ficheiro vive nos dois repositórios e o outro não. O
 * teste ao lado (`__tests__/desempenho-do-catalogo.check.ts`) compara os dois para não divergirem.
 */
export const FRONTEIRA_VIES_PRECO_SIM = '2026-09-24T14:23:58.000Z'

/**
 * Esta amostra simulada apanha o período dos preços viciados?
 *
 * Mede-se pelo fecho mais antigo da curva: um fecho anterior à correcção só pode vir de uma
 * entrada anterior a ela. Sem curva não há como verificar — e então avisa-se à mesma, que é o
 * mesmo lado para que `pips-proof.ts` erra: na dúvida sobre se a amostra está limpa, avisa-se.
 */
export function viesDePrecoSim(s: MetricasSimuladas | null | undefined): boolean {
  if (!s) return false
  const quandos = s.curva.map((c) => Date.parse(String(c.quando))).filter((t) => Number.isFinite(t))
  if (!quandos.length) return true
  return Math.min(...quandos) < Date.parse(FRONTEIRA_VIES_PRECO_SIM)
}

/** O que o cartão e o retrato desenham quando o histórico que há é simulado. */
export interface RetratoSimulado {
  /** «78,6% de acerto · 56 trades» — a mesma frase do lado real, para não haver duas gramáticas. */
  resumo: string
  /** Chave do dicionário para a etiqueta de origem. A MTM Auto traduz; a app-mobile usa `pt()`. */
  chaveEtiqueta: string
  /** Chave da ressalva do preço viciado, ou `null` se a amostra não apanha esse período. */
  chaveNota: string | null
  metricas: MetricasSimuladas
}

export const CHAVE_ORIGEM_SIMULADA = 'estrategias.origemSimulada'
export const CHAVE_VIES_PRECO_SIM = 'estrategias.viesPrecoSim'

/**
 * O retrato simulado de uma linha do catálogo — `null` quando não há nenhum a mostrar.
 *
 * Só devolve alguma coisa quando NÃO há histórico real: a MTM Auto já só manda `simuladas` nesse
 * caso, e a guarda repete-se aqui para que uma mudança lá não passe a somar os dois sem se dar
 * por ela.
 */
export function retratoSimulado(p: ProvedorMtmAuto | null | undefined): RetratoSimulado | null {
  if (!p || temHistorico(p)) return null
  const s = simuladasDoCatalogo(p)
  if (!s || s.winrate == null || !(s.trades > 0)) return null
  const pct = String(s.winrate).replace('.', ',')
  return {
    resumo: `${pct}% de acerto · ${s.trades} ${s.trades === 1 ? 'trade' : 'trades'}`,
    chaveEtiqueta: CHAVE_ORIGEM_SIMULADA,
    chaveNota: viesDePrecoSim(s) ? CHAVE_VIES_PRECO_SIM : null,
    metricas: s,
  }
}

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

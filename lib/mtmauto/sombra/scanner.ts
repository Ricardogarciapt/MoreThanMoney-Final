/**
 * SOMBRA DO MTM SCANNER — o que a estratégia `mtm-scanner` TERIA feito se executasse, medido em
 * velas reais, sem abrir trade nenhuma.
 *
 * QUEM DECIDE A EXECUÇÃO É `mtmauto_providers.ativo`, e só ele. O Scanner está com `ativo = false`
 * (desde 11/09, 27 perdas seguidas na conta-mestre 19042) e continua em `SLUGS_QUE_NAO_EXECUTAM`
 * (lib/mtmcopy/contas-provider-estrategia.ts). `sinais_config.modo = 'sombra'` (migração 108) é só
 * uma ETIQUETA para o painel: diz «isto está a ser medido de propósito», não liga nem desliga nada.
 * Nenhum executor lê `modo`.
 *
 * O QUE CONTA COMO «TERIA SIDO EXECUTADO» — a cadeia de `canExecuteProvider` do webhook do
 * TradingView, com UMA diferença: a exclusão `scannerKey !== "mtmscanner"` é levantada (é
 * exactamente a pergunta que se faz). Tudo o resto é o mesmo código (lib/mtmcopy/webhook-gates e
 * lib/mtmcopy/signal-rules), com as regras e interruptores lidos da base NA HORA da medição:
 *  1. publicado (gate de ruído `passesAlertGate`) — o T2T e o MTM Auto só vêem o que é publicado;
 *  2. classe ouro ou forex (os índices nunca executam por este caminho);
 *  3. interruptor de execução da classe ligado;
 *  4. gate de qualidade (≥2 confirmações, timeframe da classe) e sanidade do stop;
 *  5. gate de execução (`passesExecGate`: exclusões do Scanner, whitelist, confirmações, XAU só BUY).
 * O interruptor de RECEÇÃO (intake) fica de fora: desligado, o sinal nem chegava à base — se está na
 * tabela, passou.
 *
 * COMO SE EXECUTARIA — a gestão que `configDoProvider` devolve AGORA para a linha da estratégia
 * (a mesma função do motor simulado e do motor em tempo real), traduzida para R sinal a sinal com a
 * precedência de `gestaoDoSinal`. O stop é alargado ao mínimo da fonte (`slComMinimo`, 20 pips no
 * Scanner) como faz a conta-espelho T2T: sem isso as trades nasciam dentro do spread.
 */
import { configDoProvider, type ConfigSinais } from '../../mtmfunded/estrategias-sinais/calculo'
import { slComMinimo } from '../../mtmcopy/source-risk-rules'
import { passesAlertGate, passesExecGate, type SignalRules } from '../../mtmcopy/signal-rules'
import { pipSizeForSymbol, precoDaCorretora } from '../../mtmcopy/trade-outcome'
import { classifyAsset, confirmationsPassed, passesQualityGate, stopsSane, type AssetClass } from '../../mtmcopy/webhook-gates'
import {
  perdasSeguidas, piorSequencia, replicar,
  type Direcao, type Perfil, type Resultado, type Sinal, type Vela,
} from '../../estudos/replay-velas'

export const SLUG_SCANNER = 'mtm-scanner'
export const ALERT_NAME_SCANNER = 'MTMScanner'
/** 3 dias de M15: o Scanner é de 15 m; o que não resolve em 3 dias já não é a trade. */
export const JANELA_BARRAS = 288

export interface LinhaSinal {
  id: string
  received_at: string
  ticker: string | null
  action: string | null
  raw_payload: Record<string, unknown> | null
}

export interface Interruptores {
  forex?: boolean
  sensei?: boolean
  sensei_entries?: boolean
}

export type Veredicto =
  | { ok: true; classe: AssetClass }
  | { ok: false; motivo: string }

const num = (v: unknown): number | null => {
  const n = Number(v)
  return v != null && v !== '' && Number.isFinite(n) && n > 0 ? n : null
}

/** A cadeia de `canExecuteProvider` do webhook, sem a exclusão do Scanner. Pura. */
export function teriaExecutado(l: LinhaSinal, regras: SignalRules, sw: Interruptores): Veredicto {
  const p = (l.raw_payload ?? {}) as Record<string, unknown>
  const ticker = String(l.ticker ?? p.ticker ?? '').toUpperCase()
  if (!ticker) return { ok: false, motivo: 'sem símbolo' }
  const classe = classifyAsset(ticker)
  const dir = String(l.action ?? p.action ?? '').toLowerCase()
  const conf = confirmationsPassed(p)
  const timeframe = p.timeframe != null ? String(p.timeframe) : p.interval != null ? String(p.interval) : null

  if (!passesAlertGate(regras, ticker, conf, 'mtmscanner', classe)) return { ok: false, motivo: 'não publicado (gate de ruído)' }
  if (classe !== 'forex' && classe !== 'gold_btc') return { ok: false, motivo: `classe ${classe} não executa` }
  const interruptor = classe === 'forex' ? sw.forex === true : sw.sensei === true && sw.sensei_entries === true
  if (!interruptor) return { ok: false, motivo: `interruptor de execução ${classe} desligado` }
  if (dir !== 'buy' && dir !== 'sell') return { ok: false, motivo: 'sem direcção' }
  if (!passesQualityGate(p, timeframe, classe)) return { ok: false, motivo: 'gate de qualidade (confirmações/timeframe)' }
  const entrada = precoDaCorretora(num(p.entry), ticker) ?? precoDaCorretora(num(p.price), ticker)
  if (!stopsSane(entrada, precoDaCorretora(num(p.sl), ticker))) return { ok: false, motivo: 'stop absurdo' }
  const g = passesExecGate(regras, ticker, dir, conf, 'mtmscanner', classe)
  if (!g.ok) return { ok: false, motivo: `gate de execução: ${g.reason ?? '?'}` }
  return { ok: true, classe }
}

/** Motivo agrupável (sem números nem símbolos) para a tabela «ficaram de fora». */
export function motivoAgrupado(motivo: string): string {
  return motivo
    .replace(/[A-Z]{6}\s+fora da whitelist/, 'símbolo fora da whitelist')
    .replace(/[A-Z0-9]+ excluído para o scanner/, 'símbolo excluído para o Scanner')
    .replace(/confirmações \d+ < \d+ \((buy|sell|\?)\)/, 'confirmações insuficientes')
}

// ── o sinal como se executaria ───────────────────────────────────────────────

/**
 * Meio spread, em preço, para os pares do Scanner (a tabela do estudo GoldKiller só conhece quatro
 * pares e cai na taxa dos perpétuos — 0,05% do preço, ~4 pips num par a 0,85). Números prudentes de
 * uma conta ECN de retalho: 1,2 pips nos majors, 2,5 nos cruzados, 0,32 $ no ouro.
 */
export function meioSpreadScanner(ticker: string): number {
  const t = ticker.toUpperCase()
  if (t === 'XAUUSD') return 0.32 / 2
  const majors = /^(EURUSD|GBPUSD|USDJPY|USDCHF|USDCAD|AUDUSD|NZDUSD)$/
  return (pipSizeForSymbol(t) * (majors.test(t) ? 1.2 : 2.5)) / 2
}

/** Candidatos EXCHANGE:SYMBOL no TradingView — a BlackBull é a corretora de onde o Scanner lê. */
export function candidatosTvScanner(ticker: string): string[] {
  const t = ticker.toUpperCase()
  if (t === 'XAUUSD') return ['OANDA:XAUUSD', 'BLACKBULL:XAUUSD']
  return [`BLACKBULL:${t}`, `OANDA:${t}`, `FX:${t}`]
}

export interface OpcoesSinal {
  /** alargar o stop ao mínimo da fonte (por omissão sim — é o que a execução faz) */
  slMinimo?: boolean
}

/** Linha da base → sinal pronto para replay (ou o motivo por que não se consegue medir). */
export function sinalDaLinha(l: LinhaSinal, op: OpcoesSinal = {}): Sinal | { erro: string } {
  const p = (l.raw_payload ?? {}) as Record<string, unknown>
  const ticker = String(l.ticker ?? p.ticker ?? '').toUpperCase()
  const dir = String(l.action ?? p.action ?? '').toLowerCase()
  const direcao: Direcao | null = dir === 'buy' ? 'buy' : dir === 'sell' ? 'sell' : null
  if (!direcao) return { erro: 'sem direcção' }
  const entrada = precoDaCorretora(num(p.entry), ticker)
  const slOriginal = precoDaCorretora(num(p.sl), ticker)
  if (!entrada || !slOriginal) return { erro: 'sem entrada ou sem stop' }
  const sinal = direcao === 'buy' ? 1 : -1
  if ((entrada - slOriginal) * sinal <= 0) return { erro: 'stop do lado errado' }
  const sl = op.slMinimo === false ? slOriginal : slComMinimo('mtmscanner', ticker, direcao, entrada, slOriginal) ?? slOriginal
  const tps = [p.tp1 ?? p.tp, p.tp2, p.tp3, p.tp4]
    .map((x) => precoDaCorretora(num(x), ticker))
    .filter((x): x is number => x != null && (x - entrada) * sinal > 0)
  if (!tps.length) return { erro: 'sem nenhum alvo do lado certo' }
  tps.sort((a, b) => (a - b) * sinal)
  return { id: String(l.id), em: new Date(l.received_at).getTime(), ticker, tv: candidatosTvScanner(ticker)[0], direcao, entrada, sl, tps }
}

/**
 * A gestão da estratégia (`ConfigSinais`) em R para UM sinal — a mesma precedência de
 * `gestaoDoSinal`: fracção do risco → pips → TP1. O risco é o da execução (entrada com spread → SL),
 * como lá. Assume-se a conta-mestre de 10 000 (0,10 lote), onde as parciais de 50/25% existem.
 */
export function perfilParaSinal(cfg: ConfigSinais, s: Sinal, meio: number): Perfil {
  const pip = pipSizeForSymbol(s.ticker)
  const sinal = s.direcao === 'buy' ? 1 : -1
  const exec = s.entrada + sinal * meio
  const Rp = Math.abs(exec - s.sl)
  const dist = (x: number) => Math.abs(x - exec)
  const tp1 = s.tps[0] ?? null

  const partes = cfg.saidasPct
    .map((pct) => pct / 100)
    .slice(0, Math.min(3, Math.max(0, s.tps.length - 1)))

  const perfil: Perfil = { nome: 'estratégia', beR: null, beOffsetR: (cfg.beOffsetPips * pip) / Rp, trailArranqueR: null, trailDistanciaR: 0, partes }
  if (cfg.beFracaoDoRisco != null) {
    perfil.beR = cfg.beFracaoDoRisco
    if (cfg.beOffsetFracaoDoRisco != null) perfil.beOffsetR = cfg.beOffsetFracaoDoRisco
  } else if (cfg.beGatilhoPips != null) {
    perfil.beR = (cfg.beGatilhoPips * pip) / Rp
  } else if (cfg.beNoTp1 && tp1 != null) {
    if (partes.length) perfil.beNoTp1 = true
    else perfil.beR = dist(tp1) / Rp
  }
  // `validarGestao` (072): a folga tem de ficar abaixo do gatilho, senão vai a zero.
  if (perfil.beR != null && perfil.beOffsetR >= perfil.beR) perfil.beOffsetR = 0

  const distancia = cfg.trailingDistanciaPips != null ? cfg.trailingDistanciaPips * pip : Rp * cfg.trailingFracaoDoRisco
  if (!cfg.semTrailing && distancia >= pip) {
    perfil.trailDistanciaR = distancia / Rp
    const inicio = cfg.trailingInicioFracaoDoRisco != null
      ? Rp * cfg.trailingInicioFracaoDoRisco
      : cfg.trailingInicioPips != null ? cfg.trailingInicioPips * pip : tp1 != null ? dist(tp1) : null
    perfil.trailArranqueR = inicio != null && inicio > 0 ? inicio / Rp : null
  }
  return perfil
}

/** A gestão legível, para o relatório e para `estrategia_sombra_dia.gestao`. */
export function descreverGestao(cfg: ConfigSinais, slMinimo = true): Record<string, unknown> {
  return {
    saidas_pct: cfg.saidasPct,
    break_even: cfg.beFracaoDoRisco != null ? `${cfg.beFracaoDoRisco}R`
      : cfg.beGatilhoPips != null ? `${cfg.beGatilhoPips} pips`
      : cfg.beNoTp1 ? `no TP1 (+${cfg.beOffsetPips} pips)` : 'sem',
    trailing: cfg.semTrailing ? 'sem'
      : `arranca ${cfg.trailingInicioFracaoDoRisco != null ? `${cfg.trailingInicioFracaoDoRisco}R` : cfg.trailingInicioPips != null ? `${cfg.trailingInicioPips} pips` : 'no TP1'}`
        + ` · distância ${cfg.trailingDistanciaPips != null ? `${cfg.trailingDistanciaPips} pips` : `${cfg.trailingFracaoDoRisco}R`}`,
    sl_minimo: slMinimo ? '20 pips (slComMinimo)' : 'o do sinal',
    janela: '3 dias de M15',
  }
}

export { configDoProvider }

// ── trades e resumo ──────────────────────────────────────────────────────────

export interface TradeSombra {
  id: string
  ticker: string
  direcao: Direcao
  em: number
  R: number
  motivo: Resultado['motivo']
  inicioEm: number
  fechoEm: number
  /** velas seguidas; `motivo = 'aberta'` com a janela inteira quer dizer «fechada a mercado ao fim de 3 dias» */
  barras: number
}

/** Ainda por resolver: aberta E sem a janela completa (as velas acabaram antes dos 3 dias). */
export const porResolver = (t: TradeSombra) => t.motivo === 'aberta' && t.barras < JANELA_BARRAS

export function mediraSinal(s: Sinal, velas: Vela[], cfg: ConfigSinais): TradeSombra | { erro: string } {
  const meio = meioSpreadScanner(s.ticker)
  const r = replicar(s, velas, perfilParaSinal(cfg, s, meio), { janelaBarras: JANELA_BARRAS, meio })
  if ('erro' in r) return r
  return { id: s.id, ticker: s.ticker, direcao: s.direcao, em: s.em, R: r.R, motivo: r.motivo, inicioEm: r.inicioEm, fechoEm: r.fechoEm, barras: r.barras }
}

const moedas = (t: string) => (/^[A-Z]{6}$/.test(t) ? [t.slice(0, 3), t.slice(3)] : [t])

export interface Exposicao {
  /** máximo de posições abertas ao mesmo tempo */
  max: number
  /** quando aconteceu (ms) */
  em: number | null
  /** a moeda mais repetida nesse conjunto, e em quantas posições estava */
  moeda: string | null
  moedaN: number
  /** o pior momento para UMA moeda (em qualquer altura) */
  piorMoeda: string | null
  piorMoedaN: number
}

/**
 * Posições abertas em simultâneo, varrendo aberturas e fechos. Num empate de tempo o fecho vem
 * primeiro: uma trade que fecha na vela em que outra abre não conta como sobreposta.
 * `contarSo` limita os MÁXIMOS às aberturas dentro de um intervalo (o dia), sem esquecer as
 * posições que vinham de trás.
 */
export function exposicaoMaxima(trades: TradeSombra[], contarSo?: { de: number; ate: number }): Exposicao {
  const ev: { t: number; tipo: 0 | 1; tr: TradeSombra }[] = []
  for (const tr of trades) {
    ev.push({ t: tr.inicioEm, tipo: 1, tr })
    ev.push({ t: tr.fechoEm, tipo: 0, tr })
  }
  ev.sort((a, b) => a.t - b.t || a.tipo - b.tipo)
  const abertas = new Set<TradeSombra>()
  const porMoeda = new Map<string, number>()
  const out: Exposicao = { max: 0, em: null, moeda: null, moedaN: 0, piorMoeda: null, piorMoedaN: 0 }
  for (const e of ev) {
    if (e.tipo === 0) {
      if (!abertas.delete(e.tr)) continue
      for (const m of moedas(e.tr.ticker)) porMoeda.set(m, (porMoeda.get(m) ?? 1) - 1)
      continue
    }
    abertas.add(e.tr)
    for (const m of moedas(e.tr.ticker)) porMoeda.set(m, (porMoeda.get(m) ?? 0) + 1)
    if (contarSo && (e.t < contarSo.de || e.t >= contarSo.ate)) continue
    if (abertas.size > out.max) {
      out.max = abertas.size
      out.em = e.t
      let top: [string, number] = ['', 0]
      for (const [m, n] of porMoeda) if (n > top[1]) top = [m, n]
      out.moeda = top[0] || null
      out.moedaN = top[1]
    }
    for (const m of moedas(e.tr.ticker)) {
      const n = porMoeda.get(m) ?? 0
      if (n > out.piorMoedaN) { out.piorMoedaN = n; out.piorMoeda = m }
    }
  }
  return out
}

export interface Resumo {
  trades: number
  vitorias: number
  pctVitorias: number | null
  rTotal: number
  rMedio: number | null
  /** maior queda acumulada em R (≤ 0) */
  piorSequenciaR: number
  /** maior número de perdas seguidas */
  perdasSeguidas: number
  /** trades ainda por resolver (marcadas a mercado com as velas que havia) */
  abertas: number
}

export function resumir(trades: TradeSombra[]): Resumo {
  const ord = [...trades].sort((a, b) => a.em - b.em)
  const rs = ord.map((t) => t.R)
  const n = rs.length
  const total = rs.reduce((a, b) => a + b, 0)
  const vit = rs.filter((r) => r > 1e-9).length
  return {
    trades: n,
    vitorias: vit,
    pctVitorias: n ? (100 * vit) / n : null,
    rTotal: total,
    rMedio: n ? total / n : null,
    piorSequenciaR: piorSequencia(rs),
    perdasSeguidas: perdasSeguidas(rs),
    abertas: ord.filter(porResolver).length,
  }
}

export const diaUtc = (ms: number) => new Date(ms).toISOString().slice(0, 10)

export interface LinhaSombraDia {
  estrategia: string
  dia: string
  trades: number
  vitorias: number
  r_total: number
  r_medio: number | null
  pior_sequencia: number
  perdas_seguidas: number
  exposicao_max: number
  abertas: number
  definitivo: boolean
  gestao: Record<string, unknown>
  detalhe: Record<string, unknown>
}

const r3 = (x: number) => Math.round(x * 1000) / 1000

/**
 * As linhas de `estrategia_sombra_dia` para os dias pedidos. `trades` pode (e deve) incluir as dos
 * dias anteriores: é assim que a exposição conta as posições que vinham de trás.
 */
export function linhasPorDia(p: {
  estrategia: string
  dias: string[]
  trades: TradeSombra[]
  gestao: Record<string, unknown>
  sinaisPorDia: Map<string, { total: number; passaram: number; foraPorMotivo: Record<string, number>; semVelas: number }>
}): LinhaSombraDia[] {
  return p.dias.map((dia) => {
    const de = Date.parse(`${dia}T00:00:00Z`)
    const ate = de + 86_400_000
    const doDia = p.trades.filter((t) => t.em >= de && t.em < ate)
    const res = resumir(doDia)
    const exp = exposicaoMaxima(p.trades, { de, ate })
    const porSimbolo: Record<string, { n: number; r: number }> = {}
    for (const t of doDia) {
      const x = (porSimbolo[t.ticker] ??= { n: 0, r: 0 })
      x.n++
      x.r = r3(x.r + t.R)
    }
    const s = p.sinaisPorDia.get(dia)
    return {
      estrategia: p.estrategia,
      dia,
      trades: res.trades,
      vitorias: res.vitorias,
      r_total: r3(res.rTotal),
      r_medio: res.rMedio == null ? null : r3(res.rMedio),
      pior_sequencia: r3(res.piorSequenciaR),
      perdas_seguidas: res.perdasSeguidas,
      exposicao_max: exp.max,
      abertas: res.abertas,
      // Um dia é definitivo quando nenhuma trade dele ficou por resolver: até lá volta a ser medido.
      definitivo: res.abertas === 0,
      gestao: p.gestao,
      detalhe: {
        ideias: s?.total ?? null,
        passaram_gate: s?.passaram ?? null,
        fora_por_motivo: s?.foraPorMotivo ?? {},
        sem_velas: s?.semVelas ?? 0,
        exposicao: { em: exp.em ? new Date(exp.em).toISOString() : null, moeda: exp.moeda, moeda_n: exp.moedaN, pior_moeda: exp.piorMoeda, pior_moeda_n: exp.piorMoedaN },
        risco_somado_pct: { a_0_25: r3(exp.max * 0.25), a_1: exp.max },
        por_simbolo: porSimbolo,
        motivos: doDia.reduce<Record<string, number>>((a, t) => ((a[t.motivo] = (a[t.motivo] ?? 0) + 1), a), {}),
      },
    }
  })
}

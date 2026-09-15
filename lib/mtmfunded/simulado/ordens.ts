/**
 * AS DECISÕES DE UMA ORDEM — puras, sem base de dados.
 *
 * A rota das ordens lê a conta, as posições e o preço; ESTE ficheiro decide o que acontece. Está
 * separado por duas razões: (1) testa-se sem Supabase, com números à mão, e (2) todas as contas
 * passam por `./matematica` — a mesma que o motor do VPS usa. Se a rota fizesse as contas ali
 * mesmo, bastava um arredondamento diferente para o site abrir uma posição que o motor mede de
 * outra maneira.
 *
 * Tudo devolve `{ ok: false, erro }` em linguagem de gente — é o texto que aparece no ticket.
 */

import {
  type Direcao, type Simbolo, type Preco, type MapaPrecos, type PosicaoAberta,
  normalizarVolume, validarNiveis, precoDeAbertura, precoDeFecho, margemUsd, comissaoUsd,
  estadoDaConta, lucroUsd, pendenteDispara, moedaDeCotacao,
} from './matematica'
import { avaliarConta, type RegrasConta } from '../regras'

export type Falha = { ok: false; erro: string }

/** Um preço com mais de 5 segundos já não é preço de mercado: executar nele era inventar. */
export const PRECO_FRESCO_MS = 5_000

export function precoFresco(em: string | Date | null | undefined, agora = Date.now()): boolean {
  if (!em) return false
  const t = new Date(em).getTime()
  return Number.isFinite(t) && agora - t <= PRECO_FRESCO_MS
}

/**
 * O DIA DA CORRETORA vira às 22:00 UTC (o fecho de Nova Iorque), não à meia-noite. Uma trade às
 * 23h UTC de segunda já é terça para a contagem de dias negociados — igual ao que o motor usa
 * para a âncora diária, senão os dois contavam dias diferentes.
 */
export function diaDaCorretora(quando: Date = new Date()): string {
  return new Date(quando.getTime() + 2 * 3600_000).toISOString().slice(0, 10)
}

/**
 * Os símbolos cujo preço é preciso para medir estas posições: os próprios e os pares que
 * convertem a moeda de cotação para USD (USDJPY para um EURJPY, por exemplo).
 */
export function simbolosParaMedir(simbolos: Array<Pick<Simbolo, 'symbol' | 'classe' | 'moeda_lucro'>>): string[] {
  const out = new Set<string>()
  for (const s of simbolos) {
    out.add(s.symbol)
    // GBX (pence de Londres) converte-se pela libra.
    const moeda = moedaDeCotacao(s.symbol, s.classe, s.moeda_lucro).replace(/^GBX$/, 'GBP')
    if (moeda !== 'USD') { out.add(`${moeda}USD`); out.add(`USD${moeda}`) }
  }
  return [...out]
}

/** Linha da BD → Simbolo. O PostgREST pode devolver `numeric` como texto; aqui passa a número. */
export function simboloDaLinha(r: Record<string, unknown>): Simbolo {
  const n = (v: unknown, d = 0) => (v == null || v === '' ? d : Number(v))
  return {
    symbol: String(r.symbol),
    classe: String(r.classe) as Simbolo['classe'],
    moeda_lucro: r.moeda_lucro == null ? null : String(r.moeda_lucro),
    digits: n(r.digits, 2),
    contract_size: n(r.contract_size, 1),
    pip_size: n(r.pip_size, 1),
    spread_pontos: n(r.spread_pontos),
    comissao_lote: n(r.comissao_lote),
    volume_min: n(r.volume_min, 0.01),
    volume_step: n(r.volume_step, 0.01),
    volume_max: n(r.volume_max, 50),
    alavancagem_max: n(r.alavancagem_max, 100),
  }
}

export function posicaoDaLinha(r: Record<string, unknown>): PosicaoAberta & { id: string } {
  return {
    id: String(r.id),
    symbol: String(r.symbol),
    direcao: r.direcao === 'sell' ? 'sell' : 'buy',
    volume: Number(r.volume),
    preco_entrada: Number(r.preco_entrada),
    sl: r.sl == null ? null : Number(r.sl),
    tp: r.tp == null ? null : Number(r.tp),
    comissao: Number(r.comissao ?? 0),
    swap: Number(r.swap ?? 0),
  }
}

/** Regras de negociação que se aplicam NO MOMENTO da ordem (as de perda são do motor). */
export interface RegrasDeOrdem {
  hedge_permitido?: boolean
  max_posicoes_par_direcao?: number
}

// ── abrir a mercado ────────────────────────────────────────────────────────

export interface PedidoAbertura {
  simbolo: Simbolo
  direcao: Direcao
  volume: number
  sl: number | null
  tp: number | null
  preco: Preco
  saldo: number
  alavancagemConta: number
  posicoesAbertas: PosicaoAberta[]
  simbolos: Record<string, Simbolo>
  precos: MapaPrecos
  regras?: RegrasDeOrdem | null
}

export interface PlanoAbertura {
  ok: true
  volume: number
  precoExecucao: number
  comissao: number
  margem: number
  margemLivreDepois: number
  valorPip: number | null
}

export function planearAbertura(p: PedidoAbertura): PlanoAbertura | Falha {
  const volume = normalizarVolume(p.simbolo, p.volume)
  if (volume == null) {
    return { ok: false, erro: `volume fora dos limites (${p.simbolo.volume_min}–${p.simbolo.volume_max}, passo ${p.simbolo.volume_step})` }
  }
  const precoExecucao = precoDeAbertura(p.direcao, p.preco)
  const erroNiveis = validarNiveis(p.direcao, precoExecucao, p.sl, p.tp)
  if (erroNiveis) return { ok: false, erro: erroNiveis }

  // Regras do programa que se verificam à entrada. Recusar aqui é mais justo do que deixar
  // abrir e depois marcar a conta por incumprimento.
  const mesmoSimbolo = p.posicoesAbertas.filter((x) => x.symbol === p.simbolo.symbol)
  if (p.regras?.hedge_permitido === false && mesmoSimbolo.some((x) => x.direcao !== p.direcao)) {
    return { ok: false, erro: 'as regras do programa não permitem hedge (compra e venda abertas no mesmo símbolo)' }
  }
  const max = Number(p.regras?.max_posicoes_par_direcao ?? 0)
  if (max > 0 && mesmoSimbolo.filter((x) => x.direcao === p.direcao).length >= max) {
    return { ok: false, erro: `máximo de ${max} posições por símbolo e direção` }
  }

  const precosComEste = { ...p.precos, [p.simbolo.symbol]: p.preco }
  const margem = margemUsd(p.simbolo, volume, precoExecucao, p.alavancagemConta, precosComEste)
  if (margem == null) return { ok: false, erro: `sem preço de conversão para ${p.simbolo.symbol} — tenta daqui a pouco` }
  const comissao = comissaoUsd(p.simbolo, volume)

  const estado = estadoDaConta(p.saldo, p.alavancagemConta, p.posicoesAbertas, { ...p.simbolos, [p.simbolo.symbol]: p.simbolo }, precosComEste)
  if (estado.semPreco.length) {
    // Sem preço de uma posição aberta a equity é desconhecida — abrir mais às cegas não.
    return { ok: false, erro: `sem preço ao vivo para ${estado.semPreco.join(', ')} — não é possível medir a margem` }
  }
  // A comissão sai do saldo no instante da abertura, por isso já não conta como margem livre.
  const margemLivreDepois = Math.round((estado.equity - comissao - estado.margem - margem) * 100) / 100
  if (margemLivreDepois < 0) {
    return { ok: false, erro: `margem insuficiente: precisa de ${margem.toFixed(2)} USD, livre ${Math.max(0, estado.margemLivre - comissao).toFixed(2)} USD` }
  }

  return {
    ok: true, volume, precoExecucao, comissao, margem, margemLivreDepois,
    valorPip: valorDoPip(p.simbolo, volume, precoExecucao, precosComEste),
  }
}

/** Quanto vale 1 pip nesta posição, em USD — o que o ticket mostra antes de confirmar. */
export function valorDoPip(s: Simbolo, volume: number, preco: number, precos: MapaPrecos): number | null {
  const v = lucroUsd(s, 'buy', volume, preco, preco + s.pip_size, precos)
  return v == null ? null : Math.round(v * 100) / 100
}

// ── fechar (total ou parcial) ──────────────────────────────────────────────

export interface PlanoFecho {
  ok: true
  parcial: boolean
  volumeFechado: number
  volumeRestante: number
  precoFecho: number
  /** Lucro de preço da parte fechada. */
  pnl: number
  /** Comissão e swap da parte fechada (proporcionais) — só contabilidade: a comissão já saiu. */
  comissaoFechada: number
  swapFechado: number
  /** Lucro de preço + swap da parte fechada. O saldo recebe só `pnl` (como o motor) enquanto ninguém acumular swap. */
  paraOSaldo: number
}

export function planearFecho(
  pos: PosicaoAberta, simbolo: Simbolo, preco: Preco, precos: MapaPrecos, volumePedido?: number | null,
): PlanoFecho | Falha {
  let volumeFechado = pos.volume
  if (volumePedido != null && volumePedido < pos.volume - 1e-9) {
    const v = normalizarVolume(simbolo, volumePedido)
    if (v == null) return { ok: false, erro: `volume a fechar inválido (mínimo ${simbolo.volume_min})` }
    volumeFechado = v
  }
  const volumeRestante = Math.round((pos.volume - volumeFechado) * 100) / 100
  // Como numa corretora: um parcial não pode deixar para trás menos do que o lote mínimo.
  if (volumeRestante > 0 && volumeRestante < simbolo.volume_min - 1e-9) {
    return { ok: false, erro: `o que fica aberto (${volumeRestante}) é menor que o lote mínimo ${simbolo.volume_min}` }
  }
  const parcial = volumeRestante > 0
  const precoFecho = precoDeFecho(pos.direcao, preco)
  const pnl = lucroUsd(simbolo, pos.direcao, volumeFechado, pos.preco_entrada, precoFecho, { ...precos, [simbolo.symbol]: preco })
  if (pnl == null) return { ok: false, erro: `sem preço de conversão para ${simbolo.symbol}` }
  const fracao = volumeFechado / pos.volume
  const comissaoFechada = parcial ? Math.round(pos.comissao * fracao * 100) / 100 : pos.comissao
  const swapFechado = parcial ? Math.round((pos.swap || 0) * fracao * 100) / 100 : pos.swap || 0
  return {
    ok: true, parcial, volumeFechado, volumeRestante, precoFecho, pnl, comissaoFechada, swapFechado,
    paraOSaldo: Math.round((pnl + swapFechado) * 100) / 100,
  }
}

// ── modificar SL/TP ────────────────────────────────────────────────────────

/** SL/TP novos validados contra o lado por onde a posição FECHARIA agora (compra → BID). */
export function validarModificacao(pos: Pick<PosicaoAberta, 'direcao'>, preco: Preco, sl: number | null, tp: number | null): string | null {
  return validarNiveis(pos.direcao, precoDeFecho(pos.direcao, preco), sl, tp)
}

// ── pendentes ──────────────────────────────────────────────────────────────

export function validarPendente(
  simbolo: Simbolo, direcao: Direcao, tipo: 'limit' | 'stop', volume: number, nivel: number,
  sl: number | null, tp: number | null, preco: Preco | null,
): { ok: true; volume: number } | Falha {
  const v = normalizarVolume(simbolo, volume)
  if (v == null) return { ok: false, erro: `volume fora dos limites (${simbolo.volume_min}–${simbolo.volume_max})` }
  if (!(nivel > 0)) return { ok: false, erro: 'preço da ordem inválido' }
  const erro = validarNiveis(direcao, nivel, sl, tp)
  if (erro) return { ok: false, erro }
  // Uma pendente que já dispararia agora não é pendente — é uma ordem a mercado mal escolhida
  // (buy limit ACIMA do preço, por exemplo). Dizer isso ensina mais do que executá-la.
  if (preco && pendenteDispara(direcao, tipo, nivel, preco)) {
    const lado = tipo === 'limit'
      ? (direcao === 'buy' ? 'abaixo' : 'acima')
      : (direcao === 'buy' ? 'acima' : 'abaixo')
    return { ok: false, erro: `uma ${direcao === 'buy' ? 'buy' : 'sell'} ${tipo} tem de ficar ${lado} do preço atual` }
  }
  return { ok: true, volume: v }
}

// ── limites do programa ───────────────────────────────────────────────────

export interface LimitesConta {
  perdaDiariaRestante: number | null
  perdaMaximaRestante: number | null
  objetivoPct: number | null
  objetivoValor: number | null
  progressoObjetivoPct: number | null
  resultadoPct: number | null
}

/**
 * Quanto falta até às linhas vermelhas e até ao objetivo, com o MESMO motor de regras do torneio
 * (`avaliarConta`) — o número que o trader vê é o que o motor usa para o quebrar.
 */
export function limitesDaConta(
  regras: Record<string, unknown> | null | undefined,
  saldoInicial: number, equity: number, ancoraDia: number | null, fase: number,
): LimitesConta {
  const vazio: LimitesConta = { perdaDiariaRestante: null, perdaMaximaRestante: null, objetivoPct: null, objetivoValor: null, progressoObjetivoPct: null, resultadoPct: null }
  if (!regras || !(saldoInicial > 0)) return vazio
  const r: RegrasConta = {
    perda_diaria_pct: Number(regras.perda_diaria_pct ?? 0),
    perda_maxima_pct: Number(regras.perda_maxima_pct ?? 0),
  }
  const v = avaliarConta(r, {
    saldoInicial, equity, saldoReferenciaDia: ancoraDia ?? saldoInicial, lucroPorDia: {}, diasNegociados: 0,
  })
  const objetivoPct = fase >= 2 && regras.objetivo_fase2_pct != null
    ? Number(regras.objetivo_fase2_pct)
    : regras.objetivo_pct != null ? Number(regras.objetivo_pct) : null
  const objetivoValor = objetivoPct ? Math.round(saldoInicial * (1 + objetivoPct / 100) * 100) / 100 : null
  const progresso = objetivoValor
    ? Math.max(0, Math.min(100, Math.round(((equity - saldoInicial) / (objetivoValor - saldoInicial)) * 1000) / 10))
    : null
  return {
    perdaDiariaRestante: r.perda_diaria_pct ? Math.max(0, v.margemDiaria) : null,
    perdaMaximaRestante: r.perda_maxima_pct ? Math.max(0, v.margemTotal) : null,
    objetivoPct, objetivoValor, progressoObjetivoPct: progresso, resultadoPct: v.resultadoPct,
  }
}

// ── ferramenta de posição (gráfico) ───────────────────────────────────────

/**
 * Onde o trader pôs a entrada no gráfico decide o TIPO de ordem, como no TradingView/MT5:
 * perto do mercado é a mercado; longe, é pendente — e o lado decide limit ou stop.
 *   compra abaixo do ASK = buy limit · compra acima = buy stop
 *   venda acima do BID  = sell limit · venda abaixo = sell stop
 * `tolerancia` (em preço) é a distância que ainda conta como «a mercado» — um dedo não acerta
 * no preço ao décimo de pip, e uma pendente a 0,2 pips do preço é só uma ordem a mercado lenta.
 */
export function tipoDeEntrada(direcao: Direcao, nivel: number, preco: Preco, tolerancia: number): 'mercado' | 'limit' | 'stop' {
  const ref = precoDeAbertura(direcao, preco)
  if (Math.abs(nivel - ref) <= tolerancia) return 'mercado'
  if (direcao === 'buy') return nivel < ref ? 'limit' : 'stop'
  return nivel > ref ? 'limit' : 'stop'
}

// ── webhook TradingView ───────────────────────────────────────────────────

/**
 * Candidatos a símbolo nosso para um ticker do TradingView, por ordem de confiança.
 * O TradingView manda `OANDA:XAUUSD`, `PEPPERSTONE:NAS100`, `BINANCE:BTCUSDT`, `EURUSD.pro`,
 * `XAUUSDm`… O nome «limpo» vem primeiro; os apelidos e os cortes de sufixo vêm depois. Quem
 * escolhe é a rota, pelo primeiro que existir no catálogo — aqui só se imagina.
 */
export const APELIDOS: Record<string, string> = {
  GOLD: 'XAUUSD', SILVER: 'XAGUSD', XAUUSDT: 'XAUUSD',
  SPX500: 'US500', SPX: 'US500', US500USD: 'US500', SPX500USD: 'US500', ES1: 'US500',
  NDX: 'NAS100', US100: 'NAS100', NAS100USD: 'NAS100', USTEC: 'NAS100', NQ1: 'NAS100',
  DJI: 'US30', US30USD: 'US30', DJ30: 'US30', YM1: 'US30',
  DE40: 'GER40', DE30: 'GER40', GER30: 'GER40', DAX: 'GER40', DE30EUR: 'GER40', DE40EUR: 'GER40',
  UK100GBP: 'UK100', FTSE: 'UK100', JP225: 'JPN225', NI225: 'JPN225',
  USOIL: 'USOUSD', WTI: 'USOUSD', UKOIL: 'UKOUSD', BRENT: 'UKOUSD',
}
export function candidatosDeTicker(ticker: string): string[] {
  const semBolsa = String(ticker || '').split(':').pop()!.trim().toUpperCase()
  const antesDoPonto = semBolsa.split(/[._]/)[0]
  const limpo = antesDoPonto.replace(/[^A-Z0-9]/g, '')
  const out: string[] = []
  const add = (s: string) => { if (s && !out.includes(s)) out.push(s) }
  add(limpo)
  if (APELIDOS[limpo]) add(APELIDOS[limpo])
  // Cripto: os pares USDT/USDC da Binance são os nossos pares USD.
  const cripto = limpo.replace(/(USDT|USDC|BUSD)$/, 'USD')
  add(cripto)
  // Futuros contínuos do TradingView (`GC1!`, `NQ1!`) e sufixos de corretora (`XAUUSDm`, `EURUSDpro`).
  add(limpo.replace(/\d+$/, ''))
  const seis = limpo.match(/^[A-Z]{6}/)?.[0]
  if (seis) add(seis)
  add(semBolsa.replace(/[^A-Z0-9]/g, ''))
  return out
}

export type PassoSincronizacao =
  | { tipo: 'fechar'; positionId: string; volume: number | null }
  | { tipo: 'abrir'; direcao: Direcao; volume: number }

/**
 * Leva a posição líquida de um símbolo até ao tamanho que a estratégia do TradingView diz ter
 * (`strategy.position_size`: positivo comprado, negativo vendido, 0 fora).
 *
 * É a única forma honesta de «sincronizar» com o TradingView: a posição do paper trading dele
 * não se lê por API nenhuma, mas a estratégia diz em cada alerta onde ESTÁ. Em vez de somar
 * ordens (e acumular erro a cada alerta perdido), acerta-se ao alvo — um alerta perdido corrige-se
 * no seguinte.
 *
 * Reduz as posições mais ANTIGAS primeiro (FIFO), como a maioria das corretoras.
 */
export function planoSincronizacao(
  posicoes: Array<{ id: string; direcao: Direcao; volume: number }>,
  alvo: number,
): PassoSincronizacao[] {
  const arred = (n: number) => Math.round(n * 100) / 100
  const liquida = arred(posicoes.reduce((a, p) => a + (p.direcao === 'buy' ? p.volume : -p.volume), 0))
  const alvoR = arred(alvo)
  if (alvoR === liquida) return []
  const fecharTudo = (): PassoSincronizacao[] => posicoes.map((p) => ({ tipo: 'fechar', positionId: p.id, volume: null }))
  if (alvoR === 0) return fecharTudo()
  const dirAlvo: Direcao = alvoR > 0 ? 'buy' : 'sell'
  // Sentido contrário, ou posições nos dois lados (hedge): fecha tudo e abre o alvo limpo.
  const temContrarias = posicoes.some((p) => p.direcao !== dirAlvo)
  if (temContrarias) return [...fecharTudo(), { tipo: 'abrir', direcao: dirAlvo, volume: Math.abs(alvoR) }]
  const diff = arred(Math.abs(alvoR) - Math.abs(liquida))
  if (diff > 0) return [{ tipo: 'abrir', direcao: dirAlvo, volume: diff }]
  let porFechar = -diff
  const passos: PassoSincronizacao[] = []
  for (const p of posicoes) {
    if (porFechar <= 1e-9) break
    if (p.volume <= porFechar + 1e-9) { passos.push({ tipo: 'fechar', positionId: p.id, volume: null }); porFechar = arred(porFechar - p.volume) }
    else { passos.push({ tipo: 'fechar', positionId: p.id, volume: arred(porFechar) }); porFechar = 0 }
  }
  return passos
}

export interface AlertaInterpretado {
  ok: true
  acao: 'buy' | 'sell' | 'close' | 'sync'
  ticker: string
  volume: number | null
  sl: number | null
  tp: number | null
  tipo: 'market' | 'limit' | 'stop'
  preco: number | null
  /** Só em `sync`: a posição líquida alvo, em lotes (+ comprado, − vendido). */
  alvo: number | null
}

/**
 * Lê o corpo de um alerta do TradingView nos dois formatos que o painel ensina:
 *   (a) estratégia: {"action":"{{strategy.order.action}}","contracts":"{{strategy.order.contracts}}",
 *       "ticker":"{{ticker}}","price":"{{strategy.order.price}}","position_size":"{{strategy.position_size}}"}
 *   (b) manual: {"acao":"buy|sell|close","symbol":"XAUUSD","volume":0.1,"sl":…,"tp":…,"tipo":"market|limit|stop","preco":…}
 * e ainda texto simples «buy XAUUSD 0.1».
 *
 * Com `position_size` a estratégia manda SINCRONIZAR (ver planoSincronizacao) — é mais robusto do
 * que somar ordens. `volume_por_contrato` converte contratos do TradingView em lotes (padrão 1:
 * a estratégia deve usar a quantidade em lotes).
 */
export function interpretarAlerta(corpo: unknown): AlertaInterpretado | Falha {
  let b: Record<string, unknown>
  if (typeof corpo === 'string') {
    const t = corpo.trim()
    try { b = JSON.parse(t) } catch {
      const m = t.match(/^(buy|sell|close|long|short|exit)\s+([A-Za-z0-9:._!-]+)(?:\s+([\d.]+))?/i)
      if (!m) return { ok: false, erro: 'corpo não é JSON nem «buy SIMBOLO volume»' }
      b = { acao: m[1], symbol: m[2], volume: m[3] }
    }
  } else if (corpo && typeof corpo === 'object') b = corpo as Record<string, unknown>
  else return { ok: false, erro: 'corpo vazio' }

  const n = (v: unknown): number | null => {
    if (v == null || v === '') return null
    const x = Number(String(v).replace(',', '.'))
    return Number.isFinite(x) ? x : null
  }
  const ticker = String(b.symbol ?? b.ticker ?? b.simbolo ?? '').trim()
  if (!ticker || ticker.includes('{{')) return { ok: false, erro: 'falta o símbolo (symbol/ticker)' }

  const bruta = String(b.acao ?? b.action ?? b.side ?? '').trim().toLowerCase()
  const mapa: Record<string, AlertaInterpretado['acao']> = {
    buy: 'buy', long: 'buy', compra: 'buy', comprar: 'buy',
    sell: 'sell', short: 'sell', venda: 'sell', vender: 'sell',
    close: 'close', exit: 'close', flat: 'close', fechar: 'close', close_all: 'close',
  }
  const mult = n(b.volume_por_contrato) ?? 1
  const tamanho = n(b.position_size)
  const tipoBruto = String(b.tipo ?? b.type ?? 'market').toLowerCase()
  const tipo: AlertaInterpretado['tipo'] = tipoBruto === 'limit' ? 'limit' : tipoBruto === 'stop' ? 'stop' : 'market'
  const base = {
    ticker, sl: n(b.sl), tp: n(b.tp), tipo,
    preco: n(b.preco ?? (tipo === 'market' ? null : b.price)),
  }

  if (tamanho != null && !(bruta in mapa && mapa[bruta] === 'close')) {
    return { ...base, ok: true, acao: 'sync', volume: null, alvo: Math.round(tamanho * mult * 100) / 100, tipo: 'market', preco: null }
  }
  const acao = mapa[bruta]
  if (!acao) return { ok: false, erro: `acção desconhecida «${bruta || '—'}» (buy, sell ou close)` }
  const contratos = n(b.volume ?? b.contracts ?? b.qty ?? b.lotes)
  const volume = contratos == null ? null : Math.round(contratos * mult * 100) / 100
  if (acao !== 'close' && !(volume && volume > 0)) return { ok: false, erro: 'falta o volume (volume/contracts)' }
  if (tipo !== 'market' && !(base.preco && base.preco > 0)) return { ok: false, erro: `uma ordem ${tipo} precisa de preço` }
  return { ...base, ok: true, acao, volume, alvo: null }
}

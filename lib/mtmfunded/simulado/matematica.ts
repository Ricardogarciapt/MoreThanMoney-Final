/**
 * A MATEMÁTICA DAS CONTAS SIMULADAS — uma só, para o site e para o motor.
 *
 * O site executa as ordens a mercado e o motor (VPS) fecha por SL/TP, executa as pendentes e
 * mede a equity. Se cada um fizesse as contas à sua maneira, o mesmo trade dava dois resultados
 * — e a conta de um aluno podia rebentar num lado e estar viva no outro. Por isso este ficheiro
 * não importa NADA (nem Supabase, nem Next): o site usa-o directamente e o motor é empacotado
 * com ele lá dentro.
 *
 * Tudo em USD, a moeda das contas.
 */

export type Direcao = 'buy' | 'sell'

export interface Simbolo {
  symbol: string
  classe: 'forex' | 'metal' | 'indice' | 'cripto' | 'acao' | 'etf' | 'energia' | 'commodity' | 'obrigacao'
  /**
   * A moeda em que o lucro sai, tal como a corretora a declara (`profitCurrency`). Quando existe
   * manda — adivinhar pelo nome falha nas acções europeias (EUR), britânicas (GBX) e nos índices
   * asiáticos. Sem ela (símbolos antigos), cai-se na dedução por nome.
   */
  moeda_lucro?: string | null
  digits: number
  contract_size: number
  pip_size: number
  spread_pontos: number
  comissao_lote: number
  volume_min: number
  volume_step: number
  volume_max: number
  alavancagem_max: number
}

export interface Preco {
  symbol: string
  bid: number
  ask: number
}

export type MapaPrecos = Record<string, Preco>

const MOEDA_DOS_INDICES: Record<string, string> = { GER40: 'EUR', UK100: 'GBP', JPN225: 'JPY' }

/** A moeda em que o preço do símbolo está cotado. `moedaLucro` (da corretora) ganha sempre. */
export function moedaDeCotacao(symbol: string, classe: Simbolo['classe'], moedaLucro?: string | null): string {
  if (moedaLucro) return moedaLucro.toUpperCase()
  if (classe === 'indice') return MOEDA_DOS_INDICES[symbol] ?? 'USD'
  if (/^[A-Z]{6}$/.test(symbol)) return symbol.slice(3)
  return 'USD'
}

const meio = (p: Preco) => (p.bid + p.ask) / 2

/**
 * Quantos USD vale UMA unidade da moeda `moeda`, com os preços que houver.
 * USD→1; procura XXXUSD (multiplica) ou USDXXX (divide). Sem preço → null, e quem chama recusa.
 */
export function usdPorUnidade(moeda: string, precos: MapaPrecos): number | null {
  if (moeda === 'USD') return 1
  // As acções de Londres cotam em PENCE (GBX): 100 pence = 1 libra. Sem isto, uma posição em
  // Vodafone valia cem vezes o que vale.
  if (moeda === 'GBX') {
    const libra = usdPorUnidade('GBP', precos)
    return libra == null ? null : libra / 100
  }
  const directo = precos[`${moeda}USD`]
  if (directo && meio(directo) > 0) return meio(directo)
  const inverso = precos[`USD${moeda}`]
  if (inverso && meio(inverso) > 0) return 1 / meio(inverso)
  return null
}

/** O spread simulado em preço (pontos × 10^-digits). */
export function spreadEmPreco(s: Simbolo): number {
  return s.spread_pontos * Math.pow(10, -s.digits)
}

/** Quando o feed só dá um preço médio, abre-se o spread simulado à volta dele. */
export function precoComSpread(s: Simbolo, medio: number): Preco {
  const meioSpread = spreadEmPreco(s) / 2
  const f = Math.pow(10, s.digits)
  return { symbol: s.symbol, bid: Math.round((medio - meioSpread) * f) / f, ask: Math.round((medio + meioSpread) * f) / f }
}

/** Abrir: compra-se ao ASK, vende-se ao BID. Fechar é o contrário. */
export function precoDeAbertura(direcao: Direcao, p: Preco): number {
  return direcao === 'buy' ? p.ask : p.bid
}
export function precoDeFecho(direcao: Direcao, p: Preco): number {
  return direcao === 'buy' ? p.bid : p.ask
}

/** Volume arredondado ao passo do símbolo; null se ficar fora dos limites. */
export function normalizarVolume(s: Simbolo, volume: number): number | null {
  if (!(volume > 0)) return null
  const passos = Math.round(volume / s.volume_step)
  const v = Math.round(passos * s.volume_step * 100) / 100
  if (v < s.volume_min - 1e-9 || v > s.volume_max + 1e-9) return null
  return v
}

/** Lucro/prejuízo em USD de `volume` lotes entre dois preços. */
export function lucroUsd(
  s: Simbolo, direcao: Direcao, volume: number, entrada: number, saida: number, precos: MapaPrecos,
): number | null {
  const conv = usdPorUnidade(moedaDeCotacao(s.symbol, s.classe, s.moeda_lucro), precos)
  if (conv == null) return null
  const diferenca = direcao === 'buy' ? saida - entrada : entrada - saida
  return Math.round(diferenca * volume * s.contract_size * conv * 100) / 100
}

/** Margem em USD para abrir `volume` a `preco`, com a alavancagem mais baixa entre conta e símbolo. */
export function margemUsd(
  s: Simbolo, volume: number, preco: number, alavancagemConta: number, precos: MapaPrecos,
): number | null {
  const conv = usdPorUnidade(moedaDeCotacao(s.symbol, s.classe, s.moeda_lucro), precos)
  if (conv == null) return null
  const alavancagem = Math.max(1, Math.min(alavancagemConta || 1, s.alavancagem_max || 1))
  return Math.round(((volume * s.contract_size * preco * conv) / alavancagem) * 100) / 100
}

/** Comissão de ida e volta, cobrada à abertura. */
export function comissaoUsd(s: Simbolo, volume: number): number {
  return Math.round(s.comissao_lote * volume * 100) / 100
}

/** Distância em pips (para mostrar e para validar SL/TP). */
export function pips(s: Simbolo, a: number, b: number): number {
  return Math.round((Math.abs(a - b) / s.pip_size) * 10) / 10
}

export interface PosicaoAberta {
  symbol: string
  direcao: Direcao
  volume: number
  preco_entrada: number
  sl: number | null
  tp: number | null
  comissao: number
  swap: number
}

/**
 * Onde está a conta agora: flutuante, equity, margem usada e margem livre.
 * Uma posição sem preço conta como flutuante 0 e é assinalada — nunca se inventa um preço.
 */
export function estadoDaConta(
  saldo: number,
  alavancagemConta: number,
  posicoes: PosicaoAberta[],
  simbolos: Record<string, Simbolo>,
  precos: MapaPrecos,
): { flutuante: number; equity: number; margem: number; margemLivre: number; nivelMargemPct: number | null; semPreco: string[] } {
  let flutuante = 0
  let margem = 0
  const semPreco: string[] = []
  for (const p of posicoes) {
    const s = simbolos[p.symbol]
    const preco = precos[p.symbol]
    if (!s || !preco) { semPreco.push(p.symbol); continue }
    const l = lucroUsd(s, p.direcao, p.volume, p.preco_entrada, precoDeFecho(p.direcao, preco), precos)
    const m = margemUsd(s, p.volume, p.preco_entrada, alavancagemConta, precos)
    if (l == null || m == null) { semPreco.push(p.symbol); continue }
    flutuante += l + (p.swap || 0)
    margem += m
  }
  const equity = Math.round((saldo + flutuante) * 100) / 100
  return {
    flutuante: Math.round(flutuante * 100) / 100,
    equity,
    margem: Math.round(margem * 100) / 100,
    margemLivre: Math.round((equity - margem) * 100) / 100,
    nivelMargemPct: margem > 0 ? Math.round((equity / margem) * 10000) / 100 : null,
    semPreco,
  }
}

/** Stop-out: nível de margem abaixo disto fecha a pior posição (como numa corretora). */
export const STOP_OUT_PCT = 50

/** O SL/TP bate neste preço? (compra fecha ao BID, venda ao ASK) */
export function tocaSl(p: PosicaoAberta, preco: Preco): boolean {
  if (p.sl == null) return false
  const x = precoDeFecho(p.direcao, preco)
  return p.direcao === 'buy' ? x <= p.sl : x >= p.sl
}
export function tocaTp(p: PosicaoAberta, preco: Preco): boolean {
  if (p.tp == null) return false
  const x = precoDeFecho(p.direcao, preco)
  return p.direcao === 'buy' ? x >= p.tp : x <= p.tp
}

/** SL/TP do lado certo do preço de entrada? Devolve o erro em linguagem de gente, ou null. */
export function validarNiveis(direcao: Direcao, entrada: number, sl: number | null, tp: number | null): string | null {
  if (sl != null) {
    if (direcao === 'buy' && sl >= entrada) return 'numa compra o stop fica abaixo do preço'
    if (direcao === 'sell' && sl <= entrada) return 'numa venda o stop fica acima do preço'
  }
  if (tp != null) {
    if (direcao === 'buy' && tp <= entrada) return 'numa compra o alvo fica acima do preço'
    if (direcao === 'sell' && tp >= entrada) return 'numa venda o alvo fica abaixo do preço'
  }
  return null
}

/** Ordem pendente: limit compra abaixo / vende acima; stop compra acima / vende abaixo. Dispara? */
export function pendenteDispara(direcao: Direcao, tipo: 'limit' | 'stop', nivel: number, preco: Preco): boolean {
  const x = precoDeAbertura(direcao, preco)
  if (tipo === 'limit') return direcao === 'buy' ? x <= nivel : x >= nivel
  return direcao === 'buy' ? x >= nivel : x <= nivel
}

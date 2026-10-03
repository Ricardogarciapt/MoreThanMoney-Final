/**
 * DESFECHO DE UMA TRADE — pips e percentagem, numa única fonte.
 *
 * Antes deste ficheiro havia nove implementações de "tamanho do pip" espalhadas pelos motores,
 * e discordavam entre si: o premium-price-monitor não conhecia BTC, o premium-zone-monitor não
 * conhecia JPY, o premium-provider-trailing não conhecia nenhum dos dois. O mesmo fecho podia
 * ser anunciado com números diferentes conforme o motor que o apanhasse primeiro.
 *
 * Tudo o que anuncia um desfecho — chat da app, Telegram, alertas MTM, T2T, notificações push —
 * passa por aqui. Se o número estiver errado, está errado em todo o lado ao mesmo tempo, que é
 * a única forma de o apanhar.
 */

/**
 * Tamanho de um pip para o símbolo.
 *
 * Ouro 0,1 · pares com JPY 0,01 · pares forex de 6 letras 0,0001 · tudo o resto (índices,
 * cripto, matérias-primas) conta em PONTOS, isto é 1. Cripto em pontos é deliberado: dizer
 * "+3500 pips" em Bitcoin não significa nada para ninguém, "+3500 pontos" significa.
 */
export function pipSizeForSymbol(symbol: string | null | undefined): number {
  const s = (symbol ?? "").toUpperCase()
  if (/XAU|GOLD/.test(s)) return 0.1
  if (/XAG|SILVER/.test(s)) return 0.01
  // Cripto ANTES da regra das 6 letras: "BTCUSD" tem 6 letras e era apanhado como par forex,
  // o que multiplicava os pips do Bitcoin por dez mil.
  if (CRIPTO.test(s)) return 1
  if (/JPY/.test(s)) return 0.01
  const letras = s.replace(/[^A-Z]/g, "")
  if (letras.length === 6) return 0.0001
  return 1
}

/** Bases de cripto que aparecem nos nossos sinais e nos perpétuos da Bybit. */
const CRIPTO =
  /^(BTC|ETH|SOL|XRP|BNB|ADA|DOGE|AVAX|LINK|DOT|MATIC|LTC|TRX|SHIB|KAS|NEAR|ATOM|APT|ARB|OP|SUI|TON|PEPE|INJ|FIL|ICP|HBAR|VET|RNDR|IMX|TIA|SEI|JUP|WIF|BONK)(USD|USDT|USDC|PERP|_?USDT?)?/

/** Como se chama a unidade para este símbolo — pips em forex e metais, pontos no resto. */
export function unitFor(symbol: string | null | undefined): "pips" | "pontos" {
  return pipSizeForSymbol(symbol) === 1 ? "pontos" : "pips"
}

export interface TradeOutcome {
  /** Movimento a favor da direção, na unidade do símbolo. Negativo = contra. */
  pips: number
  /** Movimento em percentagem do preço de entrada, com o mesmo sinal. */
  pct: number
  unit: "pips" | "pontos"
  win: boolean
}

/**
 * Calcula o desfecho a partir dos preços. Devolve null se faltar preço — nunca um zero, porque
 * "0 pips" e "não sabemos" são coisas diferentes e a segunda não deve ser publicada.
 */
export function computeOutcome(args: {
  symbol: string | null | undefined
  direction: string | null | undefined
  entry: number | null | undefined
  exit: number | null | undefined
}): TradeOutcome | null {
  const entry = Number(args.entry)
  const exit = Number(args.exit)
  if (!Number.isFinite(entry) || !Number.isFinite(exit) || entry <= 0 || exit <= 0) return null

  const dir = (args.direction ?? "").toLowerCase()
  const vendeu = dir === "sell" || dir === "short" || dir === "venda"
  const movimento = vendeu ? entry - exit : exit - entry

  const pips = Math.round((movimento / pipSizeForSymbol(args.symbol)) * 10) / 10
  const pct = Math.round((movimento / entry) * 10000) / 100
  return { pips, pct, unit: unitFor(args.symbol), win: movimento > 0 }
}

const nf = (n: number, casas: number) =>
  n.toLocaleString("pt-PT", { minimumFractionDigits: casas, maximumFractionDigits: casas })

/** "+120,5 pips · +0,82%" — o rótulo que acompanha qualquer fecho, em qualquer superfície. */
export function outcomeLabel(o: TradeOutcome | null): string {
  if (!o) return ""
  const sinal = o.pips >= 0 ? "+" : "−"
  const pips = `${sinal}${nf(Math.abs(o.pips), Math.abs(o.pips) < 10 ? 1 : 0)} ${o.unit}`
  const pct = `${o.pct >= 0 ? "+" : "−"}${nf(Math.abs(o.pct), 2)}%`
  return `${pips} · ${pct}`
}

/** Versão compacta para etiquetas estreitas (cartões de chat, listas): "+120,5p / +0,82%". */
export function outcomeShort(o: TradeOutcome | null): string {
  if (!o) return ""
  const sinal = o.pips >= 0 ? "+" : "−"
  const u = o.unit === "pips" ? "p" : "pt"
  return `${sinal}${nf(Math.abs(o.pips), Math.abs(o.pips) < 10 ? 1 : 0)}${u} / ${o.pct >= 0 ? "+" : "−"}${nf(Math.abs(o.pct), 2)}%`
}

/** Atalho: calcula e formata de uma vez. Devolve "" se faltarem preços. */
export function outcomeFrom(args: Parameters<typeof computeOutcome>[0]): string {
  return outcomeLabel(computeOutcome(args))
}

/**
 * Quantas casas decimais tem o PREÇO deste símbolo na corretora.
 *
 * Não é o mesmo que o tamanho do pip: no ouro o pip é 0,1 mas o preço cota-se a 0,01, e nos pares
 * forex o pip é 0,0001 e o preço tem 5 casas (a última é a fração de pip). Confundir os dois dava
 * um stop do ouro arredondado a 4452,9 quando a corretora aceita 4452,97.
 */
export function casasDecimaisDoPreco(symbol: string | null | undefined): number {
  const s = (symbol ?? "").toUpperCase()
  if (/XAU|GOLD/.test(s)) return 2
  if (/XAG|SILVER/.test(s)) return 3
  if (CRIPTO.test(s)) return 2
  if (/JPY/.test(s)) return 3
  const letras = s.replace(/[^A-Z]/g, "")
  if (letras.length === 6) return 5
  return 2
}

/**
 * O preço como a corretora o entende.
 *
 * Um indicador que calcula o stop a partir do ATR devolve 4452.9733242788. Esse número não existe
 * no mercado: o ouro cota-se ao cêntimo. Mostrá-lo assim faz o cartão do sinal transbordar e dá
 * a quem lê uma precisão que não é real — e mandá-lo para a corretora é pedir uma ordem num preço
 * que ela vai ter de arredondar sozinha, ou recusar.
 *
 * Arredonda-se UMA vez, à entrada do sistema, para o número ser o mesmo no chat, no Telegram, no
 * acompanhamento e na ordem. Arredondar só ao mostrar deixava a base de dados a discordar do ecrã.
 */
export function precoDaCorretora(valor: number | null | undefined, symbol: string | null | undefined): number | null {
  const n = Number(valor)
  if (!Number.isFinite(n)) return null
  const f = 10 ** casasDecimaisDoPreco(symbol)
  return Math.round(n * f) / f
}

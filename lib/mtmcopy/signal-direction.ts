/**
 * Direção de um sinal — UMA leitura para o site, a app-mobile, o iOS e o Android.
 *
 * Porque existe esta peça
 * ───────────────────────
 * Cada superfície tinha a sua própria regra («contém buy? então BUY»). O Gold Did assina todos
 * os cartões Premium com o rodapé
 *
 *     🔑 Use suitable lot sizes based on your capital. Money management is key to long term success
 *
 * e o «long» dessa frase casava com `\blong\b`. Resultado: TODOS os setups do Premium — de venda
 * incluídos — apareciam no Tap to Trade e no chat como «BUY», em verde, ao lado de pips positivos
 * de uma venda. O servidor sempre soube a direção certa (`mtmcopy_signal_tracking.direction`);
 * quem inventava era o cliente.
 *
 * Duas regras, por esta ordem:
 *  1. «long»/«short» só valem como direção quando NÃO fazem parte de «long term», «long run»,
 *     «short term», «longo prazo» e companhia;
 *  2. entre as palavras que sobram ganha a PRIMEIRA do texto — num «3. GOLD SELL SETUP» a
 *     direção está no título, não no rodapé.
 *
 * Os emojis (🔴 / 🟢 / 🔵) ficam para último: são marcadores decorativos e aparecem tanto em
 * cartões como em linhas de gestão.
 *
 * Ainda assim, isto é o PLANO B. Quando o servidor já gravou a direção do sinal, é essa que
 * manda — ver `/api/mtmcopy/signal-directions`.
 */

export type SignalDirection = 'buy' | 'sell'

/** «long term success», «long run», «longo prazo» — nada disto é uma compra. */
const NAO_DIRECIONAL = String.raw`(?:\s*[-–]?\s*(?:term|terms|run|haul|prazo|termo))`

const BUY_RE = new RegExp(
  String.raw`\b(?:buy|buying|compra|comprar|comprando)\b|\blong\b(?!${NAO_DIRECIONAL})`,
  'i',
)
const SELL_RE = new RegExp(
  String.raw`\b(?:sell|selling|venda|vender|vendendo)\b|\bshort\b(?!${NAO_DIRECIONAL})`,
  'i',
)

/**
 * Direção lida do TEXTO do sinal (ou do follow-up). `null` quando não é declarada.
 *
 * Só se usa quando o servidor não tem direção gravada para aquela mensagem.
 */
export function directionFromText(text?: string | null): SignalDirection | null {
  if (!text) return null
  const buyIdx = text.search(BUY_RE)
  const sellIdx = text.search(SELL_RE)
  if (buyIdx >= 0 && (sellIdx < 0 || buyIdx < sellIdx)) return 'buy'
  if (sellIdx >= 0) return 'sell'
  if (/🔴/.test(text)) return 'sell'
  if (/🟢|🔵/.test(text)) return 'buy'
  return null
}

/** O mesmo, no formato que os cartões mostram («BUY» / «SELL» / ""). */
export function directionLabelFromText(text?: string | null): 'BUY' | 'SELL' | '' {
  const d = directionFromText(text)
  return d ? (d.toUpperCase() as 'BUY' | 'SELL') : ''
}

/**
 * A direção que o cartão deve mostrar: a do SERVIDOR quando existe, o texto só como plano B.
 *
 * `serverDirection` vem de `mtmcopy_signal_tracking.direction` — é a direção com que a ordem foi
 * mesmo colocada, a mesma que decide o sinal dos pips.
 */
export function resolveDirectionLabel(
  serverDirection?: string | null,
  text?: string | null,
): 'BUY' | 'SELL' | '' {
  const s = (serverDirection ?? '').toLowerCase()
  if (s === 'buy' || s === 'sell') return s.toUpperCase() as 'BUY' | 'SELL'
  return directionLabelFromText(text)
}

import type { MtmcopyChannelKey } from './channel-context'
import { isPremiumTp1CloseAllNowMessage, isPremiumTpHitMessage, shouldIgnoreChannelMessage } from './channel-context'
import { resolvePremiumTradeActiveVariant, type PremiumTradeActiveVariant } from './premium-trade-active'
import {
  premiumTrailingWithActivation,
  TRADE_IDEAS_TRAILING_PIPS,
  type TrailingDistance,
} from './pip-points'

export interface ParsedSignal {
  symbol: string | null
  direction: 'buy' | 'sell' | null
  entry: number | null
  sl: number | null
  tp: number[]
  orderType: 'market' | 'limit'
  raw: string
}

const NUMBER_RE = /\d+(?:[.,]\d+)?/g

const SYMBOL_ALIASES: Record<string, string> = {
  GOLD: 'XAUUSD',
  OURO: 'XAUUSD',
  XAU: 'XAUUSD',
  SILVER: 'XAGUSD',
  XAG: 'XAGUSD',
  BTC: 'BTCUSD',
  BITCOIN: 'BTCUSD',
  BTCUSDT: 'BTCUSD',
  ETH: 'ETHUSD',
  ETHEREUM: 'ETHUSD',
  US500: 'NAS100',
  USTEC: 'NAS100',
  SPX500: 'NAS100',
  US100: 'NAS100',
  DOW: 'US30',
  DJ30: 'US30',
  OIL: 'WTI',
  CRUDE: 'WTI',
  BRENT: 'UKOIL',
}

const SYMBOL_STOPWORDS = new Set([
  'MOEDA',
  'ACAO',
  'AÇÃO',
  'SELL',
  'BUY',
  'STOPLOSS',
  'TAKEPROFIT',
  'STOP',
  'LOSS',
  'HOLD',
  'ZONE',
  'LONDON',
  'NEWYORK',
  'PERFORMANCE',
  'TOTAL',
  'JUNE',
  'JULY',
  'AUGUST',
  'NOW',
  'JANEIRO',
  'MINUTOS',
  'NOVA',
  'POSICAO',
  'POSIÇÃO',
  'MONEY',
  'MANAGEMENT',
  'SUITABLE',
  'CAPITAL',
  'BASED',
  'SIZES',
  'RISK',
  'BREAKEVEN',
  'CLOSE',
  'CLOSEALL',
  'HOLD',
  'HIT',
  'PIPS',
  'NET',
  'WIN',
  'LOSS',
  'ENTRY',
  'TRIGGER',
  'SENSEI',
  'MTM',
])

/** Pares forex/crypto/índices comuns */
const SYMBOL_RE =
  /#?([A-Z]{2,6}[\/\-\s]?[A-Z]{2,6}|[A-Z]{3,10})\b/gi

const EXPLICIT_SYMBOL_RE =
  /\b(?:moeda|symbol|par|pair|ativo|instrumento|ticker)\s*[:=]\s*#?([A-Z]{2,12}(?:[\/\-\s][A-Z]{2,12})?)/i

const HASH_SYMBOL_RE = /#([A-Z]{2,12}(?:[\/\-][A-Z]{2,12})?)\b/i

const INLINE_SIGNAL_RE =
  /\b([A-Z]{2,12}(?:[\/\-][A-Z]{2,12})?)\s+(buy|sell|long|short|compra[r]?|venda?)\b(?:\s+(?:now|já|@|at)\s*)?/i

function parseNumber(raw: string): number | null {
  const n = parseFloat(raw.replace(/[^\d.,-]/g, '').replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

export function normalizeSymbol(raw: string): string {
  let s = raw.toUpperCase().replace(/[\/\-\s#]/g, '')
  if (SYMBOL_ALIASES[s]) return SYMBOL_ALIASES[s]
  if (s === 'XAUUSD' || s === 'XAGUSD') return s
  if (/^XAUUSD?$/.test(s)) return 'XAUUSD'
  return s
}

function isValidTradingSymbol(symbol: string): boolean {
  if (!symbol || SYMBOL_STOPWORDS.has(symbol)) return false
  if (/^(BUY|SELL|LONG|SHORT|HOLD|ZONE|NOW)$/.test(symbol)) return false
  if (symbol.length >= 6) return true
  return ['XAUUSD', 'XAGUSD', 'BTCUSD', 'ETHUSD', 'NAS100', 'US30', 'GER40', 'UK100', 'WTI', 'UKOIL', 'USOIL'].includes(
    symbol,
  )
}

function normalizeDirectionFromText(text: string): 'buy' | 'sell' | null {
  const t = text.toLowerCase()
  if (/🟢|🔵|📈|⬆️|🟩/.test(text)) return 'buy'
  if (/🔴|📉|⬇️|🟥/.test(text)) return 'sell'
  if (/\b(buy|long|compra|comprar|bull|call)\b/.test(t)) return 'buy'
  if (/\b(sell|short|venda|vender|bear|put)\b/.test(t)) return 'sell'
  return null
}

/** Recaps, avisos e updates que não são entradas novas */
export function isRecapOrAnnouncement(text: string): boolean {
  const t = text.toLowerCase()
  if (/em\s+\d+\s+minutos?\s+vou\s+enviar/i.test(text)) return true
  if (/\b(?:london|new\s?york|ny)\s+performance\b/i.test(text)) return true
  if (/\btotal\s+(?:win|loss|net)\b/i.test(text)) return true
  if (/\b\d+\s*[-–]\s*[a-z]{3,10}\s+(?:buy|sell)\s+\d+\s*pips?\s*✅/i.test(text)) return true
  if (/(?:^|\n)\s*\d+\s*[-–]\s*[a-z]{3,10}\s+(?:buy|sell)\s+\d+\s*pips/i.test(text) && !/\b(?:sl|stop)\b/i.test(t)) {
    return true
  }
  if (/\bhit\s+all\s+tp\d*\b/i.test(text) && !/\b(?:sl|stop)\s*[:=]/i.test(text)) return true
  if (/\bhit\s+tp[123]\b/i.test(text)) return false
  if (/\bclose\s+all\s+now\b/i.test(text) && !/\b(?:sl|stop)\s*[:=]/i.test(text)) return true
  if (/\b(?:enjoy|consistency|discipline|tomorrow|session)\b/i.test(t) && /\bpips?\s*✅/i.test(text)) return true
  return false
}

function extractSymbol(text: string): string | null {
  const moedaLine = text.match(/^\s*moeda\s*:\s*#?([A-Z0-9]{2,12}(?:[\/\-][A-Z0-9]{2,12})?)/im)
  if (moedaLine?.[1]) {
    const sym = normalizeSymbol(moedaLine[1])
    if (isValidTradingSymbol(sym)) return sym
  }

  const explicit = text.match(EXPLICIT_SYMBOL_RE) ?? text.match(HASH_SYMBOL_RE)
  if (explicit?.[1]) {
    const sym = normalizeSymbol(explicit[1])
    if (isValidTradingSymbol(sym)) return sym
  }

  const inline = text.match(INLINE_SIGNAL_RE)
  if (inline?.[1]) {
    const sym = normalizeSymbol(inline[1])
    if (isValidTradingSymbol(sym)) return sym
  }

  const matches = [...text.matchAll(SYMBOL_RE)]
  for (const m of matches) {
    const candidate = normalizeSymbol(m[1])
    if (isValidTradingSymbol(candidate)) return candidate
  }

  return null
}

function extractDirection(text: string): 'buy' | 'sell' | null {
  const acaoLine = text.match(/^\s*a[cç][aã]o\s*[:=].*$/im)?.[0]
  if (acaoLine) {
    const d = normalizeDirectionFromText(acaoLine)
    if (d) return d
  }

  const actionLine = text.match(/^\s*ação\s*[:=].*$/im)?.[0]
  if (actionLine) {
    const d = normalizeDirectionFromText(actionLine)
    if (d) return d
  }

  const signalHead = text.match(
    /^\s*\d*\.?\s*([A-Z]{2,12}(?:[\/\-][A-Z]{2,12})?)\s+(buy|sell|long|short)\s+(?:now|já|limit|market)?/im,
  )
  if (signalHead) {
    const d = normalizeDirectionFromText(signalHead[2])
    if (d) return d
  }

  const zoneLine = text.match(/gold\s+(buy|sell)\s+zone/im)
  if (zoneLine) {
    const d = normalizeDirectionFromText(zoneLine[1])
    if (d) return d
  }

  for (const line of text.split(/\r?\n/)) {
    const d = normalizeDirectionFromText(line)
    if (d) return d
  }

  return null
}

const ZONE_ASSET_PREFIX =
  '(?:gold|btc(?:usd)?|bitcoin|xau|silver|xag|eth(?:usd)?)?\\s*'

function extractEntryFromZone(text: string, direction: 'buy' | 'sell'): number | null {
  // Intervalo primeiro — evita capturar «431» de «4310 - 4305» com regex single ambígua
  const zone =
    text.match(
      new RegExp(
        `${ZONE_ASSET_PREFIX}(?:buy|sell)\\s+zone\\s*(\\d+(?:[.,]\\d+)?)\\s*[-–—]\\s*(\\d+(?:[.,]\\d+)?)`,
        'i',
      ),
    ) ?? text.match(/zone\s*(\d+(?:[.,]\d+)?)\s*[-–—]\s*(\d+(?:[.,]\d+)?)/i)

  if (zone) {
    const a = parseNumber(zone[1])
    const b = parseNumber(zone[2])
    if (a != null && b != null) {
      const low = Math.min(a, b)
      const high = Math.max(a, b)
      return direction === 'buy' ? low : high
    }
  }

  const single = text.match(
    new RegExp(
      `${ZONE_ASSET_PREFIX}(?:buy|sell)\\s+zone\\s*(\\d+(?:[.,]\\d+)?)(?=\\s*(?:$|\\n|[^0-9]))`,
      'i',
    ),
  )
  if (single) return parseNumber(single[1])

  return null
}

function detectOrderType(text: string): 'market' | 'limit' {
  if (/\b(?:now|market|mercado|já)\b/i.test(text)) return 'market'
  if (/\b(?:buy|sell)\s+zone\b/i.test(text)) return 'market'
  if (/\blimit\b/i.test(text)) return 'limit'
  return 'market'
}

/** Formato Premium: «Gold Sell Zone 4062-4100» + SL/TP (com ou sem «XAUUSD SELL NOW»). */
function isGoldZoneEntrySignal(text: string, sl: number | null, tp: number[]): boolean {
  return (
    /gold\s+(?:buy|sell)\s+zone/i.test(text) &&
    sl != null &&
    tp.length > 0
  )
}

function extractEntry(text: string, lines: string[]): number | null {
  const zoneDir = extractDirection(text)
  if (zoneDir) {
    const fromZone = extractEntryFromZone(text, zoneDir)
    if (fromZone != null) return fromZone
  }

  for (const line of lines) {
    // Cabeçalho numerado («1. XAUUSD BUY NOW») — não usar como preço de entrada
    if (/^\s*\d+\.\s*(?:#?[A-Z]{2,12}|gold|silver|btc)/i.test(line)) continue

    const l = line.toLowerCase()
    if (!/entr(y|ada|ar)|@|abertura|open|preço|preco|price|entry\s*zone|\bzone\b/.test(l)) continue
    if (/sl|tp|stop|alvo|takeprofit|stoploss/.test(l)) continue

    const zoneSingle = line.match(
      new RegExp(`${ZONE_ASSET_PREFIX}(?:buy|sell)\\s+zone\\s*(\\d+(?:[.,]\\d+)?)`, 'i'),
    )
    if (zoneSingle) return parseNumber(zoneSingle[1])

    const at = line.match(/@\s*(\d+(?:[.,]\d+)?)/)
    if (at) return parseNumber(at[1])

    const nums = line.match(NUMBER_RE)
    if (nums?.length) return parseNumber(nums[0])
  }

  const inlineEntry = text.match(
    /\b(?:buy|sell|long|short)\s+(?:now\s+)?(?:@|at)\s*(\d+(?:[.,]\d+)?)/i,
  )
  if (inlineEntry) return parseNumber(inlineEntry[1])

  const compact = text.match(
    /\b[A-Z]{2,12}(?:[\/\-][A-Z]{2,12})?\s+(?:buy|sell)\s+(\d+(?:[.,]\d+)?)\s+(?:sl|stop)/i,
  )
  if (compact) return parseNumber(compact[1])

  // "XAUUSD BUY LIMIT 4005.5" / "XAUUSD SELL STOP 4005.5"
  const limitOrder = text.match(
    /\b[A-Z]{2,12}(?:[\/\-][A-Z]{2,12})?\s+(?:buy|sell)\s+(?:limit|stop)\s+(\d+(?:[.,]\d+)?)/i,
  )
  if (limitOrder) return parseNumber(limitOrder[1])

  return null
}

function extractSlFromText(text: string, lines: string[]): number | null {
  for (const line of lines) {
    const l = line.toLowerCase()
    if (!/\bsl\b|stop\s?loss|stoploss|s\/l|stop(?!\s*profit)/.test(l)) continue

    const labeled = line.match(/(?:sl|stop\s?loss|stoploss|s\/l)\s*[:=]?\s*(\d+(?:[.,]\d+)?)/i)
    if (labeled) return parseNumber(labeled[1])

    const nums = line.match(NUMBER_RE)
    if (nums?.length) return parseNumber(nums[0])
  }

  const global = text.match(/\bsl\s*[:=]\s*(\d+(?:[.,]\d+)?)/i)
  if (global) return parseNumber(global[1])

  const globalStop = text.match(/\bstop\s?loss\s*[:=]?\s*(\d+(?:[.,]\d+)?)/i)
  if (globalStop) return parseNumber(globalStop[1])

  const globalStoploss = text.match(/\bstoploss\s*[:=]?\s*(\d+(?:[.,]\d+)?)/i)
  if (globalStoploss) return parseNumber(globalStoploss[1])

  return null
}

function extractTpFromText(text: string, lines: string[]): number[] {
  const tp: number[] = []

  const globalMatches = text.matchAll(/\btp\d*\s*:\s*(\d+(?:[.,]\d+)?)/gi)
  for (const m of globalMatches) {
    const v = parseNumber(m[1])
    if (v != null) tp.push(v)
  }

  const globalTakeprofit = text.matchAll(/\btake\s?profit\s*[:=]?\s*(\d+(?:[.,]\d+)?)/gi)
  for (const m of globalTakeprofit) {
    const v = parseNumber(m[1])
    if (v != null) tp.push(v)
  }

  for (const line of lines) {
    const l = line.toLowerCase()
    if (!/\btp\d*\b|take\s?profit|takeprofit|alvo|target|objetivo/.test(l)) continue
    if (/\btp\d*\s*:\s*hold\b/i.test(line)) continue

    const labeled = line.match(
      /(?:tp\d*|take\s?profit|takeprofit|alvo|target)\s*:\s*(\d+(?:[.,]\d+)?)/i,
    )
    if (labeled) {
      const v = parseNumber(labeled[1])
      if (v != null) tp.push(v)
      continue
    }

    if (/\btake\s?profit\b|\btakeprofit\b/i.test(line)) {
      const afterLabel = line.match(/take\s?profit\s*[:=]\s*(\d+(?:[.,]\d+)?)/i)
      if (afterLabel) {
        const v = parseNumber(afterLabel[1])
        if (v != null) tp.push(v)
      }
    }
  }

  const compact = text.matchAll(/\btp\d+\s+(\d+(?:[.,]\d+)?)/gi)
  for (const m of compact) {
    const v = parseNumber(m[1])
    if (v != null) tp.push(v)
  }

  const bareTp = text.matchAll(/\btp\s+(\d+(?:[.,]\d+)?)/gi)
  for (const m of bareTp) {
    const v = parseNumber(m[1])
    if (v != null) tp.push(v)
  }

  return [...new Set(tp)].filter((n) => Number.isFinite(n))
}

/** Alerta Pine Script MTM Sensei X via webhook TradingView. */
const SENSEI_PREFIX_RE = /(?:📡\s*)?MTM\s+Sensei\s+X\s*[—–-]\s*/i

/** Corpo do alerta após o prefixo Sensei X (Entry Alert = ideia · Entry Trigger = activação). */
const SENSEI_BODY_RE =
  /(?:(Long|Short|Buy|Sell)\s+)?(Entry\s+Alert|Entry\s+Trigger|Exit\s+Trigger|SL\s+Hit|Stop\s+Loss\s+Hit|TP\d?\s+Hit|Take\s+Profit(?:\s+\d+)?\s+Hit|Breakeven|Break\s+Even|BE\s+Set|Signal|Alert)(?:\s+(Long|Short|Buy|Sell))?\s+([A-Z][A-Z0-9]{1,11})(?:\s+(\d+[mMhHdDwW]?))?(?:\s+@\s*([\d.,]+))?/i

export type SenseiAlertType =
  | 'idea'
  | 'entry_trigger'
  | 'exit'
  | 'sl_hit'
  | 'tp_hit'
  | 'breakeven'
  | 'signal'
  | 'unknown'

/** Campos JSON do webhook TradingView (Pine Script Sensei X). */
export interface SenseiTradingViewFields {
  ticker?: string | null
  action?: string | null
  price?: number | null
  sl?: number | null
  tp?: number | number[] | null
  tp1?: number | null
  tp2?: number | null
  tp3?: number | null
  timeframe?: string | null
  exchange?: string | null
  alertName?: string | null
}

export interface SenseiParsedAlert extends ParsedSignal {
  alertType: SenseiAlertType
  timeframe?: string | null
  exchange?: string | null
  alertName?: string | null
  tpLevel?: number | null
}

function mapSenseiAlertKind(kind: string): SenseiAlertType {
  const k = kind.toLowerCase().replace(/\s+/g, ' ')
  if (k.includes('entry alert')) return 'idea'
  if (k.includes('entry trigger')) return 'entry_trigger'
  if (k === 'signal' || k === 'alert') return 'idea'
  if (k.includes('exit trigger')) return 'exit'
  if (k.includes('sl hit') || k.includes('stop loss hit')) return 'sl_hit'
  if (k.includes('tp') && k.includes('hit')) return 'tp_hit'
  if (k.includes('breakeven') || k.includes('break even') || k.includes('be set')) return 'breakeven'
  return 'unknown'
}

function tpLevelFromKind(kind: string): number | null {
  const m = kind.match(/tp(\d)/i)
  return m ? parseInt(m[1], 10) : null
}

function directionFromAction(action: string | null | undefined): 'buy' | 'sell' | null {
  if (!action?.trim()) return null
  return normalizeDirectionFromText(action)
}

function collectTpFromFields(fields?: SenseiTradingViewFields): number[] {
  if (!fields) return []
  const raw: (number | null | undefined)[] = []
  if (Array.isArray(fields.tp)) raw.push(...fields.tp)
  else if (fields.tp != null) raw.push(fields.tp)
  raw.push(fields.tp1, fields.tp2, fields.tp3)
  return [...new Set(raw.filter((n): n is number => n != null && Number.isFinite(n) && n > 0))]
}

function mergeSenseiParsed(
  textParsed: Partial<SenseiParsedAlert> | null,
  fields: SenseiTradingViewFields | undefined,
  raw: string,
): SenseiParsedAlert | null {
  const fromFieldsSymbol = fields?.ticker ? normalizeSymbol(fields.ticker) : null
  const symbol =
    (textParsed?.symbol && isValidTradingSymbol(textParsed.symbol) ? textParsed.symbol : null) ??
    (fromFieldsSymbol && isValidTradingSymbol(fromFieldsSymbol) ? fromFieldsSymbol : null)

  if (!symbol) return null

  const fieldTp = collectTpFromFields(fields)
  const tp = [...new Set([...(textParsed?.tp ?? []), ...fieldTp])]

  const direction =
    textParsed?.direction ??
    directionFromAction(fields?.action) ??
    null

  const entry = textParsed?.entry ?? fields?.price ?? null
  const sl = textParsed?.sl ?? fields?.sl ?? null

  const alertType = textParsed?.alertType ?? 'signal'
  const orderType: 'market' | 'limit' =
    textParsed?.orderType ?? (entry != null ? 'limit' : 'market')

  return {
    symbol,
    direction,
    entry,
    sl,
    tp,
    orderType,
    raw: raw.trim(),
    alertType,
    timeframe: textParsed?.timeframe ?? fields?.timeframe ?? null,
    exchange: textParsed?.exchange ?? fields?.exchange ?? null,
    alertName: textParsed?.alertName ?? fields?.alertName ?? null,
    tpLevel: textParsed?.tpLevel ?? null,
  }
}

function parseSenseiTextBlock(text: string): Partial<SenseiParsedAlert> | null {
  if (!text?.trim()) return null
  const stripped = text.replace(SENSEI_PREFIX_RE, '').trim()
  const m = stripped.match(SENSEI_BODY_RE) ?? text.match(SENSEI_BODY_RE)
  if (!m) return null

  const symbol = normalizeSymbol(m[4])
  if (!isValidTradingSymbol(symbol)) return null

  const dirRaw = m[1] ?? m[3]
  const direction = dirRaw ? normalizeDirectionFromText(dirRaw) : null
  const entry = m[6] ? parseNumber(m[6]) : null
  const alertType = mapSenseiAlertKind(m[2])
  const tpLevel = tpLevelFromKind(m[2])

  const lines = text.split(/\r?\n/)
  const sl = extractSlFromText(text, lines)
  const tp = extractTpFromText(text, lines)

  return {
    symbol,
    direction,
    entry,
    sl,
    tp,
    orderType: entry != null ? 'limit' : 'market',
    alertType,
    timeframe: m[5] ?? null,
    tpLevel,
  }
}

export function isSenseiTradingViewFormat(
  text: string,
  fields?: SenseiTradingViewFields,
): boolean {
  if (SENSEI_PREFIX_RE.test(text) || SENSEI_BODY_RE.test(text)) return true
  if (fields?.alertName && /sensei/i.test(fields.alertName)) return true
  if (fields?.ticker && fields?.action && /sensei/i.test(text)) return true
  return false
}

/**
 * Parser Sensei X — texto Pine Script + campos JSON do webhook TradingView.
 * Aceita Entry/Exit Trigger, SL/TP Hit, Breakeven e sinais com SL/TP inline ou em JSON.
 */
export function parseSenseiTradingViewAlert(
  text: string,
  fields?: SenseiTradingViewFields,
): SenseiParsedAlert | null {
  const raw = text?.trim() || ''
  const textParsed = parseSenseiTextBlock(raw)
  const merged = mergeSenseiParsed(textParsed, fields, raw || JSON.stringify(fields ?? {}))

  if (merged) return merged

  // JSON estruturado sem texto Sensei (ex.: ticker + action + sl + tp no payload)
  if (fields?.ticker && fields?.action) {
    const sym = normalizeSymbol(fields.ticker)
    if (!isValidTradingSymbol(sym)) return null
    return {
      symbol: sym,
      direction: directionFromAction(fields.action),
      entry: fields.price ?? null,
      sl: fields.sl ?? null,
      tp: collectTpFromFields(fields),
      orderType: fields.price != null ? 'limit' : 'market',
      raw: raw || `Moeda: ${fields.ticker}\nAção: ${fields.action}`,
      alertType: 'signal',
      timeframe: fields.timeframe ?? null,
      exchange: fields.exchange ?? null,
      alertName: fields.alertName ?? null,
    }
  }

  return null
}

export function senseiAlertTypeLabel(type: SenseiAlertType): string {
  switch (type) {
    case 'idea':
      return 'Nova Ideia'
    case 'entry_trigger':
      return 'Ideia Activada'
    case 'exit':
      return 'Exit Trigger'
    case 'sl_hit':
      return 'SL Hit'
    case 'tp_hit':
      return 'TP Hit'
    case 'breakeven':
      return 'Breakeven'
    case 'signal':
      return 'Ideia'
    default:
      return 'Alerta'
  }
}

export function parseSignal(text: string): ParsedSignal | null {
  if (!text || text.length > 4000) return null
  if (isRecapOrAnnouncement(text)) return null

  const symbol = extractSymbol(text)
  const direction = extractDirection(text)
  if (!symbol || !direction) return null

  const lines = text.split(/\r?\n/)
  const orderType = detectOrderType(text)
  const entry = extractEntry(text, lines)
  const sl = extractSlFromText(text, lines)
  const tp = extractTpFromText(text, lines)

  // Entrada nova deve ter SL (ou bloco Gold Zone com SL+TP)
  if (
    sl == null &&
    !/\b(?:now|market|mercado|já)\b/i.test(text) &&
    !isGoldZoneEntrySignal(text, sl, tp)
  ) {
    return null
  }
  if (orderType === 'limit' && (entry == null || entry <= 0)) return null

  return {
    symbol,
    direction,
    entry,
    sl,
    tp,
    orderType,
    raw: text.trim(),
  }
}

export interface ParsedManagement {
  type:
    | 'breakeven'
    | 'move_sl'
    | 'close'
    | 'close_all'
    | 'enable_trailing'
    | 'cancel_orders'
    | 'premium_trade_active'
    | 'premium_hit_tp1'
  symbol: string | null
  sl: number | null
  /** Premium — «Trade active and running» */
  premiumVariant?: PremiumTradeActiveVariant | null
  /** Trailing em pips (Trade Ideas / legado) — MetaAPI RELATIVE_PIPS */
  trailingPips?: number | null
  /** Trailing completo (Premium — activação + distância) */
  trailing?: TrailingDistance | null
  tpLevel?: number | null
  /** Premium: activar trailing só nesta perna após BE (ex. 2 = TP2 no HIT TP1) */
  trailingLeg?: number | null
  /** SL em points do broker (ex: «SL 1000 points») */
  slPoints?: number | null
  /** HIT TP1 + «Close all now» — fechar posição inteira em lucro */
  closeAllAtProfit?: boolean
}

/** Símbolo na mensagem actual ou herdado do sinal em resposta. */
export function extractSymbolFromContext(text: string, parentText?: string | null): string | null {
  return extractSymbol(text) ?? (parentText ? extractSymbol(parentText) : null)
}

/** Cancelar / apagar ordem LIMIT pendente ou sinal inválido. */
export function isCancelInstruction(text: string): boolean {
  const t = text.trim()
  if (
    /^(delete|deleted|cancelar?|cancelled?|canceled|apagar|remov(ido|er)|elimin(ar|ado))$/i.test(t)
  ) {
    return true
  }
  return /\b(cancelar?\s+ordem|cancel\s+order|apagar\s+ordem|delete\s+order|ordem\s+cancelad[oa])\b/i.test(
    text,
  )
}

/** Instruções curtas típicas em resposta a um sinal. */
export function isReplyInstruction(text: string): boolean {
  if (isCancelInstruction(text)) return true
  const t = text.trim()
  if (/^\s*sl\s*[:=]?\s*\d/i.test(t)) return true
  if (/\bsl\s+\d+\s*points?\b/i.test(text)) return true
  if (/\b(?:mover|move|ajustar|alterar|novo)\s+sl\b/i.test(text)) return true
  if (/^\s*sl\s+alterad[oa]\b/i.test(t)) return true
  if (/\bstop\s?loss\s+(?:alterad[oa]|atualizad[oa]|novo)\b/i.test(text)) return true
  return false
}

export function looksLikeManagementUpdate(text: string, channel?: MtmcopyChannelKey): boolean {
  if (!text || shouldIgnoreChannelMessage(text)) return false

  if (channel === 'premium-signals') {
    return (
      isPremiumTpHitMessage(text) ||
      isCancelInstruction(text) ||
      resolvePremiumTradeActiveVariant(text) != null
    )
  }

  return (
    isCancelInstruction(text) ||
    isReplyInstruction(text) ||
    /\b(breakeven|break\s?even|mover\s?sl|trail(ing)?(\s?stop)?|fechar?|close\s?(all|position|now)?|parcial|partial|encerrad[oa]|fechad[oa]|cancelled|canceled|hit\s?tp|hit\s?sl|tp\s?hit|sl\s?hit|hit\s+all\s+tp|set\s+be)\b/i.test(
      text,
    )
  )
}

export function looksLikeManagementOrReplyInstruction(
  text: string,
  channel: MtmcopyChannelKey,
  ctx?: { isReply?: boolean; parentText?: string | null },
): boolean {
  if (!text || shouldIgnoreChannelMessage(text)) return false
  if (ctx?.isReply && isReplyInstruction(text)) return true
  if (ctx?.isReply && ctx.parentText && looksLikeManagementUpdate(text, channel)) return true
  return looksLikeManagementUpdate(text, channel)
}

function resolvePremiumManagementSymbol(text: string, parentText: string | null): string {
  const reject = /^(IFHOLD|CLOSEALL|HOLDRI|WITHRI|SETBE|BREAKEV)/i
  const candidates = [
    extractSymbolFromContext(text, parentText),
    parentText ? extractSymbol(parentText) : null,
  ]
  for (const sym of candidates) {
    if (!sym || reject.test(sym) || !isValidTradingSymbol(sym)) continue
    return sym
  }
  return 'XAUUSD'
}

function parsePremiumManagement(text: string, parentText: string | null): ParsedManagement | null {
  if (isPremiumTpHitMessage(text)) {
    const hitTp = text.match(/\bhit\s+tp([123])\b/i)
    if (hitTp) {
      const level = parseInt(hitTp[1], 10)
      const symbol = resolvePremiumManagementSymbol(text, parentText)
      if (level === 3) {
        return {
          type: 'close',
          symbol,
          sl: null,
          tpLevel: 3,
        }
      }
      if (level === 1) {
        return {
          type: 'premium_hit_tp1',
          symbol,
          sl: null,
          tpLevel: 1,
          closeAllAtProfit: isPremiumTp1CloseAllNowMessage(text),
        }
      }
      return {
        type: 'close',
        symbol,
        sl: null,
        tpLevel: level,
      }
    }
  }

  const tradeActiveVariant = resolvePremiumTradeActiveVariant(text)
  if (tradeActiveVariant) {
    const symbol = resolvePremiumManagementSymbol(text, parentText)
    return {
      type: 'premium_trade_active',
      symbol,
      sl: null,
      premiumVariant: tradeActiveVariant,
    }
  }

  if (isCancelInstruction(text)) {
    const symbol = resolvePremiumManagementSymbol(text, parentText)
    return { type: 'cancel_orders', symbol, sl: null }
  }

  return null
}

function parseTradeIdeasManagement(text: string, parentText: string | null): ParsedManagement | null {
  const symbol = extractSymbolFromContext(text, parentText)
  const t = text.toLowerCase()

  if (isCancelInstruction(text)) {
    return { type: 'cancel_orders', symbol, sl: null }
  }

  if (/\b(close\s?all|fechar\s?tudo|encerrar\s?tudo|close\s+all\s+now)\b/i.test(text)) {
    return { type: 'close_all', symbol, sl: null }
  }

  if (/\bhit\s+all\s+tp\b/i.test(text)) {
    return { type: 'close', symbol, sl: null }
  }

  if (/\bhit\s+tp([123])\b/i.test(text)) {
    const level = parseInt(text.match(/\bhit\s+tp([123])\b/i)![1], 10)
    return {
      type: 'enable_trailing',
      symbol,
      sl: null,
      trailingPips: TRADE_IDEAS_TRAILING_PIPS,
      tpLevel: level,
    }
  }

  if (/\b(fechar?|close\s?(position|trade|now)?|encerrad[oa]|fechad[oa])\b/i.test(t) && !/sl\s*[:=]\s*\d/.test(t)) {
    return { type: 'close', symbol, sl: null }
  }

  if (/\b(breakeven|break\s?even|be\b|set\s+be|hold\s+risk\s+with\s+breakeven)\b/i.test(text)) {
    return { type: 'breakeven', symbol, sl: null }
  }

  if (/\btrail(ing)?(\s?stop)?\b/i.test(text)) {
    return { type: 'enable_trailing', symbol, sl: null }
  }

  const slPointsM = text.match(/\bsl\s+(\d+)\s*points?\b/i)
  if (slPointsM) {
    return {
      type: 'move_sl',
      symbol,
      sl: null,
      slPoints: parseInt(slPointsM[1], 10),
    }
  }

  const slM = text.match(/\bsl\s*[:=]?\s*(\d+(?:[.,]\d+)?)/i)
  if (/\b(?:mover|move|ajustar|alterar|novo)\s+sl\b/i.test(text) || slM) {
    const sl = slM ? parseNumber(slM[1]) : null
    return { type: 'move_sl', symbol, sl }
  }

  if (/\b(hit\s?sl|sl\s?hit)\b/i.test(text)) {
    return { type: 'close', symbol, sl: null }
  }

  if (isReplyInstruction(text) && parentText) {
    return { type: 'breakeven', symbol, sl: null }
  }

  return null
}

export function parseManagementUpdate(
  text: string,
  channel?: MtmcopyChannelKey,
  parentText?: string | null,
): ParsedManagement | null {
  if (!text || shouldIgnoreChannelMessage(text)) return null

  const parent = parentText?.trim() || null
  const isReplyContext = Boolean(parent) || isReplyInstruction(text)

  if (channel === 'premium-signals') {
    return parsePremiumManagement(text, parent)
  }

  const matchesManagement = looksLikeManagementUpdate(text, channel)
  const matchesReply = isReplyContext && isReplyInstruction(text)
  if (!matchesManagement && !matchesReply) return null

  return parseTradeIdeasManagement(text, parent)
}

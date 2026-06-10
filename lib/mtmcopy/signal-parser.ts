import type { MtmcopyChannelKey } from './channel-context'
import { isPremiumTpHitMessage, shouldIgnoreChannelMessage } from './channel-context'
import {
  PREMIUM_TP1_TRAILING_PIPS,
  PREMIUM_TP3_TRAILING_PIPS,
  PREMIUM_TP_HIT_TRAILING_PIPS,
  TRADE_IDEAS_TRAILING_PIPS,
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
  'RISK',
  'BREAKEVEN',
  'CLOSE',
  'HIT',
  'PIPS',
  'NET',
  'WIN',
  'LOSS',
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
  const single = text.match(
    new RegExp(
      `${ZONE_ASSET_PREFIX}(?:buy|sell)\\s+zone\\s*(\\d+(?:[.,]\\d+)?)(?!\\s*[-–—])`,
      'i',
    ),
  )
  if (single) return parseNumber(single[1])

  const zone =
    text.match(
      new RegExp(
        `${ZONE_ASSET_PREFIX}(?:buy|sell)\\s+zone\\s*(\\d+(?:[.,]\\d+)?)\\s*[-–—]\\s*(\\d+(?:[.,]\\d+)?)`,
        'i',
      ),
    ) ?? text.match(/zone\s*(\d+(?:[.,]\d+)?)\s*[-–—]\s*(\d+(?:[.,]\d+)?)/i)

  if (!zone) return null

  const a = parseNumber(zone[1])
  const b = parseNumber(zone[2])
  if (a == null || b == null) return null

  const low = Math.min(a, b)
  const high = Math.max(a, b)
  return direction === 'buy' ? low : high
}

function detectOrderType(text: string): 'market' | 'limit' {
  if (/\b(?:now|market|mercado|já)\b/i.test(text)) return 'market'
  if (/\blimit\b/i.test(text)) return 'limit'
  return 'market'
}

function extractEntry(text: string, lines: string[]): number | null {
  const zoneDir = extractDirection(text)
  if (zoneDir) {
    const fromZone = extractEntryFromZone(text, zoneDir)
    if (fromZone != null) return fromZone
  }

  for (const line of lines) {
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
    /\b(?:buy|sell|long|short)\s+(?:now\s+)?(?:@|at)?\s*(\d+(?:[.,]\d+)?)/i,
  )
  if (inlineEntry) return parseNumber(inlineEntry[1])

  const compact = text.match(
    /\b[A-Z]{2,12}(?:[\/\-][A-Z]{2,12})?\s+(?:buy|sell)\s+(\d+(?:[.,]\d+)?)\s+(?:sl|stop)/i,
  )
  if (compact) return parseNumber(compact[1])

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

  // Entrada nova deve ter SL (todos os formatos MTM oficiais têm)
  if (sl == null && !/\b(?:now|market|mercado|já)\b/i.test(text)) return null
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
  type: 'breakeven' | 'move_sl' | 'close' | 'close_all' | 'enable_trailing' | 'cancel_orders'
  symbol: string | null
  sl: number | null
  /** Trailing em pips (canal Premium HIT TP) — MetaAPI RELATIVE_PIPS */
  trailingPips?: number | null
  tpLevel?: number | null
  /** SL em points do broker (ex: «SL 1000 points») */
  slPoints?: number | null
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
    return isPremiumTpHitMessage(text) || isCancelInstruction(text)
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

function parsePremiumManagement(text: string, parentText: string | null): ParsedManagement | null {
  if (isPremiumTpHitMessage(text)) {
    const hitTp = text.match(/\bhit\s+tp([123])\b/i)
    if (hitTp) {
      const level = parseInt(hitTp[1], 10)
      const symbol = extractSymbolFromContext(text, parentText) ?? 'XAUUSD'
      if (level === 3) {
        return {
          type: 'close',
          symbol,
          sl: null,
          trailingPips: PREMIUM_TP3_TRAILING_PIPS,
          tpLevel: 3,
        }
      }
      return {
        type: level === 1 ? 'enable_trailing' : 'close',
        symbol,
        sl: null,
        trailingPips: level === 1 ? PREMIUM_TP1_TRAILING_PIPS : PREMIUM_TP_HIT_TRAILING_PIPS,
        tpLevel: level,
      }
    }
  }

  if (isCancelInstruction(text)) {
    const symbol = extractSymbolFromContext(text, parentText) ?? 'XAUUSD'
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
    if (!isPremiumTpHitMessage(text) && !isCancelInstruction(text)) return null
    return parsePremiumManagement(text, parent)
  }

  const matchesManagement = looksLikeManagementUpdate(text, channel)
  const matchesReply = isReplyContext && isReplyInstruction(text)
  if (!matchesManagement && !matchesReply) return null

  return parseTradeIdeasManagement(text, parent)
}

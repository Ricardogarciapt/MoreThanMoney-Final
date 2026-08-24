import type { MtmcopyChannelKey } from './channel-context'
import {
  isPremiumHoldRemainderAtBE,
  isPremiumTp1CloseAllNowMessage,
  isPremiumTpHitMessage,
  shouldIgnoreChannelMessage,
} from './channel-context'
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
  /** Zona de entrada [low, high] quando o sinal indica um intervalo (ex. «Gold Sell Zone 4069 - 4075»). */
  zone?: [number, number] | null
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
  let s = raw.toUpperCase().trim()
  // Remove sufixo de corretora introduzido por '.' ou '_' (XAUUSD.r, EURUSD_i, US30.cash → base).
  // NÃO divide em '-' ou '/' porque esses são notação de par (EUR/USD, EUR-USD → EURUSD).
  s = s.split(/[._]/)[0]
  s = s.replace(/[\/\-\s#]/g, '')
  if (SYMBOL_ALIASES[s]) return SYMBOL_ALIASES[s]
  if (s === 'XAUUSD' || s === 'XAGUSD') return s
  if (/^XAUUSD?$/.test(s)) return 'XAUUSD'
  return s
}

function isValidTradingSymbol(symbol: string): boolean {
  if (!symbol || SYMBOL_STOPWORDS.has(symbol)) return false
  if (/^(BUY|SELL|LONG|SHORT|HOLD|ZONE|NOW)$/.test(symbol)) return false
  // Rejeita "símbolos" que são frases de GESTÃO/ruído coladas (≥6 chars passavam): ex. "TRADEACTIVE"
  // de "Trade active and running", "CLOSEALL", "HITALLTP", "NEWPOSITION", "TRADECLOSED". Nenhuma
  // palavra inglesa de gestão é um instrumento — abriam posições inválidas (símbolo TRADEACTIVE no log).
  if (/TRADE|ACTIVE|RUNNING|CLOSE|BREAKEVEN|HIT|POSITION|STANDBY|SECURED|PROFIT|PIPS|SETUP/.test(symbol)) return false
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
  // PRIORIDADE: formato scanner "📊 SÍMBOLO 🔵/🔴 COMPRA/VENDA" — o símbolo está na MESMA
  // linha da direção. Sem isto, os fallbacks apanhavam "Scanner"/"Ideias de" do cabeçalho
  // (≥6 chars passavam no isValidTradingSymbol) → T2T abria símbolo inválido → 502.
  for (const line of text.split(/\r?\n/)) {
    if (!/🔵|🔴|🟢|🟩|🟥|📈|📉|⬆️|⬇️|\b(?:compra[r]?|comprando|venda[r]?|vendendo|buy|buying|sell|selling|long|short)\b/i.test(line)) continue
    // Remove as palavras de direção antes de extrair, senão o SYMBOL_RE cola-as ao símbolo
    // quando há 1 só espaço (ex.: "XAUUSD BUY" → "XAUUSDBUY").
    // O gerúndio também tem de sair: "I'm buying XAUUSD" dava o símbolo "BUYINGXAUUSD".
    const cleaned = line.replace(
      /\b(?:compra[r]?|comprando|venda[r]?|vendendo|buy|buying|sell|selling|long|short|now|j[aá]|at|i'?m|im)\b/gi,
      ' ',
    )
    // Padrão inclui índices com dígitos (NAS100, US30, GER40) além de pares/metais.
    const SYM_LINE_RE = /#?([A-Z]{2,7}\d{2,4}|[A-Z]{2,6}[\/\-]?[A-Z]{2,6}|[A-Z]{3,10})\b/gi
    for (const m of cleaned.matchAll(SYM_LINE_RE)) {
      const sym = normalizeSymbol(m[1])
      if (isValidTradingSymbol(sym)) return sym
    }
  }

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

  // "I'm buying XAUUSD" / "XAUUSD I'm buying" — é assim que os traders do Gold Did e do Golden
  // Moves escrevem. Sem isto o gerúndio não casava com \bbuy\b e a entrada inteira era ignorada.
  const gerundio = text.match(/\b(buying|selling|comprando|vendendo)\b/i)
  if (gerundio) {
    const g = gerundio[1].toLowerCase()
    if (g.startsWith('buy') || g.startsWith('compra')) return 'buy'
    return 'sell'
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

/** Intervalo da zona de entrada [low, high] (ex. «Gold Sell Zone 4069 - 4075» → [4069, 4075]). */
export function extractZoneRange(text: string): [number, number] | null {
  const zone =
    text.match(
      new RegExp(
        `${ZONE_ASSET_PREFIX}(?:buy|sell)\\s+zone\\s*(\\d+(?:[.,]\\d+)?)\\s*[-–—]\\s*(\\d+(?:[.,]\\d+)?)`,
        'i',
      ),
    ) ?? text.match(/zone\s*(\d+(?:[.,]\d+)?)\s*[-–—]\s*(\d+(?:[.,]\d+)?)/i)
    // Linha SÓ com o intervalo — "4642.50-4638". O Golden Moves escreve a zona assim, sem
    // rótulo nenhum, logo a seguir ao "I'm buying XAUUSD".
    ?? text.match(/^\s*(\d{2,7}(?:[.,]\d+)?)\s*[-–—]\s*(\d{2,7}(?:[.,]\d+)?)\s*$/m)
  if (!zone) return null
  const a = parseNumber(zone[1])
  const b = parseNumber(zone[2])
  if (a == null || b == null) return null
  return [Math.min(a, b), Math.max(a, b)]
}

function extractEntryFromZone(text: string, direction: 'buy' | 'sell'): number | null {
  // Intervalo primeiro — evita capturar «431» de «4310 - 4305» com regex single ambígua
  const range = extractZoneRange(text)
  if (range) {
    const [low, high] = range
    return direction === 'buy' ? low : high
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

/** Entrada explícita numa linha ("Entry: 64334.01" / "Entrada = 1.2345"). */
function extractEntryFromText(text: string): number | null {
  const m = text.match(/\b(?:entry|entrada|entrar)\s*[:=]\s*(\d+(?:[.,]\d+)?)/i)
  return m ? parseNumber(m[1]) : null
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

  // "TP1: 4645", "TP 1 4635.15", "TP1 4645" — o separador pode ser dois pontos, espaço ou nada.
  const globalMatches = text.matchAll(/\btp\s*\d{0,2}\s*[:=]?\s*(\d{2,}(?:[.,]\d+)?)/gi)
  for (const m of globalMatches) {
    const v = parseNumber(m[1])
    if (v != null) tp.push(v)
  }

  // "Take Profit 1: 4600.5" — o nível fica entre o rótulo e o preço, e o preço tem 2+ dígitos.
  // Sem isto o TP do Sensei saía como "1" e "2" (os níveis), não os preços. Bug antigo.
  const globalTakeprofit = text.matchAll(/\btake\s?profit\s*\d{0,2}\s*[:=]?\s*(\d{2,}(?:[.,]\d+)?)/gi)
  for (const m of globalTakeprofit) {
    const v = parseNumber(m[1])
    if (v != null) tp.push(v)
  }

  // "Exit 1: 65000" / "Exit2 = 65670" (formato MTM Sensei X)
  const globalExit = text.matchAll(/\bexit\s*\d*\s*[:=]\s*(\d+(?:[.,]\d+)?)/gi)
  for (const m of globalExit) {
    const v = parseNumber(m[1])
    if (v != null) tp.push(v)
  }

  for (const line of lines) {
    const l = line.toLowerCase()
    if (!/\btp\d*\b|take\s?profit|takeprofit|alvo|target|objetivo|exit\s*\d/.test(l)) continue
    if (/\btp\d*\s*:\s*hold\b/i.test(line)) continue

    const labeled = line.match(
      /(?:tp\d*|take\s?profit|takeprofit|alvo|target|exit\s*\d*)\s*:\s*(\d+(?:[.,]\d+)?)/i,
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

  const bareTp = text.matchAll(/\btp\s+(\d{2,}(?:[.,]\d+)?)/gi)
  for (const m of bareTp) {
    const v = parseNumber(m[1])
    if (v != null) tp.push(v)
  }

  return [...new Set(tp)].filter((n) => Number.isFinite(n))
}

/** Alerta Pine Script MTM Sensei X via webhook TradingView. */
const SENSEI_PREFIX_RE = /(?:📡\s*)?MTM\s+Sensei\s+X\s*[—–-]\s*/i

/** Corpo do alerta Sensei X — Entry Buy/Sell = ideia · Entry Alert = activação (Entry Trigger = alias).
 *  Aceita também os formatos curtos de gestão do Pine: "EXIT 1", "SL", "BE", "TP1". */
const SENSEI_BODY_RE =
  /(?:(Long|Short|Buy|Sell)\s+)?(Entry\s+(?:Buy|Sell)|Entry\s+Alert|Entry\s+Trigger|Exit\s+Trigger|Exit(?:\s+\d+)?|Stop\s+Loss\s+Hit|SL\s+Hit|SL|Take\s+Profit(?:\s+\d+)?\s+Hit|TP\d?\s+Hit|TP\s*\d|Breakeven|Break\s+Even|BE\s+Set|BE|Signal|Alert)(?:\s+(Long|Short|Buy|Sell))?\s+([A-Z][A-Z0-9]{1,11})(?:\s+(\d+[mMhHdDwW]?))?(?:\s+@\s*([\d.,]+))?/i

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
  /** Preço de ENTRADA original do sinal (payload Pine «entry») — chave de associação. */
  entry?: number | null
  sl?: number | null
  tp?: number | number[] | null
  tp1?: number | null
  tp2?: number | null
  tp3?: number | null
  tp4?: number | null
  timeframe?: string | null
  exchange?: string | null
  alertName?: string | null
  /** Estado do payload JSON: ENTRY | BE | TP1..TP4 | SL | EXIT */
  state?: string | null
}

export interface SenseiParsedAlert extends ParsedSignal {
  alertType: SenseiAlertType
  timeframe?: string | null
  exchange?: string | null
  alertName?: string | null
  tpLevel?: number | null
}

/** Classifica alert_name / corpo Pine Script (Entry Buy|Sell → ideia · Entry Alert → activação). */
export function alertTypeFromSenseiLabel(label: string | null | undefined): SenseiAlertType | null {
  if (!label?.trim()) return null
  const k = label.toLowerCase().replace(/\s+/g, ' ')
  if (k.includes('entry buy') || k.includes('entry sell')) return 'idea'
  if (k.includes('entry alert') || k.includes('entry trigger')) return 'entry_trigger'
  return null
}

/** Estado JSON do Pine (state) → tipo de alerta + nível de TP. */
export function alertTypeFromState(
  state: string | null | undefined,
): { type: SenseiAlertType; tpLevel: number | null } | null {
  if (!state?.trim()) return null
  const s = state.trim().toUpperCase()
  if (s === 'ENTRY') return { type: 'entry_trigger', tpLevel: null }
  if (s === 'BE') return { type: 'breakeven', tpLevel: null }
  if (s === 'SL') return { type: 'sl_hit', tpLevel: null }
  if (s === 'EXIT') return { type: 'exit', tpLevel: null }
  const tp = s.match(/^TP([1-4])$/)
  if (tp) return { type: 'tp_hit', tpLevel: parseInt(tp[1], 10) }
  return null
}

function directionFromSenseiEntryKind(
  kind: string,
  dirRaw?: string | null,
): 'buy' | 'sell' | null {
  const k = kind.toLowerCase()
  if (k.includes('entry buy')) return 'buy'
  if (k.includes('entry sell')) return 'sell'
  if (dirRaw) return normalizeDirectionFromText(dirRaw)
  return null
}

function mapSenseiAlertKind(kind: string): SenseiAlertType {
  const k = kind.toLowerCase().replace(/\s+/g, ' ').trim()
  if (k.includes('entry buy') || k.includes('entry sell')) return 'idea'
  if (k.includes('entry alert') || k.includes('entry trigger')) return 'entry_trigger'
  if (k === 'signal' || k === 'alert') return 'idea'
  // Gestão — aceita formatos longos ("Exit Trigger", "SL Hit") e curtos ("EXIT 1", "SL", "BE", "TP1").
  if (k === 'exit' || k.startsWith('exit ') || k.includes('exit trigger')) return 'exit'
  if (k === 'sl' || k.includes('sl hit') || k.includes('stop loss')) return 'sl_hit'
  if (k.startsWith('tp') || (k.includes('tp') && k.includes('hit')) || k.includes('take profit')) return 'tp_hit'
  if (k === 'be' || k.includes('breakeven') || k.includes('break even') || k.includes('be set')) return 'breakeven'
  return 'unknown'
}

function tpLevelFromKind(kind: string): number | null {
  const m = kind.match(/(?:tp|exit)\s*(\d)/i)
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
  raw.push(fields.tp1, fields.tp2, fields.tp3, fields.tp4)
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

  // Entrada ORIGINAL do sinal (payload «entry»); só usa o preço do evento como último recurso.
  const entry = textParsed?.entry ?? fields?.entry ?? fields?.price ?? null
  const sl = textParsed?.sl ?? fields?.sl ?? null

  const stateInfo = alertTypeFromState(fields?.state)
  const alertType =
    textParsed?.alertType ??
    stateInfo?.type ??
    alertTypeFromSenseiLabel(fields?.alertName) ??
    (fields?.sl != null && collectTpFromFields(fields).length > 0 ? 'idea' : 'signal')
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
    tpLevel: textParsed?.tpLevel ?? stateInfo?.tpLevel ?? null,
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
  const entry = (m[6] ? parseNumber(m[6]) : null) ?? extractEntryFromText(text)
  const alertType = mapSenseiAlertKind(m[2])
  const tpLevel = tpLevelFromKind(m[2])

  const lines = text.split(/\r?\n/)
  const sl = extractSlFromText(text, lines)
  const tp = extractTpFromText(text, lines)

  // Direção: da palavra Buy/Sell; senão infere pelo SL vs entrada
  // (SL abaixo da entrada → compra; acima → venda).
  let direction = directionFromSenseiEntryKind(m[2], dirRaw)
  if (!direction && entry != null && entry > 0 && sl != null && sl > 0) {
    direction = sl < entry ? 'buy' : 'sell'
  }

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

  // JSON estruturado (ticker + action + sl/tp) — tipo via alert_name ou SL/TP presentes
  if (fields?.ticker && fields?.action) {
    const sym = normalizeSymbol(fields.ticker)
    if (!isValidTradingSymbol(sym)) return null
    const fromName = fields.alertName ? parseSenseiTextBlock(fields.alertName) : null
    const fieldTp = collectTpFromFields(fields)
    const stateInfo = alertTypeFromState(fields.state)
    const inferredType =
      fromName?.alertType ??
      stateInfo?.type ??
      alertTypeFromSenseiLabel(fields.alertName) ??
      (fields.sl != null && fieldTp.length > 0 ? 'idea' : 'entry_trigger')
    return {
      symbol: sym,
      direction: fromName?.direction ?? directionFromAction(fields.action),
      entry: fields.entry ?? fields.price ?? null,
      sl: fields.sl ?? null,
      tp: fieldTp,
      orderType: fields.price != null ? 'limit' : 'market',
      raw: raw || `Moeda: ${fields.ticker}\nAção: ${fields.action}`,
      alertType: inferredType,
      timeframe: fields.timeframe ?? null,
      exchange: fields.exchange ?? null,
      alertName: fields.alertName ?? null,
      tpLevel: stateInfo?.tpLevel ?? null,
    }
  }

  return null
}

export function senseiAlertTypeLabel(type: SenseiAlertType): string {
  switch (type) {
    case 'idea':
      return 'Nova Ideia'
    case 'entry_trigger':
      return 'Entry Alert — Ideia Activada'
    case 'exit':
      return 'Exit Trigger'
    case 'sl_hit':
      return 'SL Hit'
    case 'tp_hit':
      return 'TP Hit'
    case 'breakeven':
      return 'Coloca BreakEven'
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
    zone: extractZoneRange(text),
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
  /** HIT TP1 + «Close all now» — fechar a maioria da posição em lucro */
  closeAllAtProfit?: boolean
  /** «If hold set BE» — fechar 70% e segurar 30% em BE + trailing (em vez de fechar tudo) */
  holdRemainderAtBE?: boolean
  /**
   * Entrada do SINAL a que este follow-up pertence (preço ou zona), lida da mensagem-pai.
   * Serve para ligar o follow-up à POSIÇÃO certa quando há mais do que uma aberta no mesmo
   * símbolo — sem isto escolhia-se a última, que podia ser a de outro setup.
   */
  entryAnchor?: { entry?: number | null; zoneLow?: number | null; zoneHigh?: number | null } | null
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
      /\bhit\s+all\s+tp\b/i.test(text) ||
      /\b(?:hit\s?sl|sl\s?hit|stop\s?loss\s+hit)\b/i.test(text) ||
      /\b(?:breakeven|break\s?even|set\s+be)\b/i.test(text) ||
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
          holdRemainderAtBE: isPremiumHoldRemainderAtBE(text),
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

  // HIT ALL TP → fecha a posição (executor Premium reclassifica a partir do texto)
  if (/\bhit\s+all\s+tp\b/i.test(text)) {
    return { type: 'close', symbol: resolvePremiumManagementSymbol(text, parentText), sl: null }
  }

  // HIT SL / SL hit → fecha (defensivo)
  if (/\b(?:hit\s?sl|sl\s?hit|stop\s?loss\s+hit)\b/i.test(text)) {
    return { type: 'close', symbol: resolvePremiumManagementSymbol(text, parentText), sl: null }
  }

  // Breakeven / Set BE isolado → BE
  if (/\b(?:breakeven|break\s?even|set\s+be)\b/i.test(text)) {
    return { type: 'breakeven', symbol: resolvePremiumManagementSymbol(text, parentText), sl: null }
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

/**
 * Lê um follow-up e, quando há mensagem-pai, anexa a ÂNCORA DA ENTRADA desse sinal — para a
 * execução conseguir ligar o follow-up à posição certa quando há várias abertas no mesmo símbolo.
 */
export function parseManagementUpdate(
  text: string,
  channel?: MtmcopyChannelKey,
  parentText?: string | null,
): ParsedManagement | null {
  const m = parseManagementUpdateInner(text, channel, parentText)
  if (!m) return null
  if (!parentText) return m
  const pai = parseSignal(parentText)
  if (!pai) return m
  return {
    ...m,
    entryAnchor: {
      entry: pai.entry ?? null,
      zoneLow: pai.zone?.[0] ?? null,
      zoneHigh: pai.zone?.[1] ?? null,
    },
  }
}

function parseManagementUpdateInner(
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

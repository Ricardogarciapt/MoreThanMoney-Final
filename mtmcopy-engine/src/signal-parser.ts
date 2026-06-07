// ──────────────────────────────────────────────────────────────────────────
// Signal Parser — extrai símbolo, direção, entrada, SL e TP de mensagens de
// texto do Telegram. Cobre os formatos mais comuns de canais de sinais
// (Forex/Cripto/Ouro). Ajusta os regex consoante o formato real do canal
// que vais copiar — cada canal tem o seu "estilo" de escrever sinais.
// ──────────────────────────────────────────────────────────────────────────

export interface ParsedSignal {
  symbol: string | null
  direction: 'buy' | 'sell' | null
  entry: number | null
  sl: number | null
  tp: number[] // pode haver vários alvos (TP1, TP2, TP3...)
  raw: string
}

const SYMBOL_RE = /\b([A-Z]{2,6}[\/\-]?[A-Z]{2,6}|XAU\s?\/?\s?USD|GOLD|BTC\s?\/?\s?USD[T]?|US30|NAS100|GER40)\b/i
const DIRECTION_RE = /\b(buy|long|compra[r]?|sell|short|venda?)\b/i
const NUMBER_RE = /\d+(?:[.,]\d+)?/g

function parseNumber(raw: string): number | null {
  const n = parseFloat(raw.replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

function normalizeSymbol(raw: string): string {
  let s = raw.toUpperCase().replace(/[\/\-\s]/g, '')
  if (s === 'GOLD') s = 'XAUUSD'
  if (s === 'BTCUSDT') s = 'BTCUSD'
  return s
}

function normalizeDirection(raw: string): 'buy' | 'sell' | null {
  const v = raw.toLowerCase()
  if (/^(buy|long|compra)/.test(v)) return 'buy'
  if (/^(sell|short|venda)/.test(v)) return 'sell'
  return null
}

/**
 * Tenta extrair um sinal estruturado de uma mensagem de texto livre.
 * Devolve null se a mensagem não parecer ser um sinal de entrada
 * (ex: comentários, atualizações de "fechado em lucro", etc.)
 */
export function parseSignal(text: string): ParsedSignal | null {
  if (!text || text.length > 2000) return null

  const symbolMatch = text.match(SYMBOL_RE)
  const directionMatch = text.match(DIRECTION_RE)
  if (!symbolMatch || !directionMatch) return null

  const symbol = normalizeSymbol(symbolMatch[1])
  const direction = normalizeDirection(directionMatch[1])
  if (!direction) return null

  // Linhas tipo "Entry: 1.0850" / "Entrada 1.0850" / "SL: 1.0800" / "TP1: 1.0900"
  const lines = text.split(/\r?\n/)
  let entry: number | null = null
  let sl: number | null = null
  const tp: number[] = []

  for (const line of lines) {
    const l = line.toLowerCase()
    const nums = line.match(NUMBER_RE)
    if (!nums || !nums.length) continue

    if (/entr(y|ada)|entrar|abertura|open/.test(l)) {
      entry = entry ?? parseNumber(nums[0])
    } else if (/\bsl\b|stop\s?loss|stop/.test(l)) {
      sl = sl ?? parseNumber(nums[0])
    } else if (/\btp\d?\b|take\s?profit|alvo|target/.test(l)) {
      const v = parseNumber(nums[0])
      if (v !== null) tp.push(v)
    }
  }

  // Sem entry explícito, mas com símbolo + direção → ainda é um sinal válido
  // (entrada "a mercado"); o motor usa o preço atual na execução.
  return { symbol, direction, entry, sl, tp, raw: text.trim() }
}

/**
 * Mensagens de "gestão" (mover SL para breakeven, fechar parcial, etc.) não
 * são sinais de entrada — filtramos para não abrir posições por engano.
 */
export function looksLikeManagementUpdate(text: string): boolean {
  return /\b(breakeven|break\s?even|mover\s?sl|fechar?|close|parcial|partial|encerrad[oa]|fechad[oa])\b/i.test(text)
}

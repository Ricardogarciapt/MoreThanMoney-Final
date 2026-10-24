/**
 * Forex Swings → formato único no chat da app.
 *
 * O relay publica no grupo da casa um texto próprio («🌊 MTM Auto FOREX Swings · 🔴 EURCHF SELL ·
 * 🎯 Take Profit · 🛡️ Stop Loss») que era o único canal de ideias que ainda não seguia a estrutura
 * comum (lib/sinais/formato-sinal). No Telegram fica como está; o chat da app mostra a ENTRADA na
 * estrutura de todos os outros, com «Entrada: Mercado» (é «set & forget») e as notas do autor.
 * Seguimentos, recaps e conversa ficam literais.
 */
import { formatarSinal } from './formato-sinal'
import { parseSignal } from '../mtmcopy/signal-parser'

/** Linhas que o formato único já representa (cabeçalho, activo/direcção, SL, TPs, entrada). */
const ESTRUTURA =
  /forex\s*swings|\b(entry|entrada|sl|stop\s*loss|tp\s*\d*|take\s*profit|buy|sell|compra|venda)\b/i

export function forexSwingsParaFormatoUnico(literal: string, quando?: Date | string | null): string | null {
  const t = String(literal ?? '').trim()
  if (!t || !/forex\s*swings/i.test(t)) return null
  const p = parseSignal(t)
  if (!p?.symbol || !p.direction || !p.tp?.length || !(p.sl && p.sl > 0)) return null
  const notas = t
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !ESTRUTURA.test(l) && !/^⚠️/u.test(l))
  return formatarSinal({
    estrategia: 'MTM Auto Forex Swings',
    simbolo: p.symbol,
    direcao: p.direction,
    entrada: p.entry ?? null,
    sl: p.sl,
    tps: p.tp,
    quando: quando ?? null,
    extras: notas,
  })
}

/**
 * Premium → formato único no chat da app.
 *
 * O Telegram Premium continua com o texto do trader (é o canal dele); o chat da app mostra a
 * ENTRADA na estrutura comum (lib/sinais/formato-sinal) e acrescenta as linhas do trader que não
 * são estrutura (conselhos de risco, comentários) — nada do que ele escreveu se perde.
 * Mensagens que não são uma entrada completa (seguimentos, recaps, conversa) ficam literais.
 */
import { formatarSinal } from './formato-sinal'
import { parseSignal } from '../mtmcopy/signal-parser'
import { isT2TEntrySignal } from '../mtmcopy/t2t-source'

/** Linhas que o formato único já representa (activo/direcção, zona, entrada, SL, TPs). */
const ESTRUTURA =
  /\b(zone|zona|entry|entrada|sl|stop\s*loss|tp\s*\d*|take\s*profit|buy|sell|compra|venda|setup)\b|^\s*\d+\.\s/i

export function premiumParaFormatoUnico(literal: string, quando?: Date | string | null): string | null {
  const t = String(literal ?? '').trim()
  if (!t || !isT2TEntrySignal('premium-ideas', t)) return null
  const p = parseSignal(t)
  if (!p?.symbol || !p.direction || !p.tp.length) return null
  const zona: [number, number] | null =
    p.zone && p.zone[0] !== p.zone[1]
      ? p.zoneFirst != null && p.zoneFirst === p.zone[1]
        ? [p.zone[1], p.zone[0]]
        : [p.zone[0], p.zone[1]]
      : null
  const notas = t
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !ESTRUTURA.test(l))
  return formatarSinal({
    estrategia: 'MTM Auto Premium',
    simbolo: p.symbol,
    direcao: p.direction,
    entrada: zona ? null : p.entry,
    zona,
    sl: p.sl,
    tps: p.tp,
    alvoAberto: /\btp\s*\d*\s*:\s*hold\b/i.test(t),
    quando: quando ?? null,
    extras: notas,
  })
}

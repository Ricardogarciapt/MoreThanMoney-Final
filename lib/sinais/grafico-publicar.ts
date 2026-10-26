/**
 * O gráfico da estratégia junto do sinal publicado — no chat da app (`chat_messages.image_url`) e
 * no Telegram (uma foto em resposta ao cartão).
 *
 * No Telegram vai como RESPOSTA e não como legenda do cartão: o cartão continua a ser uma mensagem
 * de texto, que é o que deixa corrigi-lo depois com editMessageText e o que os seguimentos usam
 * como raiz da thread. Uma foto que falhe não apaga nem atrasa o sinal — só fica sem gráfico.
 */
import { getSiteOrigin } from '@/lib/site-url'

export interface ParametrosGrafico {
  simbolo: string
  direcao: 'buy' | 'sell'
  timeframe?: string | null
  entrada: number | null
  sl: number | null
  tps: number[]
  /** slug da estratégia (sensei, goldkiller, trendshot, mtm-scanner, aurum-flow…) */
  estrategia: string
  /** instante do sinal (ms ou ISO); por omissão, agora */
  quando?: number | string | null
}

/** URL do gráfico por id do sinal gravado em tradingview_signals. */
export function urlDoGraficoDoSinal(signalId: string, opts: { png?: boolean; origem?: string } = {}): string {
  const o = opts.origem ?? getSiteOrigin()
  return `${o}/api/signals/chart-image?id=${encodeURIComponent(signalId)}${opts.png ? '&f=png' : ''}`
}

/** URL do gráfico pelos parâmetros (para quem não tem linha em tradingview_signals). */
export function urlDoGrafico(p: ParametrosGrafico, opts: { png?: boolean; origem?: string } = {}): string {
  const o = opts.origem ?? getSiteOrigin()
  const ms = p.quando == null ? Date.now() : typeof p.quando === 'number' ? p.quando : new Date(p.quando).getTime()
  const q = new URLSearchParams()
  q.set('s', p.simbolo)
  q.set('d', p.direcao)
  if (p.timeframe) q.set('tf', String(p.timeframe))
  if (p.entrada != null) q.set('en', String(p.entrada))
  if (p.sl != null) q.set('sl', String(p.sl))
  const tps = p.tps.filter((t) => Number.isFinite(t) && t > 0)
  if (tps.length) q.set('tp', tps.join(','))
  // Ao minuto: o mesmo sinal pedido duas vezes dá o mesmo URL (e a mesma entrada na CDN).
  q.set('t', String(Math.floor((Number.isFinite(ms) ? ms : Date.now()) / 60_000) * 60))
  q.set('e', p.estrategia)
  if (opts.png) q.set('f', 'png')
  return `${o}/api/signals/chart-image?${q.toString()}`
}

/**
 * Envia a foto do gráfico ao grupo, em resposta ao cartão. Nunca lança; devolve o message_id ou
 * null. O Telegram vai buscar o URL (PNG) — tem até ~10 s para o render.
 */
export async function enviarGraficoTelegram(
  token: string,
  chatId: string,
  pngUrl: string,
  legenda: string,
  responderA: number | null,
): Promise<number | null> {
  if (!token || !chatId) return null
  try {
    const r = await fetch(`https://api.telegram.org/bot${token}/sendPhoto`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        photo: pngUrl,
        caption: legenda.slice(0, 1000),
        disable_notification: true,
        ...(responderA != null ? { reply_to_message_id: responderA, allow_sending_without_reply: true } : {}),
      }),
      signal: AbortSignal.timeout(25_000),
    })
    const j = (await r.json().catch(() => null)) as { ok?: boolean; result?: { message_id?: number }; description?: string } | null
    if (!j?.ok) {
      console.warn('[grafico-telegram] sendPhoto:', j?.description ?? r.status)
      return null
    }
    return Number(j.result?.message_id ?? 0) || null
  } catch (e) {
    console.warn('[grafico-telegram] falhou:', e instanceof Error ? e.message : String(e))
    return null
  }
}

/** Legenda curta da foto: «📊 MTM Scanner · XAUUSD · M15». */
export function legendaDoGrafico(nomeEstrategia: string, simbolo: string, timeframe?: string | null): string {
  const tf = String(timeframe ?? '').trim()
  return `📊 ${nomeEstrategia} · ${simbolo}${tf ? ` · ${/^\d+$/.test(tf) ? (Number(tf) >= 60 ? `H${Number(tf) / 60}` : `M${tf}`) : tf}` : ''}`
}

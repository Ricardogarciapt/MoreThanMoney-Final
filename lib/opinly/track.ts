/**
 * Tracking server-side Opinly (compras e conversões) — SEMPRE best-effort:
 * um falhanço de atribuição nunca pode partir um webhook Stripe ou um registo.
 * Dedup via externalEventId/orderId, por isso retries dos webhooks são seguros.
 */

import { getOpinly, opinlyConfigured } from './client'

export async function opinlyTrack(
  event: string,
  properties?: Record<string, unknown>,
  opts?: { externalEventId?: string; email?: string; anonId?: string },
): Promise<void> {
  if (!opinlyConfigured()) return
  try {
    await getOpinly().track(event, properties, opts)
  } catch (err) {
    console.error(`[opinly] track(${event}) falhou:`, err instanceof Error ? err.message : err)
  }
}

export async function opinlyTrackPurchase(input: {
  orderId: string
  value: number
  currency: string
  email?: string
  /** anonId do pixel (cookie opinly_anon_id) — une a compra ao visitante do browser. */
  anonId?: string
}): Promise<void> {
  if (!opinlyConfigured()) return
  try {
    await getOpinly().trackPurchase(input)
  } catch (err) {
    console.error('[opinly] trackPurchase falhou:', err instanceof Error ? err.message : err)
  }
}

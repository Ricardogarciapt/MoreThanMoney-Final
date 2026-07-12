import { getSupabaseAdmin } from "@/lib/supabase-admin-client"

/**
 * Notifica o desfecho de uma trade (SL/TP/BE/fecho) APENAS a:
 *  - quem clicou "Seguir sinal" (user_followed_signals), e
 *  - quem aceitou o sinal numa das suas contas via Tap-to-Trade
 *    (mtmcopy_signal_log com o mesmo chat_message_id, posição não fechada).
 * Envia in-app + push via /api/notifications/send-push. Best-effort.
 */

function siteOrigin(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL || "https://www.morethanmoney.pt").trim()
}

const OUTCOME_META: Record<string, { emoji: string; label: string; body: string }> = {
  loss: { emoji: "🛑", label: "SL atingido", body: "A trade fechou no stop loss." },
  exit_1: { emoji: "🎯", label: "TP1 atingido", body: "Take profit 1 alcançado." },
  exit_2: { emoji: "🎯", label: "TP2 atingido", body: "Take profit 2 alcançado." },
  exit_3: { emoji: "🎯", label: "TP3 atingido", body: "Take profit 3 alcançado." },
  exit_4: { emoji: "🎯", label: "TP4 atingido", body: "Take profit 4 alcançado." },
  closed: { emoji: "✅", label: "Trade fechada", body: "A trade foi encerrada." },
}

const T2T_CLOSED = new Set(["closed", "rejected", "cancelled", "canceled", "error", "failed"])

export async function notifySignalOutcome(opts: {
  entryId: string
  chatMessageId?: string | null
  ticker: string | null
  status: string
}): Promise<number> {
  const meta = OUTCOME_META[opts.status]
  if (!meta) return 0
  const supabase = getSupabaseAdmin()

  const recipients = new Set<string>()

  // 1. Seguidores do sinal ("Seguir sinal")
  try {
    const { data: fol } = await supabase
      .from("user_followed_signals")
      .select("user_id")
      .eq("signal_id", opts.entryId)
    for (const r of fol ?? []) if (r.user_id) recipients.add(r.user_id as string)
  } catch {
    /* ignora */
  }

  // 2. Quem aceitou o sinal no Tap-to-Trade (posição ainda aberta)
  if (opts.chatMessageId) {
    try {
      const { data: acc } = await supabase
        .from("mtmcopy_signal_log")
        .select("user_id, status")
        .eq("chat_message_id", opts.chatMessageId)
      for (const r of acc ?? []) {
        const st = String(r.status ?? "").toLowerCase()
        if (r.user_id && !T2T_CLOSED.has(st)) recipients.add(r.user_id as string)
      }
    } catch {
      /* ignora */
    }
  }

  const userIds = [...recipients]
  if (!userIds.length) return 0

  const title = `${meta.emoji} ${meta.label} — ${opts.ticker ?? "Sinal"}`
  const url = "/app-mobile?tab=trading-alerts"
  try {
    await fetch(`${siteOrigin()}/api/notifications/send-push`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userIds,
        title,
        body: meta.body,
        url,
        data: { type: "trade_outcome", signal_id: opts.entryId, status: opts.status, ticker: opts.ticker, url },
        tag: `mtm_outcome_${opts.entryId}_${opts.status}`,
      }),
    })
  } catch {
    /* best-effort */
  }
  return userIds.length
}

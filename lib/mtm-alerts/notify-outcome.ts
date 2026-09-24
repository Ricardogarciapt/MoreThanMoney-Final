import { getSupabaseAdmin } from "@/lib/supabase-admin-client"
import { outcomeFrom } from "@/lib/mtmcopy/trade-outcome"

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

/**
 * Desfechos notificados a seguidores e a quem aceitou no T2T.
 *
 * O EMOJI e o RÓTULO vêm do vocabulário canónico (lib/mtmcopy/signal-lifecycle) para o cliente
 * ver o mesmo nome do acontecimento no chat, no Telegram e na notificação. O CORPO é próprio
 * daqui porque é aconselhamento a quem segue o sinal na sua conta, não a descrição do facto.
 */
const OUTCOME_META: Record<string, { emoji: string; label: string; body: string }> = {
  be: { emoji: "🔒", label: "Break-even", body: "O preço avançou a teu favor. Protege a trade: move o Stop Loss para a entrada." },
  loss: { emoji: "🛑", label: "Stop loss", body: "A trade fechou no stop loss." },
  exit_1: { emoji: "🎯", label: "Alvo 1", body: "Primeiro alvo alcançado. Garante parte e protege o restante em break-even." },
  exit_2: { emoji: "🎯", label: "Alvo 2", body: "Segundo alvo alcançado. A trade está a correr a teu favor." },
  exit_3: { emoji: "🎯", label: "Alvo 3", body: "Terceiro alvo alcançado." },
  exit_4: { emoji: "🎯", label: "Alvo 4", body: "Quarto alvo alcançado." },
  closed: { emoji: "🏁", label: "Posição fechada", body: "A trade foi encerrada." },
  // Ideia que morreu antes de abrir — o cliente tem de saber, tal como sabe de um fecho.
  // (Antes: o estado 'discarded' existia no motor de alertas mas nunca chegava a ninguém.)
  discarded: {
    emoji: "🗑️",
    label: "Ideia descartada",
    body: "A ideia deixou de ser válida antes de a entrada encher. Ordens pendentes deste sinal foram apagadas.",
  },
  targets_before_entry: {
    emoji: "🗑️",
    label: "Ideia descartada",
    body: "Os alvos foram atingidos antes de a entrada encher — já não há movimento para aproveitar.",
  },
}

const T2T_CLOSED = new Set(["closed", "rejected", "cancelled", "canceled", "error", "failed"])

export async function notifySignalOutcome(opts: {
  entryId: string
  chatMessageId?: string | null
  ticker: string | null
  status: string
  /** Direção e preços do sinal — com eles o título passa a trazer pips e percentagem. */
  direction?: string | null
  entry?: number | null
  exit?: number | null
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

  // O desfecho em pips e % vem da mesma função que o chat e o Telegram usam — se um deles
  // disser "+200 pips", a notificação diz exatamente o mesmo número.
  const desfecho = outcomeFrom({
    symbol: opts.ticker,
    direction: opts.direction,
    entry: opts.entry,
    exit: opts.exit,
  })
  const title = `${meta.emoji} ${meta.label} — ${opts.ticker ?? "Sinal"}${desfecho ? ` · ${desfecho}` : ""}`
  /**
   * ACOMPANHAMENTO abre o CHAT, na mensagem da trade (regra do dono, 24/09).
   *
   * Um alvo, um break-even ou um fecho é o fio da trade a andar — e o fio vive no chat, em
   * thread no sinal. Levava ao separador de alertas, que mostra o gráfico mas não a conversa.
   * Sem mensagem de chat (sinal só do scanner) mantém-se o destino antigo.
   */
  let url = `/app-mobile?tab=trading-alerts&signal=${opts.entryId}`
  if (opts.chatMessageId) {
    try {
      const { data: msg } = await supabase
        .from("chat_messages")
        .select("channel_slug")
        .eq("id", opts.chatMessageId)
        .maybeSingle()
      const slug = (msg as { channel_slug?: string | null } | null)?.channel_slug
      if (slug) {
        url =
          `/app-mobile?tab=chat&channel=${encodeURIComponent(slug)}` +
          `&msg=${encodeURIComponent(opts.chatMessageId)}`
      }
    } catch {
      /* sem canal — segue o destino antigo */
    }
  }
  try {
    await fetch(`${siteOrigin()}/api/notifications/send-push`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userIds,
        title,
        body: meta.body,
        url,
        data: {
          type: "trade_outcome",
          signal_id: opts.entryId,
          status: opts.status,
          ticker: opts.ticker,
          url,
          ...(opts.chatMessageId ? { message_id: opts.chatMessageId } : {}),
        },
        tag: `mtm_outcome_${opts.entryId}_${opts.status}`,
      }),
    })
  } catch {
    /* best-effort */
  }
  return userIds.length
}

import { getSiteOrigin } from '@/lib/site-url'
import type { AppChatChannelSlug } from '@/lib/telegram-app-channels'
import { tapToTradeEnabledChannels } from '@/lib/mtmcopy/tap-to-trade-channels'
import { isT2TEntrySignal, t2tMode } from '@/lib/mtmcopy/t2t-source'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'

const PUSH_TITLES: Record<string, string> = {
  'trade-ideas-setup': '📊 Novo Sinal Forex!',
  'ideias-e-sinais': '🌊 Nova Ideia Forex Swing!',
  'premium-ideas': '💎 Nova Ideia Premium!',
}

type PushResult = { ok: boolean; status?: number; error?: string }

/** user_ids com conta Tap to Trade ATIVA (ligada). */
async function activeT2TUserIds(): Promise<string[]> {
  const supabase = getSupabaseAdmin()
  const { data } = await supabase
    .from('mtmcopy_connections')
    .select('user_id')
    .eq('purpose', 'tap_to_trade')
    .not('metaapi_account_id', 'is', null)
    .neq('mt5_status', 'disconnected')
  return [...new Set((data ?? []).map((r) => r.user_id as string).filter(Boolean))]
}

async function postPush(body: Record<string, unknown>): Promise<PushResult> {
  try {
    const res = await fetch(`${getSiteOrigin()}/api/notifications/send-push`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      return { ok: false, status: res.status, error: text || res.statusText }
    }
    return { ok: true, status: res.status }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'push fetch failed' }
  }
}

/**
 * Notificação de mensagem/sinal de canal. Para canais de sinais ATIVOS no Tap to Trade:
 *  - Clientes COM conta T2T → push "⚡ Tap to Trade" (categoria de preferência `tap_to_trade`)
 *    que ENCAMINHA direto para o tab T2T (aceitar). Podem desligar o chat e manter só estas.
 *  - Restantes → push "ideia" (categoria `trade_ideas`) que encaminha para o chat respetivo.
 * Para canais normais → 1 push de chat.
 */
export async function sendTelegramChannelPush(opts: {
  slug: AppChatChannelSlug | string
  content: string | null
  imageUrl?: string | null
  telegramMessageId?: number
  /** id da chat_message — necessário para a ação "Tap to Trade" / deep-link ao sinal */
  chatMessageId?: string
}): Promise<PushResult> {
  const slug = opts.slug
  const firstLine = (opts.content ?? '').split('\n')[0]?.trim() ?? ''
  const ideaTitle =
    PUSH_TITLES[slug as AppChatChannelSlug] ?? (firstLine.slice(0, 60) || 'Nova mensagem MTM')
  const body =
    (opts.content ?? '').slice(0, 120) ||
    (opts.imageUrl ? 'Nova imagem no canal' : 'Nova mensagem recebida')
  const chatUrl = `/app-mobile?tab=chat&channel=${encodeURIComponent(slug)}`
  const tag = opts.telegramMessageId ? `chat_${slug}_${opts.telegramMessageId}` : `chat_${slug}`

  // É uma ENTRADA T2T? Só entradas negociáveis geram a notificação "⚡ Tap to Trade".
  // Mensagens de acompanhamento/gestão (updates, "close all", BE) e de PERFORMANCE/resumo
  // (London/New York Performance, Total Win/Loss/Net PIPS) NÃO são T2T → push de chat normal.
  let t2tUsers: string[] = []
  // Nos perpétuos o botão é SEGUIR, não abrir ordem — por isso não faz sentido exigir conta
  // T2T ligada para receber a notificação. Quem tem acesso ao canal pode seguir, logo recebe.
  // (Nos restantes canais o botão abre mesmo uma ordem: só quem tem conta é que o pode usar.)
  const modoSeguir = t2tMode(slug, opts.content) === 'follow'
  if (opts.chatMessageId && isT2TEntrySignal(slug, opts.content)) {
    try {
      const enabled = await tapToTradeEnabledChannels()
      if (enabled?.has(slug)) t2tUsers = modoSeguir ? [] : await activeT2TUserIds()
    } catch {
      // segue como push normal
    }
  }

  // Perpétuo seguível: UMA audiência só, toda a gente com a notificação de seguir.
  if (opts.chatMessageId && modoSeguir && isT2TEntrySignal(slug, opts.content)) {
    const seguirUrl = `/app-mobile?tab=tap-to-trade&signal=${encodeURIComponent(opts.chatMessageId)}`
    const r = await postPush({
      all: true,
      title: `⚡ Seguir posição: ${firstLine.slice(0, 44) || slug}`,
      body,
      url: seguirUrl,
      data: {
        type: 'tap_to_trade',
        channel: slug,
        url: seguirUrl,
        message_id: opts.chatMessageId,
        signal_id: opts.chatMessageId,
        category: 'T2T_SIGNAL',
        mode: 'follow',
      },
      tag: `t2t_${slug}_${opts.chatMessageId}`,
    })
    return { ok: r.ok, status: r.status, error: r.error }
  }

  // Sinal T2T → 2 audiências (prioriza T2T para quem tem conta)
  if (opts.chatMessageId && t2tUsers.length) {
    const t2tUrl = `/app-mobile?tab=tap-to-trade&signal=${encodeURIComponent(opts.chatMessageId)}`
    // 1) Clientes COM conta T2T → "Tap to Trade" → tab T2T (categoria tap_to_trade)
    const r1 = await postPush({
      userIds: t2tUsers,
      title: `⚡ Tap to Trade: ${firstLine.slice(0, 48) || slug}`,
      body,
      url: t2tUrl,
      data: {
        type: 'tap_to_trade',
        channel: slug,
        url: t2tUrl,
        message_id: opts.chatMessageId,
        signal_id: opts.chatMessageId,
        category: 'T2T_SIGNAL',
      },
      tag: `t2t_${slug}_${opts.chatMessageId}`,
    })
    // 2) Restantes → "ideia" → chat (exclui os que já receberam a T2T)
    const r2 = await postPush({
      all: true,
      excludeUserIds: t2tUsers,
      title: ideaTitle,
      body,
      url: chatUrl,
      data: {
        type: 'trade_ideas',
        channel: slug,
        url: chatUrl,
        message_id: opts.chatMessageId,
        signal_id: opts.chatMessageId,
      },
      tag,
    })
    return { ok: r1.ok || r2.ok, status: r1.status ?? r2.status, error: r1.error ?? r2.error }
  }

  // Canal normal (ou T2T sem clientes com conta) → 1 push de chat/ideia
  return postPush({
    all: true,
    title: ideaTitle,
    body,
    url: chatUrl,
    data: {
      type: slug.includes('trade') ? 'trade_ideas' : 'chat_message',
      channel: slug,
      url: chatUrl,
      ...(opts.chatMessageId
        ? { message_id: opts.chatMessageId, signal_id: opts.chatMessageId }
        : {}),
    },
    tag,
  })
}

import { getSiteOrigin } from '@/lib/site-url'
import type { AppChatChannelSlug } from '@/lib/telegram-app-channels'
import { tapToTradeEnabledChannels } from '@/lib/mtmcopy/tap-to-trade-channels'
import { isT2TEntrySignal, t2tMode, matchesT2TPrefs, isManagementFollowup } from '@/lib/mtmcopy/t2t-source'
import { T2T_SIGNAL_CHANNELS } from '@/lib/mtmcopy/tap-to-trade-channels'

import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { atualizarDesfechosDoCanal } from '@/lib/mtmcopy/signal-outcomes'

/** Encerra mesmo a ideia — o mesmo teste do motor de desfechos. */
const TERMINAL_RE =
  /(posi[çc][aã]o\s*fechada|fechad[ao]|sl\s*hit|stop\s*loss\s*hit|cancelad|encerrad|descartad|invalidad|alvo\s+final|close\s+all|hit\s*tp\s*[3-9])/i

const PUSH_TITLES: Record<string, string> = {
  'trade-ideas-setup': '📊 Novo Sinal Forex!',
  'ideias-e-sinais': '🌊 Nova Ideia Forex Swing!',
  'premium-ideas': '💎 Nova Ideia Premium!',
}

type PushResult = { ok: boolean; status?: number; error?: string }

/** user_ids com conta Tap to Trade ATIVA (ligada). */
/**
 * Quem deve receber a notificação de Tap to Trade para ESTE sinal.
 *
 * Dois defeitos que isto corrige:
 *  1. Ignorava as PREFERÊNCIAS do cliente. Quem tinha filtrado "só Premium e ouro" recebia na
 *     mesma o push de um sinal de Forex Swings — os filtros funcionavam no feed e não aqui.
 *  2. Só olhava para `purpose='tap_to_trade'` e esquecia as contas marcadas com
 *     `t2t_enabled=true`, que a rota de aceitação aceita. Esses clientes nunca recebiam nada.
 *
 * Sem filtros definidos ([] ou null) segue tudo — é o comportamento por omissão de sempre.
 */
const SIGNAL_SLUGS = new Set<string>([...T2T_SIGNAL_CHANNELS, 'premium-ideas', 'cripto-perps', 'golden-moves'])

async function activeT2TUserIds(channelSlug: string, content: string | null): Promise<string[]> {
  const supabase = getSupabaseAdmin()
  const { data } = await supabase
    .from('mtmcopy_connections')
    .select('user_id, purpose, t2t_enabled, t2t_sources, t2t_asset_classes')
    .not('metaapi_account_id', 'is', null)
    .neq('mt5_status', 'disconnected')

  const users = new Set<string>()
  for (const r of data ?? []) {
    const row = r as {
      user_id?: string | null; purpose?: string | null; t2t_enabled?: boolean | null
      t2t_sources?: string[] | null; t2t_asset_classes?: string[] | null
    }
    if (!row.user_id) continue
    if (row.purpose !== 'tap_to_trade' && row.t2t_enabled !== true) continue
    // Uma conta que siga este sinal chega para notificar o dono — não se exige que TODAS sigam.
    if (!matchesT2TPrefs(channelSlug, content, { sources: row.t2t_sources, assetClasses: row.t2t_asset_classes })) continue
    users.add(row.user_id)
  }
  return [...users]
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

  // Um fecho acabou de entrar no canal → grava já os pips e a percentagem na mensagem de
  // ENTRADA correspondente. É o que faz o desfecho aparecer no cartão sem esperar pelo cron.
  // Fire-and-forget: nunca segura o envio da notificação.
  if (TERMINAL_RE.test(opts.content ?? '')) {
    void atualizarDesfechosDoCanal(slug, new Date(Date.now() - 48 * 3_600_000).toISOString())
      .catch(() => {})
  }
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
      if (enabled?.has(slug)) t2tUsers = modoSeguir ? [] : await activeT2TUserIds(slug, opts.content ?? null)
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

  // ── ACOMPANHAMENTO ≠ ENTRADA ─────────────────────────────────────────────────────────
  // Um setup gera uma entrada e depois uma dúzia de mensagens de gestão: "1st entry running
  // +240PIPS", "HIT TP2 +106PIPS", "Take partials", "set BE". Todas iam para TODA a gente como
  // notificação. Em sete dias foram 63 mil avisos de chat e 63 mil de ideias — 600 por pessoa,
  // com 0,15% de leitura. Quem lê 86 notificações por dia acaba por desligar a app inteira.
  //
  // A gestão continua a aparecer no chat, em thread no sinal — e quem ACEITOU ou SEGUIU a trade
  // continua a ser avisado pelo caminho próprio (notifySignalOutcome), que sabe quem tem a
  // posição aberta. O que deixa de acontecer é acordar 105 pessoas por um TP que não é delas.
  // Só nos canais de SINAL: numa conversa normal um "fechado" é conversa, não gestão.
  if (SIGNAL_SLUGS.has(slug) && isManagementFollowup(opts.content)) {
    return { ok: true, status: 0 }
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

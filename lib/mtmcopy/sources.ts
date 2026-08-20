import type { MtmcopyChannelKey } from './channel-context'
import { channelKeyForTelegramGroup, getMtmStrategyOptions, parseTelegramGroups } from './copy-methods'
import { channelKeysFromTelegramChat, chatIdsMatch, normalizeChannel } from './channels'
import { getEffectiveSignalChatIds } from './signal-sources-config'
import type { MTMcopierConnection } from './types'

export type MtmcopyChatType = 'private' | 'group' | 'supergroup' | 'channel' | string

export interface MtmcopyTelegramChat {
  id?: number
  username?: string
  title?: string
  type?: MtmcopyChatType
}

/** IDs dos grupos/canais MTM oficiais (opcional). Vazio = todos os grupos onde o bot recebe mensagens. */
export function getDefaultSourceChatIds(): Set<string> {
  const raw = process.env.TELEGRAM_MTMCOPY_DEFAULT_CHAT_IDS || ''
  const ids = raw
    .split(/[,\s]+/)
    .map((s) => s.trim())
    .filter(Boolean)
  return new Set(ids)
}

/** Grupo/canal onde o bot pode emitir sinais (nunca chat privado). */
export function isGroupOrChannelChat(chat: MtmcopyTelegramChat): boolean {
  const type = chat.type
  if (type === 'private') return false
  if (type === 'group' || type === 'supergroup' || type === 'channel') return true
  // channel_post / updates sem type explícito — assumir válido se tiver id de grupo
  if (chat.id != null && chat.id < 0) return true
  return Boolean(chat.username)
}

function matchesEffectiveIds(chat: MtmcopyTelegramChat, effective: Set<string>): boolean {
  const keys = channelKeysFromTelegramChat(chat)
  for (const key of keys) {
    for (const allowed of effective) {
      if (key === allowed || chatIdsMatch(key, allowed)) return true
    }
  }
  return false
}

export async function chatMatchesAllowlist(chat: MtmcopyTelegramChat): Promise<boolean> {
  const effective = await getEffectiveSignalChatIds()
  if (effective.size && matchesEffectiveIds(chat, effective)) return true

  const envAllowlist = getDefaultSourceChatIds()
  if (!envAllowlist.size) return true
  const keys = channelKeysFromTelegramChat(chat)
  return keys.some((k) => envAllowlist.has(k))
}

export function usesCustomChannel(conn: Pick<MTMcopierConnection, 'telegram_channel'>): boolean {
  return Boolean(conn.telegram_channel?.trim())
}

/**
 * Sem canal configurado → sinais dos grupos/canais MTM (onde o bot está).
 * Com canal configurado → apenas esse sender externo (bot tem de ser admin).
 */
export async function connectionMatchesSignalSource(
  conn: Pick<MTMcopierConnection, 'telegram_channel'>,
  chat: MtmcopyTelegramChat,
): Promise<boolean> {
  if (!isGroupOrChannelChat(chat)) return false

  if (usesCustomChannel(conn)) {
    const configured = normalizeChannel(conn.telegram_channel)
    if (!configured) return false
    const keys = channelKeysFromTelegramChat(chat)
    return keys.some((k) => k === configured)
  }

  return chatMatchesAllowlist(chat)
}

export function describeSignalSourceMode(conn: Pick<MTMcopierConnection, 'telegram_channel'>): 'default' | 'custom' {
  return usesCustomChannel(conn) ? 'custom' : 'default'
}

/** Estratégia MTM escolhida corresponde ao canal do sinal (Premium / Trade Ideas). */
export function strategyPickMatchesChannel(
  pick: string | null | undefined,
  channel: MtmcopyChannelKey,
): boolean {
  if (channel === 'unknown') return false
  if (!pick?.trim()) return true
  for (const opt of getMtmStrategyOptions()) {
    if (opt.id === pick.trim() && opt.channelKey) {
      return opt.channelKey === channel
    }
  }
  return false
}

/** Filtra ligações pelo grupo Telegram ou estratégia MTM escolhida. */
export function connectionMatchesChannel(
  conn: Pick<
    MTMcopierConnection,
    | 'telegram_group'
    | 'telegram_groups'
    | 'copy_method'
    | 'sender_mode'
    | 'copyfactory_strategy_pick'
  > & { purpose?: string | null },
  channel: MtmcopyChannelKey,
): boolean {
  if (channel === 'unknown') return false
  if ((conn.sender_mode ?? 'telegram') === 'master_account') return false
  if (conn.copy_method === 'master_slave') return false
  // Contas de Tap to Trade NUNCA executam por canal: só abrem o que o dono aceitar à mão.
  // Sem esta guarda, uma conta T2T sem grupos configurados caía no default 'premium' do
  // parseTelegramGroups e passava a executar automaticamente tudo o que entrasse como Premium.
  if (conn.purpose === 'tap_to_trade') return false

  if (conn.copy_method === 'strategy') {
    return strategyPickMatchesChannel(conn.copyfactory_strategy_pick, channel)
  }

  const groups = parseTelegramGroups(conn)

  const keys = groups
    .map((g) => channelKeyForTelegramGroup(g))
    .filter((k): k is MtmcopyChannelKey => k != null)
  // Grupos webhook/CopyFactory (Sensei/GoldKiller) não têm canal telegram directo:
  // não devem "apanhar" execução directa dos canais Premium/Forex.
  if (!keys.length) return false
  return keys.includes(channel)
}

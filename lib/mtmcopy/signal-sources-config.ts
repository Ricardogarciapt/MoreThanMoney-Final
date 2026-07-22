import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import {
  allChatIdVariants,
  CANONICAL_TELEGRAM_CHANNELS,
  channelKeyFromTitle,
  resolvedForexIdeasChatId,
  resolvedGoldkillerScannerChatId,
  resolvedPremiumSignalsChatId,
  resolvedTradeIdeasChatId,
} from '@/lib/telegram-channel-ids'

export type MtmcopyTelegramChannelKey = 'trade-ideas' | 'premium-signals'

export type SlTpSourceOption = 'from_room' | 'none'

export interface SymbolMapping {
  signal_symbol: string
  platform_symbol: string
}

export interface SymbolLotException {
  symbol: string
  lot: number
}

export interface TradingSchedule {
  mode: 'always' | 'custom'
  days?: number[]
  start_hour?: number
  end_hour?: number
  /** Fuso IANA (ex.: 'Europe/London') p/ interpretar start_hour/end_hour. Ausente = UTC. */
  timezone?: string
  /** Símbolos ISENTOS do horário (executam 24h). Ex.: ["BTCUSD"] no Sensei — o bloqueio
   *  de sessão asiática é só para o ouro; o cripto opera 24/7. */
  exempt_symbols?: string[]
}

export interface ProviderExecutionProfile {
  lot_mode: 'fixed' | 'risk_percent' | 'multiplier'
  lot_value: number
  max_risk_percent: number | null
  copy_sl: boolean
  copy_tp: boolean
  auto_trailing_stop: boolean
  trailing_stop_points: number
  reverse_signals: boolean
  symbols_whitelist: string[] | null
  ai_validation_enabled?: boolean
  ai_min_confidence?: number
  sl_option?: SlTpSourceOption
  execute_if_no_sl?: boolean
  tp_option?: SlTpSourceOption
  execute_if_no_tp?: boolean
  symbol_prefix_suffix_mode?: 'auto' | 'manual'
  symbol_prefix?: string
  symbol_suffix?: string
  symbol_mappings?: SymbolMapping[]
  mt_comment?: string | null
  trading_schedule?: TradingSchedule
  copy_close_orders?: boolean
  copy_modify_orders?: boolean
  close_opposite_positions?: boolean
  symbols_execute_only?: string[] | null
  symbols_avoid?: string[] | null
  symbol_lot_exceptions?: SymbolLotException[]
  /** Percentagens de saída por Exit (TP1/TP2/TP3). Default 75/15/10 (>70% no Exit 1). */
  exit_pct_tp1?: number | null
  exit_pct_tp2?: number | null
  exit_pct_tp3?: number | null
  /** Mecânica de 1 posição + parciais por Exit (como o Premium). Opt-in para rotas
   *  fora do canal premium-signals; premium-signals usa sempre. Default off. */
  partial_exits?: boolean
  /** Fechar os parciais/BE/trailing por PREÇO (monitor), não por mensagem. Default off
   *  (também gated pelo interruptor global premium_price_monitor). */
  price_monitor?: boolean
}

export interface MtmcopyChannelProviderConfig {
  account_id: string
  strategy_id?: string | null
  tag?: string
  execution?: ProviderExecutionProfile
}

export type ProviderSignalSource = 'telegram' | 'webhook'

export interface ProviderRoute {
  id: string
  label?: string
  sender_channel?: MtmcopyTelegramChannelKey | null
  sender_chat_id?: string | null
  /** telegram (default) ou webhook — rotas webhook não disparam em mensagens Telegram. */
  signal_source?: ProviderSignalSource | null
  account_id: string
  strategy_id?: string | null
  /** Prompt/guia lido pela IA para replicar o estilo de execução do provider. */
  ai_strategy_prompt?: string | null
  tag?: string
  execution?: ProviderExecutionProfile
  enabled?: boolean
  /** Disponível no Tap to Trade (app-mobile) — sinais deste provider aparecem no feed Tap to Trade. */
  tap_to_trade?: boolean
  /**
   * Canal de chat (app-mobile) onde os sinais desta rota aparecem. Permite ligar rotas
   * SEM sender_channel canónico ao Tap to Trade. Se ausente: usa o mapa canónico
   * (sender_channel) ou, para rotas custom, os canais de sinais genéricos.
   */
  app_channel?: string | null
}

export interface MtmcopySignalSourcesConfig {
  enabled_chat_ids: string[]
  enabled_channels: MtmcopyTelegramChannelKey[]
  provider_strategy_id: string | null
  provider_account_id: string | null
  provider_routes?: ProviderRoute[]
  channel_providers?: Partial<Record<MtmcopyTelegramChannelKey, MtmcopyChannelProviderConfig>>
  provider_execution?: ProviderExecutionProfile
  provider_execution_profiles?: Partial<Record<MtmcopyTelegramChannelKey, ProviderExecutionProfile>>
  enabled_app_slugs?: string[]
}

const SETTING_KEY = 'mtmcopy_signal_sources'

const DEFAULT_CHANNELS: MtmcopyTelegramChannelKey[] = ['trade-ideas', 'premium-signals']

const DEFAULT_CONFIG: MtmcopySignalSourcesConfig = {
  enabled_chat_ids: [],
  enabled_channels: [...DEFAULT_CHANNELS],
  provider_strategy_id: null,
  provider_account_id: null,
}

let cache: { config: MtmcopySignalSourcesConfig; at: number } | null = null
const CACHE_MS = 30_000

export const TELEGRAM_SIGNAL_CHANNELS: Record<
  MtmcopyTelegramChannelKey,
  { label: string; description: string; envVar: string; envChatId: () => string | undefined }
> = {
  'trade-ideas': {
    label: 'MTM Auto · Sensei Scanner',
    description: CANONICAL_TELEGRAM_CHANNELS.tradeIdeas.title,
    envVar: 'TELEGRAM_CHANNEL_TRADE_IDEAS',
    envChatId: resolvedTradeIdeasChatId,
  },
  'premium-signals': {
    label: 'Premium Signals (@MTMgold)',
    description: CANONICAL_TELEGRAM_CHANNELS.premiumSignals.title,
    envVar: 'TELEGRAM_CHANNEL_PREMIUM_SIGNALS',
    envChatId: resolvedPremiumSignalsChatId,
  },
}

function migrateLegacySlugs(parsed: Record<string, unknown>): MtmcopyTelegramChannelKey[] {
  const fromNew = parsed.enabled_channels
  if (Array.isArray(fromNew) && fromNew.length) {
    return fromNew.filter((k): k is MtmcopyTelegramChannelKey =>
      k === 'trade-ideas' || k === 'premium-signals',
    )
  }

  const legacy = parsed.enabled_app_slugs
  if (!Array.isArray(legacy) || !legacy.length) return [...DEFAULT_CHANNELS]

  const channels: MtmcopyTelegramChannelKey[] = []
  if (legacy.includes('trade-ideas-setup') || legacy.includes('trade-ideas')) {
    channels.push('trade-ideas')
  }
  if (legacy.includes('premium-ideas') || legacy.includes('premium-signals')) {
    channels.push('premium-signals')
  }
  return channels.length ? channels : [...DEFAULT_CHANNELS]
}

export function envChatIds(): string[] {
  const ids = new Set<string>()
  ids.add(resolvedTradeIdeasChatId())
  ids.add(resolvedPremiumSignalsChatId())
  for (const meta of Object.values(TELEGRAM_SIGNAL_CHANNELS)) {
    const id = meta.envChatId()?.trim()
    if (id) ids.add(id)
  }
  const extra = process.env.TELEGRAM_MTMCOPY_DEFAULT_CHAT_IDS
  if (extra) {
    extra
      .split(/[,\s]+/)
      .map((s) => s.trim())
      .filter(Boolean)
      .forEach((id) => ids.add(id))
  }
  return [...ids]
}

export async function getSignalSourcesConfig(): Promise<MtmcopySignalSourcesConfig> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.config

  const supabase = getSupabaseAdmin()
  const { data } = await supabase
    .from('site_settings')
    .select('value')
    .eq('key', SETTING_KEY)
    .maybeSingle()

  let config = DEFAULT_CONFIG
  if (data?.value) {
    try {
      const parsed = typeof data.value === 'string' ? JSON.parse(data.value) : data.value
      config = {
        ...DEFAULT_CONFIG,
        ...parsed,
        enabled_channels: migrateLegacySlugs(parsed),
        enabled_chat_ids: Array.isArray(parsed.enabled_chat_ids)
          ? parsed.enabled_chat_ids.map(String)
          : [],
      }
    } catch {
      config = DEFAULT_CONFIG
    }
  }

  if (!config.provider_strategy_id && process.env.METAAPI_COPY_STRATEGY_ID) {
    config.provider_strategy_id = process.env.METAAPI_COPY_STRATEGY_ID
  }
  if (!config.provider_account_id && process.env.METAAPI_PROVIDER_ACCOUNT_ID) {
    config.provider_account_id = process.env.METAAPI_PROVIDER_ACCOUNT_ID
  }

  cache = { config, at: Date.now() }
  return config
}

export async function saveSignalSourcesConfig(config: MtmcopySignalSourcesConfig) {
  const supabase = getSupabaseAdmin()
  const payload: MtmcopySignalSourcesConfig = {
    enabled_chat_ids: config.enabled_chat_ids,
    enabled_channels: config.enabled_channels,
    provider_strategy_id: config.provider_strategy_id,
    provider_account_id: config.provider_account_id,
    provider_routes: config.provider_routes,
    channel_providers: config.channel_providers,
    provider_execution: config.provider_execution,
    provider_execution_profiles: config.provider_execution_profiles,
  }

  const { error } = await supabase.from('site_settings').upsert(
    {
      key: SETTING_KEY,
      value: JSON.stringify(payload),
      description: 'Canais Telegram activos para MTMcopier + estratégia MetaAPI',
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'key' },
  )
  if (error) throw error
  cache = null
}

function legacyEnvChatId(key: MtmcopyTelegramChannelKey): string {
  return key === 'trade-ideas' ? resolvedTradeIdeasChatId() : resolvedPremiumSignalsChatId()
}

// Fonte única de verdade: mesmo resolver por título usado pelo gate de execução.
function discoveredChannelKey(title: string | null | undefined): MtmcopyTelegramChannelKey | null {
  return channelKeyFromTitle(title)
}

export async function getEffectiveSignalChatIds(): Promise<Set<string>> {
  const config = await getSignalSourcesConfig()
  const rawIds: string[] = []

  for (const key of config.enabled_channels) {
    rawIds.push(legacyEnvChatId(key))
    // trade-ideas engloba os canais dedicados Forex + GoldKiller (mesma chave).
    // Incluí-los na allowlist evita depender da corrida da descoberta no 1º sinal.
    if (key === 'trade-ideas') {
      rawIds.push(resolvedForexIdeasChatId())
      rawIds.push(resolvedGoldkillerScannerChatId())
    }
  }
  config.enabled_chat_ids.forEach((id) => rawIds.push(id))

  if (config.enabled_channels.length) {
    const supabase = getSupabaseAdmin()
    const { data: discovered } = await supabase
      .from('mtmcopy_telegram_discovered')
      .select('chat_id, title, username')
      .limit(200)

    for (const row of discovered ?? []) {
      const mapped = discoveredChannelKey(row.title)
      if (mapped && config.enabled_channels.includes(mapped)) {
        rawIds.push(String(row.chat_id))
      }
      if (
        row.username?.toLowerCase() === CANONICAL_TELEGRAM_CHANNELS.premiumSignals.username?.toLowerCase() &&
        config.enabled_channels.includes('premium-signals')
      ) {
        rawIds.push(String(row.chat_id))
      }
    }
  }

  if (!rawIds.length) {
    envChatIds().forEach((id) => rawIds.push(id))
  }

  return allChatIdVariants(rawIds)
}

export async function registerDiscoveredTelegramChat(chat: {
  id?: number
  username?: string
  title?: string
  type?: string
}) {
  if (chat.id == null) return
  const supabase = getSupabaseAdmin()
  await supabase.from('mtmcopy_telegram_discovered').upsert(
    {
      chat_id: String(chat.id),
      username: chat.username ?? null,
      title: chat.title ?? null,
      chat_type: chat.type ?? null,
      last_message_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'chat_id' },
  )
}

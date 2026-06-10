import type { MtmcopyChannelKey } from './channel-context'
import { getMtmChannelProviders } from './provider-accounts'

/** Métodos de cópia disponíveis ao cliente. */
export type MtmcopyCopyMethod = 'telegram_group' | 'strategy' | 'master_slave'

export type MtmcopyTelegramGroup = 'premium' | 'trade_ideas'

export interface MtmCopyStrategyOption {
  id: string
  channelKey: MtmcopyChannelKey | null
  title: string
  description: string
}

export const COPY_METHODS: {
  id: MtmcopyCopyMethod
  title: string
  description: string
}[] = [
  {
    id: 'strategy',
    title: 'Estratégia MTM',
    description: 'Copia directamente uma estratégia MTM na tua conta, com o teu risco e definições.',
  },
  {
    id: 'telegram_group',
    title: 'Grupos de sinais',
    description: 'Escolhe o grupo Premium (Ouro) ou Ideias de Forex e replica os sinais automaticamente.',
  },
  {
    id: 'master_slave',
    title: 'Copy Trader pessoal',
    description: 'Usa a tua conta mestre para replicar trades em até duas contas slave.',
  },
]

export const TELEGRAM_GROUPS: {
  id: MtmcopyTelegramGroup
  channelKey: MtmcopyChannelKey
  title: string
  description: string
  chatId: string
}[] = [
  {
    id: 'premium',
    channelKey: 'premium-signals',
    title: 'Premium · Ouro',
    description:
      'Sinais consistentes em XAUUSD com scalping por sessão. Três saídas por trade — seguimos as orientações do chat.',
    chatId: '-1002424441843',
  },
  {
    id: 'trade_ideas',
    channelKey: 'trade-ideas',
    title: 'Ideias de Forex',
    description:
      'Sinais intraday e swing em pares forex. Set & forget com gestão de risco e trailing automático.',
    chatId: '-1003716578747',
  },
]

export function channelKeyForTelegramGroup(group: MtmcopyTelegramGroup | null | undefined): MtmcopyChannelKey | null {
  if (group === 'premium') return 'premium-signals'
  if (group === 'trade_ideas') return 'trade-ideas'
  return null
}

/** Estratégias MTM provider disponíveis para o método «Estratégia directa». */
export function getMtmStrategyOptions(): MtmCopyStrategyOption[] {
  const providers = getMtmChannelProviders()
  const out: MtmCopyStrategyOption[] = []

  const premium = providers['premium-signals']
  if (premium?.strategyId) {
    out.push({
      id: premium.strategyId,
      channelKey: 'premium-signals',
      title: 'MTM Premium · Ouro',
      description: 'Sinais XAUUSD com gestão de exits e trailing por sessão.',
    })
  }

  const trade = providers['trade-ideas']
  if (trade?.strategyId) {
    out.push({
      id: trade.strategyId,
      channelKey: 'trade-ideas',
      title: 'MTM Trade Ideas · Forex',
      description: 'Sinais intraday/swing com trailing automático (SL ~20 / TP ~50 pips).',
    })
  }

  return out
}

export function normalizeTelegramGroups(
  groups: unknown,
  single?: MtmcopyTelegramGroup | null,
): MtmcopyTelegramGroup[] {
  const fromArray = Array.isArray(groups)
    ? groups.filter((g): g is MtmcopyTelegramGroup => g === 'premium' || g === 'trade_ideas')
    : []
  if (fromArray.length) return [...new Set(fromArray)]
  if (single === 'premium' || single === 'trade_ideas') return [single]
  return ['premium']
}

export function parseTelegramGroups(conn: {
  telegram_groups?: string[] | null
  telegram_group?: MtmcopyTelegramGroup | null
}): MtmcopyTelegramGroup[] {
  const fromArray = (conn.telegram_groups ?? []).filter(
    (g): g is MtmcopyTelegramGroup => g === 'premium' || g === 'trade_ideas',
  )
  if (fromArray.length) return fromArray
  if (conn.telegram_group === 'premium' || conn.telegram_group === 'trade_ideas') {
    return [conn.telegram_group]
  }
  return ['premium']
}

export function strategyIdsForTelegramGroups(groups: MtmcopyTelegramGroup[]): string[] {
  const providers = getMtmChannelProviders()
  const ids: string[] = []
  if (groups.includes('premium') && providers['premium-signals']?.strategyId) {
    ids.push(providers['premium-signals'].strategyId!)
  }
  if (groups.includes('trade_ideas') && providers['trade-ideas']?.strategyId) {
    ids.push(providers['trade-ideas'].strategyId!)
  }
  return [...new Set(ids)]
}

export function copyMethodLabel(method?: MtmcopyCopyMethod | null): string {
  if (method === 'strategy') return 'Estratégia MTM'
  if (method === 'master_slave') return 'Copy Trader pessoal'
  return 'Grupos de sinais'
}

export function telegramGroupsLabel(groups: MtmcopyTelegramGroup[]): string {
  if (groups.length === 2) return 'Premium + Ideias Forex'
  if (groups.includes('trade_ideas')) return 'Ideias de Forex'
  return 'Premium · Ouro'
}

export function defaultExitPcts(): { tp1: number; tp2: number; tp3: number } {
  return { tp1: 33, tp2: 33, tp3: 34 }
}

export function normalizeExitPcts(
  tp1?: number | null,
  tp2?: number | null,
  tp3?: number | null,
): { tp1: number; tp2: number; tp3: number } {
  const a = Math.max(0, Number(tp1) || 33)
  const b = Math.max(0, Number(tp2) || 33)
  const c = Math.max(0, Number(tp3) || 34)
  const sum = a + b + c
  if (sum <= 0) return defaultExitPcts()
  return {
    tp1: Math.round((a / sum) * 100),
    tp2: Math.round((b / sum) * 100),
    tp3: 100 - Math.round((a / sum) * 100) - Math.round((b / sum) * 100),
  }
}

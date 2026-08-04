import type { MtmcopyChannelKey } from './channel-context'
import { getMtmChannelProviders } from './provider-accounts'
import {
  CANONICAL_PREMIUM_STRATEGY_ID,
  CANONICAL_TRADE_IDEAS_STRATEGY_ID,
  CANONICAL_SENSEI_STRATEGY_ID,
  CANONICAL_GOLDKILLER_STRATEGY_ID,
  CANONICAL_BOOSTER_STRATEGY_ID,
  MTM_COPY_STRATEGY_CATALOG,
  mtmStrategyPublicLabel,
} from './provider-constants'

/** Métodos de cópia disponíveis ao cliente. */
export type MtmcopyCopyMethod = 'telegram_group' | 'strategy' | 'master_slave'

export type MtmcopyTelegramGroup = 'premium' | 'trade_ideas' | 'sensei' | 'goldkiller' | 'forex_swings'

/**
 * Grupos de sinais OFERECIDOS ao cliente como fontes copiáveis.
 * Só os que NÃO são «Estratégia MTM» — para não repetir a mesma fonte de sinais:
 * Ideias de Forex + GoldKiller + Forex Swings. Premium/Sensei/Booster copiam-se pelo método
 * «Estratégia MTM». O tipo mantém 'premium'/'sensei' para retrocompatibilidade de ligações antigas.
 */
export const MTMCOPY_TELEGRAM_GROUP_IDS: MtmcopyTelegramGroup[] = [
  'trade_ideas',
  'forex_swings',
  'goldkiller',
]

/** Grupo de sinais → estratégia CopyFactory canónica (fonte real da cópia).
 *  Forex Swings executa na MESMA conta mestre Forex (fbeeafeb / 5IHE) — comentário «Forex Swings». */
export const TELEGRAM_GROUP_STRATEGY_ID: Record<MtmcopyTelegramGroup, string> = {
  premium: CANONICAL_PREMIUM_STRATEGY_ID,
  trade_ideas: CANONICAL_TRADE_IDEAS_STRATEGY_ID,
  sensei: CANONICAL_SENSEI_STRATEGY_ID,
  goldkiller: CANONICAL_GOLDKILLER_STRATEGY_ID,
  forex_swings: CANONICAL_TRADE_IDEAS_STRATEGY_ID,
}

function isTelegramGroup(v: unknown): v is MtmcopyTelegramGroup {
  return (
    v === 'premium' || v === 'trade_ideas' || v === 'sensei' ||
    v === 'goldkiller' || v === 'forex_swings'
  )
}

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
    description:
      'Copia estratégias auditadas do nosso sistema — Premium, Sensei Scanner ou 20X Booster — com replicação automática na tua conta.',
  },
  {
    id: 'telegram_group',
    title: 'Grupos de sinais',
    description:
      'Escolhe os chats de sinais a copiar — Ideias de Forex, Forex Swings ou GoldKiller. VIP: até 5 contas (subscrição MTMcopier).',
  },
  {
    id: 'master_slave',
    title: 'Copy Trader pessoal',
    description:
      'Copia da tua conta mestre para slaves via CopyFactory. Conta no limite do teu plano (VIP: 5 contas).',
  },
]

export const TELEGRAM_GROUPS: {
  id: MtmcopyTelegramGroup
  channelKey: MtmcopyChannelKey
  title: string
  description: string
  chatId: string
}[] = [
  // Premium e Sensei NÃO aparecem aqui — copiam-se pelo método «Estratégia MTM»
  // (evita repetir a mesma fonte de sinais em dois métodos).
  {
    id: 'trade_ideas',
    channelKey: 'trade-ideas',
    title: 'Ideias de Forex',
    description:
      'Sinais intraday e swing em pares forex. Set & forget com gestão de risco e trailing automático.',
    chatId: '-1003716578747',
  },
  {
    id: 'forex_swings',
    channelKey: 'trade-ideas',
    title: 'MTM Auto FOREX Swings',
    description:
      'Sinais swing de forex (maioritariamente set & forget) executados na conta MTM Auto Forex com trailing automático. Cópia via CopyFactory.',
    chatId: '-1004362819270',
  },
  {
    id: 'goldkiller',
    channelKey: 'premium-signals',
    title: 'Scanner GoldKiller · Ouro',
    description:
      'Sinais do Scanner GoldKiller (XAUUSD) — 0.5% de risco por trade e trailing conforme o scanner. Cópia via CopyFactory.',
    chatId: '',
  },
]

export function channelKeyForTelegramGroup(group: MtmcopyTelegramGroup | null | undefined): MtmcopyChannelKey | null {
  if (group === 'premium') return 'premium-signals'
  if (group === 'trade_ideas') return 'trade-ideas'
  // Sensei e GoldKiller chegam por webhook (scanner) e executam SÓ via CopyFactory —
  // não pela execução directa de Telegram (Premium/Forex). Não devolvem canal telegram
  // para não "apanhar" sinais desses canais na execução directa.
  return null
}

/** Estratégias MTM provider disponíveis para o método «Estratégia directa». */
export function getMtmStrategyOptions(): MtmCopyStrategyOption[] {
  const providers = getMtmChannelProviders()
  const out: MtmCopyStrategyOption[] = []

  const premium = providers['premium-signals']
  if (premium?.strategyId) {
    const catalog = MTM_COPY_STRATEGY_CATALOG[premium.strategyId]
    out.push({
      id: premium.strategyId,
      channelKey: 'premium-signals',
      title: catalog?.title ?? 'MTM Auto Premium',
      description: catalog?.description ?? 'Estratégia auditada Premium · Ouro.',
    })
  }

  // Forex (Trade Ideas) NÃO é oferecido como «Estratégia MTM» — é um Grupo de sinais.

  const senseiCatalog = MTM_COPY_STRATEGY_CATALOG[CANONICAL_SENSEI_STRATEGY_ID]
  if (senseiCatalog) {
    out.push({
      id: CANONICAL_SENSEI_STRATEGY_ID,
      channelKey: 'trade-ideas',
      title: senseiCatalog.title,
      description: senseiCatalog.description,
    })
  }

  const boosterCatalog = MTM_COPY_STRATEGY_CATALOG[CANONICAL_BOOSTER_STRATEGY_ID]
  if (boosterCatalog) {
    out.push({
      id: CANONICAL_BOOSTER_STRATEGY_ID,
      channelKey: 'premium-signals',
      title: boosterCatalog.title,
      description: boosterCatalog.description,
    })
  }

  return out
}

export function normalizeTelegramGroups(
  groups: unknown,
  single?: MtmcopyTelegramGroup | null,
): MtmcopyTelegramGroup[] {
  const fromArray = Array.isArray(groups) ? groups.filter(isTelegramGroup) : []
  if (fromArray.length) return [...new Set(fromArray)]
  if (isTelegramGroup(single)) return [single]
  return ['premium']
}

export function parseTelegramGroups(conn: {
  telegram_groups?: string[] | null
  telegram_group?: MtmcopyTelegramGroup | null
}): MtmcopyTelegramGroup[] {
  const fromArray = (conn.telegram_groups ?? []).filter(isTelegramGroup)
  if (fromArray.length) return [...new Set(fromArray)]
  if (isTelegramGroup(conn.telegram_group)) return [conn.telegram_group]
  return ['premium']
}

export function strategyIdsForTelegramGroups(groups: MtmcopyTelegramGroup[]): string[] {
  const providers = getMtmChannelProviders()
  const ids: string[] = []
  for (const g of groups) {
    if (g === 'premium') {
      // provider configurado tem prioridade; senão a estratégia canónica Premium.
      ids.push(providers['premium-signals']?.strategyId ?? TELEGRAM_GROUP_STRATEGY_ID.premium)
    } else if (g === 'trade_ideas') {
      ids.push(providers['trade-ideas']?.strategyId ?? TELEGRAM_GROUP_STRATEGY_ID.trade_ideas)
    } else {
      // Sensei / GoldKiller → estratégia canónica (webhook → CopyFactory).
      ids.push(TELEGRAM_GROUP_STRATEGY_ID[g])
    }
  }
  return [...new Set(ids.filter(Boolean))]
}

/** Estratégias configuradas no admin (várias rotas sender → mestre). */
export async function getMtmStrategyOptionsAsync(): Promise<MtmCopyStrategyOption[]> {
  const { getSignalSourcesConfig } = await import('./signal-sources-config')
  const { normalizeProviderRoutes, strategyOptionsFromRoutes } = await import('./provider-routes')
  const config = await getSignalSourcesConfig()
  const routes = normalizeProviderRoutes(config)
  const fromRoutes = strategyOptionsFromRoutes(routes)
  // «Estratégia MTM» oferece só as estratégias auto (Premium, Sensei, Booster).
  // Forex e GoldKiller copiam-se pelos «Grupos de sinais» — não como estratégia (evita repetir a fonte).
  const NON_STRATEGY_IDS = new Set<string>([
    CANONICAL_TRADE_IDEAS_STRATEGY_ID,
    CANONICAL_GOLDKILLER_STRATEGY_ID,
  ])
  const list: MtmCopyStrategyOption[] = (
    fromRoutes.length
      ? fromRoutes.map((r) => ({
          id: r.id,
          channelKey: r.channelKey ?? 'premium-signals',
          title: r.title,
          description: r.description,
        }))
      : getMtmStrategyOptions()
  ).filter((o) => !NON_STRATEGY_IDS.has(o.id))

  // Estratégias SÓ-CATÁLOGO (copiáveis, mas sem rota de execução de sinais) — ex.: 20X Booster.
  const boosterCatalog = MTM_COPY_STRATEGY_CATALOG[CANONICAL_BOOSTER_STRATEGY_ID]
  if (boosterCatalog && !list.some((o) => o.id === CANONICAL_BOOSTER_STRATEGY_ID)) {
    list.push({
      id: CANONICAL_BOOSTER_STRATEGY_ID,
      channelKey: 'premium-signals',
      title: boosterCatalog.title,
      description: boosterCatalog.description,
    })
  }
  return list
}

export async function strategyIdsForTelegramGroupsAsync(
  groups: MtmcopyTelegramGroup[],
): Promise<string[]> {
  const { getSignalSourcesConfig } = await import('./signal-sources-config')
  const { normalizeProviderRoutes, strategyIdsFromRoutes } = await import('./provider-routes')
  const config = await getSignalSourcesConfig()
  const routes = normalizeProviderRoutes(config)

  const ids: string[] = []
  for (const g of groups) {
    if (g === 'premium' || g === 'trade_ideas') {
      // Premium/Forex: rotas configuradas no admin têm prioridade (permite remapear).
      const fromRoutes = strategyIdsFromRoutes(routes, [g])
      if (fromRoutes.length) ids.push(...fromRoutes)
      else ids.push(...strategyIdsForTelegramGroups([g]))
    } else {
      // Sensei / GoldKiller → estratégia canónica (webhook → CopyFactory).
      ids.push(...strategyIdsForTelegramGroups([g]))
    }
  }
  return [...new Set(ids.filter(Boolean))]
}

export function copyMethodLabel(method?: MtmcopyCopyMethod | null): string {
  if (method === 'strategy') return 'Estratégia MTM'
  if (method === 'master_slave') return 'Copy Trader pessoal'
  return 'Grupos de sinais'
}

/** Evita gravar a string literal «null» vinda de JSON/String(null). */
export function normalizeTelegramChannel(value: unknown): string | null {
  if (value == null) return null
  const ch = String(value).trim()
  if (!ch || ch.toLowerCase() === 'null') return null
  return ch
}

export function strategyPickLabel(pick: string | null | undefined): string {
  return mtmStrategyPublicLabel(pick)
}

const TELEGRAM_GROUP_SHORT_LABEL: Record<MtmcopyTelegramGroup, string> = {
  premium: 'Premium · Ouro',
  trade_ideas: 'Ideias de Forex',
  sensei: 'Sensei Scanner',
  goldkiller: 'GoldKiller · Ouro',
  forex_swings: 'Forex Swings',
}

export function telegramGroupsLabel(groups: MtmcopyTelegramGroup[]): string {
  const uniq = [...new Set(groups)].filter(isTelegramGroup)
  if (!uniq.length) return TELEGRAM_GROUP_SHORT_LABEL.premium
  if (uniq.length === MTMCOPY_TELEGRAM_GROUP_IDS.length) return 'Todos os sinais'
  return uniq.map((g) => TELEGRAM_GROUP_SHORT_LABEL[g]).join(' + ')
}

// Prioridade: fechar >70% dos lotes no Exit 1 (uma posição, parciais por saída).
export function defaultExitPcts(): { tp1: number; tp2: number; tp3: number } {
  return { tp1: 75, tp2: 15, tp3: 10 }
}

export function normalizeExitPcts(
  tp1?: number | null,
  tp2?: number | null,
  tp3?: number | null,
): { tp1: number; tp2: number; tp3: number } {
  const a = Math.max(0, Number(tp1) || 75)
  const b = Math.max(0, Number(tp2) || 15)
  const c = Math.max(0, Number(tp3) || 10)
  const sum = a + b + c
  if (sum <= 0) return defaultExitPcts()
  return {
    tp1: Math.round((a / sum) * 100),
    tp2: Math.round((b / sum) * 100),
    tp3: 100 - Math.round((a / sum) * 100) - Math.round((b / sum) * 100),
  }
}

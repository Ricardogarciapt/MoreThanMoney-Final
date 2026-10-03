import { telegramChatIdVariants } from '@/lib/mtmcopy/channels'

/** IDs confirmados (bot + app-mobile) — Jun 2026 */
export const CANONICAL_TELEGRAM_CHANNELS = {
  tradeIdeas: {
    chatId: '-1003853860780',
    title: 'MoreThanMoney Sensei Scanner',
    link: 'https://t.me/+EGUwl8eXJpQ4NTZk',
    mtmcopyKey: 'trade-ideas' as const,
    appSlug: 'trade-ideas-setup' as const,
    envVars: [
      'TELEGRAM_CHANNEL_TRADE_IDEAS',
      'TELEGRAM_TRADE_IDEAS_CHAT_ID',
      'TELEGRAM_CHANNEL_ID',
      'TRADINGVIEW_RELAY_CHAT_ID',
    ],
  },
  premiumSignals: {
    chatId: '-1002424441843',
    username: 'MTMgold',
    title: 'MoreThanMoney Premium Signals',
    link: 'https://t.me/MTMgold',
    mtmcopyKey: 'premium-signals' as const,
    appSlug: 'premium-ideas' as const,
    envVars: ['TELEGRAM_CHANNEL_PREMIUM_SIGNALS', 'TELEGRAM_PREMIUM_IDEAS_CHAT_ID'],
  },
  // Canal Telegram dedicado dos sinais Forex ("Moeda:/Ação:/Stoploss:/Takeprofit:").
  // Roteia para a MESMA estratégia trade-ideas (MTM Auto Forex), conta provider forex.
  forexIdeas: {
    chatId: '-1003716578747',
    title: 'More Than Money Ideias de Forex',
    mtmcopyKey: 'trade-ideas' as const,
    appSlug: 'trade-ideas-setup' as const,
    envVars: ['TELEGRAM_CHANNEL_FOREX_IDEAS', 'TELEGRAM_FOREX_IDEAS_CHAT_ID'],
  },
  // Canal Telegram dedicado do scanner GoldKiller ("More Than Money - Goldkiller Scanner").
  // Roteia para a MESMA chave trade-ideas; a rota MTM Auto GoldKiller é escolhida por
  // CONTEÚDO (scannerKey goldkiller) dentro de trade-ideas.
  // ⚠️ id de Basic Group; muda se promovido a supergroup (bot admin costuma converter) →
  //    o match por TÍTULO (channelKeyFromTitle) é o mecanismo durável; o id é best-effort.
  goldkillerScanner: {
    // Grupo promovido a SUPERGRUPO a 2026-07-25 → id mudou (o velho -5454326270 morreu).
    chatId: '-1003912183521',
    title: 'More Than Money - Goldkiller Scanner',
    mtmcopyKey: 'trade-ideas' as const,
    appSlug: 'trade-ideas-setup' as const,
    envVars: ['TELEGRAM_CHANNEL_GOLDKILLER', 'TELEGRAM_GOLDKILLER_CHAT_ID'],
  },
  // Canal Telegram dedicado do MTM Scanner (sinais Ouro/BTC). Bot admin em
  // https://t.me/+ue9JuMRwMv0zMGQ0. chatId vazio → resolve-se por env (define-se o id
  // numérico -100… em TELEGRAM_CHANNEL_MTMSCANNER na Vercel). Enquanto não houver id,
  // resolvedMtmScannerChatId() devolve null e NÃO relaya (não polui outros canais).
  // MTM Scanner Ouro/BTC — o grupo Telegram (-1004363723837) foi REAPROVEITADO para os Perpétuos
  // (decisão Ricardo 2026-08-17). Por isso o MTM Scanner Ouro/BTC deixa de ter grupo Telegram próprio
  // (chatId vazio → resolvedMtmScannerChatId()=null → só chat da app), evitando dupla-publicação no
  // mesmo grupo. Se um dia quiser Telegram de volta, cria-se grupo novo e põe-se o id aqui/env.
  mtmScanner: {
    chatId: '',
    title: 'MTM - Scanner Ouro e BTC',
    mtmcopyKey: 'trade-ideas' as const,
    appSlug: 'trade-ideas-setup' as const,
    envVars: ['TELEGRAM_CHANNEL_MTMSCANNER', 'TELEGRAM_MTMSCANNER_CHAT_ID'],
  },
  // Canal Telegram dos PERPÉTUOS CRIPTO (Aurum Flow ORB + MTM Perps). Reaproveita o grupo que era do
  // MTM Scanner (link https://t.me/+ue9JuMRwMv0zMGQ0). O Ricardo renomeia p/ "Ideias de Perpétuos
  // Cripto" no Telegram. Override por env TELEGRAM_CHANNEL_PERPS se um dia mudar de grupo.
  cryptoPerps: {
    chatId: '-1004363723837',
    title: 'Ideias de Perpétuos Cripto',
    link: 'https://t.me/+ue9JuMRwMv0zMGQ0',
    // Fundido com a Aurum Flow (18/09): o grupo espelha para o canal único «Ideias de Cripto»
    // (o slug `aurum-flow` mantém-se — só mudou o nome visível).
    appSlug: 'aurum-flow' as const,
    envVars: ['TELEGRAM_CHANNEL_PERPS', 'TELEGRAM_PERPS_CHAT_ID'],
  },
  /**
   * MTM Auto FOREX swings — swings de forex, set & forget.
   *
   * Existia como grupo, como relay e como canal na app, mas nunca aqui. Sem estar nesta lista
   * não aparecia no painel de canais oficiais, e um canal que o admin não vê é um canal que
   * ninguém verifica quando deixa de publicar.
   */
  forexSwings: {
    chatId: '-1004362819270',
    title: 'MTM Auto FOREX swings',
    mtmcopyKey: 'trade-ideas' as const,
    appSlug: 'ideias-e-sinais' as const,
    envVars: ['TELEGRAM_CHANNEL_FOREX_SWINGS', 'TELEGRAM_FOREX_SWINGS_CHAT_ID'],
  },
  /**
   * MTM System — a comunidade. NÃO é canal de sinais: não roteia para estratégia nenhuma.
   * Está aqui para o painel mostrar o conjunto dos grupos oficiais, que é o que o admin tem
   * de conseguir confirmar de uma vez.
   */
  mtmSystem: {
    chatId: '-1004352255256',
    title: 'MTM System',
    appSlug: 'comunidade' as const,
    envVars: ['TELEGRAM_CHANNEL_MTM_SYSTEM'],
  },
}

/** Normaliza ID de env (corrige -3716578747 → -1003716578747, remove \\n). */
export function normalizeEnvChatId(raw: string | undefined | null): string | null {
  if (!raw) return null
  const trimmed = raw.trim().replace(/\\n/g, '')
  if (!trimmed) return null
  if (trimmed.startsWith('@')) return trimmed.toLowerCase()

  const negative = trimmed.startsWith('-')
  const digits = trimmed.replace(/^-/, '')

  if (trimmed.startsWith('-100') && /^\d+$/.test(trimmed.slice(4))) {
    return trimmed
  }
  if (/^\d{9,}$/.test(digits)) {
    return `-100${digits}`
  }
  if (negative && /^\d+$/.test(digits)) {
    return `-${digits}`
  }
  return trimmed
}

function readEnv(keys: string[]): string | undefined {
  for (const key of keys) {
    const v = process.env[key]
    if (v?.trim()) return v
  }
  return undefined
}

export function resolvedTradeIdeasChatId(): string {
  return (
    normalizeEnvChatId(readEnv(CANONICAL_TELEGRAM_CHANNELS.tradeIdeas.envVars)) ??
    CANONICAL_TELEGRAM_CHANNELS.tradeIdeas.chatId
  )
}

export function resolvedPremiumSignalsChatId(): string {
  return (
    normalizeEnvChatId(readEnv(CANONICAL_TELEGRAM_CHANNELS.premiumSignals.envVars)) ??
    CANONICAL_TELEGRAM_CHANNELS.premiumSignals.chatId
  )
}

/** Canal Forex dedicado — roteia para a estratégia trade-ideas (MTM Auto Forex). */
export function resolvedForexIdeasChatId(): string {
  return (
    normalizeEnvChatId(readEnv(CANONICAL_TELEGRAM_CHANNELS.forexIdeas.envVars)) ??
    CANONICAL_TELEGRAM_CHANNELS.forexIdeas.chatId
  )
}

/** Canal GoldKiller dedicado — roteia para a chave trade-ideas (rota por conteúdo). */
export function resolvedGoldkillerScannerChatId(): string {
  return (
    normalizeEnvChatId(readEnv(CANONICAL_TELEGRAM_CHANNELS.goldkillerScanner.envVars)) ??
    CANONICAL_TELEGRAM_CHANNELS.goldkillerScanner.chatId
  )
}

/** Canal MTM Scanner (Ouro/BTC). Env se definido; senão o id canónico confirmado; null se vazio. */
export function resolvedMtmScannerChatId(): string | null {
  return (
    normalizeEnvChatId(readEnv(CANONICAL_TELEGRAM_CHANNELS.mtmScanner.envVars)) ??
    (CANONICAL_TELEGRAM_CHANNELS.mtmScanner.chatId || null)
  )
}

/** Canal Telegram dos Perpétuos Cripto. Env se definido; senão o chatId canónico; null se ambos vazios
 *  (grupo ainda por criar) → não relaya, seguro. */
export function resolvedPerpsChatId(): string | null {
  return (
    normalizeEnvChatId(readEnv(CANONICAL_TELEGRAM_CHANNELS.cryptoPerps.envVars)) ??
    (CANONICAL_TELEGRAM_CHANNELS.cryptoPerps.chatId || null)
  )
}

/**
 * Resolve a chave de canal MTM a partir do TÍTULO do grupo Telegram (mecanismo
 * durável, sobrevive a mudanças de id em promoção Basic→Supergroup). Fonte única
 * de verdade partilhada pelo gate de execução (channel-context) e pela allowlist
 * (signal-sources-config). Retorna null se o título não corresponder a nenhum canal.
 */
export function channelKeyFromTitle(
  title: string | null | undefined,
): 'trade-ideas' | 'premium-signals' | null {
  if (!title) return null
  const t = title.toLowerCase()
  if (t.includes('premium') || t.includes('mtmgold')) return 'premium-signals'
  if (
    t.includes('goldkiller') ||
    t.includes('gold killer') ||
    t.includes('scanner') ||
    t.includes('sensei') ||
    t.includes('trade') ||
    t.includes('forex') ||
    t.includes('ideias') ||
    t.includes('setup') ||
    t.includes('sinais')
  ) {
    return 'trade-ideas'
  }
  return null
}

/** Todas as variantes de ID para matching robusto. */
export function allChatIdVariants(ids: Iterable<string>): Set<string> {
  const out = new Set<string>()
  for (const id of ids) {
    const norm = normalizeEnvChatId(id)
    if (!norm) continue
    telegramChatIdVariants(norm).forEach((v) => out.add(v))
    if (norm.startsWith('@')) out.add(norm)
  }
  return out
}

export function registerCanonicalChatIds(target: Map<string, string>, slug: string) {
  const trade = resolvedTradeIdeasChatId()
  const premium = resolvedPremiumSignalsChatId()

  if (slug === CANONICAL_TELEGRAM_CHANNELS.tradeIdeas.appSlug) {
    allChatIdVariants([trade, CANONICAL_TELEGRAM_CHANNELS.tradeIdeas.chatId]).forEach((id) =>
      target.set(id, slug),
    )
  }
  if (slug === CANONICAL_TELEGRAM_CHANNELS.premiumSignals.appSlug) {
    allChatIdVariants([premium, CANONICAL_TELEGRAM_CHANNELS.premiumSignals.chatId]).forEach((id) =>
      target.set(id, slug),
    )
  }
}

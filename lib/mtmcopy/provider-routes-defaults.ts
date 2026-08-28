import {
  resolvedPremiumSignalsChatId,
  resolvedTradeIdeasChatId,
} from '@/lib/telegram-channel-ids'
import {
  CANONICAL_PREMIUM_ACCOUNT_ID,
  CANONICAL_PREMIUM_STRATEGY_ID,
  CANONICAL_SENSEI_ACCOUNT_ID,
  CANONICAL_SENSEI_STRATEGY_ID,
  CANONICAL_TRADE_IDEAS_ACCOUNT_ID,
  CANONICAL_TRADE_IDEAS_STRATEGY_ID,
  CANONICAL_GOLDKILLER_ACCOUNT_ID,
  CANONICAL_GOLDKILLER_STRATEGY_ID,
  SENSEI_PROVIDER_ACCOUNT_ID,
  CANONICAL_AURUMFLOW_ACCOUNT_ID,
  CANONICAL_AURUMFLOW_STRATEGY_ID,
} from './provider-constants'
import {
  PREMIUM_PROVIDER_EXECUTION,
  SENSEI_PROVIDER_EXECUTION,
  TRADE_IDEAS_PROVIDER_EXECUTION,
} from './provider-execution'
import { MTM_DEFAULT_RISK_PERCENT } from './provider-accounts'
import type { ProviderRoute } from './signal-sources-config'

export {
  CANONICAL_PREMIUM_ACCOUNT_ID,
  CANONICAL_TRADE_IDEAS_ACCOUNT_ID,
  CANONICAL_SENSEI_ACCOUNT_ID,
  CANONICAL_PREMIUM_STRATEGY_ID,
  CANONICAL_TRADE_IDEAS_STRATEGY_ID,
  CANONICAL_SENSEI_STRATEGY_ID,
} from './provider-constants'

/**
 * Rotas provider MTM Auto — uma conta/estratégia por canal ou fonte de sinal.
 *
 * 2026-08-24: saíram daqui as canónicas do Trade Ideas (5IHE), Sensei (mADd) e GoldKiller
 * (SDNb). As contas MetaApi delas foram apagadas e o `mtmcopy-reconcile` falhava nas três
 * todos os dias — "MetaApi account … not found". Apagá-las da configuração não bastava:
 * `repairProviderRoutes` reconstrói as canónicas a cada leitura e elas voltavam sempre.
 * As rotas removidas ficaram guardadas em site_settings.mtmcopy_rotas_removidas; se as contas
 * forem recriadas, voltam como rotas normais pelo admin, sem tocar neste ficheiro.
 */
export function buildCanonicalProviderRoutes(): ProviderRoute[] {
  return [
    {
      id: 'canonical-premium-signals',
      label: 'MTM Auto Premium',
      sender_channel: 'premium-signals',
      sender_chat_id: resolvedPremiumSignalsChatId(),
      signal_source: 'telegram',
      account_id: CANONICAL_PREMIUM_ACCOUNT_ID,
      strategy_id: CANONICAL_PREMIUM_STRATEGY_ID,
      tag: 'MTM Auto Premium',
      ai_strategy_prompt: null,
      execution: {
        ...PREMIUM_PROVIDER_EXECUTION,
        lot_value: MTM_DEFAULT_RISK_PERCENT,
        mt_comment: 'MTM Auto Premium',
      },
      enabled: true,
    },
    /**
     * MTM Auto Sensei — conta própria (MT5 34744071) e estratégia Oca7.
     *
     * `signal_source: 'webhook'` porque os sinais vêm do scanner, não de uma mensagem de
     * Telegram: sem isto a rota disparava com o que passasse nos canais.
     *
     * A gestão é do MOTOR DE PREÇO (`price_monitor` no perfil), não do trailing da corretora —
     * é ele que faz os parciais, move o stop para a entrada e depois arrasta o stop atrás do
     * preço a proteger lucro. Esta é uma das três contas onde o motor corre.
     */
    {
      id: 'canonical-sensei',
      label: 'MTM Auto Sensei',
      sender_channel: null,
      sender_chat_id: null,
      signal_source: 'webhook',
      account_id: SENSEI_PROVIDER_ACCOUNT_ID,
      strategy_id: CANONICAL_SENSEI_STRATEGY_ID,
      tag: 'MTM Auto Sensei',
      ai_strategy_prompt: null,
      execution: {
        ...SENSEI_PROVIDER_EXECUTION,
        lot_value: MTM_DEFAULT_RISK_PERCENT,
        mt_comment: 'MTM Auto Sensei',
      },
      app_channel: 'sensei-scanner',
      tap_to_trade: true,
      enabled: true,
    },
    /**
     * MTM Auto Aurum Flow — ex-«Golden Moves» (MT5 34744077, estratégia vT8w).
     *
     * Aqui NÃO se gere nada por cima: o trailing já vem da fonte, que faz a gestão dela na
     * própria conta. Ligar o motor de preço a esta conta seria pôr dois donos a mexer no mesmo
     * stop. Por isso `price_monitor: false` e `auto_trailing_stop: false` — o nosso papel é
     * replicar, não corrigir.
     */
    {
      id: 'canonical-aurum-flow',
      label: 'MTM Auto Aurum Flow',
      sender_channel: null,
      sender_chat_id: null,
      signal_source: 'webhook',
      account_id: CANONICAL_AURUMFLOW_ACCOUNT_ID,
      strategy_id: CANONICAL_AURUMFLOW_STRATEGY_ID,
      tag: 'MTM Auto Aurum Flow',
      ai_strategy_prompt: null,
      execution: {
        ...TRADE_IDEAS_PROVIDER_EXECUTION,
        lot_value: MTM_DEFAULT_RISK_PERCENT,
        mt_comment: 'MTM Auto Aurum Flow',
        auto_trailing_stop: false,
        price_monitor: false,
      },
      // Sem Tap to Trade e SEM CHAT: esta fonte copia-se por estratégia (vT8w) e mais nada. O
      // chat dela foi retirado das apps — `app_channel: null` é o que impede que volte a
      // aparecer conteúdo num canal que ninguém vê.
      app_channel: null,
      tap_to_trade: false,
      enabled: true,
    },
  ]
}

/** Repara rotas mal configuradas (chat errado, sender_channel null, contas trocadas). */
export function repairProviderRoutes(routes: ProviderRoute[]): ProviderRoute[] {
  const canonical = buildCanonicalProviderRoutes()

  // As rotas canónicas são reconstruídas a cada leitura para corrigir corrupção
  // (chat errado, etc.), mas isso apagava as flags editáveis pelo admin. Voltamos
  // a sobrepor as flags guardadas (tap_to_trade, enabled) por conta.
  const savedByAccount = new Map<string, ProviderRoute>()
  for (const r of routes) {
    const acc = r.account_id?.trim()
    if (acc && !savedByAccount.has(acc)) savedByAccount.set(acc, r)
  }
  const canonicalMerged = canonical.map((c) => {
    const saved = savedByAccount.get(c.account_id.trim())
    if (!saved) return c
    return {
      ...c,
      enabled: saved.enabled !== false,
      tap_to_trade: saved.tap_to_trade === true,
      // Preserva o chat T2T dedicado editável (ex.: GoldKiller → 'sinais-goldkiller'),
      // senão a reconstrução canónica mapeava-o pelo sender_channel partilhado ('trade-ideas').
      app_channel: saved.app_channel ?? c.app_channel,
    }
  })

  const custom = routes.filter(
    (r) =>
      r.enabled !== false &&
      r.account_id?.trim() &&
      !isCanonicalRoute(r) &&
      r.id !== 'legacy-global',
  )

  const merged = [...canonicalMerged, ...custom]
  const seenAccount = new Set<string>()
  return merged.filter((r) => {
    const acc = r.account_id.trim()
    if (seenAccount.has(acc)) return false
    seenAccount.add(acc)
    return true
  })
}

function isCanonicalRoute(r: ProviderRoute): boolean {
  if (r.account_id === CANONICAL_PREMIUM_ACCOUNT_ID) return true
  if (r.account_id === SENSEI_PROVIDER_ACCOUNT_ID) return true
  if (r.account_id === CANONICAL_AURUMFLOW_ACCOUNT_ID) return true
  if (r.account_id === CANONICAL_TRADE_IDEAS_ACCOUNT_ID) return true
  if (r.account_id === CANONICAL_SENSEI_ACCOUNT_ID) return true
  if (r.account_id === CANONICAL_GOLDKILLER_ACCOUNT_ID) return true
  if (r.strategy_id === CANONICAL_PREMIUM_STRATEGY_ID) return true
  if (r.strategy_id === CANONICAL_TRADE_IDEAS_STRATEGY_ID) return true
  if (r.strategy_id === CANONICAL_SENSEI_STRATEGY_ID) return true
  if (r.strategy_id === CANONICAL_GOLDKILLER_STRATEGY_ID) return true
  return false
}

export function routeBelongsToChannel(
  route: ProviderRoute,
  channel: 'premium-signals' | 'trade-ideas',
): boolean {
  if (route.signal_source === 'webhook') {
    return channel === 'trade-ideas'
  }

  if (route.sender_channel === channel) return true

  if (channel === 'premium-signals') {
    if (
      route.strategy_id === CANONICAL_TRADE_IDEAS_STRATEGY_ID ||
      route.account_id === CANONICAL_TRADE_IDEAS_ACCOUNT_ID ||
      route.strategy_id === CANONICAL_SENSEI_STRATEGY_ID ||
      route.account_id === CANONICAL_SENSEI_ACCOUNT_ID
    ) {
      return false
    }
    return (
      route.strategy_id === CANONICAL_PREMIUM_STRATEGY_ID ||
      route.account_id === CANONICAL_PREMIUM_ACCOUNT_ID
    )
  }

  if (
    route.strategy_id === CANONICAL_PREMIUM_STRATEGY_ID ||
    route.account_id === CANONICAL_PREMIUM_ACCOUNT_ID
  ) {
    return false
  }
  return (
    route.strategy_id === CANONICAL_TRADE_IDEAS_STRATEGY_ID ||
    route.account_id === CANONICAL_TRADE_IDEAS_ACCOUNT_ID
  )
}

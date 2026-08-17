/**
 * ÍNDICE ÚNICO da configuração do MTM Auto (consolidação — ver o mapa de execução).
 *
 * A config vive em várias keys de `site_settings` (cresceu estratégia a estratégia). Este ficheiro
 * é o mapa: nomes das keys num só sítio + re-export dos loaders tipados. Código novo importa daqui
 * para descobrir e carregar config sem caçar pelo repositório. NÃO muda como a config é lida/guardada
 * (é um facade), por isso é seguro.
 */

/** Todas as keys de config do MTM Auto em `site_settings` (fonte única de nomes). */
export const MTM_AUTO_CONFIG_KEYS = {
  /** Rotas provider + contas + parciais + trading_schedule (o grande). */
  signalSources: 'mtmcopy_signal_sources',
  /** Entrada por zona do Premium: mode, layers, gatilhos. */
  premiumZone: 'mtmcopy_premium_zone',
  /** On/off por estratégia + price_monitor + subscriber_exits. */
  execSwitches: 'mtmcopy_exec_switches',
  /** Execução Forex Swings (James): conta, lote, riskPct. */
  forexSwings: 'forex_swings_execution',
  /** Execução PrimeVerse: traders, conta, tpLevel, bybit. */
  primeverse: 'primeverse_execution',
  /** Estratégias visíveis ao cliente em /mtmcopy. */
  clientStrategies: 'mtmcopy_client_strategies',
  /** Perps Bybit: flag runtime de execução. */
  bybitPerpsExec: 'bybit_perps_exec',
  /** Perps: regras do gate (slMax, cooldown, blacklist, funding). */
  perpsGateRules: 'perps_gate_rules',
  /** Símbolos que o Copy Trading da Bybit não suporta (auto-preenchida). */
  bybitCopyUnsupported: 'bybit_copy_unsupported',
} as const

// ── Loaders tipados (re-export — o facade da consolidação) ──────────────────────────────
export { getSignalSourcesConfig } from './signal-sources-config'
export { getPremiumZoneConfig, setPremiumZoneConfig } from './premium-zone-config'
export { getExecSwitches } from './exec-switches'
export { getForexSwingsExecConfig } from './forex-swings-exec'
export { getPrimeverseExecConfig } from './primeverse-exec'
export { getClientVisibleStrategyIds } from './copy-methods'
export { resolveExitEngine, usesPriceMonitor, type ExitEngine } from './exit-engine'

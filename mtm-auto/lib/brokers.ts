import type { Broker } from './types'

export const MT5_BROKERS: Broker[] = [
  { name: "ICMarkets", servers: ["ICMarkets-MT5-1", "ICMarkets-MT5-2"], env: "Live + Demo", platform: 'MT5', type: 'regulated' },
  { name: "Pepperstone", servers: ["Pepperstone-MT5", "Pepperstone-MT5-Edge"], env: "Live + Demo", platform: 'MT5', type: 'regulated' },
  { name: "Exness", servers: ["Exness-MT5Real", "Exness-MT5Real2", "Exness-MT5Real3"], env: "Live + Demo", platform: 'MT5', type: 'regulated' },
  { name: "XM Group", servers: ["XM-MT5", "XM-MT5-2"], env: "Live + Demo", platform: 'MT5', type: 'regulated' },
  { name: "FxPro", servers: ["FxPro-MT5"], env: "Live + Demo", platform: 'MT5', type: 'regulated' },
  { name: "HFM (HotForex)", servers: ["HFM-MT5Live", "HFMarketsGlobal-Live1"], env: "Live + Demo", platform: 'MT5', type: 'regulated' },
  { name: "Tickmill", servers: ["Tickmill-MT5Live", "Tickmill-MT5Demo"], env: "Live + Demo", platform: 'MT5', type: 'regulated' },
  { name: "Admirals", servers: ["Admirals-MT5Live", "Admirals-MT5Demo"], env: "Live + Demo", platform: 'MT5', type: 'regulated' },
  { name: "OANDA", servers: ["OANDA-MT5"], env: "Live + Demo", platform: 'MT5', type: 'regulated' },
  { name: "AvaTrade", servers: ["AvaTrade-MT5"], env: "Live + Demo", platform: 'MT5', type: 'regulated' },
  { name: "ThinkMarkets", servers: ["ThinkMarkets-MT5Live", "ThinkMarkets-MT5Demo"], env: "Live + Demo", platform: 'MT5', type: 'regulated' },
  { name: "Vantage", servers: ["Vantage-MT5Live", "Vantage-MT5Demo"], env: "Live + Demo", platform: 'MT5', type: 'regulated' },
  { name: "FP Markets", servers: ["FPMarkets-MT5Live", "FPMarkets-MT5Demo"], env: "Live + Demo", platform: 'MT5', type: 'regulated' },
  { name: "BlackBull Markets", servers: ["BlackBull-MT5Live"], env: "Live + Demo", platform: 'MT5', type: 'regulated' },
  { name: "Fusion Markets", servers: ["FusionMarkets-MT5Live"], env: "Live + Demo", platform: 'MT5', type: 'regulated' },
  { name: "Monaxa", servers: ["Monaxa-MT5"], env: "Live + Demo", platform: 'MT5', type: 'regulated' },
  { name: "Axiory", servers: ["Axiory-MT5"], env: "Live + Demo", platform: 'MT5', type: 'regulated' },
  { name: "NordFX", servers: ["NordFX-MT5"], env: "Live + Demo", platform: 'MT5', type: 'regulated' },
  { name: "RoboForex", servers: ["RoboForex-MT5", "RoboForex-MT5-2"], env: "Live + Demo", platform: 'MT5', type: 'regulated' },
  { name: "JustMarkets", servers: ["JustMarkets-MT5Live", "JustMarkets-MT5Demo"], env: "Live + Demo", platform: 'MT5', type: 'regulated' },
  { name: "EagleFX", servers: ["EagleFX-MT5"], env: "Live + Demo", platform: 'MT5', type: 'regulated' },
  { name: "GTCFX", servers: ["GTCFX-MT5Live"], env: "Live + Demo", platform: 'MT5', type: 'regulated' },
  { name: "Eightcap", servers: ["Eightcap-MT5Live"], env: "Live + Demo", platform: 'MT5', type: 'regulated' },
  { name: "Global Prime", servers: ["GlobalPrime-MT5"], env: "Live + Demo", platform: 'MT5', type: 'regulated' },
  { name: "FXGT", servers: ["FXGT-MT5Live"], env: "Live + Demo", platform: 'MT5', type: 'regulated' },
  { name: "OctaFX", servers: ["OctaFX-MT5"], env: "Live + Demo", platform: 'MT5', type: 'regulated' },
]

export const MT5_PROPFIRMS: Broker[] = [
  { name: "FTMO", servers: ["FTMO-MT5"], env: "PropFirm", platform: 'MT5', type: 'propfirm' },
  { name: "MyForexFunds", servers: ["MyForexFunds-MT5"], env: "PropFirm", platform: 'MT5', type: 'propfirm' },
  { name: "FundedNext", servers: ["FundedNext-MT5"], env: "PropFirm", platform: 'MT5', type: 'propfirm' },
  { name: "E8 Funding", servers: ["E8Funding-MT5"], env: "PropFirm", platform: 'MT5', type: 'propfirm' },
  { name: "True Forex Funds", servers: ["TrueForexFunds-MT5"], env: "PropFirm", platform: 'MT5', type: 'propfirm' },
  { name: "Fidelcrest", servers: ["Fidelcrest-MT5"], env: "PropFirm", platform: 'MT5', type: 'propfirm' },
  { name: "Lux Trading Firm", servers: ["LuxTradingFirm-MT5"], env: "PropFirm", platform: 'MT5', type: 'propfirm' },
  { name: "The5ers", servers: ["The5ers-MT5"], env: "PropFirm", platform: 'MT5', type: 'propfirm' },
  { name: "City Traders Imperium", servers: ["CTI-MT5"], env: "PropFirm", platform: 'MT5', type: 'propfirm' },
  { name: "Alphachain", servers: ["Alphachain-MT5"], env: "PropFirm", platform: 'MT5', type: 'propfirm' },
]

export const MT4_BROKERS: Broker[] = [
  { name: "XM Group", servers: ["XM-MT4-1", "XM-MT4-2", "XM-MT4-3"], env: "Live + Demo", platform: 'MT4', type: 'regulated' },
  { name: "FxPro", servers: ["FxPro-MT4Real", "FxPro-MT4Demo"], env: "Live + Demo", platform: 'MT4', type: 'regulated' },
  { name: "ICMarkets", servers: ["ICMarkets-MT4"], env: "Live + Demo", platform: 'MT4', type: 'regulated' },
  { name: "Exness", servers: ["Exness-MT4Real", "Exness-MT4Real2"], env: "Live + Demo", platform: 'MT4', type: 'regulated' },
  { name: "Alpari", servers: ["Alpari-MT4Live", "Alpari-MT4Demo"], env: "Live + Demo", platform: 'MT4', type: 'regulated' },
  { name: "RoboForex", servers: ["RoboForex-MT4Live"], env: "Live + Demo", platform: 'MT4', type: 'regulated' },
  { name: "NordFX", servers: ["NordFX-MT4Live"], env: "Live + Demo", platform: 'MT4', type: 'regulated' },
  { name: "HFM (HotForex)", servers: ["HFM-MT4Live", "HFM-MT4Demo"], env: "Live + Demo", platform: 'MT4', type: 'regulated' },
  { name: "Tickmill", servers: ["Tickmill-MT4Live", "Tickmill-MT4Demo"], env: "Live + Demo", platform: 'MT4', type: 'regulated' },
  { name: "EGM Securities", servers: ["EGMSecurities-Live4", "EGMSecurities-Demo"], env: "Live + Demo", platform: 'MT4', type: 'regulated' },
  { name: "FXGT", servers: ["FXGT-MT4Live"], env: "Live + Demo", platform: 'MT4', type: 'regulated' },
  { name: "JustMarkets", servers: ["JustMarkets-MT4Live"], env: "Live + Demo", platform: 'MT4', type: 'regulated' },
  { name: "Pepperstone", servers: ["Pepperstone-MT4"], env: "Live + Demo", platform: 'MT4', type: 'regulated' },
  { name: "OctaFX", servers: ["OctaFX-MT4"], env: "Live + Demo", platform: 'MT4', type: 'regulated' },
  { name: "InstaForex", servers: ["InstaForex-MT4"], env: "Live + Demo", platform: 'MT4', type: 'regulated' },
  { name: "AvaTrade", servers: ["AvaTrade-MT4"], env: "Live + Demo", platform: 'MT4', type: 'regulated' },
  { name: "Monaxa", servers: ["Monaxa-MT4"], env: "Live + Demo", platform: 'MT4', type: 'regulated' },
]

export function getAllServers() {
  const servers: { value: string; label: string; platform: 'MT4' | 'MT5' }[] = []
  
  MT5_BROKERS.forEach(b => {
    b.servers.forEach(s => {
      servers.push({ value: s, label: `${b.name} - ${s}`, platform: 'MT5' })
    })
  })
  
  MT5_PROPFIRMS.forEach(b => {
    b.servers.forEach(s => {
      servers.push({ value: s, label: `${b.name} - ${s} (PropFirm)`, platform: 'MT5' })
    })
  })
  
  MT4_BROKERS.forEach(b => {
    b.servers.forEach(s => {
      servers.push({ value: s, label: `${b.name} - ${s}`, platform: 'MT4' })
    })
  })
  
  return servers
}

/** Lista para UI (modal adicionar conta): id estável + servidores. */
export type BrokerPickerItem = {
  id: string
  name: string
  servers: string[]
  platform: "MT4" | "MT5"
}

function slugify(s: string) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
}

export const brokers: BrokerPickerItem[] = [
  ...MT5_BROKERS.map((b, i) => ({
    id: `mt5-${slugify(b.name)}-${i}`,
    name: b.name,
    servers: [...b.servers],
    platform: "MT5" as const,
  })),
  ...MT5_PROPFIRMS.map((b, i) => ({
    id: `prop-${slugify(b.name)}-${i}`,
    name: b.name,
    servers: [...b.servers],
    platform: "MT5" as const,
  })),
  ...MT4_BROKERS.map((b, i) => ({
    id: `mt4-${slugify(b.name)}-${i}`,
    name: b.name,
    servers: [...b.servers],
    platform: "MT4" as const,
  })),
]

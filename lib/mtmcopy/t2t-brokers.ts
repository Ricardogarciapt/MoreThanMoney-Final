/**
 * Corretoras permitidas no Tap to Trade — APENAS estas. Servidores MT5 reais (MetaApi).
 * Usado no UI (dropdown) e no servidor (provision) para impedir contornar via API.
 */
export interface T2TBroker {
  id: string
  label: string
  servers: string[]
}

export const T2T_BROKERS: T2TBroker[] = [
  {
    id: 'puprime',
    label: 'PU Prime',
    // Servidores MT5 documentados da PU Prime (variantes de espaçamento incluídas — Live2 e Live 2).
    servers: [
      'PUPrime-Live', 'PUPrime-Live2', 'PUPrime-Live 2', 'PUPrime-Live 3', 'PUPrime-Live 4',
      'PUPrime-Live 5', 'PUPrime-Live 6', 'PUPrime-Live 7', 'PUPrime-Live 8', 'PUPrime-Demo',
    ],
  },
  {
    id: 'ftmo',
    label: 'FTMO',
    servers: ['FTMO-Server', 'FTMO-Server2', 'FTMO-Server3', 'FTMO-Server4', 'FTMO-Server5', 'FTMO-Demo', 'FTMO-Demo2'],
  },
  {
    id: 'fundednext',
    label: 'FundedNext',
    servers: ['FundedNext-Server', 'FundedNext-Server 2', 'FundedNext-Server 3'],
  },
  {
    id: 'vtmarkets',
    label: 'VT Markets',
    servers: [
      'VTMarkets-Live', 'VTMarkets-Live 2', 'VTMarkets-Live 3', 'VTMarkets-Live 4',
      'VTMarkets-Live 5', 'VTMarkets-Live 6', 'VTMarkets-Live 7', 'VTMarkets-Live 8', 'VTMarkets-Demo',
    ],
  },
  {
    id: 'thetradingmaster',
    label: 'The Trading Master',
    servers: ['TheTradingMaster-Live'],
  },
  {
    id: 'monaxa',
    label: 'Monaxa',
    // Servidores MT5 Monaxa (variantes de espaçamento incluídas — Live2 e Live 2).
    servers: [
      'Monaxa-Live', 'Monaxa-Live2', 'Monaxa-Live 2', 'Monaxa-Live 3', 'Monaxa-Live 4',
      'Monaxa-Live 5', 'Monaxa-Live 6', 'Monaxa-Live 7', 'Monaxa-Live 8',
      'Monaxa-Server', 'Monaxa-Demo',
    ],
  },
]

const ALLOWED = new Set(
  T2T_BROKERS.flatMap((b) => b.servers.map((s) => s.trim().toLowerCase())),
)

/** O servidor pertence a uma das corretoras permitidas no T2T? */
export function isAllowedT2TServer(server: string | null | undefined): boolean {
  return ALLOWED.has((server ?? '').trim().toLowerCase())
}

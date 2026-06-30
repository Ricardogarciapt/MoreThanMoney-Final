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
]

const ALLOWED = new Set(
  T2T_BROKERS.flatMap((b) => b.servers.map((s) => s.trim().toLowerCase())),
)

/** O servidor pertence a uma das corretoras permitidas no T2T? */
export function isAllowedT2TServer(server: string | null | undefined): boolean {
  return ALLOWED.has((server ?? '').trim().toLowerCase())
}

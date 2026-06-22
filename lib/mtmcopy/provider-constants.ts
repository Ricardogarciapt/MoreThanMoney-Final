/** IDs canónicos MTM Auto — sem dependências (evita ciclos de import). */
export const CANONICAL_PREMIUM_ACCOUNT_ID = 'c17a8c46-7fe7-40cf-acb4-41678d42f9a9'
export const CANONICAL_TRADE_IDEAS_ACCOUNT_ID = 'fbeeafeb-96a9-4133-bc6c-194cc281b6e0'
export const CANONICAL_SENSEI_ACCOUNT_ID = 'a5a1dddd-0099-4d67-98f1-86b65aad5845'
export const CANONICAL_PREMIUM_STRATEGY_ID = '9gsL'
export const CANONICAL_TRADE_IDEAS_STRATEGY_ID = '5IHE'
/** ziC3 estava ligada à demo 108127251 — MetaAPI não permite mover accountId; mADd = 18132 Live */
export const CANONICAL_SENSEI_STRATEGY_ID = 'mADd'

/** Estratégias MTM disponíveis para cópia (UI pública — sem expor IDs técnicos). */
export const MTM_COPY_STRATEGY_CATALOG: Record<
  string,
  { title: string; description: string; publicLabel: string }
> = {
  [CANONICAL_PREMIUM_STRATEGY_ID]: {
    title: 'MTM Auto Premium',
    publicLabel: 'MTM Auto Premium',
    description: 'Ouro (XAUUSD) com uma perna, parciais nas saídas e trailing após TP1.',
  },
  [CANONICAL_TRADE_IDEAS_STRATEGY_ID]: {
    title: 'MTM Auto Trade Ideas',
    publicLabel: 'MTM Auto Trade Ideas',
    description: 'Ideias forex com trailing dinâmico — BE a meio do movimento.',
  },
  [CANONICAL_SENSEI_STRATEGY_ID]: {
    title: 'MTM Auto Sensei',
    publicLabel: 'MTM Auto Sensei',
    description: 'Scanner Sensei com sinais auditados via TradingView e gestão programada.',
  },
}

export function mtmStrategyPublicLabel(strategyId: string | null | undefined): string {
  const id = strategyId?.trim()
  if (!id) return 'Estratégia MTM'
  return MTM_COPY_STRATEGY_CATALOG[id]?.publicLabel ?? 'Estratégia MTM auditada'
}

/** IDs canónicos MTM Auto — sem dependências (evita ciclos de import). */
/** MTM Auto Premium — conta MT5 700160095 (substituiu a c17a8c46 a 2026-08-20, que deixou de
 *  existir na MetaApi). É esta que executa os sinais Premium e que entra nas métricas do sistema. */
export const CANONICAL_PREMIUM_ACCOUNT_ID = '530d2e07-b391-440f-bc6e-f4c2a224057b'
export const CANONICAL_TRADE_IDEAS_ACCOUNT_ID = 'fbeeafeb-96a9-4133-bc6c-194cc281b6e0'
export const CANONICAL_SENSEI_ACCOUNT_ID = 'a5a1dddd-0099-4d67-98f1-86b65aad5845'
/** GoldKiller Scanner — conta MetaApi 181271197 (MetaQuotes) + estratégia CopyFactory SDNb */
export const CANONICAL_GOLDKILLER_ACCOUNT_ID = 'bddad3b8-353f-4a19-badf-f8df8f532678'
/** MTM 20X Booster — conta Monaxa 986912 (booster 20x, 1:50) + estratégia CopyFactory pIrJ */
export const CANONICAL_BOOSTER_ACCOUNT_ID = 'dc588b39-1f0a-47a5-8985-28e6fbc98817'
/** MxsR criada a 2026-08-20 na conta 530d2e07. A 9gsL desapareceu com a conta antiga —
 *  a CopyFactory não deixa mover o accountId de uma estratégia, por isso é sempre uma nova. */
export const CANONICAL_PREMIUM_STRATEGY_ID = 'MxsR'
export const CANONICAL_TRADE_IDEAS_STRATEGY_ID = '5IHE'
/** ziC3 estava ligada à demo 108127251 — MetaAPI não permite mover accountId; mADd = 18132 Live */
export const CANONICAL_SENSEI_STRATEGY_ID = 'mADd'
export const CANONICAL_GOLDKILLER_STRATEGY_ID = 'SDNb'
export const CANONICAL_BOOSTER_STRATEGY_ID = 'pIrJ'
/** Gold Did — conta PU Prime do Alcy (4dacaf5a) executa os sinais Premium com gestão própria
 *  (BE aos +5.0 sem trailing, alvo TP2). Estratégia CopyFactory e68I. */
export const CANONICAL_GOLDDID_ACCOUNT_ID = '4dacaf5a-2ea0-4236-b630-9acd2da446d1'
export const CANONICAL_GOLDDID_STRATEGY_ID = 'e68I'
/** Copy Trader Ricardo Garcia — conta intermédia PU Prime (0f38257a) que copia o Premium
 *  (MxsR) e revende como estratégia própria su0a para os slaves do Ricardo Garcia. */
export const CANONICAL_COPYTRADER_RG_ACCOUNT_ID = '0f38257a-ba12-4f6c-b20c-9139693b3674'
export const CANONICAL_COPYTRADER_RG_STRATEGY_ID = 'su0a'

/** Gold Did — conta Alcy 700161536 (PU Prime demo) alimentada pelo canal GOLD DID. */
export const CANONICAL_GOLDDID_SOURCE_ACCOUNT_ID = 'ac351c88-f206-439c-9999-97636e8f9791'
export const CANONICAL_GOLDDID_SOURCE_STRATEGY_ID = 'GdId'
/** Golden Moves — conta Alcy 700147340 (PU Prime demo) alimentada pelo canal GOLDEN MOVES. */
export const CANONICAL_GOLDENMOVES_ACCOUNT_ID = '58aeb8d6-3b4c-4178-bfa6-3e0c8af24ff0'
export const CANONICAL_GOLDENMOVES_STRATEGY_ID = 'GdMv'

/**
 * CONTA MÍNIMA para copiar, em USD.
 *
 * Não é uma regra comercial — é aritmética do broker. O lote mínimo é 0,01 e, em ouro, 0,01
 * vale 0,10 USD por pip: um stop de 50 pips arrisca 5 USD. Para 5 USD serem 1% do saldo, o
 * saldo tem de ser 500. Abaixo disso não existe lote que respeite a percentagem — abre-se no
 * mínimo e arrisca-se mais do que o cliente escolheu.
 */
export const MTM_COPY_MIN_ACCOUNT_USD = 500

/** Estratégias MTM disponíveis para cópia (UI pública — sem expor IDs técnicos). */
export const MTM_COPY_STRATEGY_CATALOG: Record<
  string,
  { title: string; description: string; publicLabel: string }
> = {
  [CANONICAL_PREMIUM_STRATEGY_ID]: {
    title: 'MTM - Auto Premium',
    publicLabel: 'MTM - Auto Premium',
    description:
      'Ouro (XAUUSD). Uma posição de cada vez, parciais nos alvos e stop movido para a entrada ' +
      'depois do primeiro. As trades chegam do canal Premium e a tua conta copia-as sozinha. ' +
      'Conta mínima 500 USD (a 1% por trade) — abaixo disso o lote mínimo do broker já arrisca ' +
      'mais do que a percentagem escolhida. Com 1000 USD operas a 0,5%, que é o padrão da casa.',
  },
  [CANONICAL_TRADE_IDEAS_STRATEGY_ID]: {
    title: 'MTM Auto - Forex',
    publicLabel: 'MTM Auto - Forex',
    description: 'Sinais forex com trailing dinâmico — BE a meio do movimento.',
  },
  [CANONICAL_SENSEI_STRATEGY_ID]: {
    title: 'MTM Auto Sensei',
    publicLabel: 'MTM Auto Sensei',
    description:
      'Scanner Sensei (ouro e BTC) — entradas validadas, parciais nos alvos e trailing após o primeiro. ' +
      'Só executa nas contas que a subscreverem e a configurarem.',
  },
  [CANONICAL_GOLDDID_SOURCE_STRATEGY_ID]: {
    title: 'MTM Auto Gold Did',
    publicLabel: 'MTM Auto Gold Did',
    description:
      'Ouro, pelo trader do canal Gold Did. O stop e os alvos são os que vêm na mensagem — não ' +
      'inventamos gestão por cima. Cada sinal entra a 1% do teu saldo e a gestão (parciais, ' +
      'break-even, fecho) segue o que o trader anuncia, acompanhada pelo motor de preço. ' +
      'Conta mínima 500 USD.',
  },
  [CANONICAL_GOLDENMOVES_STRATEGY_ID]: {
    title: 'MTM Auto Golden Moves',
    publicLabel: 'MTM Auto Golden Moves',
    description:
      'Ouro e alguns pares, pelo trader do canal Golden Moves. Stop e alvos da própria mensagem, ' +
      '1% do teu saldo por trade, gestão acompanhada pelo motor de preço. Opera mais vezes por ' +
      'dia do que o Premium — conta com mais movimento na conta. Conta mínima 500 USD.',
  },
  [CANONICAL_GOLDKILLER_STRATEGY_ID]: {
    title: 'MTM Auto Goldkiller',
    publicLabel: 'MTM Auto Goldkiller',
    description: 'Scanner GoldKiller (XAUUSD) — 0.5% de risco por trade e trailing conforme o scanner.',
  },
  [CANONICAL_BOOSTER_STRATEGY_ID]: {
    title: 'MTM - 20X Booster',
    publicLabel: 'MTM - 20X Booster',
    description:
      '⚠️ ALTO RISCO — conta booster 20x (alavancagem 1:50). Espelha o Premium com lotes ' +
      'reduzidos e aceita Tap to Trade. Capital maioritariamente BÓNUS (não-levantável) — ' +
      'usa lote fixo pequeno (0.01) e só com capital que aceitas perder. Não indicado para ' +
      'contas conservadoras.',
  },
  [CANONICAL_GOLDDID_STRATEGY_ID]: {
    title: 'Gold Did',
    publicLabel: 'Gold Did',
    description: 'Ouro (XAUUSD) a seguir os sinais Premium com gestão simples: break-even aos 50 pips (sem trailing) e alvo no TP2.',
  },
  [CANONICAL_COPYTRADER_RG_STRATEGY_ID]: {
    title: 'Copy Trader Ricardo Garcia',
    publicLabel: 'Copy Trader Ricardo Garcia',
    description: 'Relay do MTM Auto Premium via conta intermédia — replica os sinais Premium para as contas do Ricardo Garcia a lote fixo.',
  },
}

export function mtmStrategyPublicLabel(strategyId: string | null | undefined): string {
  const id = strategyId?.trim()
  if (!id) return 'Estratégia MTM'
  return MTM_COPY_STRATEGY_CATALOG[id]?.publicLabel ?? 'Estratégia MTM auditada'
}

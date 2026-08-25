/** IDs canónicos MTM Auto — sem dependências (evita ciclos de import). */
/** MTM Auto Premium — conta MT5 700160095 (substituiu a c17a8c46 a 2026-08-20, que deixou de
 *  existir na MetaApi). É esta que executa os sinais Premium e que entra nas métricas do sistema. */
export const CANONICAL_PREMIUM_ACCOUNT_ID = '530d2e07-b391-440f-bc6e-f4c2a224057b'
export const CANONICAL_TRADE_IDEAS_ACCOUNT_ID = 'fbeeafeb-96a9-4133-bc6c-194cc281b6e0'
export const CANONICAL_SENSEI_ACCOUNT_ID = 'a5a1dddd-0099-4d67-98f1-86b65aad5845'

/**
 * Conta PRÓPRIA do Sensei Scanner — «Copy PU Gold Did», login 34744071, PU Prime Live 6.
 *
 * O Sensei não tinha conta: os sinais dele caíam no destino do Trade Ideas, que aponta para a
 * conta MESTRE do Premium. A 2026-08-25 a ideia #14509 (XAUUSD) abriu lá com o comentário
 * `MTM-TI` e a CopyFactory replicou-a para os 8 subscritores do Premium — um sinal do Sensei a
 * chegar às contas de quem assinou o Premium. Daqui em diante o Sensei abre só aqui.
 *
 * `CANONICAL_SENSEI_ACCOUNT_ID` acima fica como está: é a conta antiga (já apagada na MetaApi) e
 * ainda serve de default a outros sítios (PrimeVerse, preço de referência) — mexer nela mudava
 * coisas que nada têm a ver com isto.
 */
export const SENSEI_PROVIDER_ACCOUNT_ID = '79225bd0-b556-4dbe-8c5b-d2a2969b997e'
/** GoldKiller Scanner — conta MetaApi 181271197 (MetaQuotes) + estratégia CopyFactory SDNb */
export const CANONICAL_GOLDKILLER_ACCOUNT_ID = 'bddad3b8-353f-4a19-badf-f8df8f532678'
/** MTM 20X Booster — conta Monaxa 986912 (booster 20x, 1:50) + estratégia CopyFactory pIrJ */
export const CANONICAL_BOOSTER_ACCOUNT_ID = 'dc588b39-1f0a-47a5-8985-28e6fbc98817'
/** MxsR criada a 2026-08-20 na conta 530d2e07. A 9gsL desapareceu com a conta antiga —
 *  a CopyFactory não deixa mover o accountId de uma estratégia, por isso é sempre uma nova. */
export const CANONICAL_PREMIUM_STRATEGY_ID = 'MxsR'
export const CANONICAL_TRADE_IDEAS_STRATEGY_ID = '5IHE'
/** ziC3 estava ligada à demo 108127251 — MetaAPI não permite mover accountId; mADd = 18132 Live */
/**
 * Estratégia CopyFactory do Sensei. Passou de 'mADd' para '0o5o' a 2026-08-25: a `mADd` vivia na
 * conta a5a1dddd, apagada na MetaApi, por isso os clientes que a "copiavam" não copiavam nada.
 * A nova está na conta própria do Sensei (login 34744071).
 */
export const CANONICAL_SENSEI_STRATEGY_ID = '0o5o'
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
    description:
      'Pares de forex, intraday e swing. Entra com o stop e os alvos do sinal, move o stop para ' +
      'a entrada a meio do caminho e deixa o trailing acompanhar o resto. Menos trades por dia ' +
      'do que o ouro e movimentos mais lentos. Conta mínima 500 USD (a 1% por trade).',
  },
  [CANONICAL_SENSEI_STRATEGY_ID]: {
    title: 'MTM Auto Sensei',
    publicLabel: 'MTM Auto Sensei',
    description:
      'Ouro e Bitcoin, por scanner automático. Só entra nas ideias que o scanner confirma — a ' +
      'maioria dos alertas é descartada antes de chegar à tua conta. Parciais nos alvos e ' +
      'trailing depois do primeiro. Como opera BTC, corre também fora do horário de mercado do ' +
      'ouro. Conta mínima 500 USD (a 1% por trade).',
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
    description:
      'Ouro, por scanner próprio, com 0,5% de risco por trade e trailing conforme o scanner ' +
      'dita. É a mais conservadora das automáticas: arrisca metade das outras em cada entrada. ' +
      'Conta mínima 1000 USD (a 0,5% por trade).',
  },
  [CANONICAL_BOOSTER_STRATEGY_ID]: {
    title: 'MTM - 20X Booster',
    publicLabel: 'MTM - 20X Booster',
    description:
      '⚠️ ALTO RISCO. Conta booster com alavancagem 1:50, em que a maior parte do capital é ' +
      'BÓNUS e não se levanta. Espelha o Premium a lote fixo de 0,01 e aceita Tap to Trade. ' +
      'Serve para multiplicar um saldo pequeno sabendo que o pode perder todo — não é uma ' +
      'estratégia de acumulação. Só com dinheiro que aceitas perder.',
  },
  [CANONICAL_GOLDDID_STRATEGY_ID]: {
    title: 'Gold Did',
    publicLabel: 'Gold Did',
    description:
      'Ouro, a seguir os mesmos sinais do Premium mas com gestão mais simples: stop para a ' +
      'entrada aos 50 pips, sem trailing, e sai no segundo alvo. Fecha mais cedo do que o ' +
      'Premium — menos por trade, menos tempo exposta. Conta mínima 500 USD.',
  },
  [CANONICAL_COPYTRADER_RG_STRATEGY_ID]: {
    title: 'Copy Trader Ricardo Garcia',
    publicLabel: 'Copy Trader Ricardo Garcia',
    description:
      'Conta interna que repete o MTM Auto Premium a lote fixo para as contas do Ricardo Garcia. ' +
      'Não é uma estratégia para subscrever — existe para encadear a cópia, e o desempenho que ' +
      'mostra é o do Premium.',
  },
}

export function mtmStrategyPublicLabel(strategyId: string | null | undefined): string {
  const id = strategyId?.trim()
  if (!id) return 'Estratégia MTM'
  return MTM_COPY_STRATEGY_CATALOG[id]?.publicLabel ?? 'Estratégia MTM auditada'
}

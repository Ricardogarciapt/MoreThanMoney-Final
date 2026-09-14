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
/**
 * ⚠️ REFORMADO a 2026-09-04, e por isso VAZIO.
 *
 * A conta que estava aqui (MT5 34744071) foi entregue a outra estratégia (entretanto removida,
 * 2026-09-14). Duas estratégias na mesma conta partilham a porta de saída: quem subscrevesse uma
 * levava as trades da outra.
 *
 * O Sensei volta quando a conta MT5 {@link SENSEI_MT5_LOGIN_NOVO} estiver ligada — ligar uma
 * conta exige a password dela, que vai do Ricardo directamente para o sistema. Até lá o id fica
 * vazio, e vazio aqui quer dizer **não executa**: a rota sobrevive (continua a alimentar chat e
 * Tap to Trade, que não precisam de conta mestre) mas `routeMatchesSignal` recusa qualquer rota
 * sem conta, e `senseiPronto()` fecha o caminho do webhook.
 *
 * Não voltar a escrever um id aqui à mão sem confirmar que essa conta não é já de outra
 * estratégia — foi assim que se chegou a esta confusão.
 */
export const SENSEI_PROVIDER_ACCOUNT_ID =
  process.env.METAAPI_PROVIDER_SENSEI_ACCOUNT_ID?.trim() || ''

/** A conta que o Sensei vai receber: MT5 35044320, «MTM Auto Sensei». Ainda por ligar. */
export const SENSEI_MT5_LOGIN_NOVO = '35044320'

/** O Sensei tem conta mestre para executar? */
export function senseiPronto(): boolean {
  return SENSEI_PROVIDER_ACCOUNT_ID.length > 0
}
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
export const CANONICAL_SENSEI_STRATEGY_ID = 'Oca7'
export const CANONICAL_GOLDKILLER_STRATEGY_ID = 'SDNb'
export const CANONICAL_BOOSTER_STRATEGY_ID = 'pIrJ'
/** Copy Trader Ricardo Garcia — conta intermédia PU Prime (0f38257a) que copia o Premium
 *  (MxsR) e revende como estratégia própria su0a para os slaves do Ricardo Garcia. */
export const CANONICAL_COPYTRADER_RG_ACCOUNT_ID = '0f38257a-ba12-4f6c-b20c-9139693b3674'
export const CANONICAL_COPYTRADER_RG_STRATEGY_ID = 'su0a'

/**
 * Aurum Flow — conta PU Prime LIVE 34744077 (a4ea0c45), com papel de PROVIDER na CopyFactory,
 * a publicar a estratégia vT8w.
 *
 * Estava apontado à conta demo do Alcy (58aeb8d6 / GdMv), e isso estava errado por duas razões.
 * A primeira é que a demo do Alcy tem o mesmo login MT5 (700147340) que uma segunda conta
 * MetaApi SUBSCRITA ao Premium — a mesma conta de corretora registada duas vezes, uma a receber
 * cópias do Premium e a outra a republicar tudo o que lá acontecesse como Aurum Flow. A
 * segunda é que a GdMv já não existe: quem a copiasse não copiava nada.
 *
 * A fonte a sério é a conta que executa mesmo os sinais do canal (alimentada pelo PrimeSync), e
 * é essa que publica a vT8w.
 */
export const CANONICAL_AURUMFLOW_ACCOUNT_ID = 'a4ea0c45-3dd1-4b55-bd2a-7f44d8d6884b'
export const CANONICAL_AURUMFLOW_STRATEGY_ID = 'vT8w'

/**
 * As contas onde o MOTOR EM TEMPO REAL corre — e só estas.
 *
 * O monitor de preço lia as posições de TODAS as contas com trades abertas, cliente a cliente.
 * Com dezenas de contas isso são dezenas de leituras à MetaApi por minuto para gerir posições
 * que, na esmagadora maioria, são cópias: quando o mestre faz o parcial, move o stop para a
 * entrada ou arrasta o trailing, a CopyFactory replica essas alterações para quem o copia. Gerir
 * a cópia outra vez, uma conta de cada vez, é pagar duas vezes pelo mesmo resultado.
 *
 * Daqui em diante gere-se a ORIGEM. São estas três — as únicas que ainda existem na MetaApi;
 * todas as outras contas provedoras antigas foram apagadas.
 *
 * ⚠️ Quem executa por Telegram DIRETO (copy_method='telegram_group') não recebe estas alterações
 * pela CopyFactory: abre a posição na própria conta e depende do motor para os parciais, o BE e
 * o trailing. Para esses, ou se passa a cópia por estratégia, ou o motor tem de continuar a
 * visitá-los — ver `motorCorreNaConta`.
 */
export const CONTAS_MOTOR_TEMPO_REAL: string[] = [
  CANONICAL_PREMIUM_ACCOUNT_ID,      // MTM Auto Premium  · MT5 700160095 · MxsR
  // O Sensei está sem conta (reformado da 34744071). Entra sozinho quando a nova existir.
  ...(SENSEI_PROVIDER_ACCOUNT_ID ? [SENSEI_PROVIDER_ACCOUNT_ID] : []), // MTM Auto Sensei · Oca7
  CANONICAL_AURUMFLOW_ACCOUNT_ID,    // MTM Auto Aurum Flow · MT5 34744077 · vT8w
  // O layering da Aurum Flow depende do motor: é ele que põe a entrada de mercado em
  // break-even quando a limite enche, e que arrasta o runner. Sem esta conta na lista a estratégia
  // abria as duas camadas e ficava a olhar para elas.
  // A lista tem de ficar sem strings vazias: um '' aqui faria `ehContaDeMotor('')` dizer que sim
  // a uma conta sem id.
]

export function ehContaDeMotor(accountId: string | null | undefined): boolean {
  return Boolean(accountId) && CONTAS_MOTOR_TEMPO_REAL.includes(String(accountId))
}

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
  [CANONICAL_AURUMFLOW_STRATEGY_ID]: {
    title: 'MTM Auto Aurum Flow',
    publicLabel: 'MTM Auto Aurum Flow',
    description:
      'Ouro e alguns pares, com gestão feita na própria fonte — o trailing vem de lá, não é '
      + 'aplicado por cima. Stop e alvos da própria mensagem, ' +
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

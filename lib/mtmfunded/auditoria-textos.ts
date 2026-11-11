/**
 * Textos da página pública de auditoria em PORTUGUÊS (de Portugal) e INGLÊS — traduzidos à mão,
 * não por máquina. Os nomes de estratégias e produtos (MTM Auto Premium II, MTM Funded…) não se
 * traduzem. Os números seguem a língua: 1 234,56 em PT, 1,234.56 em EN.
 */

export type Lingua = 'pt' | 'en'

export const LOCALE: Record<Lingua, string> = { pt: 'pt-PT', en: 'en-GB' }

export function textosAuditoria(l: Lingua) {
  return l === 'en' ? EN : PT
}

const PT = {
  tituloPagina: 'Auditoria de conta · MoreThanMoney',
  descricaoPagina: 'Histórico verificável de uma conta: operações fechadas, pips, drawdown e, nas contas MTM Funded, ligação aos sinais, R e risco de ruína.',
  auditoria: 'Auditoria de conta',
  lingua: 'Língua',
  contaReal: 'conta real', contaDemo: 'conta demo',
  conta: (p: string) => `Conta ${p}`,
  contaFunded: 'Conta MTM Funded',
  indisponivel: {
    sem_historico: 'Esta corretora ainda não tem histórico para auditoria.',
    erro_leitura: 'Não foi possível ler a conta na corretora neste momento. Tenta daqui a uns minutos.',
  } as Record<string, string>,
  cabecalhoReal: (o: { demo: boolean; servidor: string | null; plataforma: string }) =>
    [`Conta ${o.demo ? 'demo' : 'real'} na corretora${o.servidor ? ` (${o.servidor})` : ''}, lida pela ligação ${o.plataforma} do dono.`],
  saldoAgora: (v: string) => `Saldo agora ${v} USD.`,
  historicoReal: (de: string, ate: string, n: number, dias: number, abertas: number) =>
    `Histórico de ${de} a ${ate} (último ano) · ${n} operações fechadas em ${dias} dias · ${abertas} aberta(s) agora.`,
  lidoCorretora: (em: string) => `Lido na corretora em ${em} UTC.`,
  simulada: 'simulada',
  cabecalhoFunded: (o: { saldo: string; ciclo: string | null; estrategia: string | null }) => ({
    antes: 'Conta ', depoisSimulada: ` no motor MTM Funded, saldo ${o.ciclo ? `no início do ciclo actual (${o.ciclo})` : 'inicial'} ${o.saldo} USD`,
    aSeguir: o.estrategia ? ', a seguir ' : '',
  }),
  historicoFunded: (de: string, ate: string, n: number, dias: number, abertas: number) =>
    `Histórico de ${de} a ${ate} · ${n} operações fechadas em ${dias} dias · ${abertas} aberta(s) agora.`,
  lidoBase: (em: string) => `Dados lidos da base de produção em ${em} UTC.`,
  indicadores: 'Indicadores principais',
  k: {
    acerto: 'Taxa de acerto', porResultado: 'por resultado', porPips: 'por pips',
    pips: 'Pips (forex e metais)', ptsIndices: (v: string) => `${v} pts em índices/cripto`,
    retorno: 'Retorno ponderado no tempo', depositosNaoContam: 'depósitos e levantamentos não contam', ajustesNaoContam: 'ajustes de capital não contam',
    ddMax: 'Drawdown máx.', noIndice: 'no índice ponderado', pctNoIndice: (v: string) => `${v} % no índice`,
    resultadoOps: 'Resultado das operações', comSwap: 'com swap e comissões',
    seguidas: 'Seguidas (ganho / perda)',
    resultadoR: 'Resultado em R', comRisco: (n: number) => `${n} trades com risco registado`,
    expectativa: 'Expectativa por trade', fatorLucro: 'Fator de lucro (R)', mediaGP: 'Ganho médio / perda média',
    ligadas: 'Ligadas a um sinal', de: (a: number, b: number) => `${a} de ${b}`,
    latencia: 'Latência sinal → ordem', latenciaNota: 'mediana, ordens a mercado',
    desvio: 'Desvio da entrada', desvioNota: 'mediana, em pips/pts vs. sinal',
  },
  evolucao: 'Evolução da conta',
  srCurvaR: (r: string, n: number, de: string, ate: string, max: string, min: string, ddR: string, ddPct: string) =>
    `Resultado acumulado de ${r} R em ${n} operações, de ${de} a ${ate}; máximo ${max} R, mínimo ${min} R, drawdown máximo ${ddR} R e ${ddPct} % no índice.`,
  srCurvaPips: (n: number, pips: string) => `${n} operações; ${pips} pips acumulados.`,
  ruina: 'Risco de ruína',
  ruinaTexto: 'Probabilidade de perder 30 % do capital em 250 trades, arriscando uma fracção fixa do saldo por trade. Reamostragem (4 000 simulações, semente fixa) das próprias trades desta conta em R.',
  amostraCurta: (n: number) => ` Amostra curta (${n} trades): ler como indicação, não como medida.`,
  riscoPorTrade: 'Risco por trade', probRuina: 'Prob. de ruína', amostraInsuf: 'amostra insuficiente', ruinaCaption: 'Risco de ruína por risco por trade',
  semR: 'Sem R nem risco de ruína',
  semRTexto: (usd: boolean) =>
    `A corretora não guarda o stop com que cada operação abriu, por isso esta conta não tem resultado em R nem risco de ruína (que se calcula a partir do R). Em vez de o estimar, a página mostra só o que a corretora regista: ${usd ? 'preços, pips e dinheiro' : 'preços e pips (a TradeLocker não dá o lucro por ordem)'}.`,
  porMes: 'Por mês', mes: 'Mês', trades: 'Trades', retornoCol: 'Retorno', mensalCaption: 'Resultado mensal',
  porEstrategia: 'Por estratégia (origem do sinal)', porSimbolo: 'Por símbolo', acertoCol: 'Acerto',
  manual: 'Manual', sinal: 'sinal', pendente: 'pendente',
  operacoes: (n: number) => `Operações fechadas (${n})`,
  operacoesNota: (real: boolean) => `Mais recentes primeiro. Horas em UTC. Parciais somadas na operação-mãe.${real ? '' : ' «Sinal» é a hora a que o sinal chegou ao motor.'}`,
  operacoesCaption: 'Lista de operações fechadas',
  col: { fecho: 'Fecho', simbolo: 'Símbolo', dir: 'Dir.', origem: 'Origem / estratégia', sinal: 'Sinal', latencia: 'Latência', lote: 'Lote', pips: 'Pips/pts', r: 'R', usd: 'USD' },
  compra: 'Compra', venda: 'Venda',
  comoSeMede: 'Como se mede',
  medeReal: (o: { tl: boolean; usd: boolean; ajustes: number; total: string }) => [
    `Origem: ${o.tl ? 'histórico de ordens executadas da TradeLocker; cada ordem que fecha (parte de) uma posição é uma saída.' : 'histórico de negócios (deals) do MetaTrader; cada saída é uma parte da operação, a comissão da entrada conta na operação.'} Janela: último ano.`,
    'Pips: 0,0001 no forex, 0,01 nos pares JPY, 0,1 no ouro, 0,01 na prata; índices e cripto em pontos. Média ponderada pelo lote de cada parte.',
    ...(o.usd ? [`Retorno ponderado no tempo: cada operação conta sobre o saldo que havia nesse momento. ${o.ajustes ? `Esta conta teve ${o.ajustes} depósito(s)/levantamento(s) na janela (${o.total} USD), que não contam como ganho nem como drawdown.` : 'Sem depósitos nem levantamentos na janela.'}`] : []),
    'Nada é editado à mão: a página relê a conta na corretora a cada poucos minutos. A MoreThanMoney não custodia nem executa nesta conta por ninguém — é a conta do próprio dono.',
  ],
  medeFunded: (o: { ajustes: number; total: string }) => [
    'R = resultado líquido da operação (com parciais, swap e comissão) a dividir pelo risco inicial registado na abertura (distância ao stop × lote). Operações sem risco registado não entram no R.',
    'Pips: 0,0001 no forex, 0,01 nos pares JPY, 0,1 no ouro, 0,01 na prata; índices e cripto em pontos. Média ponderada pelo lote de cada parte.',
    `Retorno ponderado no tempo: cada operação conta sobre o saldo que havia nesse momento. ${o.ajustes ? `Esta conta teve ${o.ajustes} ajuste(s) de capital (${o.total} USD), que não contam como ganho nem como drawdown.` : 'Esta conta não teve ajustes de capital.'}`,
    'Ligação ao sinal: cada ordem aberta por um sinal fica registada no motor com a estratégia, a hora e o preço do sinal — daí a latência e o desvio da entrada. Sinais com entrada por ordem pendente (limite) só abrem quando o preço chega: aí não se conta latência.',
    'Operações de teste interno marcadas na base são excluídas. Nada é editado à mão nesta página: é lida da base de produção.',
  ],
  rodapeReal: 'Conta numa corretora escolhida pelo dono; a MoreThanMoney só lê o histórico.',
  rodapeFunded: 'Conta simulada. MTM Funded não é uma corretora nem uma prop firm e não executa ordens reais por clientes.',
  rodapeComum: 'Conteúdo educativo, não constitui consultoria financeira. Resultados passados, simulados ou não, não garantem resultados futuros; o trading envolve risco de perda de capital.',
  graficos: {
    abas: { crescimento: 'Crescimento', r: 'Resultado (R)', saldo: 'Saldo', dd: 'Drawdown', pips: 'Pips', dia: 'R por dia' },
    grafico: 'Gráfico', periodo: 'Período', periodos: { '1s': '1S', '1m': '1M', '3m': '3M', tudo: 'Tudo' },
    ajuda: 'Arrasta para os lados para percorrer o histórico; roda do rato ou pinça para zoom.',
    falhou: 'Não foi possível carregar o gráfico interactivo.',
  },
}

const EN: typeof PT = {
  tituloPagina: 'Account audit · MoreThanMoney',
  descricaoPagina: 'Verifiable track record of an account: closed trades, pips, drawdown and, on MTM Funded accounts, links to signals, R and risk of ruin.',
  auditoria: 'Account audit',
  lingua: 'Language',
  contaReal: 'live account', contaDemo: 'demo account',
  conta: (p: string) => `${p} account`,
  contaFunded: 'MTM Funded account',
  indisponivel: {
    sem_historico: 'This broker does not provide trade history for audits yet.',
    erro_leitura: 'The account could not be read from the broker right now. Please try again in a few minutes.',
  },
  cabecalhoReal: (o) =>
    [`${o.demo ? 'Demo' : 'Live'} brokerage account${o.servidor ? ` (${o.servidor})` : ''}, read through the owner's ${o.plataforma} connection.`],
  saldoAgora: (v) => `Current balance ${v} USD.`,
  historicoReal: (de, ate, n, dias, abertas) =>
    `History from ${de} to ${ate} (last 12 months) · ${n} closed trades over ${dias} days · ${abertas} open now.`,
  lidoCorretora: (em) => `Read from the broker at ${em} UTC.`,
  simulada: 'simulated',
  cabecalhoFunded: (o) => ({
    antes: '', depoisSimulada: ` account on the MTM Funded engine, ${o.ciclo ? `balance at the start of the current cycle (${o.ciclo})` : 'starting balance'} ${o.saldo} USD`,
    aSeguir: o.estrategia ? ', following ' : '',
  }),
  historicoFunded: (de, ate, n, dias, abertas) =>
    `History from ${de} to ${ate} · ${n} closed trades over ${dias} days · ${abertas} open now.`,
  lidoBase: (em) => `Data read from the production database at ${em} UTC.`,
  indicadores: 'Key metrics',
  k: {
    acerto: 'Win rate', porResultado: 'by result', porPips: 'by pips',
    pips: 'Pips (forex and metals)', ptsIndices: (v) => `${v} pts on indices/crypto`,
    retorno: 'Time-weighted return', depositosNaoContam: 'deposits and withdrawals excluded', ajustesNaoContam: 'capital adjustments excluded',
    ddMax: 'Max drawdown', noIndice: 'on the weighted index', pctNoIndice: (v) => `${v} % on the index`,
    resultadoOps: 'Trading result', comSwap: 'including swap and commissions',
    seguidas: 'Consecutive (wins / losses)',
    resultadoR: 'Result in R', comRisco: (n) => `${n} trades with recorded risk`,
    expectativa: 'Expectancy per trade', fatorLucro: 'Profit factor (R)', mediaGP: 'Average win / average loss',
    ligadas: 'Linked to a signal', de: (a, b) => `${a} of ${b}`,
    latencia: 'Signal → order latency', latenciaNota: 'median, market orders',
    desvio: 'Entry slippage', desvioNota: 'median, in pips/pts vs. signal',
  },
  evolucao: 'Account growth',
  srCurvaR: (r, n, de, ate, max, min, ddR, ddPct) =>
    `Cumulative result of ${r} R over ${n} trades, from ${de} to ${ate}; high ${max} R, low ${min} R, max drawdown ${ddR} R and ${ddPct} % on the index.`,
  srCurvaPips: (n, pips) => `${n} trades; ${pips} cumulative pips.`,
  ruina: 'Risk of ruin',
  ruinaTexto: 'Probability of losing 30 % of capital within 250 trades, risking a fixed fraction of the balance per trade. Bootstrap resampling (4,000 simulations, fixed seed) of this account’s own trades in R.',
  amostraCurta: (n) => ` Small sample (${n} trades): read as an indication, not a measurement.`,
  riscoPorTrade: 'Risk per trade', probRuina: 'Prob. of ruin', amostraInsuf: 'insufficient sample', ruinaCaption: 'Risk of ruin by risk per trade',
  semR: 'No R or risk of ruin',
  semRTexto: (usd) =>
    `The broker does not store the stop each trade was opened with, so this account has no result in R and no risk of ruin (which is derived from R). Rather than estimate it, this page shows only what the broker records: ${usd ? 'prices, pips and money' : 'prices and pips (TradeLocker does not report profit per order)'}.`,
  porMes: 'By month', mes: 'Month', trades: 'Trades', retornoCol: 'Return', mensalCaption: 'Monthly results',
  porEstrategia: 'By strategy (signal source)', porSimbolo: 'By symbol', acertoCol: 'Win rate',
  manual: 'Manual', sinal: 'signal', pendente: 'pending',
  operacoes: (n) => `Closed trades (${n})`,
  operacoesNota: (real) => `Most recent first. Times in UTC. Partial closes are added to the parent trade.${real ? '' : ' “Signal” is the time the signal reached the engine.'}`,
  operacoesCaption: 'List of closed trades',
  col: { fecho: 'Closed', simbolo: 'Symbol', dir: 'Side', origem: 'Source / strategy', sinal: 'Signal', latencia: 'Latency', lote: 'Lots', pips: 'Pips/pts', r: 'R', usd: 'USD' },
  compra: 'Buy', venda: 'Sell',
  comoSeMede: 'Methodology',
  medeReal: (o) => [
    `Source: ${o.tl ? 'TradeLocker filled-order history; each order that closes (part of) a position counts as an exit.' : 'MetaTrader deal history; each exit is one part of the trade, and the entry commission is included in the trade.'} Window: last 12 months.`,
    'Pips: 0.0001 on forex, 0.01 on JPY pairs, 0.1 on gold, 0.01 on silver; indices and crypto in points. Lot-weighted average across the parts of each trade.',
    ...(o.usd ? [`Time-weighted return: each trade is measured against the balance at that moment. ${o.ajustes ? `This account had ${o.ajustes} deposit(s)/withdrawal(s) in the window (${o.total} USD), which count neither as profit nor as drawdown.` : 'No deposits or withdrawals in the window.'}`] : []),
    'Nothing is edited by hand: the page re-reads the account from the broker every few minutes. MoreThanMoney does not hold funds or trade on this account for anyone — it is the owner’s own account.',
  ],
  medeFunded: (o) => [
    'R = net result of the trade (including partial closes, swap and commission) divided by the initial risk recorded at entry (distance to stop × lots). Trades without recorded risk are left out of R.',
    'Pips: 0.0001 on forex, 0.01 on JPY pairs, 0.1 on gold, 0.01 on silver; indices and crypto in points. Lot-weighted average across the parts of each trade.',
    `Time-weighted return: each trade is measured against the balance at that moment. ${o.ajustes ? `This account had ${o.ajustes} capital adjustment(s) (${o.total} USD), which count neither as profit nor as drawdown.` : 'This account had no capital adjustments.'}`,
    'Signal link: every order opened by a signal is recorded by the engine with the strategy, time and price of the signal — hence the latency and entry slippage. Signals entered as pending (limit) orders only open when price gets there, so no latency is counted for them.',
    'Internal test trades flagged in the database are excluded. Nothing on this page is edited by hand: it is read from the production database.',
  ],
  rodapeReal: 'An account at a broker chosen by its owner; MoreThanMoney only reads the history.',
  rodapeFunded: 'Simulated account. MTM Funded is not a broker or a prop firm and does not execute real orders for clients.',
  rodapeComum: 'Educational content, not financial advice. Past results, simulated or not, do not guarantee future results; trading involves the risk of losing capital.',
  graficos: {
    abas: { crescimento: 'Growth', r: 'Result (R)', saldo: 'Balance', dd: 'Drawdown', pips: 'Pips', dia: 'R per day' },
    grafico: 'Chart', periodo: 'Period', periodos: { '1s': '1W', '1m': '1M', '3m': '3M', tudo: 'All' },
    ajuda: 'Drag sideways to scroll through the history; use the mouse wheel or pinch to zoom.',
    falhou: 'The interactive chart could not be loaded.',
  },
}

export type TextosGraficos = typeof PT.graficos

/**
 * A MENSAGEM DIÁRIA DAS CONTAS — o que entra, o que fica de fora e como se lê.
 *
 * O dono pediu isto por palavras dele (24/09): «esta mensagem apresentará apenas as contas
 * pessoais de 1K e reais do ricardo (reais da casa) […] apresenta as contas dos clientes também
 * que estão em ambiente real». O que este teste fixa é exactamente esse critério, para que
 * ninguém volte a pôr as mestres e os desafios na mensagem sem dar por isso.
 *
 *   npx tsx lib/__tests__/relatorio-dinheiro-real.check.ts
 */
import assert from 'node:assert/strict'
import {
  ehServidorDemo,
  linhaDeContaMtmFunded,
  seccoesDoDinheiroReal,
  reportSummary,
  type ContaMtmFunded,
  type DailyReport,
  type LinhaDinheiroReal,
} from '../accounts-daily-report'

const HOJE = '2026-09-24'

// ── Ambiente: o nome do servidor é o único sinal que há em `mtmcopy_connections` ──
assert.equal(ehServidorDemo('VTMarkets-Demo'), true)
assert.equal(ehServidorDemo('PUPrime-Live 6'), false)
assert.equal(ehServidorDemo('VTMarkets-Live 6'), false)
// Uma prop firm é ambiente REAL: o capital é de terceiros, as ordens não.
assert.equal(ehServidorDemo('FXIFY-Server'), false)
assert.equal(ehServidorDemo(null), false)

// ── Quem entra e quem não entra ──
const base: ContaMtmFunded = { mt5_login: '77000001', saldo_inicial: 1000, sim_equity: 1000, sim_ancora_dia: 1000 }

// Mestres, desafios e torneios não são dinheiro de ninguém.
for (const tipo of ['provider', 'desafio', 'torneio']) {
  assert.equal(linhaDeContaMtmFunded({ ...base, tipo }, HOJE), null, `${tipo} não devia entrar`)
}
// Financiada do produto (a que conta 10% e enchia a mensagem com «100 · +0,00»): fora.
assert.equal(linhaDeContaMtmFunded({ ...base, tipo: 'financiada', conta_real_casa: false }, HOJE), null)
// Financiada marcada real da casa: é uma das 1K do dono, entra em «As tuas».
assert.equal(
  linhaDeContaMtmFunded({ ...base, tipo: 'financiada', conta_real_casa: true, etiqueta: 'Sensei' }, HOJE)?.grupo,
  'minhas',
)
// Conta `real` de um cliente: entra em «Clientes — real», com o NOME da pessoa à frente.
const doCliente = linhaDeContaMtmFunded({ ...base, tipo: 'real', conta_real_casa: false, etiqueta: 'Real' }, HOJE, 'Ana Silva')
assert.equal(doCliente?.grupo, 'clientes')
assert.ok(doCliente?.etiqueta.startsWith('Ana Silva'), 'o nome do cliente manda sobre a etiqueta genérica')
// Na conta da casa é ao contrário: a etiqueta diz mais do que o nome do dono.
const daCasa = linhaDeContaMtmFunded({ ...base, tipo: 'real', conta_real_casa: true, etiqueta: 'Conta Pessoal' }, HOJE, 'Ricardo')
assert.ok(daCasa?.etiqueta.startsWith('Conta Pessoal'))

// ── O P&L do dia: do motor quando há, da âncora quando não há, nunca um zero inventado ──
const comMotor = linhaDeContaMtmFunded(
  { ...base, tipo: 'real', sim_equity: 1050, metricas: { lucroPorDia: { [HOJE]: 12.5, '2026-09-23': 40 } } },
  HOJE,
)
assert.equal(comMotor?.pnlToday, 12.5)
assert.equal(comMotor?.pnlMonth, 52.5)
const soAncora = linhaDeContaMtmFunded({ ...base, tipo: 'real', sim_equity: 1010, sim_ancora_dia: 1000 }, HOJE)
assert.equal(soAncora?.pnlToday, 10)
// Sem histórico do mês, o mês é um TRAÇO — não um zero que se leia como «não perdeu nada».
assert.equal(soAncora?.pnlMonth, null)

// ── As secções: total próprio, ordenadas por equidade, e sem secção vazia ──
const linhas: LinhaDinheiroReal[] = [
  { grupo: 'minhas', etiqueta: 'Conta Pessoal · 1', equity: 1000, pnlToday: 5, pnlMonth: 10 },
  { grupo: 'minhas', etiqueta: 'Sensei · 2', equity: 2000, pnlToday: -3, pnlMonth: null },
  { grupo: 'clientes', etiqueta: 'Ana · 3', equity: 500, pnlToday: 1, pnlMonth: 2 },
]
const seccoes = seccoesDoDinheiroReal(linhas)
assert.equal(seccoes.length, 2)
assert.equal(seccoes[0].grupo, 'minhas')
assert.equal(seccoes[0].equity, 3000)
assert.equal(seccoes[0].pnlToday, 2)
// O mês soma só o que foi medido; uma linha sem mês não a transforma em zero.
assert.equal(seccoes[0].pnlMonth, 10)
assert.equal(seccoes[0].linhas[0].equity, 2000, 'maior equidade primeiro')
assert.equal(seccoesDoDinheiroReal(linhas.filter((l) => l.grupo === 'minhas')).length, 1, 'secção vazia não se imprime')
assert.equal(seccoesDoDinheiroReal([]).length, 0)

// ── A mensagem ──
const relatorio: DailyReport = {
  date: HOJE,
  accounts: [],
  totals: { equity: 0, pnlToday: 0, pnlMonth: 0, trades: 0 },
  dinheiroReal: linhas,
  generatedAt: new Date().toISOString(),
}
const msg = reportSummary(relatorio)
assert.ok(msg.includes('🏠 As tuas (2)'))
assert.ok(msg.includes('👥 Clientes — real (1)'))
assert.ok(msg.includes('Σ Total'))
assert.ok(msg.split('\n').length <= 40, 'a mensagem não pode passar das 40 linhas')
// Nada de mestres nem de financiadas de avaliação no texto.
assert.ok(!/Mestre ·/.test(msg))

// Um relatório gravado ANTES desta mudança não tem `dinheiroReal`: cai no formato antigo em vez
// de sair uma mensagem vazia.
const antigo: DailyReport = {
  date: HOJE,
  accounts: [{ label: 'Conta X', accountId: 'a', balance: 100, equity: 100, pnlToday: 1, pnlMonth: 2, trades: 3, winRatePct: 60, profitFactor: 1.2, ok: true }],
  totals: { equity: 100, pnlToday: 1, pnlMonth: 2, trades: 3 },
  generatedAt: new Date().toISOString(),
}
assert.ok(reportSummary(antigo).includes('Conta X'))

console.log('relatório dinheiro real: 24 ok')

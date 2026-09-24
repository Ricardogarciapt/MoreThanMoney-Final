/**
 * Correr com: npx tsx lib/mtmcopy/__tests__/scanner-confirmacoes.check.ts
 *
 * Os payloads abaixo são cópias literais de linhas reais de `tradingview_signals` (60 dias,
 * estratégia `MTMScanner`), não invenções — é a partir deles que se contou quantos sinais por dia
 * passariam o filtro.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { ESTRATEGIA_DO_WEBHOOK } from '../../mestres/servidor/sinal-mestre'
import { T2T_SENDER_TO_CHAT, T2T_SIGNAL_CHANNELS } from '../tap-to-trade-channels'

import { confirmationsPassed } from '../webhook-gates'
import {
  CHAVES_CONFIRMACOES_SCANNER,
  lerConfirmacoes,
  temTodasAsConfirmacoes,
} from '../scanner-confirmacoes'

const conf = (dema1550: boolean, dema50238: boolean, acimaPoc: boolean) => ({
  'DEMA 15>50': dema1550,
  'DEMA 50>238': dema50238,
  'Acima POC': acimaPoc,
})

// Linha real: GBPUSD sell, as três a false (uma venda com tudo a favor).
const vendaCheia = { strategy: 'MTMScanner', ticker: 'GBPUSD', action: 'sell', timeframe: '15', confirmations: conf(false, false, false) }
// Linha real: EURGBP sell, DEMA 50>238 a true (tendência de fundo contra a venda).
const vendaIncompleta = { strategy: 'MTMScanner', ticker: 'EURGBP', action: 'sell', timeframe: '15', confirmations: conf(false, false, true) }
const compraCheia = { strategy: 'MTMScanner', ticker: 'EURUSD', action: 'buy', timeframe: '15', confirmations: conf(true, true, true) }
const compraIncompleta = { strategy: 'MTMScanner', ticker: 'EURUSD', action: 'buy', timeframe: '15', confirmations: conf(true, true, false) }

assert.equal(CHAVES_CONFIRMACOES_SCANNER.length, 3, 'o Pine v3.5 manda exactamente três confirmações')

// ── Leitura: literal vs a favor ───────────────────────────────────────────────
const lVenda = lerConfirmacoes(vendaCheia, 'sell')
assert.deepEqual(lVenda, { total: 3, verdadeiras: 0, aFavor: 3 }, 'venda com tudo a false tem 3 a favor')
const lCompra = lerConfirmacoes(compraCheia, 'buy')
assert.deepEqual(lCompra, { total: 3, verdadeiras: 3, aFavor: 3 })

// A contagem literal tem de bater certo com a do webhook — se divergisse, a sombra media outra coisa.
assert.equal(lerConfirmacoes(compraIncompleta, 'buy')!.verdadeiras, confirmationsPassed(compraIncompleta))
assert.equal(lerConfirmacoes(vendaIncompleta, 'sell')!.verdadeiras, confirmationsPassed(vendaIncompleta))

// ── Modo «alinhadas» (o que fecha o filtro do dono) ───────────────────────────
assert.equal(temTodasAsConfirmacoes(compraCheia, 'buy').ok, true, 'compra 3/3 passa')
assert.equal(temTodasAsConfirmacoes(vendaCheia, 'sell').ok, true, 'venda com as três a favor passa')
assert.equal(temTodasAsConfirmacoes(compraIncompleta, 'buy').ok, false, 'compra a 2/3 não passa')
assert.equal(temTodasAsConfirmacoes(vendaIncompleta, 'sell').ok, false, 'venda a 2/3 não passa')
assert.match(temTodasAsConfirmacoes(vendaIncompleta, 'sell').motivo ?? '', /2\/3 a favor/)

// ── Modo «literal»: nunca deixa passar uma venda ──────────────────────────────
// Não há, em 60 dias, uma única venda do scanner com 3/3 a true — por isso este modo é, na prática,
// «só compras». Fica disponível, mas a escolha é de quem chama.
assert.equal(temTodasAsConfirmacoes(compraCheia, 'buy', { modo: 'literal' }).ok, true)
assert.equal(temTodasAsConfirmacoes(vendaCheia, 'sell', { modo: 'literal' }).ok, false, 'venda a 0/3 true não passa no literal')

// ── Sem informação não se decide ──────────────────────────────────────────────
assert.equal(lerConfirmacoes({ strategy: 'MTMScanner', action: 'buy' }, 'buy'), null)
assert.equal(temTodasAsConfirmacoes({ strategy: 'MTMScanner', action: 'buy' }, 'buy').ok, false)
assert.equal(temTodasAsConfirmacoes(null, 'buy').motivo, 'alerta sem confirmações')
// Um alerta com menos confirmações do que as três do Pine é um formato que não conhecemos → fora.
assert.equal(temTodasAsConfirmacoes({ confirmations: { 'DEMA 15>50': true } }, 'buy').ok, false)

// ── Formatos alternativos que o webhook também aceita ─────────────────────────
assert.equal(lerConfirmacoes({ confirmations: [{ passed: true }, { passed: true }, { passed: true }] }, 'buy')!.aFavor, 3)
assert.equal(lerConfirmacoes({ confirmations: conf(true, true, true) }, null)!.aFavor, 3, 'sem direcção fica a leitura literal')

// ── Direcção escrita de outras maneiras ───────────────────────────────────────
assert.equal(temTodasAsConfirmacoes(vendaCheia, 'SELL').ok, true)
assert.equal(temTodasAsConfirmacoes(vendaCheia, 'short').ok, true)
assert.equal(temTodasAsConfirmacoes(compraCheia, 'long').ok, true)

// ── As fechaduras que não podem cair com esta mudança ────────────────────────
// (o webhook é uma rota Next e não se importa daqui — lê-se o texto, como em publicar.check.ts)
const raiz = join(__dirname, '..', '..', '..')
const webhook = readFileSync(join(raiz, 'app/api/webhooks/tradingview/route.ts'), 'utf8')

// 1. O scanner continua SEM execução nas contas MT5 dos clientes: o `canExecuteProvider` mantém a
//    exclusão escrita a 18/08. É a diferença entre «a mestre regista» e «o cliente abre trades».
assert.match(webhook, /scannerKey !== "mtmscanner" &&/, 'canExecuteProvider tem de continuar a excluir o mtmscanner')

// 2. O desvio para a mestre passa pelo filtro das confirmações — e pelo cano de sempre.
assert.match(webhook, /temTodasAsConfirmacoes\(payload, execDirForGate\)/, 'o filtro tem de ser aplicado no webhook')
assert.match(webhook, /fonte: "mtmscanner"/, 'o desvio tem de usar encaminharSinalParaMestre')
assert.equal(
  (webhook.match(/encaminharSinalParaMestre\(/g) ?? []).length, 2,
  'só as duas chamadas (a de sempre e a do scanner): nenhum segundo executor',
)

// 3. O slug tem de bater certo com a linha de `mestres_estrategias` criada a 24/09.
assert.equal(ESTRATEGIA_DO_WEBHOOK.mtmscanner?.slug, 'mtm-scanner')
assert.equal(ESTRATEGIA_DO_WEBHOOK.mtmscanner?.ignoraProviderAtivo, undefined,
  'o scanner NÃO ignora o provider inactivo — é essa a fechadura do dono')

// 4. O canal das Ideias de Forex continua fora do T2T (saiu a 27/08: ~115 avisos/dia).
//    Isto é sobre a conta mestre, não sobre o botão de aceitar dos clientes.
assert.ok(!T2T_SIGNAL_CHANNELS.includes('trade-ideas-setup'), 'trade-ideas-setup não volta ao T2T')
assert.ok(!Object.values(T2T_SENDER_TO_CHAT).flat().includes('trade-ideas-setup'))

console.log('scanner-confirmacoes.check: ok')

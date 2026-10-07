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

import { classifyAsset, confirmationsPassed, stopsSane } from '../webhook-gates'
import { parseSenseiTradingViewAlert, parseSignal } from '../signal-parser'
import { decidirScannerParaMestre } from '../scanner-para-mestre'
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
// (desde 07/10 o canExecuteProvider é uma lista de portões com motivo — `primeiroPortaoFechado`)
assert.match(
  webhook,
  /\[scannerKey !== "mtmscanner", "o MTM Scanner não executa"\]/,
  'canExecuteProvider tem de continuar a excluir o mtmscanner',
)
assert.match(webhook, /const canExecuteProvider = motivoNaoExecutar === null/, 'o portão do scanner decide o canExecuteProvider')

// 2. O desvio para a mestre passa pelo filtro das confirmações — e pelo cano de sempre.
assert.match(webhook, /temTodasAsConfirmacoes\(payload, execDirForGate\)/, 'o filtro tem de ser aplicado no webhook')
assert.match(webhook, /fonte: "mtmscanner"/, 'o desvio tem de usar encaminharSinalParaMestre')
assert.equal(
  (webhook.match(/encaminharSinalParaMestre\(/g) ?? []).length, 3,
  // 07/10: a 3.ª é a da Aurum Flow (fonte `aurum`, lib/mestres/aurum.ts) — o MESMO cano, não um executor novo.
  'só as três chamadas (a de sempre, a do scanner e a da Aurum): nenhum segundo executor',
)
assert.match(webhook, /fonte: "aurum"/, 'a 3.ª chamada é a da Aurum Flow')

// 3. O slug tem de bater certo com a linha de `mestres_estrategias` criada a 24/09.
assert.equal(ESTRATEGIA_DO_WEBHOOK.mtmscanner?.slug, 'mtm-scanner')
assert.equal(ESTRATEGIA_DO_WEBHOOK.mtmscanner?.ignoraProviderAtivo, undefined,
  'o scanner NÃO ignora o provider inactivo — é essa a fechadura do dono')

// 4. O canal das Ideias de Forex continua fora do T2T (saiu a 27/08: ~115 avisos/dia).
//    Isto é sobre a conta mestre, não sobre o botão de aceitar dos clientes.
assert.ok(!T2T_SIGNAL_CHANNELS.includes('trade-ideas-setup'), 'trade-ideas-setup não volta ao T2T')
assert.ok(!Object.values(T2T_SENDER_TO_CHAT).flat().includes('trade-ideas-setup'))

// 5. As duas condições que mataram o desvio no dia em que nasceu não podem voltar.
//    `!isIdeaAlert`/`!activeSensei` vieram do `canExecuteProvider` e são SEMPRE falsas nos alertas do
//    scanner (o parser do Sensei monta um alerta a partir de ticker+action e infere `idea`).
assert.ok(
  !/decidirScannerParaMestre\(\{[\s\S]{0,600}?(isIdeaAlert|activeSensei)/.test(webhook),
  'a decisão do scanner não pode voltar a depender de isIdeaAlert/activeSensei',
)
assert.match(webhook, /decidirScannerParaMestre\(/, 'a decisão vive na função pura, com testes')
// 6. Não abrir deixa rasto na linha do sinal — a resposta a «porque é que este não abriu?».
assert.match(webhook, /registarMotivoScanner/, 'o motivo tem de ir para tradingview_signals.ai_error')

// ── A DECISÃO, com os alertas REAIS de 24/09 ─────────────────────────────────
// Linhas literais de `tradingview_signals` (as três que passaram todas as confirmações e que, mesmo
// assim, não abriram uma única posição na mestre 77696002).
const alertasReais = [
  { id: 'f3025af7 EURCHF buy 14:30', p: { sl: 0.94169, tp1: 0.94357, tp2: 0.94483, tp3: 0.94608, entry: 0.94232, action: 'buy', ticker: 'EURCHF', exchange: 'BLACKBULL', strategy: 'MTMScanner', timeframe: '15', order_type: 'MARKET', confirmations: conf(true, true, true) } },
  { id: '96f08fed GBPUSD sell 14:30', p: { sl: 1.32225, tp1: 1.31965, tp2: 1.31791, tp3: 1.31618, entry: 1.32139, action: 'sell', ticker: 'GBPUSD', exchange: 'BLACKBULL', strategy: 'MTMScanner', timeframe: '15', order_type: 'MARKET', confirmations: conf(false, false, false) } },
  { id: '187de921 GBPCHF buy 14:15', p: { sl: 1.09382, tp1: 1.09617, tp2: 1.09774, tp3: 1.09931, entry: 1.09461, action: 'buy', ticker: 'GBPCHF', exchange: 'BLACKBULL', strategy: 'MTMScanner', timeframe: '15', order_type: 'MARKET', confirmations: conf(true, true, true) } },
]

/** O caminho do webhook até `parsedForExec`, com o MESMO parser (é aqui que estava o defeito). */
function comoOWebhookLe(p: (typeof alertasReais)[number]['p']) {
  const campos = {
    ticker: p.ticker, action: p.action, price: null, entry: p.entry, sl: p.sl,
    tp: [p.tp1, p.tp2, p.tp3], tp1: p.tp1, tp2: p.tp2, tp3: p.tp3, tp4: null,
    timeframe: p.timeframe, exchange: p.exchange, alertName: p.strategy, state: null,
  }
  // buildRawSignal do webhook: o alerta do scanner não traz texto reconhecível.
  const acao = p.action === 'buy' ? '🔵 Buy 🔵' : '🔴 Sell 🔴'
  const raw = `Moeda: ${p.ticker}\nAção:   ${acao}\nStoploss: ${p.sl}\nTakeprofit: ${p.tp1}`
  const activeSensei = parseSenseiTradingViewAlert(raw, campos)
  return { activeSensei, parsedForExec: activeSensei ?? parseSignal(raw) }
}

for (const { id, p } of alertasReais) {
  const { activeSensei, parsedForExec } = comoOWebhookLe(p)
  // A prova do defeito: o parser do Sensei devolve SEMPRE um alerta, e classifica-o como `idea`.
  assert.ok(activeSensei, `${id}: o parser do Sensei devolve sempre um alerta (era isto que travava)`)
  assert.equal(activeSensei!.alertType, 'idea', `${id}: e classifica-o como ideia`)

  const d = decidirScannerParaMestre({
    scanner: 'mtmscanner',
    tipoSinal: 'entry',
    classe: classifyAsset(p.ticker),
    simbolo: parsedForExec?.symbol ?? null,
    direcao: parsedForExec?.direction ?? null,
    confirmacoes: temTodasAsConfirmacoes(p, parsedForExec?.direction ?? null),
    stopsSaos: stopsSane(parsedForExec?.entry ?? null, parsedForExec?.sl ?? null),
    gateExec: { ok: true },
    podeExecutarProvider: false,
  })
  assert.equal(d.vai, true, `${id}: tinha de ir à mestre — ${d.motivo ?? ''}`)
  assert.equal(d.candidato, true)
}

// ── E o que continua a NÃO ir (com motivo escrito) ───────────────────────────
const base = {
  scanner: 'mtmscanner' as const, tipoSinal: 'entry' as const, classe: classifyAsset('EURCHF'),
  simbolo: 'EURCHF', direcao: 'buy', confirmacoes: temTodasAsConfirmacoes(compraCheia, 'buy'),
  stopsSaos: true, gateExec: { ok: true }, podeExecutarProvider: false,
}
assert.equal(decidirScannerParaMestre({ ...base, scanner: 'sensei' }).vai, false)
assert.equal(decidirScannerParaMestre({ ...base, scanner: 'sensei' }).candidato, false, 'outro scanner não enche o ai_error')
const seguimento = decidirScannerParaMestre({ ...base, tipoSinal: 'followup' })
assert.equal(seguimento.vai, false)
assert.match(seguimento.motivo ?? '', /seguimento/)
const semConf = decidirScannerParaMestre({ ...base, confirmacoes: temTodasAsConfirmacoes(compraIncompleta, 'buy') })
assert.equal(semConf.vai, false)
assert.equal(semConf.candidato, false, 'os ~95% que o filtro corta não escrevem motivo nenhum')
const indice = decidirScannerParaMestre({ ...base, classe: classifyAsset('GER40'), simbolo: 'GER40' })
assert.equal(indice.vai, false)
assert.equal(indice.candidato, true, 'um índice com 3/3 merece explicação')
assert.match(indice.motivo ?? '', /fora do âmbito da mestre/)
const stopLixo = decidirScannerParaMestre({ ...base, stopsSaos: false })
assert.match(stopLixo.motivo ?? '', /stop fora de escala/)
const gateFora = decidirScannerParaMestre({ ...base, gateExec: { ok: false, reason: 'EURCHF fora da whitelist de execução' } })
assert.match(gateFora.motivo ?? '', /gate de execução: EURCHF fora da whitelist/)
assert.equal(gateFora.candidato, true)
// E se o sinal já vai pelo caminho normal, não há desvio nenhum a fazer (nunca dois executores).
assert.equal(decidirScannerParaMestre({ ...base, podeExecutarProvider: true }).vai, false)

console.log('scanner-confirmacoes.check: ok')

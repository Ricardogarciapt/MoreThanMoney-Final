/**
 * CADEIA DO SENSEI (auditoria de 07/10/2026) — prende as três decisões que estavam erradas.
 *
 * Correr: npx tsx lib/mtmcopy/__tests__/sensei-cadeia.check.ts
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  entradaSenseiAutonoma,
  escolherEntradaDoSeguimento,
  precoDaEntrada,
  primeiroPortaoFechado,
} from '../sensei-cadeia'

// ── 1. Entrada autónoma ────────────────────────────────────────────────────────────────────
assert.equal(entradaSenseiAutonoma({ scannerKey: 'sensei', assetClass: 'gold_btc', state: 'ENTRY' }), true)
assert.equal(entradaSenseiAutonoma({ scannerKey: 'sensei', assetClass: 'gold_btc', state: ' entry ' }), true)
// Os seguimentos e os outros scanners continuam a usar as ideias.
assert.equal(entradaSenseiAutonoma({ scannerKey: 'sensei', assetClass: 'gold_btc', state: 'TP1' }), false)
assert.equal(entradaSenseiAutonoma({ scannerKey: 'goldkiller', assetClass: 'gold_btc', state: 'ENTRY' }), false)
assert.equal(entradaSenseiAutonoma({ scannerKey: 'mtmscanner', assetClass: 'gold_btc', state: 'ENTRY' }), false)
assert.equal(entradaSenseiAutonoma({ scannerKey: 'sensei', assetClass: 'forex', state: 'ENTRY' }), false)
assert.equal(entradaSenseiAutonoma({ scannerKey: 'sensei', assetClass: 'gold_btc', state: null }), false)

// ── 2. Seguimento → a sua entrada ──────────────────────────────────────────────────────────
// O caso real de 07/10: TP1 da venda do Sensei (entry 4132.73). A COMPRA do MTM Scanner das 07:45
// é mais recente na lista do ticker e não pode ser escolhida.
const candidatas = [
  { id: 'scanner-0815', alert_name: 'MTMScanner', price: 0, raw_payload: {} },
  { id: 'sensei-0800', alert_name: 'MTM Sensei X', price: 4132.73, raw_payload: { entry: 4132.73 } },
  { id: 'scanner-0745', alert_name: 'MTMScanner', price: 0, raw_payload: {} },
  { id: 'sensei-0600', alert_name: 'MTM Sensei X', price: 4161.53, raw_payload: { entry: 4161.53 } },
]
assert.equal(
  escolherEntradaDoSeguimento(candidatas, { alertName: 'MTM Sensei X', entry: 4132.73 })?.id,
  'sensei-0800',
  'o TP do Sensei vai à entrada do Sensei com o mesmo preço',
)
assert.equal(
  escolherEntradaDoSeguimento(candidatas, { alertName: 'mtm sensei x', entry: 4161.6 })?.id,
  'sensei-0600',
  'escolhe pela entrada, não pela mais recente',
)
assert.equal(
  escolherEntradaDoSeguimento(candidatas, { alertName: 'MTM Sensei X', entry: 4000 }),
  null,
  'sem entrada da mesma trade em aberto, não marca nenhuma',
)
assert.equal(
  escolherEntradaDoSeguimento(candidatas, { alertName: 'MTMScanner', entry: null })?.id,
  'scanner-0815',
  'sem preço no seguimento: a mais recente DA MESMA FONTE',
)
assert.equal(
  escolherEntradaDoSeguimento(candidatas, { alertName: 'GoldKiller', entry: null }),
  null,
  'uma fonte sem entradas em aberto não apanha a de outra',
)
assert.equal(precoDaEntrada({ id: 'x', price: '4100.5', raw_payload: null }), 4100.5)
assert.equal(precoDaEntrada({ id: 'x', price: 0, raw_payload: {} }), null)

// ── 3. Portões com motivo ──────────────────────────────────────────────────────────────────
assert.equal(primeiroPortaoFechado([[true, 'a'], [true, 'b']]), null)
assert.equal(primeiroPortaoFechado([[true, 'a'], [false, 'b'], [false, 'c']]), 'b')
// Curto-circuito: um portão-função depois de um fechado não corre (há gates que rebentam fora da classe).
let correu = false
assert.equal(
  primeiroPortaoFechado([[false, 'classe'], [() => { correu = true; return true }, 'qualidade']]),
  'classe',
)
assert.equal(correu, false, 'o portão seguinte não pode ser avaliado')
assert.equal(primeiroPortaoFechado([[true, 'a'], [() => false, 'qualidade']]), 'qualidade')

// ── 4. O webhook usa isto (guarda estática, para ninguém voltar ao ticker sozinho) ───────────
const rota = readFileSync(join(__dirname, '..', '..', '..', 'app', 'api', 'webhooks', 'tradingview', 'route.ts'), 'utf8')
assert.ok(/entradaSenseiAutonoma\(/.test(rota), 'o webhook não procura ideia pendente para a entrada do Sensei X')
// Desde 07/10 (199) a escolha é por ID e não por fonte+preço: estratégia + chave da trade, uma só
// ligação (`entradaLigada`) que os dois caminhos de seguimento (Pine e eventos JSON) usam.
// Isolamento completo em lib/sinais/__tests__/isolamento-estrategias.check.ts.
assert.ok(/ligarSeguimento\(/.test(rota), 'o seguimento liga-se à entrada por estratégia + chave')
assert.ok(
  (rota.match(/const entryRow = entradaLigada/g) ?? []).length >= 2,
  'os dois caminhos de seguimento (Pine e eventos JSON) usam a entrada ligada por id',
)
assert.ok(!/escolherEntradaDoSeguimento\(/.test(rota), 'nenhum caminho volta a escolher a entrada pelo ticker')
assert.ok(/primeiroPortaoFechado\(/.test(rota), 'o canExecuteProvider diz porquê')

console.log('sensei-cadeia: ok')

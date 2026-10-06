/**
 * Dois defeitos do alerta Aurum Flow de 06/10 (XRPUSDT), que nunca chegou ao Telegram, à app nem às contas:
 *  1. o cooldown «1 entrada/vela» do gate dos perps contava a PRÓPRIA linha do alerta (gravada antes
 *     do gate) e bloqueava todas as entradas;
 *  2. o webhook só respondia depois de processar tudo, e a TradingView desistia ao fim de ~3 s.
 * Corre: npx tsx lib/mtmcopy/__tests__/webhook-tv-rapido.check.ts
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const raiz = join(__dirname, '../../..')
const gate = readFileSync(join(raiz, 'lib/mtmcopy/perps-signal-gate.ts'), 'utf8')
const rota = readFileSync(join(raiz, 'app/api/webhooks/tradingview/route.ts'), 'utf8')

// 1 — o cooldown exclui a linha do próprio alerta, e o webhook passa-lha.
assert.match(gate, /excluirId/, 'o gate tem de aceitar a linha a excluir')
assert.match(gate, /q\.neq\("id", opts\.excluirId\)/, 'a contagem do cooldown tem de excluir a própria linha')
assert.match(rota, /evaluatePerpsSignalGate\([^)]*excluirId: logId/, 'o webhook tem de passar o id do alerta ao gate')

// 2 — o POST responde antes de processar.
const post = rota.slice(rota.indexOf('export async function POST'), rota.indexOf('function segredoTradingViewValido'))
assert.match(post, /after\(/, 'o processamento tem de correr em after()')
const iAfter = post.indexOf('after(')
const iResp = post.indexOf('return NextResponse.json({ ok: true, aceite: true })')
assert.ok(iAfter > 0 && iResp > iAfter, 'responde logo a seguir a agendar o processamento')
assert.ok(post.indexOf('segredoTradingViewValido') < iAfter, 'o segredo valida-se ANTES de aceitar')
assert.doesNotMatch(post, /await processarAlerta\(copia\)\s*\n\s*return NextResponse\.json\(\{ ok: true, aceite/, 'não pode esperar pelo processamento')

console.log('webhook-tv-rapido: o cooldown não se conta a si próprio e a TradingView recebe resposta já ✓')

/**
 * As pernas, sem tocar na corretora: `colocar` e `construir` são substituídos por espiões.
 *
 * O que isto tranca é a coisa que se descobre tarde e cara: uma perna que se declara dona do
 * sinal e depois recusa abrir NÃO pode deixar o sinal cair para o caminho genérico. Se deixar,
 * cada recusa — fora de janela, zona impossível, interruptor desligado — vira uma ordem a
 * mercado que a estratégia nunca pediu.
 */
import { pernaGoldenMoves, pernaGoldenAstro } from '../golden-exec'
import { GOLDENMOVES_PROVIDER_ACCOUNT_ID, GOLDENASTRO_PROVIDER_ACCOUNT_ID } from '../provider-constants'
import type { OrderRequest, OrderResult } from '../metaapi'

let ok = 0
let mau = 0
function eq(nome: string, a: unknown, b: unknown) {
  if (a === b) { ok++; return }
  mau++
  console.error(`✗ ${nome}\n   esperado: ${String(b)}\n   obtido:   ${String(a)}`)
}

const ordens: OrderRequest[] = []
const construir = (accountId: string, sinal: any, lote: number, comentario: string): OrderRequest => ({
  accountId, symbol: sinal.symbol, direction: sinal.direction, volume: lote,
  orderType: sinal.orderType ?? 'market', openPrice: sinal.entry,
  stopLoss: sinal.sl, takeProfit: sinal.tp?.[0] ?? null, comment: comentario,
})
const colocar = async (_a: string, req: OrderRequest): Promise<OrderResult> => {
  ordens.push(req)
  return { success: true, orderId: `sim-${ordens.length}` }
}

const VENDA = `I'm selling XAUUSD\n4411-4415\nTP1 4408\nTP2 4406\nTP3 4404\nTP4 4400\nSL 4419`

async function main() {
  // ── Conta que não é dela: não é comigo, deixa passar ao genérico ───────────────────────
  const alheia = await pernaGoldenMoves({
    accountId: 'outra-conta-qualquer', raw: VENDA, construir, colocar,
  })
  eq('conta alheia não é tratada pela Golden Moves', alheia.tratado, false)
  eq('e não abriu nada', ordens.length, 0)

  // ── Golden Moves na conta dela ────────────────────────────────────────────────────────
  const gm = await pernaGoldenMoves({
    accountId: GOLDENMOVES_PROVIDER_ACCOUNT_ID, raw: VENDA, construir, colocar,
  })
  eq('assume o sinal', gm.tratado, true)
  if (gm.detalhe.includes('goldenmoves_exec=off')) {
    console.log('  (interruptor desligado — as ordens não são testadas aqui)')
  } else {
    eq('abriu DUAS camadas', ordens.length, 2)
    eq('a primeira é a mercado', ordens[0]?.orderType, 'market')
    eq('a mercado no lado de baixo da zona', ordens[0]?.openPrice, 4411)
    eq('a segunda é LIMITE', ordens[1]?.orderType, 'limit')
    eq('a limite no preço melhor da venda', ordens[1]?.openPrice, 4415)
    eq('as duas com o mesmo stop', ordens[0]?.stopLoss, 4419)
    eq('e o mesmo stop na limite', ordens[1]?.stopLoss, 4419)
    eq('as duas vendem', `${ordens[0]?.direction}/${ordens[1]?.direction}`, 'sell/sell')
  }

  // ── Uma zona impossível é RECUSADA, mas continua a ser dela ───────────────────────────
  ordens.length = 0
  const impossivel = await pernaGoldenMoves({
    accountId: GOLDENMOVES_PROVIDER_ACCOUNT_ID,
    raw: `I'm selling XAUUSD\n4411-4415\nTP1 4408\nSL 4400`, // stop do lado errado
    construir, colocar,
  })
  eq('geometria impossível continua a ser dela', impossivel.tratado, true)
  eq('e não abre nada', impossivel.abertas, 0)
  eq('nenhuma ordem foi enviada', ordens.length, 0)

  // ── Golden Astro fora da janela ───────────────────────────────────────────────────────
  ordens.length = 0
  const fora = await pernaGoldenAstro({
    accountId: GOLDENASTRO_PROVIDER_ACCOUNT_ID, raw: 'Gold Buy 📈', precoAtual: 4411,
    construir, colocar, lote: 0.02,
    quando: new Date('2026-09-07T05:00:00Z'), // 06:00 em Londres
  })
  eq('fora da janela continua a ser dela', fora.tratado, true)
  eq('mas não abre', fora.abertas, 0)
  eq('nenhuma ordem enviada fora de janela', ordens.length, 0)

  // ── Sem gatilho ───────────────────────────────────────────────────────────────────────
  const semGatilho = await pernaGoldenAstro({
    accountId: GOLDENASTRO_PROVIDER_ACCOUNT_ID, raw: 'Fixed stop loss: 100 pips',
    precoAtual: 4411, construir, colocar, lote: 0.02,
    quando: new Date('2026-09-07T07:30:00Z'),
  })
  eq('texto sem gatilho não abre', semGatilho.abertas, 0)

  // ── Conta alheia na Astro ─────────────────────────────────────────────────────────────
  const alheia2 = await pernaGoldenAstro({
    accountId: GOLDENMOVES_PROVIDER_ACCOUNT_ID, raw: 'Gold Buy', precoAtual: 4411,
    construir, colocar, lote: 0.02, quando: new Date('2026-09-07T07:30:00Z'),
  })
  eq('a Astro não toca na conta da Golden Moves', alheia2.tratado, false)

  console.log(`\n${ok} passaram, ${mau} falharam`)
  if (mau) process.exit(1)
}
main()

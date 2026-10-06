import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { CAIXA_PRE_MARCADA, TEXTO_CAIXA_CHECKOUT, consentimentoDaCompra, podeReceber } from './captacao-consentimento'

/**
 * Guarda da caixa de consentimento no checkout e no marketplace (06/10, F4).
 * A regra: sem caixa marcada não há consentimento de campanha. Comprar não é subscrever.
 */
let n = 0
const caso = (nome: string, f: () => void) => { f(); n++; console.log(`  ok  ${nome}`) }
const email = 'compradora@gmail.com'

caso('MAU: sem caixa marcada não se grava consentimento', () => {
  for (const aceitou of [false, undefined, null, 'on', 'true', 1, {}, []]) {
    for (const canal of ['checkout', 'marketplace'] as const) {
      assert.equal(consentimentoDaCompra({ aceitou, email, canal }), null, `gravou com aceitou=${JSON.stringify(aceitou)} (${canal})`)
    }
  }
})
caso('MAU: sem linha no livro, um comprador NÃO pode receber campanhas', () => {
  // É o que a vista lê quando a caixa não foi marcada: nenhuma base legal de consentimento.
  const d = podeReceber({ email, baseLegal: null, retirou: false, ehCliente: true }, 'campanha')
  assert.equal(d.pode, false, 'comprar passou a ser subscrever')
})
caso('com a caixa marcada grava consentimento, com o texto que a pessoa leu como prova', () => {
  const l = consentimentoDaCompra({ aceitou: true, email: ' Compradora@Gmail.com ', canal: 'marketplace' })
  assert.ok(l)
  assert.equal(l!.email, email)
  assert.equal(l!.base_legal, 'consentimento')
  assert.equal(l!.canal, 'marketplace')
  assert.equal(l!.prova, TEXTO_CAIXA_CHECKOUT)
  assert.equal(podeReceber({ email, baseLegal: l!.base_legal, retirou: false, ehCliente: false }, 'campanha').pode, true)
})
caso('MAU: email de teste ou inválido não grava nem com a caixa marcada', () => {
  assert.equal(consentimentoDaCompra({ aceitou: true, email: 'x@example.com', canal: 'checkout' }), null)
  assert.equal(consentimentoDaCompra({ aceitou: true, email: 'lixo', canal: 'checkout' }), null)
})
caso('a caixa nasce desmarcada e o texto é claro (lembretes e novidades por email, opcional, sai-se)', () => {
  assert.equal(CAIXA_PRE_MARCADA, false)
  assert.match(TEXTO_CAIXA_CHECKOUT, /lembretes/i)
  assert.match(TEXTO_CAIXA_CHECKOUT, /novidades/i)
  assert.match(TEXTO_CAIXA_CHECKOUT, /email/i)
  assert.match(TEXTO_CAIXA_CHECKOUT, /opcional/i)
  assert.match(TEXTO_CAIXA_CHECKOUT, /cancelo quando quiser/i)
})
caso('os três ecrãs começam com a caixa desmarcada e mandam o campo; as três rotas gravam pela regra', () => {
  const raiz = join(__dirname, '..')
  for (const f of ['app/upgrade/upgrade-client.tsx', 'app/register/page.tsx', 'components/marketplace/ficha-produto.tsx']) {
    const src = readFileSync(join(raiz, f), 'utf8')
    assert.match(src, /useState\(CAIXA_PRE_MARCADA\)/, `${f}: a caixa não nasce de CAIXA_PRE_MARCADA`)
    assert.ok(!/useState\(true\)[^\n]*consentimento/i.test(src), `${f}: caixa pré-marcada`)
    assert.ok(src.includes('<CaixaConsentimentoEmail'), `${f}: falta a caixa`)
    assert.ok(src.includes('consentimentoEmail'), `${f}: o campo não vai no pedido`)
  }
  for (const f of ['app/api/stripe/create-checkout-session/route.ts', 'app/api/stripe/register-checkout/route.ts', 'app/api/marketplace/checkout/route.ts']) {
    const src = readFileSync(join(raiz, f), 'utf8')
    assert.ok(src.includes('registarConsentimentoDaCompra({'), `${f}: não grava o consentimento`)
  }
})
console.log(`captacao-consentimento-compra: ${n} casos — sem caixa marcada não há consentimento ✓`)

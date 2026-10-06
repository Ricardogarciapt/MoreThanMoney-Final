/**
 * Guarda do aviso de cartão falhado. Corre: npx tsx lib/cobranca/aviso-cartao-falhado.check.ts
 * Prova os casos maus: o cliente fica sem saber (o defeito de 06/10), ou recebe o mesmo email a
 * cada nova tentativa do Stripe.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  buildAvisoCartaoFalhado,
  chaveDoAviso,
  jaAvisado,
  juntarMarca,
  momentoDoAviso,
} from './aviso-cartao-falhado'

let n = 0
const caso = (nome: string, f: () => void) => {
  f()
  n++
  void nome
}

caso('primeira falha avisa', () => {
  assert.equal(momentoDoAviso({ tentativaFatura: 1, falhasPerfil: 1, limiarCorte: 3 }), 'primeira')
})
caso('retentativa intermédia não repete', () => {
  assert.equal(momentoDoAviso({ tentativaFatura: 2, falhasPerfil: 2, limiarCorte: 3 }), null)
})
caso('a falha que corta o acesso avisa o corte', () => {
  assert.equal(momentoDoAviso({ tentativaFatura: 3, falhasPerfil: 3, limiarCorte: 3 }), 'corte')
})
caso('mesma fatura e momento não sai duas vezes', () => {
  const k = chaveDoAviso('in_1', 'corte')
  const marcas = juntarMarca(undefined, k)
  assert.equal(jaAvisado(marcas, k), true)
  assert.equal(jaAvisado(marcas, chaveDoAviso('in_2', 'corte')), false)
})
caso('marcas não incham o perfil', () => {
  let m: string[] = []
  for (let i = 0; i < 50; i++) m = juntarMarca(m, `in_${i}:primeira`)
  assert.equal(m.length, 20)
  assert.equal(m[19], 'in_49:primeira')
})
caso('link da fatura do Stripe é o botão; sem ele, a área de membro', () => {
  const com = buildAvisoCartaoFalhado({ nome: 'Ana', momento: 'primeira', valorCents: 3500, moeda: 'eur', linkFatura: 'https://invoice.stripe.com/i/x' })
  assert.match(com.html, /https:\/\/invoice\.stripe\.com\/i\/x/)
  assert.match(com.text, /35,00€/)
  const sem = buildAvisoCartaoFalhado({ nome: 'Ana', momento: 'corte', linkFatura: 'javascript:alert(1)' })
  assert.doesNotMatch(sem.html, /javascript:/)
  assert.match(sem.html, /member-area\?tab=subscription/)
})
caso('o webhook chama o aviso depois de gravar a falha', () => {
  const src = readFileSync(join(__dirname, '../../app/api/stripe/webhook/route.ts'), 'utf8')
  const corpo = src.slice(src.indexOf('async function handlePaymentFailed'))
  const iHist = corpo.indexOf("from('payment_history')")
  const iAviso = corpo.indexOf('avisarCartaoFalhado(profile')
  assert.ok(iHist > 0 && iAviso > iHist, 'o aviso tem de vir depois do registo da falha')
})

console.log(`aviso-cartao-falhado: ${n} casos — o cliente sabe que o banco recusou, uma vez por momento ✓`)

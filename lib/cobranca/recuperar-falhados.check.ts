/**
 * Guarda da recuperação de pagamentos falhados. Corre: npx tsx lib/cobranca/recuperar-falhados.check.ts
 */
import assert from 'node:assert/strict'
import { chaveDoAviso } from './aviso-cartao-falhado'
import { acaoParaFatura, buildEmailReativar, linhaDoResumo, resumir, type FaturaAberta } from './recuperar-falhados'

let n = 0
const caso = (nome: string, f: () => void) => {
  f()
  n++
  void nome
}
const DIA = 864e5
const agora = Date.UTC(2026, 10, 17)
const base: FaturaAberta = {
  id: 'in_1',
  cliente: 'cus_1',
  email: 'a@b.pt',
  nome: 'Ana',
  valorCents: 6500,
  moeda: 'eur',
  proximaTentativaMs: agora + 2 * DIA,
  falhouEmMs: agora - 3 * DIA,
  link: 'https://invoice.stripe.com/i/x',
}

caso('em curso sem aviso do webhook → rede de segurança manda a 1.ª', () => {
  assert.equal(acaoParaFatura(base, [], agora), 'primeira')
})
caso('webhook já avisou (primeira ou corte) → não repete', () => {
  assert.equal(acaoParaFatura(base, [chaveDoAviso('in_1', 'primeira')], agora), null)
  assert.equal(acaoParaFatura(base, [chaveDoAviso('in_1', 'corte')], agora), null)
})
caso('Stripe desistiu há pouco → um convite para reativar, uma vez', () => {
  const f = { ...base, proximaTentativaMs: null, falhouEmMs: agora - 30 * DIA }
  assert.equal(acaoParaFatura(f, [], agora), 'reativar')
  assert.equal(acaoParaFatura(f, ['in_1:reativar'], agora), null)
})
caso('fora da janela ou interruptor desligado → silêncio', () => {
  const velha = { ...base, proximaTentativaMs: null, falhouEmMs: agora - 60 * DIA }
  assert.equal(acaoParaFatura(velha, [], agora), null)
  assert.equal(acaoParaFatura(velha, [], agora, { reativar: true, janelaDias: 120 }), 'reativar')
  assert.equal(acaoParaFatura({ ...velha, falhouEmMs: agora - DIA }, [], agora, { reativar: false }), null)
})
caso('sem email ou sem valor → nada', () => {
  assert.equal(acaoParaFatura({ ...base, email: null }, [], agora), null)
  assert.equal(acaoParaFatura({ ...base, valorCents: 0 }, [], agora), null)
})
caso('resumo e linha só com resultado', () => {
  const r = resumir([base, { ...base, id: 'in_2', proximaTentativaMs: null, valorCents: 3500 }], [6500], 1, agora)
  assert.deepEqual(r.emCurso, { quantas: 1, cents: 6500 })
  assert.deepEqual(r.esgotadas, { quantas: 1, cents: 3500 })
  assert.equal(linhaDoResumo(r), '65,00€ recuperados este mês (1) · 65,00€ em recuperação (1)')
  assert.equal(linhaDoResumo(resumir([], [], 0, agora)), null)
})
caso('convite sem promessas, com link para reativar', () => {
  const m = buildEmailReativar({ nome: 'Ana', valorCents: 6500 })
  assert.match(m.html, /\/upgrade/)
  assert.doesNotMatch(m.text, /garant|lucro|retorno/i)
})

console.log(`recuperar-falhados: ${n} casos ✓`)

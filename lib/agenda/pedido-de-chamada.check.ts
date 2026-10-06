import assert from 'node:assert/strict'
import { comLinkDaAgenda, pedeParaFalar } from './pedido-de-chamada'
import { linkAgendar } from './link'
import { linkTemAg } from '@/lib/agentes/codigos'

/** Guardas do link da agenda nas respostas a leads (F3c, 06/10). */
let n = 0
const caso = (nome: string, f: () => void) => { f(); n++; console.log(`  ok  ${nome}`) }

caso('MAU: link da agenda sem ?ag= falha', () => {
  assert.equal(linkTemAg('https://www.morethanmoney.pt/agendar'), false)
  assert.ok(linkTemAg(linkAgendar()), linkAgendar())
  assert.ok(linkAgendar('onboarding').includes('ag=AG-SETTER'), linkAgendar('onboarding'))
})
caso('pedir para falar acrescenta a agenda', () => {
  const r = comLinkDaAgenda('Claro, posso ajudar.', 'quero falar com alguém')
  assert.ok(r.includes('/agendar'), r)
  assert.ok(r.includes('ag=AG-SETTER'), r)
})
caso('MAU: quem só pergunta o preço não leva agenda (não pediu chamada)', () => {
  assert.equal(pedeParaFalar('quanto custa?'), false)
  assert.equal(comLinkDaAgenda('São 35€/mês.', 'quanto custa?'), 'São 35€/mês.')
})
caso('não duplica o link', () => {
  const uma = comLinkDaAgenda('Ok', 'podes ligar-me?')
  assert.equal(comLinkDaAgenda(uma, 'podes ligar-me?'), uma)
})
caso('assunto pela mensagem', () => {
  assert.ok(comLinkDaAgenda('Ok', 'quero marcar uma call sobre copytrading').includes('t=copytrading'))
})
console.log(`pedido-de-chamada: ${n} casos ✓`)

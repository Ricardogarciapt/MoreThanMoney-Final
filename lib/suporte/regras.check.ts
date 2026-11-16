import assert from 'node:assert/strict'
import {
  deveEscalar, lerRegrasReembolso, pedePessoa, prazoPassou, prometeReembolso, proximoPrazo,
  reembolsoAutomaticoPermitido, respostaSegura, triar, REGRAS_REEMBOLSO_OMISSAO,
} from './regras'

// Triagem imediata por assunto.
assert.equal(triar('Não consigo entrar na minha conta, esqueci a password'), 'acessos')
assert.equal(triar('Fui cobrado duas vezes no cartão'), 'pagamentos')
assert.equal(triar('A app não abre no iPhone'), 'app')
assert.equal(triar('Quanto custa o Premium?'), 'vendas')
assert.equal(triar('Não tenho capital para começar'), 'capital')
assert.equal(triar('Olá, bom dia'), 'outro')
// Reembolso ganha a pagamento; reclamação também sobe.
assert.equal(triar('Paguei a subscrição e quero o reembolso'), 'reembolso')
assert.equal(triar('Quero o meu dinheiro de volta'), 'reembolso')
assert.equal(triar('Isto é uma burla, vou fazer queixa'), 'reclamacao')
assert.equal(deveEscalar('reembolso'), true)
assert.equal(deveEscalar('reclamacao'), true)
assert.equal(deveEscalar('pagamentos'), false)
assert.equal(pedePessoa('Quero falar com uma pessoa'), true)
assert.equal(pedePessoa('Como funciona o scanner?'), false)

// Prazos: 15 min, depois 1 h, depois nada.
const t0 = '2026-11-16T10:00:00.000Z'
assert.equal(proximoPrazo(t0, 0), '2026-11-16T10:15:00.000Z')
assert.equal(proximoPrazo(t0, 1), '2026-11-16T11:00:00.000Z')
assert.equal(proximoPrazo(t0, 2), null)
assert.equal(prazoPassou('2026-11-16T10:15:00.000Z', Date.parse('2026-11-16T10:16:00Z')), true)
assert.equal(prazoPassou(null), false)

// Reembolso automático: desligado por omissão, nunca acima de 50 € nem abaixo de 5.000 €/mês.
assert.equal(REGRAS_REEMBOLSO_OMISSAO.ligado, false)
assert.equal(reembolsoAutomaticoPermitido(lerRegrasReembolso(null), 99999, 10), false, 'desligado = nunca')
const ligado = lerRegrasReembolso({ reembolso_automatico: { ligado: true } })
assert.equal(reembolsoAutomaticoPermitido(ligado, 4999, 10), false, 'faturação abaixo de 5.000')
assert.equal(reembolsoAutomaticoPermitido(ligado, 5000, 50), false, '50 € já não')
assert.equal(reembolsoAutomaticoPermitido(ligado, 5000, 49.99), true)
// Ninguém sobe os tectos por base de dados.
const forcado = lerRegrasReembolso({ reembolso_automatico: { ligado: true, limite_eur: 500, faturacao_minima_mensal_eur: 100 } })
assert.equal(forcado.limite_eur, 50)
assert.equal(forcado.faturacao_minima_mensal_eur, 5000)

// O modelo nunca promete reembolso.
assert.equal(prometeReembolso('Vamos proceder ao reembolso amanhã.'), true)
assert.equal(prometeReembolso('O teu reembolso foi aprovado.'), true)
assert.equal(prometeReembolso('Tens direito a reembolso.'), true)
assert.equal(prometeReembolso('Para cancelar, vai a Definições > Subscrição.'), false)
assert.notEqual(respostaSegura('Vou reembolsar-te já.'), 'Vou reembolsar-te já.')
assert.equal(respostaSegura('Olá!'), 'Olá!')

console.log('suporte/regras: ok')

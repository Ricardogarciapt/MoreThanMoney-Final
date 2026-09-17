/**
 * Teste puro da regra de escrita das métricas do motor — sem base, sem rede.
 *
 *   npx tsx services/funded-motor/teste-metricas-escrita.ts
 *
 * O que se protege: uma conta que mexe continua a ver o painel actualizado ao minuto; uma conta
 * parada deixa de reescrever a linha todos os minutos; o gráfico continua a ganhar um ponto por hora.
 */
import assert from 'node:assert/strict'
import {
  HORA_MS,
  MINIMO_MS,
  REFRESCO_MS,
  assinaturaMetricas,
  precisaDeEscreverMetricas,
  ultimoPontoDoHistorico,
  type AssinaturaMetricas,
} from './metricas-escrita'

const base: AssinaturaMetricas = {
  equity: 10000, saldo: 10000, margem: 0, nivelMargem: null, posicoes: 0, fechos: 3, ancoraDia: 10000, diasNegociados: 2,
}
const a0 = assinaturaMetricas(base)
const t0 = Date.parse('2026-09-17T10:00:30Z')
const ultima = { em: t0, assinatura: a0, ultimoPontoMs: t0 }

const casos: Array<[string, boolean, boolean]> = [
  ['primeira vez escreve', precisaDeEscreverMetricas(undefined, a0, t0), true],
  ['conta parada, 2 min depois: não escreve', precisaDeEscreverMetricas(ultima, a0, t0 + 2 * 60_000), false],
  ['conta parada, 14 min depois: não escreve', precisaDeEscreverMetricas(ultima, a0, t0 + 14 * 60_000), false],
  ['conta parada, 15 min depois: refresca', precisaDeEscreverMetricas(ultima, a0, t0 + REFRESCO_MS), true],
  ['equity mudou, 30 s depois: espera pelo minuto', precisaDeEscreverMetricas(ultima, assinaturaMetricas({ ...base, equity: 10010 }), t0 + 30_000), false],
  ['equity mudou, 1 min depois: escreve', precisaDeEscreverMetricas(ultima, assinaturaMetricas({ ...base, equity: 10010 }), t0 + MINIMO_MS), true],
  ['diferença abaixo do cêntimo não conta', precisaDeEscreverMetricas(ultima, assinaturaMetricas({ ...base, equity: 10000.001 }), t0 + 5 * 60_000), false],
  ['posição nova conta como mudança', precisaDeEscreverMetricas(ultima, assinaturaMetricas({ ...base, posicoes: 1 }), t0 + MINIMO_MS), true],
  ['fecho novo conta como mudança', precisaDeEscreverMetricas(ultima, assinaturaMetricas({ ...base, fechos: 4 }), t0 + MINIMO_MS), true],
  ['virar do dia (âncora) conta como mudança', precisaDeEscreverMetricas(ultima, assinaturaMetricas({ ...base, ancoraDia: 10050 }), t0 + MINIMO_MS), true],
  ['1 h depois do último ponto do gráfico escreve (mesmo com refresco recente)',
    precisaDeEscreverMetricas({ em: t0 + 50 * 60_000, assinatura: a0, ultimoPontoMs: t0 }, a0, t0 + HORA_MS), true],
  ['59 min depois do ponto e refresco recente: não escreve',
    precisaDeEscreverMetricas({ em: t0 + 50 * 60_000, assinatura: a0, ultimoPontoMs: t0 }, a0, t0 + 59 * 60_000), false],
]
for (const [nome, obtido, esperado] of casos) assert.equal(obtido, esperado, nome)

assert.equal(ultimoPontoDoHistorico({}), 0, 'sem histórico')
assert.equal(ultimoPontoDoHistorico({ historico: [{ t: '2026-09-17T09:00:00Z' }, { t: '2026-09-17T10:00:00Z' }] }), Date.parse('2026-09-17T10:00:00Z'), 'último ponto')
assert.equal(ultimoPontoDoHistorico({ historico: [{ t: 'lixo' }] }), 0, 'data inválida')

// Simulação de um dia: 143 contas, 9 a mexer ao minuto, avaliação de 5 em 5 s (o `tudo-sujo`).
let escritas = 0
const estado = new Map<number, { em: number; assinatura: string; ultimoPontoMs: number }>()
for (let s = 0; s < 3600 * 24; s += 5) {
  const agora = t0 + s * 1000
  for (let c = 0; c < 143; c++) {
    const mexe = c < 9
    const a = assinaturaMetricas({ ...base, equity: mexe ? 10000 + Math.floor(s / 7) : 10000 })
    if (precisaDeEscreverMetricas(estado.get(c), a, agora)) {
      escritas++
      const ant = estado.get(c)
      // como o construirMetricas: novo ponto quando passou uma hora desde o último
      const ponto = !ant || agora - ant.ultimoPontoMs >= HORA_MS ? agora : ant.ultimoPontoMs
      estado.set(c, { em: agora, assinatura: a, ultimoPontoMs: ponto })
    }
  }
}
const antes = 143 * 24 * 60
console.log(`escritas num dia: ${escritas} (antes ${antes}; −${Math.round((1 - escritas / antes) * 100)}%)`)
assert.ok(escritas < antes * 0.2, 'tem de cortar pelo menos 80% das escritas')
assert.ok(escritas >= 9 * 24 * 60, 'as contas que mexem continuam ao minuto')

console.log('metricas-escrita: todos certos')

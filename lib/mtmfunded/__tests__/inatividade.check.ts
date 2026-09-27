import assert from 'node:assert/strict'
import {
  DIAS_INATIVIDADE,
  MOTIVO_INATIVIDADE,
  contasACair,
  decidir,
  noAmbito,
  type ContaParaInatividade,
} from '../inatividade'

const AGORA = Date.parse('2026-10-15T12:00:00Z')
const haDias = (d: number) => new Date(AGORA - d * 86_400_000).toISOString()

const conta = (p: Partial<ContaParaInatividade> = {}): ContaParaInatividade => ({
  id: 'c1',
  tipo: 'desafio',
  estado: 'ativa',
  criadaEm: haDias(60),
  ultimaTradeFechadaEm: haDias(1),
  ...p,
})

// ── A REAL NUNCA CAI ───────────────────────────────────────────────────────

/**
 * A primeira frase do dono: «exclui as reais». Uma conta real apagada é dinheiro de um cliente a
 * desaparecer de um painel — e há DUAS maneiras de uma conta ser real nesta base. As duas contam.
 */
for (const real of [{ tipo: 'real' }, { contaRealCasa: true }]) {
  const c = conta({ ...real, ultimaTradeFechadaEm: null, criadaEm: haDias(400) })
  assert.equal(decidir(c, AGORA).accao, 'nada', `${JSON.stringify(real)} não pode cair`)
}

// As nossas contas também não: apagá-las partia o sistema por dentro.
assert.equal(decidir(conta({ contaCasa: true, ultimaTradeFechadaEm: null, criadaEm: haDias(400) }), AGORA).accao, 'nada')
assert.equal(decidir(conta({ semRegras: true, ultimaTradeFechadaEm: null, criadaEm: haDias(400) }), AGORA).accao, 'nada')

// ── O ÂMBITO É FECHADO ─────────────────────────────────────────────────────

assert.equal(noAmbito(conta({ tipo: 'desafio' })).dentro, true)
assert.equal(noAmbito(conta({ tipo: 'financiada', temCertificado: true })).dentro, true)
assert.equal(noAmbito(conta({ tipo: 'financiada', temCertificado: false })).dentro, false, 'financiada SEM certificado fica de fora')
assert.equal(noAmbito(conta({ tipo: 'financiada' })).dentro, false, 'sem se saber do certificado, fica de fora')

/**
 * O que o dono não nomeou NÃO entra. É o contrário de «apanhar tudo e ir excluindo»: assim, um
 * tipo de conta novo criado daqui a seis meses não começa a ser apagado sem ninguém ter decidido.
 */
for (const t of ['provider', 'torneio', 'seja_o_que_for']) {
  assert.equal(noAmbito(conta({ tipo: t })).dentro, false, `«${t}» não entra sozinho`)
}

// Contas já mortas ou noutro estado não se voltam a matar.
for (const e of ['quebrada', 'apagada', 'cancelada', 'passou']) {
  assert.equal(noAmbito(conta({ estado: e })).dentro, false, `estado «${e}»`)
}
for (const e of ['ativa', 'pedida']) assert.equal(noAmbito(conta({ estado: e })).dentro, true)

// ── O RELÓGIO: trade fechada, e a criação quando nunca houve nenhuma ───────

assert.equal(decidir(conta({ ultimaTradeFechadaEm: haDias(DIAS_INATIVIDADE - 1) }), AGORA).accao, 'nada')
assert.equal(decidir(conta({ ultimaTradeFechadaEm: haDias(DIAS_INATIVIDADE) }), AGORA).accao, 'quebrar_e_apagar', 'no dia 30 cai')
assert.equal(decidir(conta({ ultimaTradeFechadaEm: haDias(DIAS_INATIVIDADE + 5) }), AGORA).accao, 'quebrar_e_apagar')

/**
 * UMA POSIÇÃO ABERTA NÃO PARA O RELÓGIO. Foi a escolha explícita do dono entre «trade fechada» e
 * «trade aberta»: sem isto, bastava deixar uma posição aberta para a conta viver para sempre.
 * Aqui prova-se pelo que o módulo NÃO recebe — não há campo nenhum de posição aberta a considerar.
 */
assert.equal(decidir(conta({ ultimaTradeFechadaEm: haDias(45) }), AGORA).accao, 'quebrar_e_apagar')

// Nunca fechou nada: conta desde a criação. É o caso que a regra existe para apanhar.
const nunca = conta({ ultimaTradeFechadaEm: null, criadaEm: haDias(31) })
const v = decidir(nunca, AGORA)
assert.equal(v.accao, 'quebrar_e_apagar')
assert.match((v as any).porque, /sem nenhuma trade fechada/)
// Mas só depois dos 30 dias: uma conta entregue ontem não cai por ainda não ter negociado.
assert.equal(decidir(conta({ ultimaTradeFechadaEm: null, criadaEm: haDias(29) }), AGORA).accao, 'nada')

/**
 * SEM DATA NENHUMA NÃO SE APAGA. Numa regra que apaga contas de clientes, não saber é motivo para
 * parar — nunca para avançar. Se esta guarda cair, uma data mal gravada passa a apagar a conta.
 */
for (const mau of [null, undefined, '', 'ontem', 'NaN']) {
  const c = conta({ ultimaTradeFechadaEm: null, criadaEm: mau as never })
  assert.equal(decidir(c, AGORA).accao, 'nada', `criadaEm=«${String(mau)}» não pode apagar`)
}

// ── A lista ────────────────────────────────────────────────────────────────

const lista: ContaParaInatividade[] = [
  conta({ id: 'viva', ultimaTradeFechadaEm: haDias(2) }),
  conta({ id: 'parada40', ultimaTradeFechadaEm: haDias(40) }),
  conta({ id: 'parada90', ultimaTradeFechadaEm: haDias(90) }),
  conta({ id: 'real', tipo: 'real', ultimaTradeFechadaEm: haDias(200) }),
]
const caem = contasACair(lista, AGORA)
assert.deepEqual(caem.map((x) => x.conta.id), ['parada90', 'parada40'], 'a mais parada primeiro, e a real nunca')
assert.equal(contasACair([], AGORA).length, 0)

// O limite e o motivo são os que o dono disse, e ficam presos aqui.
assert.equal(DIAS_INATIVIDADE, 30)
assert.match(MOTIVO_INATIVIDADE, /30 dias/)

console.log('mtmfunded/inatividade: OK')

// ── O AVISO DA VÉSPERA ─────────────────────────────────────────────────────

import { DIAS_AVISO_VESPERA, TECTO_POR_PASSAGEM, contasAAvisar } from '../inatividade'

{
  /**
   * A regra de ouro do aviso: quem aparece na véspera TEM de cair no dia seguinte, e quem cai no
   * dia seguinte TEM de ter aparecido na véspera. Um aviso que não bate certo com o que acontece
   * a seguir é pior do que não avisar — ensina a ignorá-lo, e é nesse dia que apaga a conta errada.
   */
  const amanha = AGORA + 86_400_000
  const frota: ContaParaInatividade[] = [
    conta({ id: 'cai-amanha', ultimaTradeFechadaEm: haDias(DIAS_INATIVIDADE - 1) }),
    conta({ id: 'ainda-longe', ultimaTradeFechadaEm: haDias(5) }),
    conta({ id: 'ja-caia-hoje', ultimaTradeFechadaEm: haDias(DIAS_INATIVIDADE + 3) }),
    conta({ id: 'nunca-negociou-amanha', ultimaTradeFechadaEm: null, criadaEm: haDias(DIAS_INATIVIDADE - 1) }),
    conta({ id: 'real', tipo: 'real', ultimaTradeFechadaEm: haDias(DIAS_INATIVIDADE - 1) }),
  ]

  const aviso = contasAAvisar(frota, AGORA).map((x) => x.conta.id)
  assert.deepEqual(aviso.sort(), ['cai-amanha', 'nunca-negociou-amanha'].sort())

  // Quem já caía HOJE não é véspera de nada: não se avisa de um corte que já aconteceu.
  assert.ok(!aviso.includes('ja-caia-hoje'))
  // E uma real nunca entra no aviso, porque nunca entra no corte.
  assert.ok(!aviso.includes('real'))

  // A prova dos dois sentidos, com o relógio adiantado um dia.
  const caemAmanha = contasACair(frota, amanha).map((x) => x.conta.id)
  for (const id of aviso) assert.ok(caemAmanha.includes(id), `avisado «${id}» tem de cair amanhã`)
  const jaCaiamHoje = new Set(contasACair(frota, AGORA).map((x) => x.conta.id))
  for (const id of caemAmanha) {
    if (jaCaiamHoje.has(id)) continue
    assert.ok(aviso.includes(id), `«${id}» cai amanhã e ninguém foi avisado`)
  }

  assert.equal(DIAS_AVISO_VESPERA, DIAS_INATIVIDADE - 1, 'a véspera é um dia antes, não três')
  assert.equal(contasAAvisar([], AGORA).length, 0)
}

// O tecto por passagem vive com a regra e é modesto de propósito: dá uma manhã para travar.
assert.equal(TECTO_POR_PASSAGEM, 20)
assert.ok(TECTO_POR_PASSAGEM < 50)

console.log('mtmfunded/inatividade (véspera): OK')

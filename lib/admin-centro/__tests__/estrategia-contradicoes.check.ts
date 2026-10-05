/**
 * F1 · contradições entre elos da cadeia (fonte → mestre → rotas → subscritores).
 *   npx tsx lib/admin-centro/__tests__/estrategia-contradicoes.check.ts
 * Casos MAUS do dono: fonte desligada com mestre live; rota activa para subscritor sem direito.
 */
import assert from 'node:assert/strict'
import { contradicoesDaEstrategia, type EntradaContradicoes } from '../estrategia-contradicoes'

const saudavel: EntradaContradicoes = {
  ativo: true, apagada: false,
  fonte: { desligada: false, porLigar: false, semFonte: false },
  mestre: { modo: 'live', sinalModo: 'live', t2tModo: 'live', temConta: true, copyfactoryPorCortar: 0 },
  motor: { ligado: true, kill: false },
  rotas: [{ id: 'r1', activa: true, pausada: false, efectivo: 'live', temDireito: true, quem: 'a@b', tipo: 'estrategia' }],
  subscricoes: [{ id: 's1', ativo: true, autoAceitar: true, temRota: true, temDireito: true, quem: 'a@b' }],
  rotaProvider: { copia: true, t2t: true },
}
const ids = (e: EntradaContradicoes) => contradicoesDaEstrategia(e).map((c) => c.id)

assert.deepEqual(ids(saudavel), [], 'uma cadeia coerente não grita')

// Edge a 05/10: fonte desligada, mestre live
const edge = ids({ ...saudavel, fonte: { ...saudavel.fonte, desligada: true } })
assert.ok(edge.includes('fonte-desligada-mestre-live'), 'fonte desligada com mestre live tem de aparecer')
assert.equal(contradicoesDaEstrategia({ ...saudavel, fonte: { ...saudavel.fonte, desligada: true } })[0].gravidade, 'grave', 'e no topo, como grave')
// a mesma fonte desligada com a mestre em sombra é coerente
assert.deepEqual(ids({ ...saudavel, fonte: { ...saudavel.fonte, desligada: true }, mestre: { ...saudavel.mestre!, modo: 'sombra', sinalModo: 'sombra', t2tModo: 'sombra' } }), [])

// rota activa em live para quem já não tem direito
const semDireito = contradicoesDaEstrategia({ ...saudavel, rotas: [{ ...saudavel.rotas[0], temDireito: false }] })
assert.equal(semDireito[0]?.id, 'rota-sem-direito:r1')
assert.equal(semDireito[0]?.gravidade, 'grave', 'em LIVE é grave')
// pausada não conta (ainda gere o que está aberto)
assert.deepEqual(ids({ ...saudavel, rotas: [{ ...saudavel.rotas[0], temDireito: false, pausada: true }] }), [])
// direito desconhecido (erro de leitura) não acusa ninguém
assert.deepEqual(ids({ ...saudavel, rotas: [{ ...saudavel.rotas[0], temDireito: null }] }), [])

// subscrição em auto-aceitar sem rota
assert.ok(ids({ ...saudavel, subscricoes: [{ ...saudavel.subscricoes[0], temRota: false }] }).includes('subscricao-sem-rota:s1'))
// CopyFactory por cortar com propagação live = ordens em dobro
assert.ok(ids({ ...saudavel, mestre: { ...saudavel.mestre!, copyfactoryPorCortar: 1 } }).includes('cf-por-cortar'))
// T2T live na mestre com o T2T da rota desligado
assert.ok(ids({ ...saudavel, rotaProvider: { copia: true, t2t: false } }).includes('t2t-live-canal-off'))
// pausa da cópia que não chegou à app (o incidente de 04/09)
assert.ok(ids({ ...saudavel, rotaProvider: { copia: false, t2t: true } }).includes('copia-pausada-ativa'))
// MT5 por ligar + live
assert.ok(ids({ ...saudavel, fonte: { ...saudavel.fonte, porLigar: true } }).includes('fonte-por-ligar-mestre-live'))
// apagada mas mestre live
assert.ok(ids({ ...saudavel, apagada: true }).includes('apagada-mestre-live'))
console.log('estrategia-contradicoes: fonte desligada×mestre live, rota sem direito, subscrição sem rota, CF por cortar, T2T, pausa — todas detectadas; cadeia coerente calada')

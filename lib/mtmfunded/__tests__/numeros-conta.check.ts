/**
 * Paridade dono × admin — os números de uma conta saem da mesma fonte (lib/mtmfunded/numeros-conta.ts).
 *
 *   npx tsx lib/mtmfunded/__tests__/numeros-conta.check.ts
 */
import assert from 'node:assert/strict'
import { barrasDaConta, equityParaLevantamento, numerosDaConta, selecionarComOpcionais } from '../numeros-conta'
import { barrasDeRegras } from '../admin-conta'
import { estadoCurto } from '../etiquetas'
import { limitesDaConta } from '../simulado/ordens'

let n = 0
const caso = async (nome: string, f: () => void | Promise<void>) => { await f(); n++; console.log(`  ok  ${nome}`) }
const regras = { objetivo_pct: 8, objetivo_fase2_pct: 5, perda_diaria_pct: 5, perda_maxima_pct: 10, dias_minimos: 3, consistencia_pct: 40 }
const sim = {
  id: 'a', tipo: 'desafio', estado: 'ativa', motor: 'sim', saldo_inicial: 10000, sim_saldo: 10014.95, sim_equity: 10190,
  sim_margem: 120, sim_ancora_dia: 10050, sim_dias_negociados: 2, pausada_em: null,
  metricas: { fase: 1, lucroPorDia: { '2026-09-14': 100, '2026-09-15': 90 }, equity: 9000 },
}

async function main() {
  await caso('pausa do admin: «Pause» igual no dono e no admin (antes o dono via Active)', () => {
    const p = numerosDaConta({ ...sim, pausada_em: '2026-09-15T10:00:00Z' })
    assert.equal(p.estadoCurto, 'Pause')
    assert.equal(p.estadoCurto, estadoCurto('ativa', sim.metricas, '2026-09-15T10:00:00Z'))
    assert.equal(numerosDaConta(sim).estadoCurto, 'Active')
  })

  await caso('simulada: saldo/equity/flutuante/% a partir das colunas sim_* (não das métricas velhas)', () => {
    const x = numerosDaConta(sim)
    assert.equal(x.saldo, 10014.95); assert.equal(x.equity, 10190); assert.equal(x.flutuante, 175.05); assert.equal(x.resultadoPct, 1.9)
  })

  await caso('mt5: saldo pelas métricas (balance/saldo), equity pelas métricas', () => {
    const x = numerosDaConta({ id: 'b', tipo: 'financiada', estado: 'ativa', motor: 'mt5', saldo_inicial: 5000, metricas: { balance: 5100, equity: 5150 } })
    assert.equal(x.saldo, 5100); assert.equal(x.equity, 5150); assert.equal(x.etiqueta, 'Funded')
  })

  await caso('levantável: GET do dono = POST = admin (saldo exacto na simulada, não metricas.equity)', () => {
    assert.equal(equityParaLevantamento(sim), 10014.95)
    assert.equal(equityParaLevantamento({ id: 'c', tipo: 'financiada', estado: 'ativa', motor: 'mt5', saldo_inicial: 5000, metricas: { equity: 5200 } }), 5200)
  })

  await caso('barras: as do WebTrader = as do admin (mesma chamada), com consistência e dias', () => {
    const x = numerosDaConta(sim)
    const dono = barrasDaConta(x, regras, 10190)
    const admin = barrasDeRegras({ regras, saldoInicial: 10000, equity: 10190, ancoraDia: 10050, diasNegociados: 2, fase: 1, lucroPorDia: sim.metricas.lucroPorDia, analise: false })
    assert.deepEqual(dono, admin)
    assert.deepEqual(dono.map((b) => b.chave), ['objetivo', 'diaria', 'maxima', 'dias', 'consistencia'])
  })

  await caso('barras: perda diária usa a âncora do dia, como o motor (limitesDaConta)', () => {
    const x = numerosDaConta({ ...sim, sim_equity: 9800 })
    const diaria = barrasDaConta(x, regras).find((b) => b.chave === 'diaria')!
    const l = limitesDaConta(regras, 10000, 9800, 10050, 1)
    const permitido = 10050 * 0.05
    // usado + restante = permitido (os dois ecrãs contam do mesmo chão)
    const usado = 10050 - 9800
    assert.ok(Math.abs(usado + (l.perdaDiariaRestante ?? 0) - permitido) < 0.01)
    assert.ok(diaria.texto.startsWith('250 USD'))
  })

  await caso('fase 2 usa o objectivo da fase 2 nos dois', () => {
    const x = numerosDaConta({ ...sim, metricas: { ...sim.metricas, fase: 2 } })
    assert.equal(x.etiqueta, 'F2')
    assert.match(barrasDaConta(x, regras)[0].nome, /5%/)
    assert.equal(limitesDaConta(regras, 10000, 10190, 10050, 2).objetivoPct, 5)
  })

  await caso('conta da casa / seguidora identificadas para os filtros do admin', () => {
    const x = numerosDaConta({ ...sim, conta_casa: true, segue_estrategia: 'sensei', metricas: { analise: true } })
    assert.equal(x.contaCasa, true); assert.equal(x.segueEstrategia, 'sensei'); assert.equal(x.analise, true)
  })

  await caso('colunas opcionais: sem conta_casa (082) repete sem ela e mantém pausada_em', async () => {
    const pedidas: string[] = []
    const r = await selecionarComOpcionais<{ id: string }>('id', async (cols) => {
      pedidas.push(cols)
      if (cols.includes('conta_casa')) return { data: null, error: { code: '42703', message: 'column conta_casa does not exist' } }
      return { data: [{ id: 'x' }], error: null }
    })
    assert.deepEqual(r.data, [{ id: 'x' }])
    assert.equal(pedidas[1], 'id, pausada_em')
  })

  console.log(`\n${n} casos ok`)
}
main().catch((e) => { console.error(e); process.exit(1) })

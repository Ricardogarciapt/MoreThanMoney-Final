/**
 * Quem liga streaming (tecto, prioridades, graça, travão de quota/limite, recuo) e quem gere cada
 * conta (lista live + batimento do motor). Mais: as cópias do repositório mtm-auto são byte a byte.
 *
 *   npx tsx lib/gestao-real/__tests__/planeamento-e-guarda.check.ts
 */
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { aposFalhaLigar, planear, PLANEAMENTO_PADRAO, type EstadoConta, type PedidoConta } from '../planeamento'
import { decidirGuarda, lerListaLive, listaPedeLive, TIPOS_LIVE_SUPORTADOS } from '../contas-live-regras'
import { RAIZ } from './harness'

const MIN = 60_000
const cfg = { ...PLANEAMENTO_PADRAO, maxContas: 3 }
const ped = (conta: string, prioridade: number, fixa = false): PedidoConta => ({ conta, prioridade, chaveToken: 'casa', motivos: [`p${prioridade}`], fixa })
const est = (ligada: boolean, pedidaEm = 0, paradaAte = 0): EstadoConta => ({ ligada, pedidaEm, paradaAte, falhas: 0 })
const livre = { pausaGlobalAte: 0, bloqueada: () => null }

// ── planeamento ─────────────────────────────────────────────────────────────────
{
  // Tecto e prioridade: mestre (0) e Premium directa (1) antes de T2T (2) e MTM Auto (3).
  const p = planear([ped('auto', 3), ped('t2t', 2), ped('mestre', 0, true), ped('dir', 1)], new Map(), 0, cfg, livre)
  assert.deepEqual(p.ligar, ['mestre', 'dir', 't2t'])
  assert.deepEqual(p.recusadas.map((r) => r.conta), ['auto'])

  // Uma ligação viva não cai por uma nova de prioridade melhor com o tecto cheio... excepto se já não
  // houver vaga para ela e ela não for pedida.
  const estados = new Map([['t2t', est(true, 0)], ['auto', est(true, 0)], ['velha', est(true, 0)]])
  const p2 = planear([ped('t2t', 2), ped('auto', 3), ped('mestre', 0, true)], estados, 5 * MIN, cfg, livre)
  assert.deepEqual(p2.ligar, ['mestre'])
  assert.deepEqual(p2.desligar, [], 'a «velha» ainda está dentro da graça de 10 min')
  const p3 = planear([ped('t2t', 2), ped('auto', 3), ped('mestre', 0, true)], estados, 11 * MIN, cfg, livre)
  assert.deepEqual(p3.desligar, ['velha'], 'passada a graça, desliga')

  // Fixa (fotografia) nunca desliga por graça.
  const p4 = planear([], new Map([['mestre', est(true, 0)]]), 60 * MIN, cfg, livre)
  assert.deepEqual(p4.desligar, ['mestre'], 'sem pedido nenhum, até a fixa sai (o pedido fixo vem sempre do escopo)')
  const p5 = planear([ped('mestre', 0, true)], new Map([['mestre', est(true, 0)]]), 60 * MIN, cfg, livre)
  assert.deepEqual(p5.desligar, [])

  // Travão de quota: conta inexistente/bloqueada é recusada sem tentar; pausa global por LIMITE não liga
  // nada novo mas mantém as vivas.
  const p6 = planear([ped('morta', 2), ped('viva', 2)], new Map([['viva', est(true, 0)]]), 0, cfg, {
    pausaGlobalAte: 10 * MIN,
    bloqueada: (c) => (c === 'morta' ? 'conta inexistente na MetaApi (24 h)' : null),
  })
  assert.deepEqual(p6.ligar, [])
  assert.deepEqual(p6.recusadas, [{ conta: 'morta', motivo: 'conta inexistente na MetaApi (24 h)' }])
  assert.deepEqual(p6.desligar, [])
  const p7 = planear([ped('nova', 2)], new Map(), 0, cfg, { pausaGlobalAte: 10 * MIN, bloqueada: () => null })
  assert.match(p7.recusadas[0]!.motivo, /limite da MetaApi/)

  // Recuo: limite → 15 min; outro erro → 1, 2, 4… até 15 min.
  let e = est(false)
  e = aposFalhaLigar(e, true, 0, cfg)
  assert.equal(e.paradaAte, 15 * MIN)
  e = aposFalhaLigar(est(false), false, 0, cfg)
  assert.equal(e.paradaAte, 1 * MIN)
  e = aposFalhaLigar(e, false, 0, cfg)
  assert.equal(e.paradaAte, 2 * MIN)
  for (let i = 0; i < 10; i++) e = aposFalhaLigar(e, false, 0, cfg)
  assert.equal(e.paradaAte, 15 * MIN)
  const p8 = planear([ped('recuo', 2)], new Map([['recuo', { ...e, paradaAte: 5 * MIN }]]), 1 * MIN, cfg, livre)
  assert.match(p8.recusadas[0]!.motivo, /em recuo/)
  console.log('ok  planeamento: tecto, prioridades, graça, fixa, conta inexistente, pausa por limite, recuo')
}

// ── guarda live ───────────────────────────────────────────────────────────────────
{
  const M = '530D2E07-b391-440f-bc6e-f4c2a224057b'
  const agora = Date.parse('2026-09-20T10:00:00Z')
  const pulso = (idadeMs: number, live: string[], escrita = true) => ({ em: new Date(agora - idadeMs).toISOString(), escrita, live })
  const chave = `${M.toLowerCase()}:premium`

  assert.deepEqual(lerListaLive('[]'), [])
  assert.deepEqual(lerListaLive(null), [])
  assert.deepEqual(lerListaLive('lixo'), [])
  assert.deepEqual(lerListaLive(`["${M}"]`), [{ conta: M.toLowerCase(), tipos: [...TIPOS_LIVE_SUPORTADOS] }])
  const lista = lerListaLive([{ conta: M, tipos: ['premium', 't2t'] }])

  assert.equal(decidirGuarda([], pulso(1000, [chave]), M, 'premium', agora), false, 'lista vazia: o monitor gere')
  assert.equal(decidirGuarda(lista, pulso(1000, [chave]), M, 'premium', agora), true, 'lista + motor vivo + confirmado')
  assert.equal(decidirGuarda(lista, pulso(25_000, [chave]), M, 'premium', agora), false, 'batimento velho: o monitor volta a gerir')
  assert.equal(decidirGuarda(lista, pulso(1000, [chave], false), M, 'premium', agora), false, 'motor sem escrita: o monitor gere')
  assert.equal(decidirGuarda(lista, pulso(1000, []), M, 'premium', agora), false, 'motor não confirma a conta')
  assert.equal(decidirGuarda(lista, null, M, 'premium', agora), false, 'sem batimento')
  assert.equal(decidirGuarda(lista, pulso(1000, [`${M.toLowerCase()}:t2t`]), M, 't2t', agora), false, 'T2T ainda não é suportado em live')
  assert.equal(listaPedeLive(lista, M, 'mtmauto'), false)
  console.log('ok  guarda: lista vazia, JSON em texto, batimento velho/sem escrita/sem confirmação, tipos não suportados')
}

// ── cópias do repositório mtm-auto ─────────────────────────────────────────────────
{
  const dir = process.env.MTM_AUTO_DIR || path.resolve(RAIZ, '../mtm-auto')
  const ficheiros = ['lib/gestao-real/mtmauto.ts', 'lib/gestao-real/mtmauto-regras.ts', 'lib/gestao-real/contas-live-regras.ts']
  if (!existsSync(path.join(dir, 'lib/gestao-real'))) {
    console.log(`aviso: ${dir} sem lib/gestao-real — cópias não comparadas (MTM_AUTO_DIR=<repositório mtm-auto>)`)
  } else {
    for (const f of ficheiros) {
      assert.equal(readFileSync(path.join(RAIZ, f), 'utf8'), readFileSync(path.join(dir, f), 'utf8'), `${f} difere do repositório mtm-auto (${dir})`)
    }
    console.log(`ok  cópias byte a byte com ${dir}: ${ficheiros.length} ficheiros`)
  }
}
console.log('planeamento e guarda: todos certos')

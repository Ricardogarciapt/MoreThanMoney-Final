/**
 * PARIDADE PREMIUM — o monitor de preço Premium ORIGINAL (git 8a81044) e o actual (que chama
 * lib/gestao-real/premium.ts) fazem EXACTAMENTE as mesmas chamadas nos mesmos cenários:
 * modificações (SL/TP/trailing), fechos parciais e totais, espelho aos subscritores, escritas na
 * base e anúncios. Depois, o guarda do motor em tempo real (lista live) só cala a gestão por preço.
 *
 *   npx tsx lib/gestao-real/__tests__/paridade-premium.check.ts
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { RAIZ, empacotar, fonteDoGit, normalizar, primeiraDiferenca, type Registo } from './harness'
import { FALSOS_SITE } from './falsos-site'
import { DIRECTA, MESTRE, cenarios, novoMundo, type Cenario, type Mundo } from './cenarios-premium'

type Monitor = { runPremiumPriceMonitor: () => Promise<{ actions: number; detail: string[] }> }
const FICHEIRO = 'lib/mtmcopy/premium-price-monitor.ts'
const pasta = path.join(RAIZ, 'lib/mtmcopy')
let original: Monitor
let actual: Monitor

async function correr(m: Monitor, c: Cenario, extra: Partial<Mundo> = {}): Promise<Registo[]> {
  const w = { ...novoMundo(c), ...extra }
  ;(globalThis as { __P?: unknown }).__P = w
  for (const [i, passo] of c.passos.entries()) {
    passo.mundo?.(w)
    for (const lista of Object.values(w.contas)) {
      for (const p of lista) {
        const s = Object.keys(passo.preco).find((k) => String(p.symbol).toUpperCase().startsWith(k))
        if (s) p.currentPrice = passo.preco[s]
      }
    }
    w.log.push({ k: 'passo', i })
    const r = await m.runPremiumPriceMonitor()
    w.log.push({ k: 'fim', actions: r.actions, detail: r.detail })
  }
  return normalizar(w.log)
}

async function main() {
  original = await empacotar<Monitor>({ codigo: fonteDoGit(FICHEIRO), pasta, falsos: FALSOS_SITE })
  actual = await empacotar<Monitor>({ codigo: readFileSync(path.join(RAIZ, FICHEIRO), 'utf8'), pasta, falsos: FALSOS_SITE })
  let accoes = 0
  for (const c of cenarios) {
    const a = await correr(original, c)
    const b = await correr(actual, c)
    assert.deepEqual(b, a, `${c.nome}\n${primeiraDiferenca(a, b)}`)
    const n = a.filter((x) => x.k === 'modify' || x.k === 'close' || x.k === 'mirror' || x.k === 'announce').length
    assert.ok(n > 0, `${c.nome}: o cenário não exercitou nenhuma acção`)
    accoes += n
    console.log(`ok  ${c.nome} (${n} acções)`)
  }

  // Cobertura mínima das regras (se um cenário deixar de as tocar, o teste avisa).
  const tudo: Registo[] = []
  for (const c of cenarios) tudo.push(...(await correr(actual, c)))
  const detalhes = tudo.filter((x) => x.k === 'fim').flatMap((x) => x.detail as string[]).join('\n')
  for (const regra of ['lucro trancado', 'BE protetor', 'zona larga', 'Exit 1 → fecha 70%', 'trailing pós-TP1', 'conta pequena', 'trailing → stop', 'fecha tudo', 'ausente na fotografia', 'fecho Exit 1 falhou', 'ilegível']) {
    assert.ok(detalhes.includes(regra), `nenhum cenário tocou «${regra}»\n${detalhes}`)
  }
  assert.ok(tudo.some((x) => x.k === 'mirror'), 'espelho aos subscritores não exercitado')
  assert.ok(tudo.some((x) => x.k === 'announce' && x.event === 'target_final'), 'fecho no último alvo não anunciado')
  assert.ok(tudo.some((x) => x.k === 'announce' && x.event === 'closed'), 'desaparecimento não anunciado')

  // Guarda do motor em tempo real: conta em live → nenhuma ordem, mas a contabilidade continua.
  const c0 = cenarios[5]
  const vivo = await correr(actual, c0, { live: [`${MESTRE}:premium`] })
  assert.equal(vivo.filter((x) => x.k === 'modify' || x.k === 'close' || x.k === 'mirror').length, 0, 'conta em live: o monitor não pode mexer')
  assert.ok(vivo.some((x) => x.k === 'announce' && x.event === 'closed'), 'conta em live: o fecho continua a ser contabilizado')
  const outroTipo = await correr(actual, cenarios[0], { live: [`${MESTRE}:t2t`] })
  assert.deepEqual(outroTipo, await correr(original, cenarios[0]), 'live de OUTRO tipo não cala a gestão Premium')

  console.log(`paridade Premium: ${cenarios.length} cenários, ${accoes} acções iguais — todos certos`)
}

main().catch((e) => { console.error(e); process.exit(1) })

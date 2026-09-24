/**
 * PARIDADE T2T — o monitor de preço T2T ORIGINAL (git 8a81044) e o actual (que chama
 * lib/gestao-real/t2t.ts) fazem as mesmas chamadas: entry hit, parciais 50/30/20, BE no Exit 1,
 * BE cedo, ratchet do trailing, fecho no último alvo, pendentes descartadas, posições que
 * desaparecem, anúncios (chat + push) e o estado em site_settings.
 *
 *   npx tsx lib/gestao-real/__tests__/paridade-t2t.check.ts
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { RAIZ, empacotar, fonteDoGit, normalizar, primeiraDiferenca, type Registo } from './harness'
import { FALSOS_SITE } from './falsos-site'
import { ACC, cenarios, novoMundo, type Cenario, type Mundo } from './cenarios-t2t'

type Monitor = { runT2TPriceMonitor: () => Promise<{ managed: number; actions: string[] }> }
const FICHEIRO = 'lib/mtmcopy/t2t-price-monitor.ts'
const pasta = path.join(RAIZ, 'lib/mtmcopy')

async function correr(m: Monitor, c: Cenario, extra: Partial<Mundo> = {}): Promise<Registo[]> {
  const w: Mundo = { ...novoMundo(c), ...extra }
  ;(globalThis as { __P?: unknown }).__P = w
  for (const [i, passo] of c.passos.entries()) {
    passo.mundo?.(w)
    w.precos = { ...passo.precos }
    w.log.push({ k: 'passo', i })
    const r = await m.runT2TPriceMonitor()
    w.log.push({ k: 'fim', managed: r.managed, actions: r.actions })
  }
  w.log.push({ k: 'estado', db: w.db.site_settings })
  // O original (8a81044) gravava `t2t_monitor_state` em TODAS as passagens; desde o
  // commit 9043c1f7 («menos escritas na base») so se grava quando o estado muda.
  // A diferenca e intencional e tem teste proprio (estado-monitor), por isso a
  // paridade ignora as escritas INTERMEDIAS deste estado — o estado FINAL continua
  // a ser comparado no registo `estado` acima, que e o que de facto importa.
  const semEstadoIntermedio = w.log.filter(
    (r) =>
      !(
        r.k === 'db' &&
        r.t === 'site_settings' &&
        (r.p as { key?: string } | undefined)?.key === 't2t_monitor_state'
      ),
  )
  return normalizar(semEstadoIntermedio)
}

async function main() {
  const original = await empacotar<Monitor>({ codigo: fonteDoGit(FICHEIRO), pasta, falsos: FALSOS_SITE })
  const actual = await empacotar<Monitor>({ codigo: readFileSync(path.join(RAIZ, FICHEIRO), 'utf8'), pasta, falsos: FALSOS_SITE })
  let n = 0
  const tudo: Registo[] = []
  for (const c of cenarios) {
    const a = await correr(original, c)
    const b = await correr(actual, c)
    assert.deepEqual(b, a, `${c.nome}\n${primeiraDiferenca(a, b)}`)
    const k = a.filter((x) => x.k === 'modify' || x.k === 'close' || x.k === 'cancel' || x.k === 'push').length
    assert.ok(k > 0, `${c.nome}: nada exercitado`)
    n += k
    tudo.push(...b)
    console.log(`ok  ${c.nome} (${k} acções)`)
  }
  const acoes = tudo.filter((x) => x.k === 'fim').flatMap((x) => x.actions as string[]).join(' | ')
  for (const r of ['entry_hit', 'early_be', 'exit1', 'be_trail', 'trail ', 'exit2', 'exit3', 'discarded', 'closed', 'ilegível']) {
    assert.ok(acoes.includes(r), `nenhum cenário tocou «${r}»: ${acoes}`)
  }

  // Guarda: conta em live para T2T → o monitor não mexe na posição (as pendentes/fechos continuam).
  const vivo = await correr(actual, cenarios[0], { live: [`${ACC}:t2t`] })
  assert.equal(vivo.filter((x) => x.k === 'modify' || x.k === 'close').length, 0, 'conta em live: o monitor T2T não pode mexer')
  console.log(`paridade T2T: ${cenarios.length} cenários, ${n} acções iguais — todos certos`)
}

main().catch((e) => { console.error(e); process.exit(1) })

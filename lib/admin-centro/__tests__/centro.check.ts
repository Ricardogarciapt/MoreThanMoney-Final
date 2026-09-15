/**
 * Centro de Controlo MTM Auto (/admin/centro).
 *
 *  1. TODAS as rotas em app/api/admin/centro exportam só handlers embrulhados em soAdmin, e cada
 *     uma, chamada sem sessão (não-admin), responde 403 sem correr nada.
 *  2. Regras puras: percentis, séries, fontes, estados de fan-out, alertas, flag de transição.
 *  3. Cache: TTL, deduplicação de pedidos em curso, último valor bom quando a leitura falha.
 *  4. O ecrã nunca chama a MetaApi: nenhum ficheiro do Centro importa metaapi.ts / copyfactory.ts /
 *     metaApiFotografia (as acções usam acaoConta, que é o caminho guardado de sempre).
 *
 *   npx tsx lib/admin-centro/__tests__/centro.check.ts
 */
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { NextRequest } from 'next/server'
import { __tamanhoCache, emCache, esquecerCache } from '../cache'
import {
  derivarAlertas, erroActual, estadoFanout, fonteDoAlerta, fonteDoCanal, lerFlagPadrao, mercadoAberto, motivoEsperado,
  percentil, serieTemporal, tomIdade, type EntradaAlertas,
} from '../regras'

const andar = (d: string, fim: (f: string) => boolean, out: string[] = []) => {
  for (const f of readdirSync(d)) {
    const p = join(d, f)
    if (statSync(p).isDirectory()) andar(p, fim, out)
    else if (fim(f)) out.push(p)
  }
  return out
}

async function main() {
  // ── 1. rotas: estática + 403 real ──
  const raiz = join(process.cwd(), 'app/api/admin/centro')
  const rotas = andar(raiz, (f) => f === 'route.ts')
  assert.ok(rotas.length >= 10, `esperava ≥10 rotas, há ${rotas.length}`)
  for (const p of rotas) {
    const src = readFileSync(p, 'utf8')
    const metodos = [...src.matchAll(/export\s+(?:async\s+function|const|function)\s+(GET|POST|PUT|PATCH|DELETE)\b/g)].map((m) => m[1])
    assert.ok(metodos.length > 0, `${p}: sem handlers`)
    const guardados = [...src.matchAll(/export\s+const\s+(GET|POST|PUT|PATCH|DELETE)\s*=\s*soAdmin\(/g)].map((m) => m[1])
    assert.deepEqual(guardados.sort(), metodos.sort(), `${p}: há handlers sem soAdmin`)
  }
  let chamadas403 = 0
  for (const p of rotas) {
    const mod = (await import(p)) as Record<string, unknown>
    for (const m of ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']) {
      const h = mod[m] as ((req: NextRequest) => Promise<Response>) | undefined
      if (!h) continue
      const req = new NextRequest('http://localhost/api/admin/centro/x?id=site:tg:1&q=ab', {
        method: m, ...(m === 'GET' ? {} : { body: JSON.stringify({ acao: 'pausar_monitores', confirmacao: 'PAUSAR' }) }),
      })
      const r = await h(req)
      assert.equal(r.status, 403, `${p} ${m}: não-admin devia levar 403 e levou ${r.status}`)
      chamadas403++
    }
  }

  // ── 2. regras ──
  assert.equal(percentil([], 0.5), null)
  assert.equal(percentil([10, 20, 30, 40, 1000], 0.5), 30)
  assert.equal(percentil([10, 20, 30, 40, 1000], 0.95), 40)
  assert.equal(percentil([5], 0.95), 5)
  const agora = Date.UTC(2026, 8, 15, 12, 0, 0)
  assert.deepEqual(serieTemporal([agora - 10, agora - 3600_000 - 10, agora - 90_000_000], 3, 3600_000, agora), [0, 1, 1])
  assert.equal(tomIdade(null, 60, 180), 'grave')
  assert.equal(tomIdade(30, 60, 180), 'ok')
  assert.equal(tomIdade(90, 60, 180), 'aviso')
  assert.equal(fonteDoCanal('premium-signals'), 'premium')
  assert.equal(fonteDoCanal(null, 'Validação local · MTM Auto Premium mestre'), 'premium')
  assert.equal(fonteDoCanal('trade-ideas-setup', '🔵 XAUUSD BUY\n📡 PrimeVerse · kingfkg'), 'primeverse')
  assert.equal(fonteDoCanal('sinais-scanner-mtm'), 'mtmscanner')
  assert.equal(fonteDoAlerta('MTM Sensei X'), 'sensei')
  assert.equal(fonteDoAlerta('MTM Perps Aurum Flow'), 'aurum')
  assert.equal(fonteDoAlerta('GoldKiller'), 'goldkiller')
  assert.equal(estadoFanout('executed'), 'executado')
  assert.equal(estadoFanout('skipped'), 'saltado')
  assert.equal(estadoFanout('exit_2'), 'fechado')
  assert.ok(motivoEsperado('Your access is not active.'))
  assert.ok(motivoEsperado('There is not enough money to complete the request'))
  assert.ok(!motivoEsperado('The ws:getSymbols API allows 4320000 cpu credits per 6h'), 'quota é falha do sistema, não ruído')
  assert.equal(erroActual(null, null), null)
  assert.equal(erroActual('x', new Date(agora - 3600_000).toISOString(), agora), 'actual')
  assert.equal(erroActual('x', new Date(agora - 3 * 86_400_000).toISOString(), agora), 'velho')
  assert.equal(mercadoAberto(new Date(Date.UTC(2026, 8, 19, 12))), false, 'sábado fechado')
  assert.equal(mercadoAberto(new Date(Date.UTC(2026, 8, 20, 23))), true, 'domingo 23:00 UTC já abriu')
  assert.equal(mercadoAberto(new Date(Date.UTC(2026, 8, 20, 12))), false, 'domingo ao meio-dia fechado')
  assert.equal(mercadoAberto(new Date(Date.UTC(2026, 8, 16, 12))), true, 'quarta aberto')

  const base: EntradaAlertas = {
    agoraMs: agora, quotaBloqueioAte: null, supabaseMs: 80, pulsos: [], snapshots: [],
    exec1h: { total: 0, erros: 0, errosSistema: 0 }, latenciaP95Ms: null,
    copia: { pedidos: 0, live: 0, eventosPendentes: 0, motorLigado: false }, fantasmas: 0, premiumUltimoS: 60, mercadoAberto: true,
  }
  assert.deepEqual(derivarAlertas(base), [], 'tudo verde → sem alertas')
  const muitos = derivarAlertas({
    ...base, quotaBloqueioAte: agora + 5 * 60_000, supabaseMs: 2500,
    pulsos: [{ nome: 'copia-contas', idadeS: 600 }], snapshots: [{ conta: '530d2e07-x', idadeS: 400, sincronizado: true }],
    exec1h: { total: 10, erros: 5, errosSistema: 5 }, latenciaP95Ms: 15_000,
    copia: { pedidos: 2, live: 1, eventosPendentes: 500, motorLigado: true }, fantasmas: 3,
  })
  assert.equal(muitos[0].severidade, 'grave', 'graves primeiro')
  assert.equal(muitos[muitos.length - 1].severidade, 'info', 'info no fim')
  for (const id of ['quota', 'supabase', 'pulso:copia-contas', 'snap:530d2e07-x', 'erros1h', 'latencia', 'copia-live', 'copia-fila', 'fantasmas', 'copia-pedidos']) {
    assert.ok(muitos.some((a) => a.id === id), `falta o alerta ${id}`)
  }
  const sb = muitos.find((a) => a.id === 'supabase')!
  assert.deepEqual(sb.acoes[0].acao, { tipo: 'pausar_monitores', minutos: 10 })
  assert.equal(sb.acoes[0].confirmar, 'PAUSAR', 'acção de runbook exige confirmação')
  assert.ok(!derivarAlertas({ ...base, exec1h: { total: 10, erros: 8, errosSistema: 1 } }).some((a) => a.id === 'erros1h'), 'erros esperados (sem acesso/saldo) não disparam')
  assert.ok(!derivarAlertas({ ...base, premiumUltimoS: 99_999, mercadoAberto: false }).some((a) => a.id === 'premium-silencio'))

  assert.equal(lerFlagPadrao(undefined, undefined), false)
  assert.equal(lerFlagPadrao(false, undefined), false)
  assert.equal(lerFlagPadrao(true, undefined), true)
  assert.equal(lerFlagPadrao('true', undefined), true)
  assert.equal(lerFlagPadrao({ ligado: true }, undefined), true)
  assert.equal(lerFlagPadrao(false, '1'), true, 'env força')

  // ── 3. cache ──
  esquecerCache()
  let leituras = 0
  const lerDevagar = async () => { leituras++; await new Promise((r) => setTimeout(r, 20)); return leituras }
  const [a, b] = await Promise.all([emCache('t:x', 1000, lerDevagar), emCache('t:x', 1000, lerDevagar)])
  assert.equal(leituras, 1, 'pedidos simultâneos partilham uma leitura')
  assert.equal(a.v, b.v)
  assert.equal((await emCache('t:x', 1000, lerDevagar)).v, 1, 'dentro do TTL não relê')
  const velho = await emCache('t:x', 0, async () => { throw new Error('base em baixo') })
  assert.equal(velho.velho, true)
  assert.equal(velho.v, 1, 'falha devolve o último valor bom')
  await assert.rejects(emCache('t:nunca', 1000, async () => { throw new Error('x') }), 'sem valor bom, a falha propaga')
  esquecerCache('t:')
  assert.equal(__tamanhoCache(), 0)

  // ── 4. sem MetaApi no painel ──
  const ficheiros = [
    ...andar(join(process.cwd(), 'lib/admin-centro'), (f) => f.endsWith('.ts') && !f.endsWith('.check.ts')),
    ...rotas,
    ...andar(join(process.cwd(), 'components/admin/centro'), (f) => f.endsWith('.tsx') || f.endsWith('.ts')),
  ]
  for (const f of ficheiros) {
    const src = readFileSync(f, 'utf8')
    assert.doesNotMatch(src, /from ['"]@\/lib\/mtmcopy\/(metaapi|copyfactory|metaapi-admin|metaapi-cache)['"]/, `${f}: o Centro não chama a MetaApi`)
    assert.doesNotMatch(src, /metaApiFotografia|fetchMetaApiOverview/, `${f}: o Centro não lista a MetaApi`)
  }

  console.log(`centro: ${rotas.length} rotas guardadas, ${chamadas403} handlers → 403 sem admin, regras/cache/sem-MetaApi certos`)
}

void main().catch((e) => { console.error('✗', e instanceof Error ? e.message : e); process.exit(1) })

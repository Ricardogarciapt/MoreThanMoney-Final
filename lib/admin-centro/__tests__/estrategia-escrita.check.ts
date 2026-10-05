/**
 * F1 · CAMADA DE ESCRITA ÚNICA — paridade com as rotas antigas + a guarda de equipa.
 *   npx tsx lib/admin-centro/__tests__/estrategia-escrita.check.ts
 *
 * Paridade: para cada interruptor, escrever pela camada nova produz EXACTAMENTE o mesmo update (mesma
 * tabela, mesmo patch, mesmo filtro) que a rota antiga produzia. A regra antiga está COPIADA aqui tal
 * como estava nas rotas a 05/10 (`antiga*`) — se alguém mudar a nova, o teste diz onde divergiu.
 *
 * Caso MAU: um franchisado da equipa X tenta escrever numa estratégia da equipa Y → 403, e nada é escrito.
 */
import assert from 'node:assert/strict'
import { escreverEstrategia, type DepsEscrita } from '../servidor/estrategia-escrita'
import { alternarCanalExtra, configEspelho, decidirQuem, equipaDaVista, linhaGravavel, patchTrailing, podeDecidir, type QuemDecide } from '../estrategia-escrita-plano'

// ── as regras ANTIGAS, copiadas das rotas (05/10) ───────────────────────────
const antigaNum = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? n : null
}
function antigaTrailing(corpo: Record<string, unknown>, agora: string) { // app/api/admin/mtmcopy/trailing-estrategias POST
  const patch: Record<string, unknown> = { updated_at: agora }
  if (corpo.trailing_tempo_real !== undefined) patch.trailing_tempo_real = corpo.trailing_tempo_real === true
  if (corpo.trailing_arranca_pips !== undefined) patch.trailing_arranca_pips = antigaNum(corpo.trailing_arranca_pips)
  if (corpo.trailing_distancia_pips !== undefined) patch.trailing_distancia_pips = antigaNum(corpo.trailing_distancia_pips)
  if (corpo.trailing_passo_pips !== undefined) patch.trailing_passo_pips = antigaNum(corpo.trailing_passo_pips)
  return patch
}
function antigaConfigEspelho(c: Record<string, unknown>) { // app/api/admin/mtmfunded/espelho-provider POST config
  const sf = String(c.seguirFechos ?? 'humanos')
  return { seguirFechos: ['humanos', 'todos', 'nenhum'].includes(sf) ? sf : 'humanos', seguirParciais: c.seguirParciais === true, copiarNiveisIniciais: c.copiarNiveisIniciais !== false }
}
function antigoExtra(actuais: string[], canal: string, value: boolean) { // t2t-controls extra_channel
  const s = new Set(actuais); if (value) s.add(canal); else s.delete(canal); return [...s]
}

// ── base falsa que regista cada escrita ─────────────────────────────────────
type Escrita = { tabela: string; op: string; valor: unknown; filtros: Array<[string, string, unknown]> }
function baseFalsa(providers: Array<Record<string, unknown>>) {
  const escritas: Escrita[] = []
  const db = () => ({
    from(tabela: string) {
      const st: Escrita & { leitura: boolean } = { tabela, op: 'select', valor: null, filtros: [], leitura: true }
      const b: Record<string, unknown> = {}
      const encadear = (op: string) => (c: string, v: unknown) => { st.filtros.push([op, c, v]); return b }
      Object.assign(b, {
        select: () => b, limit: () => b, single: () => b, maybeSingle: () => b, order: () => b,
        eq: encadear('eq'), in: encadear('in'), ilike: encadear('ilike'), is: encadear('is'), neq: encadear('neq'),
        update: (v: unknown) => { st.op = 'update'; st.valor = v; st.leitura = false; return b },
        insert: (v: unknown) => { st.op = 'insert'; st.valor = v; st.leitura = false; return b },
        upsert: (v: unknown) => { st.op = 'upsert'; st.valor = v; st.leitura = false; return b },
        delete: () => { st.op = 'delete'; st.leitura = false; return b },
        then(res: (x: unknown) => unknown) {
          if (!st.leitura) { escritas.push({ tabela: st.tabela, op: st.op, valor: st.valor, filtros: st.filtros }); return Promise.resolve(res({ data: st.op === 'upsert' ? st.valor : null, error: null, count: 0 })) }
          let linhas = tabela === 'mtmauto_providers' ? providers : []
          for (const [op, c, v] of st.filtros) {
            if (op === 'eq') linhas = linhas.filter((l) => String(l[c]) === String(v))
            if (op === 'ilike') linhas = linhas.filter((l) => String(l[c]).toLowerCase() === String(v).toLowerCase())
          }
          return Promise.resolve(res({ data: linhas, error: null, count: 0 }))
        },
      })
      return b
    },
    rpc: () => Promise.resolve({ data: null, error: null }),
  })
  return { db: db as unknown as DepsEscrita['db'], escritas }
}

const X = '11111111-1111-4111-8111-111111111111'
const Y = '22222222-2222-4222-8222-222222222222'
const PX = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', slug: 'da-equipa-x', tenant_id: X, nome: 'X' }
const PY = { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', slug: 'da-equipa-y', tenant_id: Y, nome: 'Y', espelho_funded_account_id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' }
const CASA: QuemDecide = { adminId: 'admin', tudo: true, tenantId: null, origem: 'site' }
const FRANQ_X: QuemDecide = { adminId: 'franq', tudo: false, tenantId: X, origem: 'mtmauto' }

async function main() {
  // 1) puro: patches iguais aos antigos, caso a caso
  const agora = '2026-10-05T12:00:00.000Z'
  const corpos: Record<string, unknown>[] = [
    {}, { trailing_tempo_real: true }, { trailing_tempo_real: 'sim' }, { trailing_arranca_pips: '12.5' },
    { trailing_distancia_pips: 0 }, { trailing_passo_pips: -3 }, { trailing_arranca_pips: '' }, { trailing_distancia_pips: null },
    { trailing_tempo_real: false, trailing_arranca_pips: 20, trailing_distancia_pips: 'abc', trailing_passo_pips: 2 },
  ]
  for (const c of corpos) assert.deepEqual(patchTrailing(c, agora), antigaTrailing(c, agora), `trailing diverge para ${JSON.stringify(c)}`)
  for (const c of [{}, { seguirFechos: 'todos' }, { seguirFechos: 'xpto', seguirParciais: true }, { copiarNiveisIniciais: false }, { seguirParciais: 'true' }]) {
    assert.deepEqual(configEspelho(c), antigaConfigEspelho(c), `config espelho diverge para ${JSON.stringify(c)}`)
  }
  assert.deepEqual(alternarCanalExtra(['aurum-flow'], 'sensei-scanner', true), antigoExtra(['aurum-flow'], 'sensei-scanner', true))
  assert.deepEqual(alternarCanalExtra(['aurum-flow', 'sensei-scanner'], 'aurum-flow', false), antigoExtra(['aurum-flow', 'sensei-scanner'], 'aurum-flow', false))
  assert.equal(alternarCanalExtra([], 'ideias-e-sinais', true), null, 'canal fechado a 04/10 não se liga')

  // 2) pela camada: a MESMA escrita na base que a rota antiga fazia
  const semExternos: Partial<DepsEscrita> = {
    auditar: false,
    externos: { pausarCopyFactory: async () => {}, registar: async () => ({ ok: true }) },
  }
  {
    const f = baseFalsa([PX, PY])
    const corpo = { trailing_tempo_real: true, trailing_arranca_pips: '15', trailing_passo_pips: '' }
    const r = await escreverEstrategia(CASA, { accao: 'trailing', providerId: PX.id, ...corpo }, { ...semExternos, db: f.db })
    assert.equal(r.ok, true, r.mensagem)
    assert.equal(f.escritas.length, 1)
    const e = f.escritas[0]
    const { updated_at: _a, ...nova } = e.valor as Record<string, unknown>
    const { updated_at: _b, ...antiga } = antigaTrailing(corpo, agora)
    void _a; void _b
    assert.deepEqual({ tabela: e.tabela, op: e.op, patch: nova, filtros: e.filtros }, { tabela: 'mtmauto_providers', op: 'update', patch: antiga, filtros: [['eq', 'id', PX.id]] })
  }
  {
    const f = baseFalsa([PX, PY])
    const r = await escreverEstrategia(CASA, { accao: 'espelho', sub: 'ligar', slug: PY.slug, ativo: true }, { ...semExternos, db: f.db })
    assert.equal(r.ok, true, r.mensagem)
    assert.deepEqual(f.escritas, [{ tabela: 'mtmauto_providers', op: 'update', valor: { espelho_provider_ativo: true }, filtros: [['eq', 'id', PY.id]] }])
    const g = baseFalsa([PX, PY])
    const sem = await escreverEstrategia(CASA, { accao: 'espelho', sub: 'ligar', slug: PX.slug, ativo: true }, { ...semExternos, db: g.db })
    assert.equal(sem.status, 409, 'ligar o espelho sem conta é recusado como antes')
    assert.equal(g.escritas.length, 0)
  }
  {
    const f = baseFalsa([PX, PY])
    const c = { seguirFechos: 'todos', seguirParciais: true }
    await escreverEstrategia(CASA, { accao: 'espelho', sub: 'config', slug: PY.slug, config: c }, { ...semExternos, db: f.db })
    assert.deepEqual(f.escritas, [{ tabela: 'mtmauto_providers', op: 'update', valor: { espelho_config: antigaConfigEspelho(c) }, filtros: [['eq', 'id', PY.id]] }])
  }
  {
    // t2t-controls route_copy=false: config primeiro, depois o espelho em `ativo` pelos slugs da rota
    const f = baseFalsa([PX, PY])
    let gravada: Record<string, unknown> | null = null
    const ordem: string[] = []
    const r = await escreverEstrategia(CASA, { accao: 'rota_provider', routeId: 'canonical-sensei', campo: 'copia', value: false }, {
      ...semExternos, db: f.db,
      config: { ler: async () => ({ provider_routes: [{ id: 'canonical-sensei', enabled: true, tap_to_trade: true, account_id: 'acc', strategy_id: 'st' }] }), gravar: async (c) => { gravada = c; ordem.push('config') } },
      externos: { pausarCopyFactory: async () => { ordem.push('copyfactory') }, registar: async () => ({ ok: true }) },
    })
    assert.equal(r.ok, true, r.mensagem)
    const rota = ((gravada as unknown as { provider_routes: Array<{ id: string; enabled: boolean }> }).provider_routes).find((x) => x.id === 'canonical-sensei')
    assert.equal(rota?.enabled, false)
    assert.deepEqual(f.escritas.filter((e) => e.op === 'update'), [{ tabela: 'mtmauto_providers', op: 'update', valor: { ativo: false }, filtros: [['in', 'slug', ['sensei']]] }])
    assert.deepEqual(ordem, ['config', 'copyfactory'], 'o travão (config + ativo) agarra ANTES da CopyFactory')
  }

  // 3) caso MAU: franchisado X a escrever na Y → 403 e NENHUMA escrita
  for (const accao of ['trailing', 'opcoes', 'fonte', 'apagar', 'gravar', 'conta', 'registar', 'apagar_parando']) {
    const f = baseFalsa([PX, PY])
    const r = await escreverEstrategia(FRANQ_X, { accao, providerId: PY.id, linha: { id: PY.id, slug: 'x', nome: 'x' }, tipo: 'metaapi', campos: {}, trailing_tempo_real: true }, { ...semExternos, db: f.db })
    assert.equal(r.status, 403, `${accao}: franchisado X escreveu na equipa Y (status ${r.status})`)
    assert.equal(f.escritas.length, 0, `${accao}: houve escrita apesar do 403`)
  }
  // o motor da casa nem na equipa dele
  for (const accao of ['mestres', 'rota_provider', 'espelho', 'equipas', 'criar']) {
    const f = baseFalsa([PX, PY])
    const r = await escreverEstrategia(FRANQ_X, { accao, providerId: PX.id, routeId: 'canonical-sensei', campo: 'copia' }, { ...semExternos, db: f.db })
    assert.equal(r.status, 403, `${accao}: franchisado mexeu no motor da casa`)
    assert.equal(f.escritas.length, 0)
  }
  // e na SUA equipa passa
  {
    const f = baseFalsa([PX, PY])
    const r = await escreverEstrategia(FRANQ_X, { accao: 'trailing', providerId: PX.id, trailing_tempo_real: true }, { ...semExternos, db: f.db })
    assert.equal(r.ok, true, r.mensagem)
    assert.equal(f.escritas.length, 1)
  }
  // criar pela MTM Auto: a equipa é SEMPRE a do franchisado, diga o pedido o que disser
  assert.equal(linhaGravavel({ slug: 's', nome: 'n', tenant_id: Y, apagado_em: 'x', fonte_execucao: 'espelho' }, FRANQ_X, null).tenant_id, X)
  assert.equal('apagado_em' in linhaGravavel({ slug: 's', nome: 'n', apagado_em: 'x' }, CASA, null), false, 'a linha gravada não pode trazer apagado_em')
  assert.equal('fonte_execucao' in linhaGravavel({ slug: 's', nome: 'n', fonte_execucao: 'espelho' }, CASA, null), false, 'fonte_execucao só pela função da 084')
  // sem sessão / cliente
  assert.equal(podeDecidir(null, 'trailing', PX).ok, false)
  assert.equal(decidirQuem({ userId: 'u', adminDoSite: false, mtmauto: { papel: 'client' } }), null, 'cliente da MTM Auto não decide')
  assert.deepEqual(decidirQuem({ userId: 'u', adminDoSite: false, mtmauto: { papel: 'admin', tenant_id: X } }), FRANQ_X_COM('u'))
  assert.equal(decidirQuem({ userId: 'u', adminDoSite: false, mtmauto: { papel: 'admin', super_admin: true, tenant_id: X } })?.tudo, true)
  // a fronteira na LISTA: o franchisado não navega para outra equipa por parâmetro
  assert.deepEqual(equipaDaVista(FRANQ_X, Y), { todas: false, tenantId: X })
  assert.deepEqual(equipaDaVista(CASA, Y), { todas: false, tenantId: Y })
  console.log('estrategia-escrita: paridade trailing/espelho/rota/canal com as rotas antigas; franchisado X → 403 em Y e no motor da casa, sem escrita')
}
const FRANQ_X_COM = (u: string): QuemDecide => ({ adminId: u, tudo: false, tenantId: X, origem: 'mtmauto' })

main().catch((e) => { console.error(e); process.exit(1) })

/**
 * «Sincronizar tudo» e a tabela de estratégias com fotografias inventadas: órfãs, estratégias
 * mortas, ligações sem conta, duplicados, quota, rotas órfãs, 2.ª confirmação e CSV.
 *
 *   npx tsx lib/copia-contas/__tests__/sincronizacao.check.ts
 */
import assert from 'node:assert/strict'
import { gerarDiffSincronizacao, seleccionarAplicaveis, type FotografiasSync } from '../reconciliar'
import { montarEstrategias } from '../estrategias'
import { celulaCsv, paraCsv } from '../csv'

const U1 = 'user-1'
const U2 = 'user-2'
const F1 = 'aaaaaaaa-0000-0000-0000-00000000f001'

function base(): FotografiasSync {
  return {
    metaapi: [
      { id: 'acc-cliente', login: '1001', server: 'PUPrime-Live', state: 'DEPLOYED' },
      { id: 'acc-orfa-ligada', name: 'antiga', login: '9999', server: 'VT-Live', state: 'DEPLOYED' },
      { id: 'acc-orfa-parada', login: '8888', server: 'VT-Live', state: 'UNDEPLOYED' },
      { id: 'acc-provider', login: '700160095', server: 'PUPrime-Live', state: 'DEPLOYED' },
      { id: 'acc-auto', login: '2002', server: 'PUPrime-Live', state: 'DEPLOYED' },
    ],
    estrategiasCf: [{ id: 'MxsR', accountId: 'acc-provider', name: 'Premium' }],
    subscritoresCf: [
      { id: 'acc-cliente', subscriptions: [{ strategyId: 'MxsR' }, { strategyId: '9gsL' }] },
      { id: 'acc-fantasma', name: 'Infinox manual', subscriptions: [{ strategyId: 'MxsR' }] },
    ],
    site: [
      { id: 's1', user_id: U1, metaapi_account_id: 'acc-cliente', mt5_login: '1001', mt5_server: 'PUPrime-Live', mt5_status: 'connected', copyfactory_strategy_pick: 'MxsR' },
      { id: 's2', user_id: U1, metaapi_account_id: 'acc-apagada', mt5_login: '3003', mt5_server: 'PUPrime-Live', mt5_status: 'connected' },
      { id: 's3', user_id: U2, mt5_platform: 'tradelocker', mt5_status: 'connected', tl_account_id: '55' },
      { id: 's4', user_id: U1, mt5_status: 'disconnected', metaapi_account_id: 'acc-velha' },
      { id: 's5', user_id: U2, mt5_platform: 'mtmfunded', funded_account_id: 'nao-existe', mt5_status: 'connected' },
    ],
    auto: [
      { id: 'a1', user_id: U1, metaapi_account_id: 'acc-auto', login: '1001', servidor: 'puprime-live', plataforma: 'mt5', estado: 'connected' },
    ],
    webtrader: [],
    providers: [{ id: 'p1', slug: 'premium', ativo: true, metaapi_account_id: 'acc-provider' }, { id: 'p2', slug: 'velha', ativo: false }],
    subsAuto: [{ id: 'sa1', user_id: U1, provider_id: 'p2', ativo: true }, { id: 'sa2', user_id: U1, provider_id: 'p1', ativo: true }],
    contasFunded: new Set([F1]),
    credenciaisTl: new Set<string>(),
    rotas: [
      { id: 'r1', user_id: U1, origem_ref: `funded:${F1}`, destino_ref: 'site:s1', ativa: true, estado: 'aprovada' },
      { id: 'r2', user_id: U1, origem_ref: 'site:s-apagada', destino_ref: 'site:s1', ativa: true, estado: 'aprovada' },
    ],
    idsDeSistema: new Set(['acc-provider']),
    limitePorUser: new Map([[U1, 1]]),
  }
}

const d = gerarDiffSincronizacao(base())
const ids = d.correcoes.map((c) => c.id)
const tem = (id: string) => assert.ok(ids.includes(id), `falta ${id}\n  tem: ${ids.join(', ')}`)
const naoTem = (id: string) => assert.ok(!ids.includes(id), `não devia ter ${id}`)

// órfãs
tem('orfa:undeploy:acc-orfa-ligada')
tem('orfa:apagar:acc-orfa-ligada')
naoTem('orfa:undeploy:acc-orfa-parada') // parada não custa: só a proposta de apagar
tem('orfa:apagar:acc-orfa-parada')
naoTem('orfa:apagar:acc-provider') // conta de sistema
naoTem('orfa:apagar:acc-cliente')
assert.equal(d.correcoes.find((c) => c.id === 'orfa:apagar:acc-orfa-ligada')!.segundaConfirmacao, true)
assert.equal(d.correcoes.find((c) => c.id === 'orfa:undeploy:acc-orfa-ligada')!.segundaConfirmacao, false)

// sem conta / estratégia morta / fantasma
tem('sem_conta:mtmcopy_connections:s2')
naoTem('sem_conta:mtmcopy_connections:s4') // desligada
const morta = d.correcoes.find((c) => c.id === 'estrategia_morta:acc-cliente')!
assert.deepEqual(morta.acao, { tipo: 'remover_subscricoes_cf', subscriberId: 'acc-cliente', strategyIds: ['9gsL'] })
const fantasma = d.correcoes.find((c) => c.id === 'subscritor_sem_linha:acc-fantasma')!
assert.equal(fantasma.segundaConfirmacao, true)
tem('sub_auto_morta:sa1')
naoTem('sub_auto_morta:sa2')

// TradeLocker / Funded / rotas
tem('tl_sem_credenciais:s3')
tem('funded_inexistente:site:s5')
tem('rota_orfa:r2')
naoTem('rota_orfa:r1')

// duplicado (mesma conta física no site e no MTM Auto) e quota
const dup = d.correcoes.find((c) => c.categoria === 'duplicado')!
assert.ok(dup.detalhe.includes('site:s1') && dup.detalhe.includes('auto:a1'))
assert.equal(dup.acao.tipo, 'nenhuma')
tem(`quota:${U1}`)

// listagem MetaApi falhada: zero órfãs e zero «sem conta», com aviso
{
  const f = base()
  f.metaapi = null
  const x = gerarDiffSincronizacao(f)
  assert.equal(x.correcoes.filter((c) => c.categoria === 'orfa' && c.id.startsWith('orfa:')).length, 0)
  assert.equal(x.correcoes.filter((c) => c.categoria === 'sem_conta').length, 0)
  assert.ok(x.avisos.length >= 1)
}

// aplicar só o seleccionado, com a 2.ª confirmação
{
  const r = seleccionarAplicaveis(d, ['orfa:undeploy:acc-orfa-ligada', 'orfa:apagar:acc-orfa-ligada', `quota:${U1}`, 'nao-existe'], null)
  assert.deepEqual(r.aplicar.map((c) => c.id), ['orfa:undeploy:acc-orfa-ligada'])
  assert.equal(r.recusadas.length, 3)
  const r2 = seleccionarAplicaveis(d, ['orfa:apagar:acc-orfa-ligada'], 'APAGAR')
  assert.equal(r2.aplicar.length, 1)
}

// estratégias e divergências
{
  const f = base()
  const linhas = montarEstrategias({
    estrategiasCf: f.estrategiasCf, subscritoresCf: f.subscritoresCf, providers: [{ ...f.providers[0], nome: 'Premium' }],
    site: [
      { id: 's1', user_id: U1, metaapi_account_id: 'acc-cliente', mt5_status: 'connected', copyfactory_strategy_pick: 'MxsR', is_active: true },
      { id: 's6', user_id: U2, metaapi_account_id: 'acc-sem-sub', mt5_status: 'connected', copyfactory_strategy_pick: 'MxsR', is_active: true },
      { id: 's7', user_id: U2, metaapi_account_id: 'acc-fantasma', mt5_status: 'connected', copyfactory_strategy_pick: 'MxsR', is_active: false },
      { id: 's8', user_id: U2, metaapi_account_id: 'acc-t2t', mt5_status: 'connected', purpose: 'tap_to_trade', copyfactory_strategy_pick: 'MxsR' },
    ],
    auto: [{ id: 'a1', user_id: U1, login: '1', servidor: 's' }],
    subsAuto: [{ id: 'sa2', user_id: U1, provider_id: 'p1', conta_id: 'a1', ativo: true, modo_risco: 'pct', risco_pct: 1 }],
    funded: [{ id: F1, user_id: U2, segue_estrategia: 'premium', estado: 'ativa' }],
    contaAutoParada: (id) => id === 'a1',
  })
  const premium = linhas.find((l) => l.strategyId === 'MxsR')!
  assert.equal(premium.nome, 'Premium')
  const porRef = new Map(premium.seguidores.map((s) => [s.ref, s]))
  assert.deepEqual(porRef.get('site:s1')!.flags, [])
  assert.deepEqual(porRef.get('site:s6')!.flags, ['devia_copiar_nao_copia'])
  assert.deepEqual(porRef.get('site:s7')!.flags, ['pausada_mas_copia'])
  assert.equal(porRef.has('site:s8'), false) // T2T não segue estratégias CopyFactory
  assert.deepEqual(porRef.get('autosub:sa2')!.flags, ['conta_auto_parada'])
  assert.equal(porRef.get(`funded:${F1}`)!.plataforma, 'mtmfunded')
  const morta9 = linhas.find((l) => l.strategyId === '9gsL')!
  assert.equal(morta9.viva, false)
  assert.ok(morta9.flags.includes('copia_estrategia_morta'))
}

// CSV
assert.equal(celulaCsv('a;b'), '"a;b"')
assert.equal(celulaCsv('=HYPERLINK("x")'), `"'=HYPERLINK(""x"")"`)
assert.equal(celulaCsv(-1.5), '-1.5')
assert.ok(paraCsv(['a', 'b'], [{ a: 1, b: 'x' }]).endsWith('a;b\r\n1;x\r\n'))

console.log(`sincronizacao: ${d.correcoes.length} correcções geradas, todos certos`)

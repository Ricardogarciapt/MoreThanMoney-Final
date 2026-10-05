/**
 * REGISTAR PROVIDER NA CADEIA + CANAL → ESTRATÉGIA derivado (05/10).
 *
 * Prova, sem base: criar um provider de cada tipo (metaapi / telegram / mt5 / mtmfunded) com IO falso
 * produz mestre SIM + linha em mestres_estrategias (SOMBRA) + rotas sincronizadas + canal de chat; um
 * provider NOVO entra no mapa canal→estratégia sem mexer no código; o caso MAU (apagado, conta mestre
 * que falha, canal que falha) não deixa nada a meio sem dizer.
 *
 *   npx tsx lib/mestres/__tests__/registar-provider.check.ts
 */
import assert from 'node:assert/strict'
import { canalChatDoProvider, mapaCanalEstrategia } from '../canal-t2t'
import { validarProviderExterno } from '../provider-externo'
import { linhaMestreNova, registarProvider, type DepsRegistar, type ProviderParaRegistar } from '../servidor/registar-provider'
import { estrategiaDoSinalT2T } from '../t2t'

let n = 0
const ok = async (f: () => void | Promise<void>) => { await f(); n++ }

function depsFalsas(p: ProviderParaRegistar, opts: { mestreExiste?: boolean; canalExiste?: boolean; falharConta?: boolean; falharCanal?: boolean } = {}) {
  const escritas: Record<string, unknown[]> = { mestre: [], canal: [], contas: [], canalNoProvider: [], sincronizar: [] }
  const deps: DepsRegistar = {
    lerProvider: async () => p,
    lerMestre: async () => (opts.mestreExiste ? { conta_mestre_id: 'mestre-existente', modo: 'live' } : null),
    criarContaMestre: async () => { if (opts.falharConta) return { erro: 'sem dono' }; escritas.contas.push(p.slug); return { id: `sim-${p.slug}` } },
    inserirMestre: async (l) => { escritas.mestre.push(l); return null },
    sincronizarRotas: async (slug) => { escritas.sincronizar.push(slug); return { slug, aplicavel: true, criadas: 2, actualizadas: 1, retiradas: 0, ignorados: [], erros: [] } },
    canalExiste: async () => Boolean(opts.canalExiste),
    criarCanal: async (l) => { if (opts.falharCanal) return 'rls'; escritas.canal.push(l); return null },
    gravarCanalNoProvider: async (_id, c) => { escritas.canalNoProvider.push(c) },
  }
  return { deps, escritas }
}

async function main() {
  // ── validação dos dados mínimos por tipo (caso MAU primeiro) ──────────────
  await ok(() => {
    assert.equal(validarProviderExterno({ tipo: 'metaapi', metaapi_account_id: 'abc' }).ok, false)
    assert.equal(validarProviderExterno({ tipo: 'telegram', telegram_chat_id: '@canal' }).ok, false)
    assert.equal(validarProviderExterno({ tipo: 'mt5', login: '123', servidor: '' }).ok, false)
    assert.equal(validarProviderExterno({ tipo: 'mt5', login: '123', servidor: 'X-Live', password: '' }).ok, false)
    const m = validarProviderExterno({ tipo: 'metaapi', metaapi_account_id: '9dfb4df3-112d-4c7b-8d7d-b8cf97ca6fa6' })
    assert.ok(m.ok && m.linha.metaapi_account_id === '9dfb4df3-112d-4c7b-8d7d-b8cf97ca6fa6')
    const t = validarProviderExterno({ tipo: 'telegram', telegram_chat_id: '-1001234567890', telegram_chat_titulo: 'X' })
    assert.ok(t.ok && t.aviso && /no bot/i.test(t.aviso))
    const c = validarProviderExterno({ tipo: 'mt5', login: '77 123', servidor: 'PUPrime-Live', password: 's3cr3t' })
    assert.ok(c.ok && c.linha.login === '77123' && c.linha.mt5_estado === 'por_ligar' && c.passwordMt5 === 's3cr3t')
    assert.ok(!('password' in c.linha), 'a password nunca vai na linha em claro')
  })

  // ── cada tipo produz mestre + rotas + canal, tudo em sombra ───────────────
  for (const tipo of ['metaapi', 'telegram', 'mt5'] as const) {
    await ok(async () => {
      const p: ProviderParaRegistar = { id: `id-${tipo}`, slug: `nova-${tipo}`, nome: `Nova ${tipo}`, tipo }
      const { deps, escritas } = depsFalsas(p)
      const r = await registarProvider(p.id, deps)
      assert.equal(r.ok, true, JSON.stringify(r))
      assert.equal(escritas.contas.length, 1, 'cria a mestre SIM')
      const linha = escritas.mestre[0] as Record<string, unknown>
      assert.equal(linha.modo, 'sombra'); assert.equal(linha.sinal_modo, 'sombra'); assert.equal(linha.t2t_modo, 'sombra')
      assert.equal(linha.conta_mestre_id, `sim-nova-${tipo}`)
      assert.deepEqual(escritas.sincronizar, [`nova-${tipo}`])
      assert.equal(r.canal?.slug, `sinais-nova-${tipo}`)
      assert.equal(r.canal?.criado, true)
      assert.deepEqual(escritas.canalNoProvider, [`sinais-nova-${tipo}`])
    })
  }
  // mtmfunded: a própria conta ligada é a mestre (não cria outra)
  await ok(async () => {
    const p: ProviderParaRegistar = { id: 'id-f', slug: 'funded-x', nome: 'Funded X', tipo: 'mtmfunded', funded_account_id: 'conta-ligada' }
    const { deps, escritas } = depsFalsas(p)
    const r = await registarProvider(p.id, deps)
    assert.equal(r.ok, true)
    assert.equal(escritas.contas.length, 0)
    assert.equal(r.mestre?.contaMestreId, 'conta-ligada')
  })
  // idempotente: mestre e canal já existem → não cria, só ressincroniza
  await ok(async () => {
    const p: ProviderParaRegistar = { id: 'id-r', slug: 'sensei', nome: 'Sensei', tipo: 'mtmfunded', canal_chat: 'sensei-scanner' }
    const { deps, escritas } = depsFalsas(p, { mestreExiste: true, canalExiste: true })
    const r = await registarProvider(p.id, deps)
    assert.equal(r.ok, true)
    assert.equal(escritas.mestre.length, 0); assert.equal(escritas.canal.length, 0); assert.equal(escritas.canalNoProvider.length, 0)
    assert.equal(r.mestre?.modo, 'live', 'o modo que já existia não se mexe')
  })
  // casos MAUS: apagado / conta falha / canal falha
  await ok(async () => {
    const apagado: ProviderParaRegistar = { id: 'x', slug: 'x', nome: 'x', tipo: 'metaapi', apagado_em: '2026-09-23' }
    assert.equal((await registarProvider('x', depsFalsas(apagado).deps)).ok, false)
    const p: ProviderParaRegistar = { id: 'y', slug: 'y', nome: 'y', tipo: 'telegram' }
    const semConta = depsFalsas(p, { falharConta: true })
    const r1 = await registarProvider('y', semConta.deps)
    assert.equal(r1.ok, false); assert.equal(semConta.escritas.mestre.length, 0, 'sem mestre não se insere linha')
    const semCanal = depsFalsas(p, { falharCanal: true })
    const r2 = await registarProvider('y', semCanal.deps)
    assert.equal(r2.ok, false); assert.match(r2.erro ?? '', /canal/)
    assert.ok(r2.mestre, 'diz o que já ficou feito')
  })
  // a linha nova inclui as contas MTM Auto (rotas auto: em sombra) e nunca nasce live
  await ok(() => {
    const l = linhaMestreNova({ id: 'a', slug: 'a', nome: 'A', tipo: 'mt5' }, 'c')
    assert.equal(l.incluir_mtmauto, true); assert.equal(l.modo, 'sombra')
  })

  // ── canal → estratégia derivado: um provider novo entra ───────────────────
  await ok(() => {
    const provs = [
      { slug: 'sensei', fonte_mtm: 'sensei' }, { slug: 'premium-ouro', fonte_mtm: 'premium' },
      { slug: 'nova-metaapi', canal_chat: null }, { slug: 'apagada', canal_chat: 'sinais-apagada', apagado_em: '2026-09-29' },
      { slug: 'com-canal', canal_chat: 'Meu-Canal' },
    ]
    const mapa = mapaCanalEstrategia(provs)
    assert.equal(mapa['sinais-nova-metaapi'], 'nova-metaapi', 'provider novo entra')
    assert.equal(mapa['sensei-scanner'], 'sensei'); assert.equal(mapa['premium-ideas'], 'premium-ouro')
    assert.equal(mapa['sinais-goldkiller'], 'Goldkiller', 'fixo histórico fica enquanto ninguém o reclama')
    assert.equal(mapa['sinais-apagada'], undefined, 'apagado não reclama canal')
    assert.equal(mapa['meu-canal'], 'com-canal')
    assert.equal(estrategiaDoSinalT2T('sinais-nova-metaapi', 'XAUUSD BUY', mapa), 'nova-metaapi')
    assert.equal(estrategiaDoSinalT2T('sinais-nova-metaapi', 'XAUUSD BUY'), null, 'sem o mapa derivado o provider novo NÃO entra (o caso mau de antes)')
    assert.equal(canalChatDoProvider({ slug: 'Gold Killer 2' }), 'sinais-gold-killer-2')
  })

  console.log(`registar-provider: ${n} casos OK`)
}
main().catch((e) => { console.error(e); process.exit(1) })

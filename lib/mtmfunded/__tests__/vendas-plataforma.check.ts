/**
 * Venda MTM Funded em duas plataformas (MTM Funded simulado | MT5 corretora) + leitura barata MT5.
 *
 *   npx tsx lib/mtmfunded/__tests__/vendas-plataforma.check.ts
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  lerPlataforma, motorDaCompra, motorDaContinuacao, planoDaEmissao, plataformasAVenda,
  validarPlataformaDoCheckout, PRAZO_MT5_HORAS,
} from '../plataforma'
import {
  creditosPorDia, decidirVigia, deveParar, diaDaCorretora, resumirHistorico, QUOTA_6H_POR_CONTA,
  type EntradaVigia, type NegocioMt5,
} from '../leitura-mt5'
import {
  plataformasDoPrograma, precoDaPlataforma, precosLadoALado, temPrecoMtmFunded,
  validarPlataformaDoPrograma,
} from '../precos'

let ok = 0
function t(nome: string, f: () => void) {
  try { f(); ok++ } catch (e) { console.error(`✗ ${nome}\n  ${e instanceof Error ? e.message : e}`); process.exitCode = 1 }
}
const raiz = join(__dirname, '..', '..', '..')
const fonte = (p: string) => readFileSync(join(raiz, p), 'utf8')

const LANCADO = { sim_lancado_em: '2026-09-16T10:00:00Z', mt5_a_venda: true }
const POR_LANCAR = { sim_lancado_em: null, mt5_a_venda: true }

// ── checkout: o que está à venda ──────────────────────────────────────────────
t('antes do lançamento só MT5; depois MTM Funded primeiro (recomendada) e MT5', () => {
  assert.deepEqual(plataformasAVenda(POR_LANCAR), ['mt5'])
  assert.deepEqual(plataformasAVenda(LANCADO), ['mtmfunded', 'mt5'])
  assert.deepEqual(plataformasAVenda({ ...LANCADO, mt5_a_venda: false }), ['mtmfunded'])
  assert.deepEqual(plataformasAVenda({ sim_lancado_em: null, mt5_a_venda: false }), [])
  // Config antiga sem o campo: MT5 à venda.
  assert.deepEqual(plataformasAVenda({ sim_lancado_em: null }), ['mt5'])
})
t('validação no servidor: recusa o que não está à venda, nunca troca em silêncio', () => {
  assert.deepEqual(validarPlataformaDoCheckout('mtmfunded', LANCADO), { ok: true, plataforma: 'mtmfunded' })
  assert.deepEqual(validarPlataformaDoCheckout('mt5', LANCADO), { ok: true, plataforma: 'mt5' })
  assert.equal(validarPlataformaDoCheckout('mtmfunded', POR_LANCAR).ok, false)
  assert.equal(validarPlataformaDoCheckout('mt5', { ...LANCADO, mt5_a_venda: false }).ok, false)
  assert.equal(validarPlataformaDoCheckout('ctrader', LANCADO).ok, false)
  assert.deepEqual(validarPlataformaDoCheckout(undefined, LANCADO), { ok: true, plataforma: 'mtmfunded' })
  assert.deepEqual(validarPlataformaDoCheckout('', POR_LANCAR), { ok: true, plataforma: 'mt5' })
  assert.equal(lerPlataforma(' MT5 '), 'mt5')
})
t('rota do checkout: bloqueio iOS, valida a plataforma e envia-a nos metadados do Stripe', () => {
  const s = fonte('app/api/mtmfunded/checkout/route.ts')
  assert.match(s, /isIosAppRequest\(request\)/)
  assert.ok(s.indexOf('isIosAppRequest(request)') < s.indexOf('stripe.checkout.sessions.create'))
  assert.match(s, /validarPlataformaDoPrograma\(body\?\.plataforma, config, programa\)/)
  assert.match(s, /metadata: \{[\s\S]*?\n\s+plataforma,\n/)
})

// ── metadados → plano da emissão ──────────────────────────────────────────────
t('metadados mtmfunded → conta simulada activa, credenciais por link, sem fila', () => {
  const p = planoDaEmissao('mtmfunded', true)
  assert.deepEqual(p, { motor: 'sim', plataforma: 'mtmfunded', pedidoNaFila: false, enviarCredenciais: true, estadoInicial: 'ativa' })
})
t('metadados mt5 → pedido na fila do agente, mesmo depois do lançamento', () => {
  const p = planoDaEmissao('mt5', true)
  assert.deepEqual(p, { motor: 'mt5', plataforma: 'mt5', pedidoNaFila: true, enviarCredenciais: false, estadoInicial: 'pedida' })
})
t('compra paga como mtmfunded nasce simulada mesmo que a config mude (pagou por isso)', () => {
  assert.equal(motorDaCompra('mtmfunded', false), 'sim')
})
t('sessões antigas sem plataforma seguem o lançamento', () => {
  assert.equal(motorDaCompra(undefined, false), 'mt5')
  assert.equal(motorDaCompra('', true), 'sim')
})
t('o webhook usa o plano (e não a regra antiga do lançamento)', () => {
  const s = fonte('lib/mtmfunded/compra.ts')
  assert.match(s, /planoDaEmissao\(meta\.plataforma/)
  assert.doesNotMatch(s, /motorDeNovasContas\(\)/)
  assert.match(s, /if \(plano\.pedidoNaFila\) await db\.from\('mtm_account_requests'\)/)
  assert.match(s, /if \(plano\.enviarCredenciais\)/)
})

// ── continuações herdam ───────────────────────────────────────────────────────
t('fase 2 / financiada / renovação herdam o motor', () => {
  assert.equal(motorDaContinuacao({ motor: 'sim' }), 'sim')
  assert.equal(motorDaContinuacao({ motor: 'mt5' }), 'mt5')
  assert.equal(motorDaContinuacao({}), 'mt5')
  const s = fonte('lib/mtmfunded/ciclo-de-vida.ts')
  assert.equal((s.match(/motorDaContinuacao\((anterior|aprovado|conta)\) === 'sim'/g) ?? []).length, 3)
})
t('prazo MT5 prometido é 24 h', () => assert.equal(PRAZO_MT5_HORAS, 24))

// ── leitura MT5: dia da corretora e histórico ─────────────────────────────────
t('o dia da corretora vira às 22:00 UTC', () => {
  assert.equal(diaDaCorretora(Date.parse('2026-09-15T21:59:59Z')), '2026-09-15')
  assert.equal(diaDaCorretora(Date.parse('2026-09-15T22:00:00Z')), '2026-09-16')
})

const REGRAS = { perda_diaria_pct: 5, perda_maxima_pct: 10 }
const deal = (time: string, profit: number, type = 'DEAL_TYPE_SELL'): NegocioMt5 => ({ time, type, profit })

t('depósito inicial não dá quebra falsa e fixa a âncora do dia', () => {
  const r = resumirHistorico({
    saldoAtual: 3010, saldoInicial: 3000, agoraMs: Date.parse('2026-09-15T12:00:00Z'), regras: REGRAS,
    negocios: [deal('2026-09-15T08:00:00Z', 3000, 'DEAL_TYPE_BALANCE'), deal('2026-09-15T10:00:00Z', 10)],
    anterior: {},
  })
  assert.equal(r.quebra, null)
  assert.equal(r.saldoReferenciaDia, 3000)
  assert.deepEqual(r.lucroPorDia, { '2026-09-15': 10 })
  assert.equal(r.diasNegociados, 1)
  assert.equal(r.ultimoNegocioEm, '2026-09-15T10:00:00Z')
})
t('perda diária fechada a meio do dia é apanhada pelo histórico, mesmo com recuperação', () => {
  // Dia 14: começa 3000, perde 160 (−5,3%), recupera 200. Hoje (15) sem negócios.
  const r = resumirHistorico({
    saldoAtual: 3040, saldoInicial: 3000, agoraMs: Date.parse('2026-09-15T12:00:00Z'), regras: REGRAS,
    negocios: [deal('2026-09-14T09:00:00Z', -160), deal('2026-09-14T11:00:00Z', 200)],
    anterior: { ultimoNegocioEm: '2026-09-13T10:00:00Z', diaReferencia: '2026-09-13', saldoReferenciaDia: 3000 },
  })
  assert.equal(r.quebra?.motivo, 'perda_diaria')
  assert.equal(r.saldoReferenciaDia, 3040) // âncora de hoje = saldo com que o dia abriu
})
t('âncora já fixada hoje mantém-se; negócios antigos (≤ último visto) são ignorados', () => {
  const r = resumirHistorico({
    saldoAtual: 2950, saldoInicial: 3000, agoraMs: Date.parse('2026-09-15T15:00:00Z'), regras: REGRAS,
    negocios: [deal('2026-09-15T09:00:00Z', -999), deal('2026-09-15T14:00:00Z', -50)],
    anterior: { ultimoNegocioEm: '2026-09-15T09:00:00Z', diaReferencia: '2026-09-15', saldoReferenciaDia: 3000, lucroPorDia: { '2026-09-15': 0 } },
  })
  assert.equal(r.saldoReferenciaDia, 3000)
  assert.equal(r.quebra, null) // 2950 > 3000×0,95
  assert.deepEqual(r.lucroPorDia, { '2026-09-15': -50 })
})

// ── leitura MT5: agenda, quota, repouso ───────────────────────────────────────
const AGORA = Date.parse('2026-09-15T12:00:00Z')
const base: EntradaVigia = {
  agoraMs: AGORA, estadoMetaApi: 'DEPLOYED', inexistente: false, quotaBloqueada: false,
  minutosEntreLeituras: 60, lidaEmMs: AGORA - 20 * 60_000, diaReferencia: '2026-09-15',
  paradaPorNosEmMs: null, deployPedidoEmMs: null, donoPediuEmMs: null, horasVarredura: 24,
}
t('quota bloqueada / conta inexistente / listagem falhada → não lê nada', () => {
  assert.equal(decidirVigia({ ...base, quotaBloqueada: true }), 'saltar_quota')
  assert.equal(decidirVigia({ ...base, inexistente: true }), 'saltar_inexistente')
  assert.equal(decidirVigia({ ...base, estadoMetaApi: null }), 'saltar_sem_estado')
})
t('agenda: completa a cada 60 min ou quando o dia vira; entre elas só posições', () => {
  assert.equal(decidirVigia(base), 'posicoes')
  assert.equal(decidirVigia({ ...base, lidaEmMs: AGORA - 60 * 60_000 }), 'leitura_completa')
  assert.equal(decidirVigia({ ...base, lidaEmMs: null }), 'leitura_completa')
  assert.equal(decidirVigia({ ...base, diaReferencia: '2026-09-14' }), 'leitura_completa')
  assert.equal(decidirVigia({ ...base, forcarCompleta: true }), 'leitura_completa')
})
t('undeployed nunca é lida: deploy se foi a MetaApi a parar, repouso se fomos nós', () => {
  assert.equal(decidirVigia({ ...base, estadoMetaApi: 'UNDEPLOYED' }), 'deploy')
  const parada = { ...base, estadoMetaApi: 'UNDEPLOYED', paradaPorNosEmMs: AGORA - 3600_000, lidaEmMs: AGORA - 3600_000 }
  assert.equal(decidirVigia(parada), 'saltar_parada')
  assert.equal(decidirVigia({ ...parada, donoPediuEmMs: AGORA - 60_000 }), 'deploy')
  assert.equal(decidirVigia({ ...parada, paradaPorNosEmMs: AGORA - 25 * 3600_000, lidaEmMs: AGORA - 25 * 3600_000 }), 'deploy')
  assert.equal(decidirVigia({ ...parada, donoPediuEmMs: AGORA, deployPedidoEmMs: AGORA - 5 * 60_000 }), 'aguardar_deploy')
})
t('repouso só sem posições, 48 h sem negócios, e não nas 2 h a seguir ao dono', () => {
  const e = { agoraMs: AGORA, posicoesAbertas: 0, ultimoNegocioEmMs: AGORA - 49 * 3600_000, criadaEmMs: AGORA - 100 * 3600_000, horasOciosa: 48, donoPediuEmMs: null }
  assert.equal(deveParar(e), true)
  assert.equal(deveParar({ ...e, posicoesAbertas: 1 }), false)
  assert.equal(deveParar({ ...e, ultimoNegocioEmMs: AGORA - 47 * 3600_000 }), false)
  assert.equal(deveParar({ ...e, donoPediuEmMs: AGORA - 3600_000 }), false)
  assert.equal(deveParar({ ...e, ultimoNegocioEmMs: null, criadaEmMs: AGORA - 10 * 3600_000 }), false)
})
t('créditos por conta/dia bem abaixo da quota da MetaApi', () => {
  const dia = creditosPorDia({ minutosTick: 10, minutosCompleta: 60, horasComPosicoes: 8, negociosPorDia: 20 })
  assert.equal(dia, 12613)
  assert.ok(dia / 4 < QUOTA_6H_POR_CONTA * 0.1)
})
t('só REST: sem RPC, sem streaming, sem getSymbols; cron de 10 min registado', () => {
  const s = fonte('lib/mtmfunded/leitura-mt5-servidor.ts')
  for (const proibido of ['getRPCConnection', 'getRpcConnection', 'getStreamingConnection', 'getSymbols', 'metaapi.cloud-sdk']) {
    assert.ok(!s.includes(proibido), proibido)
  }
  assert.match(s, /leituraDeFundoBloqueada\(metaapiId\)/)
  assert.match(s, /contaInexistente\(metaapiId\)/)
  const crons = JSON.parse(fonte('vercel.json')).crons as Array<{ path: string; schedule: string }>
  assert.ok(crons.some((c) => c.path === '/api/cron/mtmfunded-mt5-vigia' && /^3,13,23,33,43,53 /.test(c.schedule)))
  assert.ok(crons.some((c) => c.path === '/api/cron/mtmfunded-metrics'))
})

// ── preço por plataforma (MTM Funded mais barata) ─────────────────────────────
const P3K1F = { preco_cents: 6900, preco_cents_mtmfunded: 4500, stripe_price_id: 'price_mt5_3k1f', stripe_price_id_mtmfunded: 'price_sim_3k1f' }
const SEM_SIM = { preco_cents: 6900, preco_cents_mtmfunded: null, stripe_price_id: 'price_mt5_3k1f' }

t('cada plataforma cobra o seu preço e o seu price id do Stripe', () => {
  assert.deepEqual(precoDaPlataforma(P3K1F, 'mt5'), { plataforma: 'mt5', cents: 6900, stripePriceId: 'price_mt5_3k1f', proprio: true })
  assert.deepEqual(precoDaPlataforma(P3K1F, 'mtmfunded'), { plataforma: 'mtmfunded', cents: 4500, stripePriceId: 'price_sim_3k1f', proprio: true })
  assert.deepEqual(precosLadoALado(P3K1F), { mt5: 6900, mtmfunded: 4500 })
  assert.ok(precoDaPlataforma(P3K1F, 'mtmfunded').cents < precoDaPlataforma(P3K1F, 'mt5').cents)
})
t('sem preço MTM Funded: plataforma escondida e preço do MT5 como recurso', () => {
  assert.equal(temPrecoMtmFunded(SEM_SIM), false)
  assert.deepEqual(plataformasDoPrograma(LANCADO, SEM_SIM), ['mt5'])
  assert.deepEqual(plataformasDoPrograma(LANCADO, P3K1F), ['mtmfunded', 'mt5'])
  assert.deepEqual(precosLadoALado(SEM_SIM), { mt5: 6900, mtmfunded: null })
  const r = precoDaPlataforma(SEM_SIM, 'mtmfunded')
  assert.deepEqual(r, { plataforma: 'mtmfunded', cents: 6900, stripePriceId: 'price_mt5_3k1f', proprio: false })
})
t('checkout: MTM Funded pedida sem preço é recusada; sem escolha fica o MT5', () => {
  assert.equal(validarPlataformaDoPrograma('mtmfunded', LANCADO, SEM_SIM).ok, false)
  assert.deepEqual(validarPlataformaDoPrograma(undefined, LANCADO, SEM_SIM), { ok: true, plataforma: 'mt5' })
  assert.deepEqual(validarPlataformaDoPrograma('mtmfunded', LANCADO, P3K1F), { ok: true, plataforma: 'mtmfunded' })
  assert.deepEqual(validarPlataformaDoPrograma(undefined, LANCADO, P3K1F), { ok: true, plataforma: 'mtmfunded' })
  assert.deepEqual(validarPlataformaDoPrograma('mt5', POR_LANCAR, P3K1F), { ok: true, plataforma: 'mt5' })
})
t('rotas usam o preço da plataforma, nunca o preco_cents à bruta', () => {
  const c = fonte('app/api/mtmfunded/checkout/route.ts')
  assert.match(c, /const preco = precoDaPlataforma\(programa, plataforma\)/)
  assert.match(c, /let cents = preco\.cents/)
  assert.match(c, /preco\.stripePriceId && !cupaoAplicado/)
  assert.doesNotMatch(c, /Number\(programa\.preco_cents\)/)
  const cup = fonte('app/api/mtmfunded/cupao/route.ts')
  assert.match(cup, /validarPlataformaDoPrograma\(body\?\.plataforma/)
  assert.doesNotMatch(cup, /Number\(programa\.preco_cents\)/)
})
t('a tabela de preços da migração 098 é a decidida pelo dono', () => {
  const sql = fonte('supabase/migrations/098_mtmfunded_precos_plataforma.sql')
  for (const [slug, cents] of [
    ['1k-1f', 1900], ['3k-1f', 4500], ['5k-1f', 6500], ['10k-1f', 10900], ['25k-1f', 19500],
    ['1k-2f', 1200], ['3k-2f', 2900], ['5k-2f', 3900], ['10k-2f', 6900], ['25k-2f', 12900],
    ['launch-10k-2f', 1000],
  ] as Array<[string, number]>) {
    assert.ok(sql.includes(`('${slug}', ${cents})`), `${slug} → ${cents}`)
  }
  // O MT5 não muda: a migração não toca em preco_cents nem em stripe_price_id.
  assert.doesNotMatch(sql, /set preco_cents =|stripe_price_id\s*=/)
})
t('script dos preços: simulação por defeito, nunca apaga nem mexe em subscrições', () => {
  const s2 = fonte('scripts/mtmfunded-precos-plataforma.ts')
  assert.match(s2, /const APLICAR = tem\('--aplicar'\)/)
  assert.match(s2, /if \(!APLICAR\)/)
  for (const proibido of ['prices.update', 'prices.del', 'products.del', 'subscriptions']) {
    assert.ok(!s2.includes(proibido), proibido)
  }
  assert.match(s2, /stripe\.prices\.create/)
})

console.log(`vendas-plataforma: ${ok} ok${process.exitCode ? ' — COM FALHAS' : ''}`)

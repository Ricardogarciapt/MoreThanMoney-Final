/**
 * Contas reais da casa (109, decisão do dono de 17/09):
 *   · o aviso diz «Conta MTM Funded · Conta de auditoria · negociação real» (as regras continuam
 *     desligadas); a análise de cliente continua simulada; a Funded de cliente continua «contém
 *     negociação real»; o email trata a conta como Funded (real);
 *   · 1K conta 1K; o espelho de 10K conta 1K; a conta-mestre que o espelho representa conta 0;
 *   · no relatório diário entram SÓ pela equidade — nunca no P&L/trades/win rate/profit factor
 *     que a lib/inspiring-metrics.ts publica.
 *
 *   npx tsx lib/mtmfunded/__tests__/contas-reais-casa.check.ts
 */
import assert from 'node:assert/strict'
import { avisoDaConta, avisoReal, chaveDoAviso } from '../aviso-conta'
import { translate } from '../../i18n/translate'
import { tipoDeEntrega, textosDaEntrega } from '../email-tipo-conta'
import { contaEntregaDaLinha } from '../entrega-conta-dados'
import { numerosDaConta, selecionarComOpcionais, COLUNAS_OPCIONAIS } from '../numeros-conta'
import { ehContaRealDaCasa } from '../conta-real-casa'
import { factorNaEquidade, planoDaEquidade, notaDoFactor, FACTOR_FUNDED } from '../../equidade-mtm'
import { agregarEquidadeCasa } from '../../equidade-casa'
import { linhaDeEquidade, totaisDoRelatorio, ligacaoEntraNasMetricas, type AccountDay } from '../../accounts-daily-report'

let ok = 0
async function t(nome: string, f: () => void | Promise<void>) {
  try { await f(); ok++ } catch (e) { console.error(`✗ ${nome}\n  ${e instanceof Error ? e.message : e}`); process.exitCode = 1 }
}

// As linhas como estão na base a 17/09 (sem regras, `analise` forçada pela 092).
const METRICAS_CASA = { analise: true, estrategia: 'sensei' }
const umK = { id: 'k1', tipo: 'financiada', estado: 'ativa', motor: 'sim', saldo_inicial: 1000, sim_saldo: 1062.5, sim_equity: 1062.5, metricas: METRICAS_CASA, conta_casa: true, conta_real_casa: true }
const t2t = { ...umK, id: 'k2', conta_casa: false } // a de T2T do dono não tem `conta_casa`
const espelho = { ...umK, id: 'e1', mt5_login: '77094082', saldo_inicial: 10000, sim_saldo: 10000, sim_equity: 10000 }
const clienteAnalise = { ...umK, id: 'c1', conta_casa: false, conta_real_casa: false }

async function main() {
  // ── 1. aviso do WebTrader ────────────────────────────────────────────────
  await t('conta real da casa (1K, 10K, T2T) → auditoria, negociação real', () => {
    for (const c of [umK, t2t, espelho]) {
      const a = avisoDaConta({ tipo: c.tipo, estado: c.estado, metricas: c.metricas, contaReal: ehContaRealDaCasa(c) })
      assert.equal(a, 'auditoria')
      assert.equal(avisoReal(a), true)
    }
  })
  await t('textos: auditoria (longo e curto), análise do Fábio e Funded de cliente', () => {
    assert.equal(translate(chaveDoAviso('auditoria'), 'pt'), 'Conta MTM Funded · Conta de auditoria · negociação real')
    assert.equal(translate(chaveDoAviso('auditoria', true), 'pt'), 'MTM Funded · Auditoria · real')
    assert.equal(translate(chaveDoAviso('auditoria'), 'en'), 'MTM Funded account · Audit account · real trading')
    // contas do Fábio: financiadas de análise sem a marca
    const fabio = avisoDaConta({ tipo: 'financiada', estado: 'ativa', metricas: { analise: true, estrategia: 'sensei' }, contaReal: false })
    assert.equal(translate(chaveDoAviso(fabio), 'pt'), 'Conta simulada educativa · MTM Funded · Conta de análise, não é negociação real')
    assert.equal(avisoReal(fabio), false)
    // Funded de cliente real (ex.: a MT5 de 3K, sem análise nem marca)
    const cliente = avisoDaConta({ tipo: 'financiada', estado: 'ativa', metricas: { equity: 3052.37 }, contaReal: false })
    assert.equal(translate(chaveDoAviso(cliente), 'pt'), 'Conta · MTM Funded · contém negociação real')
  })
  await t('conta de análise de cliente continua simulada', () => {
    assert.equal(avisoDaConta({ tipo: 'financiada', estado: 'ativa', metricas: METRICAS_CASA, contaReal: ehContaRealDaCasa(clienteAnalise) }), 'analise')
    // sem o campo (sessão antiga / migração por aplicar) → como antes
    assert.equal(avisoDaConta({ tipo: 'financiada', estado: 'ativa', metricas: METRICAS_CASA }), 'analise')
  })
  await t('conta real encerrada não diz «contém negociação real»', () => {
    assert.equal(avisoDaConta({ tipo: 'financiada', estado: 'cancelada', metricas: METRICAS_CASA, contaReal: true }), 'funded_encerrada')
  })
  await t('a marca só vale em contas financiadas (desafio/torneio/mestre não mudam)', () => {
    assert.equal(avisoDaConta({ tipo: 'desafio', estado: 'ativa', contaReal: true }), 'avaliacao')
    assert.equal(avisoDaConta({ tipo: 'provider', estado: 'ativa', contaReal: true }), 'mestre')
  })

  // ── 2. email de entrega ─────────────────────────────────────────────────
  await t('email: conta real da casa é Funded (real), mesmo com `analise`', () => {
    const c = contaEntregaDaLinha(umK, null, null, false)
    assert.equal(c.analise, true)
    assert.equal(c.contaReal, true)
    assert.equal(tipoDeEntrega(c), 'funded')
    assert.equal(textosDaEntrega(c, 'criacao', 'pt').real, true)
    assert.equal(tipoDeEntrega(contaEntregaDaLinha(clienteAnalise, null, null, false)), 'analise')
  })

  // ── 3. números do dono/admin: continua sem regras ─────────────────────────
  await t('numerosDaConta: contaReal e analise (sem regras) ao mesmo tempo', () => {
    const n = numerosDaConta(umK as never)
    assert.equal(n.contaReal, true)
    assert.equal(n.analise, true)
    assert.equal(numerosDaConta(clienteAnalise as never).contaReal, false)
  })

  await t('colunas opcionais: sem a 109 repete sem `conta_real_casa` e mantém as outras', async () => {
    const pedidas: string[] = []
    const r = await selecionarComOpcionais<{ id: string }>('id', async (cols) => {
      pedidas.push(cols)
      if (cols.includes('conta_real_casa')) return { data: null, error: { code: '42703', message: 'column mtm_trading_accounts.conta_real_casa does not exist' } }
      return { data: [{ id: 'x' }], error: null }
    })
    assert.deepEqual(r.data, [{ id: 'x' }])
    // Derivado de COLUNAS_OPCIONAIS em vez de escrito a mao: a expectativa estava
    // presa a 'id, pausada_em, conta_casa' e a migracao 113 acrescentou `etiqueta`,
    // o que punha o teste a falhar por estar desactualizado — nao por haver defeito.
    const esperado = `id, ${COLUNAS_OPCIONAIS.filter((c) => c !== 'conta_real_casa').join(', ')}`
    assert.equal(pedidas[1], esperado)
  })

  // ── 4. equidade ───────────────────────────────────────────────────────────
  await t('factor: 1K real = 100%; espelho real = 10%; mestre representada = 0%', () => {
    assert.equal(factorNaEquidade({ tipo: 'financiada', contaReal: true }), 1)
    assert.equal(factorNaEquidade({ tipo: 'financiada', contaReal: true, espelhoDe: 'sensei' }), FACTOR_FUNDED)
    assert.equal(factorNaEquidade({ tipo: 'provider', representadaPor: '77094082' }), 0)
    // o resto não muda
    assert.equal(factorNaEquidade({ tipo: 'financiada' }), FACTOR_FUNDED)
    assert.equal(factorNaEquidade({ tipo: 'provider' }), FACTOR_FUNDED)
    assert.equal(factorNaEquidade({ tipo: 'desafio', contaReal: true }), 0)
  })

  // Fotografia de 17/09 (4 estratégias ligadas + as mestres Edge/King/Wolf/Scanner sem espelho).
  const contas = [
    { id: 'esp-sensei', tipo: 'financiada', mt5_login: '77094082', conta_real_casa: true },
    { id: 'esp-premium', tipo: 'financiada', mt5_login: '77296149', conta_real_casa: true },
    { id: 'esp-aurum', tipo: 'financiada', mt5_login: '77579900', conta_real_casa: true },
    { id: 'esp-gk', tipo: 'financiada', mt5_login: '77235875', conta_real_casa: true },
    { id: 'k-sensei', tipo: 'financiada', mt5_login: '77917137', conta_real_casa: true },
    { id: 'k-todos', tipo: 'financiada', mt5_login: '77549217', conta_real_casa: true },
    { id: 'k-fabio', tipo: 'financiada', mt5_login: '77170533', conta_real_casa: false },
    { id: 'm-sensei', tipo: 'provider', provider_slug: 'sensei', metaapi_account_id: '78066d2d' },
    { id: 'm-premium', tipo: 'provider', provider_slug: 'premium-ouro', metaapi_account_id: 'a21178c2' },
    { id: 'm-aurum', tipo: 'provider', provider_slug: 'aurum-flow', metaapi_account_id: '166531ed' },
    { id: 'm-gk', tipo: 'provider', provider_slug: 'Goldkiller', metaapi_account_id: '3bab6541' },
    { id: 'm-edge', tipo: 'provider', provider_slug: 'mtm-auto-edge', metaapi_account_id: null },
    { id: 'm-scanner', tipo: 'provider', provider_slug: 'mtm-scanner', metaapi_account_id: '6bda9af4' },
  ]
  const estrategias = [
    { slug: 'sensei', metaapi_account_id: '78066d2d', espelho_funded_account_id: 'esp-sensei' },
    { slug: 'premium-ouro', metaapi_account_id: 'a21178c2', espelho_funded_account_id: 'esp-premium' },
    { slug: 'aurum-flow', metaapi_account_id: '166531ed', espelho_funded_account_id: 'esp-aurum' },
    { slug: 'Goldkiller', metaapi_account_id: '3bab6541', espelho_funded_account_id: 'esp-gk' },
    { slug: 'mtm-auto-edge', metaapi_account_id: null, espelho_funded_account_id: null },
    { slug: 'mtm-scanner', metaapi_account_id: '6bda9af4', espelho_funded_account_id: null },
  ]
  const plano = planoDaEquidade(contas, estrategias)
  const f = (id: string) => plano.get(id)!.factor

  await t('plano: espelhos a 10%, 1K reais a 100%, cliente a 10%', () => {
    for (const id of ['esp-sensei', 'esp-premium', 'esp-aurum', 'esp-gk']) assert.equal(f(id), 0.1, id)
    assert.equal(f('k-sensei'), 1)
    assert.equal(f('k-todos'), 1)
    assert.equal(f('k-fabio'), 0.1)
  })
  await t('sem dupla contagem: cada mestre com espelho real conta 0; as outras ficam a 10%', () => {
    for (const id of ['m-sensei', 'm-premium', 'm-aurum', 'm-gk']) assert.equal(f(id), 0, id)
    assert.equal(plano.get('m-sensei')!.representadaPor, '77094082')
    assert.equal(f('m-edge'), 0.1)
    assert.equal(f('m-scanner'), 0.1)
    // Cada estratégia ligada conta UMA vez, a 10% de 10K = 1K.
    const porEstrategia = (slug: string, espelhoId: string, mestreId: string) => 10_000 * f(espelhoId) + 10_000 * f(mestreId)
    assert.equal(porEstrategia('sensei', 'esp-sensei', 'm-sensei'), 1000)
  })
  await t('mestre só sai quando o espelho é real E está activo', () => {
    const semReal = planoDaEquidade(
      [{ id: 'esp', tipo: 'financiada', conta_real_casa: false }, { id: 'm', tipo: 'provider', provider_slug: 's' }],
      [{ slug: 's', espelho_funded_account_id: 'esp' }],
    )
    assert.equal(semReal.get('m')!.factor, 0.1)
    const inactivo = planoDaEquidade(
      [{ id: 'm', tipo: 'provider', provider_slug: 's' }], // o espelho não veio (não está activo)
      [{ slug: 's', espelho_funded_account_id: 'esp' }],
    )
    assert.equal(inactivo.get('m')!.factor, 0.1)
    // ligada só pelo id MetaApi (a mestre sem provider_slug) também sai
    const porMetaapi = planoDaEquidade(
      [{ id: 'esp', tipo: 'financiada', conta_real_casa: true }, { id: 'm', tipo: 'provider', metaapi_account_id: 'abc' }],
      [{ slug: 's', metaapi_account_id: 'abc', espelho_funded_account_id: 'esp' }],
    )
    assert.equal(porMetaapi.get('m')!.factor, 0)
  })
  await t('nota explica o factor', () => {
    assert.match(notaDoFactor(plano.get('m-sensei')!, 10000), /^0% .*espelho real 77094082/)
    assert.match(notaDoFactor(plano.get('k-sensei')!, 1062.5), /^100% .*conta real da casa/)
    assert.match(notaDoFactor(plano.get('esp-gk')!, 10060.49), /^10% .*espelho de Goldkiller/)
  })

  await t('equidade da casa (admin): 1K real a 100%, espelho a 10%', () => {
    const a = agregarEquidadeCasa([
      { id: '1', tipo: 'financiada', estrategia: 'sensei', saldo_inicial: 1000, sim_saldo: 1062.5, sim_equity: 1062.5, conta_real_casa: true },
      { id: '2', tipo: 'financiada', estrategia: null, saldo_inicial: 10000, sim_saldo: 10000, sim_equity: 10000, conta_real_casa: true, factor: 0.1 },
    ])
    assert.equal(a.total.contribuicao, 2062.5)
  })

  // ── 5. relatório diário / métricas de publicação ──────────────────────────
  await t('contas da casa entram SÓ pela equidade (nunca P&L, trades, win rate, profit factor)', () => {
    const casa = [
      { etiqueta: 'Real da casa · 77549217', metaapiId: null, valorNominal: 695.29, contribuicao: 695.29, nota: '100% de 695,29 — conta real da casa' },
      { etiqueta: 'Real da casa · 77094082', metaapiId: null, valorNominal: 10000, contribuicao: 1000, nota: '10% …' },
      { etiqueta: 'Mestre · sensei', metaapiId: '78066d2d', valorNominal: 10000, contribuicao: 0, nota: '0% …' },
    ].map(linhaDeEquidade)
    for (const l of casa) {
      assert.equal(l.pnlToday, 0); assert.equal(l.pnlMonth, 0)
      assert.equal(l.trades, null); assert.equal(l.winRatePct, null); assert.equal(l.profitFactor, null)
    }
    const corretora: AccountDay = { label: 'PU Prime', accountId: 'x', balance: 5000, equity: 5000, pnlToday: 42.5, pnlMonth: 300, trades: 80, winRatePct: 61, profitFactor: 1.5, ok: true }
    const so = totaisDoRelatorio([corretora])
    const com = totaisDoRelatorio([corretora, ...casa])
    assert.equal(com.pnlToday, so.pnlToday)
    assert.equal(com.pnlMonth, so.pnlMonth)
    assert.equal(com.trades, so.trades)
    assert.equal(com.equity, so.equity + 695.29 + 1000)
    // os filtros da lib/inspiring-metrics.ts (melhor conta: trades ≥ 20; win rate: trades ≥ 30) nunca as apanham
    assert.equal(casa.filter((a) => (a.profitFactor ?? 0) > 1.2 && (a.trades ?? 0) >= 20).length, 0)
    assert.equal(casa.filter((a) => (a.trades ?? 0) >= 30 && a.winRatePct != null).length, 0)
  })
  await t('ligação a conta MTM Funded nunca entra nas métricas MetaStats', () => {
    assert.equal(ligacaoEntraNasMetricas({ metaapi_account_id: null, funded_account_id: 'k-todos' }), false)
    assert.equal(ligacaoEntraNasMetricas({ metaapi_account_id: 'abc', funded_account_id: 'k-todos' }), false)
    assert.equal(ligacaoEntraNasMetricas({ metaapi_account_id: 'abc', funded_account_id: null }), true)
  })

  console.log(`\ncontas reais da casa: ${ok} ok`)
}
main().catch((e) => { console.error(e); process.exit(1) })

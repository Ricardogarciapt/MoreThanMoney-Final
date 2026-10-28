/**
 * A GUARDA DO AGENTE CRIPTO.
 *
 *   npx tsx lib/cripto/cripto.check.ts
 *
 * O que aqui se prova erra em silêncio e com dinheiro: um filtro de rug que deixa passar o que não
 * sabe, uma guarda que aceita o tamanho da IA, um envio de lucros que levanta capital de uma conta a
 * perder. Cada bloco é uma dessas portas.
 */
import { LIMITES_PADRAO, guardar, lerLimites, type EntradaGuarda } from './guarda'
import { atr, desequilibrioLivro, detectarGatilho, retratoDeVelas, rsi } from './indicadores'
import { inicioDaSessao, motivoDeFecho, planoVarredura, pnlUsd } from './papel'
import { avaliarRug } from './rug'
import { decisaoTrader, parecerApoio, parecerContexto, type ChamarIA } from './subagentes'
import { lerConfig, modoDoMercado } from './ciclo'
import { eScalp, emRegime, gatilhosScalp, simularScalp, sinaisScalp } from './scalp'
import type { DecisaoIA, Gatilho, Retrato, Vela } from './tipos'

const falhas: string[] = []
const teste = (nome: string, c: boolean) => { if (!c) falhas.push(nome) }

const AGORA = new Date('2026-10-28T12:00:00Z')

/* ── Indicadores ── */
const sobe = Array.from({ length: 30 }, (_, i) => 100 + i)
teste('rsi: só subidas = 100', rsi(sobe) === 100)
teste('rsi: sem velas = null', rsi([1, 2, 3]) === null)
const planas: Vela[] = Array.from({ length: 30 }, (_, i) => ({ t: i, o: 100, h: 101, l: 99, c: 100, v: 10 }))
teste('atr: vela de 2 de amplitude = 2', Math.abs((atr(planas) ?? 0) - 2) < 1e-9)
teste('livro: só compradores = 1', desequilibrioLivro({ bids: [[100, 1]], asks: [] }) === 1)

// Rompimento com volume: 21 velas planas e uma última acima do máximo com 3× volume.
const rompe: Vela[] = [...planas, { t: 99, o: 100, h: 104, l: 100, c: 103, v: 30 }]
const rRompe = retratoDeVelas({ ativo: 'BTCUSDT', mercado: 'perp', id: 'BTCUSDT', velas5m: rompe, agora: AGORA })!
const gRompe = detectarGatilho(rRompe, rompe)
teste('scanner: rompimento com volume dispara long', gRompe?.tipo === 'rompimento' && gRompe.lado === 'long')
teste('scanner: plano com SL abaixo e TP acima', !!gRompe && gRompe.sl < gRompe.entrada && gRompe.tp > gRompe.entrada)
teste('scanner: velas planas não disparam', detectarGatilho(retratoDeVelas({ ativo: 'X', mercado: 'perp', id: 'X', velas5m: planas, agora: AGORA })!, planas) === null)
const rMemeRug = { ...retratoDeVelas({ ativo: 'MEME', mercado: 'spot', id: 'mint', velas5m: rompe, agora: AGORA })!, rug: { aprovado: false, motivos: ['x'] } }
teste('scanner: memecoin chumbada no rug nunca dispara', detectarGatilho(rMemeRug, rompe) === null)

/* ── Filtro de rug ── */
const limpo = { mint: 'm', mintAuthorityAtiva: false, freezeAuthorityAtiva: false, top10Fraccao: 0.2, lpBloqueadaFraccao: 1, liquidezUsd: 200_000, idadeHoras: 72, impactoVendaPct: 1, rugcheckScore: 100 }
teste('rug: token limpo passa', avaliarRug(limpo).aprovado)
teste('rug: desconhecido conta contra', !avaliarRug({ mint: 'm' }).aprovado)
teste('rug: mint authority ativa chumba', !avaliarRug({ ...limpo, mintAuthorityAtiva: true }).aprovado)
teste('rug: honeypot (vender custa 40%) chumba', !avaliarRug({ ...limpo, impactoVendaPct: 40 }).aprovado)
teste('rug: baleias com 60% chumba', !avaliarRug({ ...limpo, top10Fraccao: 0.6 }).aprovado)
teste('rug: pool com 2 h chumba', !avaliarRug({ ...limpo, idadeHoras: 2 }).aprovado)

/* ── Guarda ── */
const retrato: Retrato = { ...rRompe, preco: 100, em: AGORA.toISOString() }
const gatilho: Gatilho = { tipo: 'rompimento', lado: 'long', ativo: 'BTCUSDT', mercado: 'perp', id: 'BTCUSDT', entrada: 100, sl: 97, tp: 105, porque: 't' }
const decisao = (p: Partial<DecisaoIA> = {}): DecisaoIA => ({
  action: 'LONG_PERP',
  execution_details: { leverage: 5, max_slippage_pct: 5 },
  rationale: { technical_trigger: 'rompimento', confidence_score: 0.8 },
  risk_check: { stop_loss_price: 97, take_profit_price: 105, is_within_safety_limits: true },
  ...p,
})
const base = (p: Partial<EntradaGuarda> = {}): EntradaGuarda => ({
  modo: 'papel', agora: AGORA, retrato, gatilho, decisao: decisao(), pareceres: [],
  conta: { capitalUsd: 1000, picoUsd: 1000, pnlHojeUsd: 0, abertas: [] },
  vantagem: { n: 30, aprovada: true, porque: 'ok' }, ...p,
})
const ok = guardar(base())
teste('guarda: caso limpo aprova', !!ok.ordem && ok.recusas.length === 0)
// Risco 1% de 1000 = 10 $; SL a 3% → 333,33 $ de nocional; margem máx 20%×3× = 600 → fica 333,33.
teste('guarda: tamanho pelo risco, não pela IA', ok.ordem?.nocionalUsd === 333.33)
teste('guarda: alavancagem cortada a 3 (a IA pediu 5)', ok.ordem?.alavancagem === 3)
teste('guarda: escorregamento cortado ao tecto dos perps', ok.ordem?.slippageMaxPct === LIMITES_PADRAO.slippageMaxPctPerp)
teste('guarda: sem JSON = HOLD', !guardar(base({ decisao: null })).ordem)
teste('guarda: HOLD não abre', !guardar(base({ decisao: decisao({ action: 'HOLD' }) })).ordem)
teste('guarda: acção contrária ao gatilho recusa', !guardar(base({ decisao: decisao({ action: 'SHORT_PERP' }) })).ordem)
teste('guarda: confiança 0,6 recusa', !guardar(base({ decisao: decisao({ rationale: { technical_trigger: 'x', confidence_score: 0.6 } }) })).ordem)
teste('guarda: dados com 6 min recusa', !guardar(base({ retrato: { ...retrato, em: new Date(AGORA.getTime() - 6 * 60_000).toISOString() } })).ordem)
teste('guarda: SL do lado errado recusa', !guardar(base({ decisao: decisao({ risk_check: { stop_loss_price: 103, take_profit_price: 105, is_within_safety_limits: true } }) })).ordem)
teste('guarda: RR 1 recusa', !guardar(base({ decisao: decisao({ risk_check: { stop_loss_price: 97, take_profit_price: 103, is_within_safety_limits: true } }) })).ordem)
teste('guarda: veto de um sub-agente recusa', !guardar(base({ pareceres: [{ agente: 'trader-apoio', favor: -1, nota: 'não', veto: true }] })).ordem)
teste('guarda: travão do dia (−25 $ em 1000) recusa', !guardar(base({ conta: { capitalUsd: 1000, picoUsd: 1000, pnlHojeUsd: -25, abertas: [] } })).ordem)
teste('guarda: drawdown de 15% recusa', !guardar(base({ conta: { capitalUsd: 850, picoUsd: 1000, pnlHojeUsd: 0, abertas: [] } })).ordem)
teste('guarda: mesma posição já aberta recusa', !guardar(base({ conta: { capitalUsd: 1000, picoUsd: 1000, pnlHojeUsd: 0, abertas: [{ ativo: 'BTCUSDT', mercado: 'perp', lado: 'long', nocionalUsd: 100, entrada: 1, sl: 1, tp: 1 }] } })).ordem)
teste('guarda: medido a perder recusa', !guardar(base({ vantagem: { n: 25, aprovada: false, porque: 'perde' } })).ordem)
const expl = guardar(base({ vantagem: { n: 3, aprovada: false, porque: 'curta' } }))
teste('guarda: amostra curta abre em exploração a 25%', expl.ordem?.exploracao === true && expl.ordem.nocionalUsd === 83.33)
teste('guarda: exploração desligada recusa amostra curta', !guardar(base({ vantagem: { n: 3, aprovada: false, porque: 'curta' }, limites: { ...LIMITES_PADRAO, exploracaoFraccao: 0 } })).ordem)
teste('guarda: sem capital recusa', !guardar(base({ conta: { capitalUsd: 0, picoUsd: 0, pnlHojeUsd: 0, abertas: [] } })).ordem)
const memeG: Gatilho = { ...gatilho, tipo: 'meme-momento', mercado: 'spot', ativo: 'MEME', id: 'mint', sl: 90, tp: 120 }
const memeOk = guardar(base({ gatilho: memeG, retrato: { ...retrato, mercado: 'spot', liquidezUsd: 100_000 }, decisao: decisao({ action: 'BUY_SPOT', risk_check: { stop_loss_price: 90, take_profit_price: 120, is_within_safety_limits: true } }) }))
teste('guarda: memecoin limitada a 5% do capital e alavancagem 1', memeOk.ordem?.nocionalUsd === 50 && memeOk.ordem.alavancagem === 1)
teste('guarda: memecoin sem liquidez recusa', !guardar(base({ gatilho: memeG, retrato: { ...retrato, mercado: 'spot', liquidezUsd: 5_000 }, decisao: decisao({ action: 'BUY_SPOT', risk_check: { stop_loss_price: 90, take_profit_price: 120, is_within_safety_limits: true } }) })).ordem)
teste('limites: alavancagem nunca acima de 5 por configuração', lerLimites({ alavancagemMax: 20 }).alavancagemMax === 5)

/* ── Contas e sessão ── */
const pos = { mercado: 'perp' as const, lado: 'long' as const, entrada: 100, nocionalUsd: 1000, sl: 97, tp: 105, abertaEm: AGORA.toISOString() }
teste('pnl: +5% em 1000 menos taxas ≈ 48,85', Math.abs(pnlUsd(pos, 105) - (50 - 0.55 - 0.5775)) < 1e-6)
teste('fecho: abaixo do SL = sl', motivoDeFecho(pos, 96, AGORA) === 'sl')
teste('fecho: acima do TP = tp', motivoDeFecho(pos, 106, AGORA) === 'tp')
teste('fecho: 49 h depois = tempo', motivoDeFecho(pos, 100, new Date(AGORA.getTime() + 49 * 3600_000)) === 'tempo')
teste('varredura: conta a perder não envia nada', planoVarredura({ capitalBaseUsd: 1000, equityUsd: 950, livreUsd: 950, minimoUsd: 10 }).enviarUsd === 0)
teste('varredura: envia só o lucro acima da base', planoVarredura({ capitalBaseUsd: 1000, equityUsd: 1080, livreUsd: 1080, minimoUsd: 10 }).enviarUsd === 80)
teste('varredura: com margem presa envia só o livre', planoVarredura({ capitalBaseUsd: 1000, equityUsd: 1080, livreUsd: 50, minimoUsd: 10 }).enviarUsd === 50)
teste('varredura: abaixo do mínimo não envia', planoVarredura({ capitalBaseUsd: 1000, equityUsd: 1005, livreUsd: 1005, minimoUsd: 10 }).enviarUsd === 0)
teste('varredura: sem base definida não envia', planoVarredura({ capitalBaseUsd: 0, equityUsd: 500, livreUsd: 500, minimoUsd: 10 }).enviarUsd === 0)
teste('sessão: 12:00 pertence à sessão das 00:00', inicioDaSessao(AGORA).toISOString() === '2026-10-28T00:00:00.000Z')
teste('sessão: fecho às 21 h, 12:00 pertence à de ontem às 21 h', inicioDaSessao(AGORA, 21).toISOString() === '2026-10-27T21:00:00.000Z')

/* ── Config ── */
teste('real só nas memecoins: perps continuam em papel', modoDoMercado(lerConfig({ modo: 'real', realMercados: ['spot'] }), 'perp') === 'papel' && modoDoMercado(lerConfig({ modo: 'real', realMercados: ['spot'] }), 'spot') === 'real')
teste('sem realMercados: real vale para os dois (como antes)', modoDoMercado(lerConfig({ modo: 'real' }), 'perp') === 'real')
teste('modo papel: nada é real', modoDoMercado(lerConfig({ modo: 'papel', realMercados: ['spot'] }), 'spot') === 'papel')
teste('config: desligado por omissão', lerConfig(null).ligado === false && lerConfig(null).modo === 'papel')
teste('config: símbolo estranho fica de fora', lerConfig({ perps: ['BTCUSDT', 'rm -rf'] }).perps.join() === 'BTCUSDT')

/* ── Scalping com os estudos (scalp.ts) ── */
{
  // Tendência limpa com recuos: dá cruzamentos de EMA e viragens, sem depender da rede.
  const vs: Vela[] = Array.from({ length: 700 }, (_, i) => {
    const base = 100 + i * 0.05 + Math.sin(i / 9) * 2
    return { t: 1_700_000_000_000 + i * 300_000, o: base, h: base + 0.4, l: base - 0.4, c: base + Math.sin(i / 3) * 0.2, v: 100 + (i % 7) * 10 }
  })
  const sinais = sinaisScalp(vs, 'BTCUSDT')
  teste('scalp: os estudos dão sinais numa série com tendência', sinais.length > 0)
  teste('scalp: todo o sinal tem SL e TP do lado certo', sinais.every((x) => (x.lado === 'long' ? x.sl < x.entrada && x.tp > x.entrada : x.sl > x.entrada && x.tp < x.entrada)))
  teste('scalp: cada estudo é um tipo de gatilho próprio', sinais.every((x) => eScalp(x.tipo)))
  const r0 = { ...retrato, preco: vs[vs.length - 1].c }
  const ao = gatilhosScalp(r0, vs)
  teste('scalp ao vivo: só sinais da ÚLTIMA vela fechada', ao.length === sinais.filter((x) => x.i === vs.length - 1).length)
  teste('scalp ao vivo: poucas velas = nada', gatilhosScalp(r0, vs.slice(0, 100)).length === 0)

  // Simulação: SL antes de TP na mesma vela, e os custos entram sempre.
  const velasSim: Vela[] = [
    { t: 0, o: 100, h: 100, l: 100, c: 100, v: 1 },
    { t: 1, o: 100, h: 103, l: 98, c: 100, v: 1 },
  ]
  const [tr] = simularScalp(velasSim, [{ tipo: 'scalp-goldkiller', i: 0, lado: 'long', entrada: 100, sl: 99, tp: 102 }], { mercado: 'perp', velasMax: 10, umaDeCadaVez: true })
  teste('simulação: SL e TP na mesma vela conta como SL', tr?.motivo === 'sl' && tr.pct < -1)
  const [tp] = simularScalp([velasSim[0], { t: 1, o: 100, h: 103, l: 99.5, c: 102, v: 1 }], [{ tipo: 'scalp-goldkiller', i: 0, lado: 'long', entrada: 100, sl: 99, tp: 102 }], { mercado: 'perp', velasMax: 10, umaDeCadaVez: true })
  teste('simulação: TP líquido fica abaixo dos 2% brutos (taxas)', tp?.motivo === 'tp' && tp.pct < 2 && tp.pct > 1.8)
  // Regime: 300 velas calmas e depois uma a abrir 5× o range → só a última está em regime.
  const calmas: (number | null)[] = Array.from({ length: 301 }, (_, i) => (i < 14 ? null : 1))
  calmas[300] = 3
  teste('regime: ATR 3× a mediana dispara', emRegime(calmas, 300, { k: 1.5, janela: 200 }))
  teste('regime: ATR normal não dispara', !emRegime(calmas, 299, { k: 1.5, janela: 200 }))
  teste('regime: sem 200 velas de história não dispara', !emRegime(calmas, 150, { k: 1.5, janela: 200 }))
  const comRegime = sinaisScalp(vs, 'BTCUSDT', undefined, { k: 0.5, janela: 200 })
  teste('regime: SL/TP passam a ser medidos no ATR (1,5 / 2,5)', comRegime.every((x) => Math.abs(Math.abs(x.tp - x.entrada) / Math.abs(x.entrada - x.sl) - 2.5 / 1.5) < 1e-6))
  teste('config scalp alta volatilidade: 5 voláteis, 1 min, k 1,5 por omissão', (() => { const c = lerConfig({}); return c.scalpVolateis === 5 && c.scalpTf === 1 && c.scalpRegimeK === 1.5 })())
  teste('config scalp: tf estranho volta a 1, voláteis no máximo 15', lerConfig({ scalpTf: 3, scalpVolateis: 99 }).scalpTf === 1 && lerConfig({ scalpVolateis: 99 }).scalpVolateis === 15)
  teste('config: scalping desligado por omissão', lerConfig({}).scalp === false && lerConfig({ scalp: true }).scalp === true)
  teste('config: estudo desconhecido fica de fora', lerConfig({ estudosScalp: ['scalp-sensei', 'xpto'] }).estudosScalp.join() === 'scalp-sensei')
}

/* ── Sub-agentes de IA (com IA falsa) ── */
const iaQue = (texto: string): ChamarIA => async () => ({ texto, fornecedor: 'groq', modelo: 'teste', custoCents: 0, emReserva: false, tentativas: [] })
const iaQueFalha: ChamarIA = async () => { throw new Error('429') }
async function sub() {
  teste('trader: prosa em vez de JSON = null', (await decisaoTrader(iaQue('compra já'), retrato, gatilho, [])) === null)
  teste('trader: JSON válido passa', (await decisaoTrader(iaQue(JSON.stringify(decisao())), retrato, gatilho, []))?.action === 'LONG_PERP')
  teste('trader: alavancagem 10 fora do esquema = null', (await decisaoTrader(iaQue(JSON.stringify(decisao({ execution_details: { leverage: 10, max_slippage_pct: 1 } }))), retrato, gatilho, [])) === null)
  teste('apoio: IA em baixo = veto', (await parecerApoio(iaQueFalha, retrato, gatilho, decisao(), [])).veto === true)
  teste('apoio: discorda = veto', (await parecerApoio(iaQue('{"concorda":false,"motivo":"funding alto"}'), retrato, gatilho, decisao(), [])).veto === true)
  teste('notícias: IA em baixo = veto', (await parecerContexto(iaQueFalha, retrato, [], [])).veto === true)
  teste('notícias: evento de risco = veto', (await parecerContexto(iaQue('{"sentimento":0,"evento_de_risco":true,"nota":"hack"}'), retrato, [], [])).veto === true)
}

sub().then(() => {
  if (falhas.length) {
    console.error(`✗ ${falhas.length} falha(s):\n  - ${falhas.join('\n  - ')}`)
    process.exit(1)
  }
  console.log('✓ agente cripto: indicadores, rug, guarda, contas, sessão e sub-agentes')
})

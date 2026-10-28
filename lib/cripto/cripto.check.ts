/**
 * A GUARDA DO AGENTE CRIPTO.
 *
 *   npx tsx lib/cripto/cripto.check.ts
 *
 * O que aqui se prova erra em silêncio e com dinheiro: um filtro de rug que deixa passar o que não
 * sabe, uma guarda que aceita o tamanho da IA, um envio de lucros que levanta capital de uma conta a
 * perder. Cada bloco é uma dessas portas.
 */
import { LIMITES_PADRAO, PREFIXO_SEM_IA, decisaoSemIA, guardar, iaEmBaixo, lerLimites, type EntradaGuarda } from './guarda'
import { atr, desequilibrioLivro, detectarGatilho, retratoDeVelas, rsi } from './indicadores'
import { inicioDaSessao, motivoDeFecho, planoVarredura, pnlUsd } from './papel'
import { LIMIARES_RUG_PUMP, avaliarRug } from './rug'
import { decisaoTrader, parecerApoio, parecerContexto, type ChamarIA } from './subagentes'
import { lerConfig, modoDoMercado } from './ciclo'
import { emParalelo } from './paralelo'
import { eScalp, emRegime, gatilhosScalp, simularScalp, sinaisScalp } from './scalp'
import { gatilhoCarteira, gatilhoMeme, retratoDeSnapshot } from './memes'
import { compradoresCedo, comprasDaTransacao, estadoDaCarteira, pontuar, retornoPct } from './carteiras'
import type { SnapshotMeme } from './fontes'
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
// Papel sem IA: decide o código, a guarda continua a mandar; no real nunca.
const semIA = decisaoSemIA(gatilho, 'papel')
teste('sem-IA: no REAL não há decisão de código', decisaoSemIA(gatilho, 'real') === null)
teste('sem-IA: em papel a acção e o plano são os do gatilho', semIA?.action === 'LONG_PERP' && semIA.risk_check.stop_loss_price === 97 && semIA.risk_check.take_profit_price === 105)
teste('sem-IA: em papel a guarda aprova com alavancagem 1', guardar(base({ decisao: semIA })).ordem?.alavancagem === 1)
teste('sem-IA: veto do filtro de rug continua a chumbar', !guardar(base({ decisao: semIA, pareceres: [{ agente: 'filtro-rug', favor: -1, nota: 'Freeze authority ativa.', veto: true }] })).ordem)
teste('sem-IA: reconhece o veto de IA em baixo e só esse', iaEmBaixo({ agente: 'noticias-sentimento', favor: 0, nota: 'IA indisponível (503).', veto: true }) && !iaEmBaixo({ agente: 'filtro-rug', favor: -1, nota: 'Liquidez baixa.', veto: true }))
teste('sem-IA: medido à parte na régua', PREFIXO_SEM_IA === 'sem-ia:')
teste('guarda: sem decisão por veto mostra o veto', guardar(base({ decisao: null, pareceres: [{ agente: 'filtro-rug', favor: -1, nota: 'Honeypot.', veto: true }] })).recusas.join() === 'Veto de filtro-rug: Honeypot.')
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

/* ── Memecoins pela DexScreener e carteiras espertas ── */
{
  const snap = (x: Partial<SnapshotMeme> = {}): SnapshotMeme => ({
    mint: 'Mint111pump', simbolo: 'TESTE', pool: 'Pool1', dexId: 'pumpswap', precoUsd: 0.001, liquidezUsd: 40_000, fdvUsd: 500_000, idadeHoras: 2,
    var5mPct: 6, var1hPct: 20, var24hPct: 80, vol5mUsd: 20_000, vol1hUsd: 60_000, compras5m: 120, vendas5m: 40, compras1h: 900, vendas1h: 500, social: [], ...x,
  })
  const g1 = gatilhoMeme(snap(), retratoDeSnapshot(snap()))
  teste('meme: Pump.fun graduado há 2 h a subir com compradores = pump-graduado', g1?.tipo === 'pump-graduado' && g1.lado === 'long')
  teste('meme: SL 10% e TP 18% (RR 1,8)', !!g1 && Math.abs(g1.sl / 0.001 - 0.9) < 1e-9 && Math.abs(g1.tp / 0.001 - 1.18) < 1e-9)
  teste('meme: ainda na curva da Pump.fun = nada', gatilhoMeme(snap({ dexId: 'pumpfun' }), retratoDeSnapshot(snap({ dexId: 'pumpfun' }))) === null)
  const velho = snap({ mint: 'Mint222', dexId: 'raydium', idadeHoras: 100 })
  teste('meme: fluxo comprador com volume 4× = meme-fluxo', gatilhoMeme(velho, retratoDeSnapshot(velho))?.tipo === 'meme-fluxo')
  const vendedores = snap({ mint: 'Mint333', dexId: 'raydium', idadeHoras: 100, compras5m: 30, vendas5m: 60 })
  teste('meme: vendedores a dominar = nada', gatilhoMeme(vendedores, retratoDeSnapshot(vendedores)) === null)
  teste('meme: retrato tem volume relativo e fluxo', Math.abs((retratoDeSnapshot(snap()).volumeRelativo ?? 0) - 4) < 1e-9 && Math.abs((retratoDeSnapshot(snap()).desequilibrioLivro ?? 0) - 0.5) < 1e-9)
  teste('rug pump: liquidez 20 k e 1 h passam, o resto igual', avaliarRug({ mint: 'x', rugcheckScore: 10, rugcheckRiscos: [], mintAuthorityAtiva: false, freezeAuthorityAtiva: false, top10Fraccao: 0.2, lpBloqueadaFraccao: 1, liquidezUsd: 20_000, idadeHoras: 1, impactoVendaPct: 2 }, LIMIARES_RUG_PUMP).aprovado)
  teste('rug pump: freeze authority continua a chumbar', !avaliarRug({ mint: 'x', rugcheckScore: 10, rugcheckRiscos: [], mintAuthorityAtiva: false, freezeAuthorityAtiva: true, top10Fraccao: 0.2, lpBloqueadaFraccao: 1, liquidezUsd: 20_000, idadeHoras: 1, impactoVendaPct: 2 }, LIMIARES_RUG_PUMP).aprovado)
  teste('carteira esperta: gatilho próprio fora da curva', gatilhoCarteira(snap(), retratoDeSnapshot(snap()), 'Carteira1111')?.tipo === 'carteira-esperta' && gatilhoCarteira(snap({ dexId: 'pumpfun' }), retratoDeSnapshot(snap()), 'C') === null)

  teste('espertas: 6 compras, 4 ganhas, média +12% = esperta', estadoDaCarteira(pontuar([30, 20, 15, 10, -8, 5])) === 'esperta')
  teste('espertas: poucas compras continua candidata', estadoDaCarteira(pontuar([50, 40])) === 'candidata')
  teste('espertas: 12 compras sem vantagem = descartada', estadoDaCarteira(pontuar(Array.from({ length: 12 }, (_, i) => (i % 2 ? 5 : -10)))) === 'descartada')
  teste('espertas: retorno limitado a [−100, 500]', retornoPct(1, 100) === 500 && retornoPct(1, 0) === -100 && retornoPct(0, 1) === null)
  const trades = [
    { kind: 'buy' as const, carteira: 'Cedo1', precoUsd: 0.0004, volumeUsd: 500, em: 't1' },
    { kind: 'buy' as const, carteira: 'Tarde', precoUsd: 0.0009, volumeUsd: 500, em: 't2' },
    { kind: 'buy' as const, carteira: 'Pequena', precoUsd: 0.0004, volumeUsd: 20, em: 't3' },
    { kind: 'sell' as const, carteira: 'Vendeu', precoUsd: 0.0004, volumeUsd: 500, em: 't4' },
  ]
  teste('espertas: descoberta só apanha quem comprou cedo e com dinheiro', compradoresCedo(trades, 0.001).map((x) => x.carteira).join() === 'Cedo1')
  const W = 'Carteira111'
  const tx = (x: Record<string, unknown> = {}) => ({
    meta: { err: null, fee: 5000, preBalances: [2e9], postBalances: [1.5e9], preTokenBalances: [], postTokenBalances: [{ mint: 'Token1', owner: W, uiTokenAmount: { uiAmount: 1000 } }], ...x },
    transaction: { message: { accountKeys: [{ pubkey: W }] } },
  })
  teste('espertas: pagou SOL e recebeu token = compra', comprasDaTransacao(tx(), W).map((c) => c.mint).join() === 'Token1')
  teste('espertas: recebeu sem pagar (airdrop) = não é compra', comprasDaTransacao(tx({ postBalances: [2e9 - 5000] }), W).length === 0)
  teste('espertas: transacção falhada = nada', comprasDaTransacao(tx({ err: { x: 1 } }), W).length === 0)
  teste('espertas: token de outra carteira = nada', comprasDaTransacao(tx(), 'Outra').length === 0)
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

async function paralelo() {
  let ativos = 0
  let pico = 0
  const r = await emParalelo([5, 1, 4, 2, 3], 2, async (x) => {
    ativos++
    pico = Math.max(pico, ativos)
    await new Promise((ok) => setTimeout(ok, x * 3))
    ativos--
    return x * 10
  })
  teste('paralelo: resultados na ordem dos itens', r.join() === '50,10,40,20,30')
  teste('paralelo: nunca mais do que n ao mesmo tempo', pico === 2)
  teste('paralelo: lista vazia', (await emParalelo([], 3, async (x) => x)).length === 0)
}

paralelo().then(sub).then(() => {
  if (falhas.length) {
    console.error(`✗ ${falhas.length} falha(s):\n  - ${falhas.join('\n  - ')}`)
    process.exit(1)
  }
  console.log('✓ agente cripto: indicadores, rug, guarda, contas, sessão e sub-agentes')
})

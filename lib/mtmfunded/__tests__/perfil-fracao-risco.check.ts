/**
 * GESTÃO EM FRACÇÃO DO RISCO (16/09) — «BE a 0,30R», nos DOIS motores que gerem uma posição:
 * `gestaoDoSinal` (motor simulado / sinais) e `decidirProvider` (contas mestre reais, gestao-real).
 *
 * O que estes testes protegem, e porquê:
 *
 *  1. PRECEDÊNCIA. A fracção do risco manda quando está definida; os pips ficam como recurso
 *     (fracção → pips → TP1). Escrito em `beFracaoDoRisco`, em lib/.../calculo.ts.
 *  2. O JSONB MANDA sobre as colunas antigas (`trailing_arranca_pips` e irmãs). Era ao contrário até
 *     16/09 — e isso queria dizer que escrever em `sinais_config` não conseguia DESLIGAR o que
 *     estava na coluna. As linhas REAIS da base (lidas a 16/09) estão aqui como fixtures.
 *  3. NADA MUDA em premium-ouro e sensei (perfil «zona», aprovado pelo dono) nem no GoldKiller
 *     de hoje. As fixtures são as linhas reais; os números esperados são os que o motor já dava.
 *  4. A UNIDADE. A mesma fracção dá a mesma gestão num ONDOUSDT a 0,39 $ e num BTCUSDT a 120 000 $ —
 *     que é exactamente o que 40 «pips» NÃO dão (`pipSizeForSymbol` devolve 1 para cripto: são 40
 *     unidades de PREÇO).
 *  5. O RISCO FIXA-SE. Depois do break-even o SL da corretora está na entrada; medir o risco ao SL
 *     de agora fazia «1R» valer a folga do BE.
 *
 *   npx tsx lib/mtmfunded/__tests__/perfil-fracao-risco.check.ts
 */
import assert from 'node:assert'
import { CONFIG_PADRAO, configDoProvider, gestaoDoSinal } from '../estrategias-sinais/calculo'
import {
  configProviderDaLinha, decidirProvider, temGestaoProvider, ESTADO_PROVIDER_NOVO,
  type EstadoProvider, type PosicaoProvider,
} from '../../gestao-real/provider'
import type { Simbolo } from '../simulado/matematica'

const XAU: Simbolo = { symbol: 'XAUUSD', classe: 'metal', digits: 2, contract_size: 100, pip_size: 0.1, spread_pontos: 18, comissao_lote: 0, volume_min: 0.01, volume_step: 0.01, volume_max: 20, alavancagem_max: 100 }
const ONDO: Simbolo = { ...XAU, symbol: 'ONDOUSDT', classe: 'cripto', contract_size: 1, pip_size: 0.0001, digits: 4 }
const BTC: Simbolo = { ...XAU, symbol: 'BTCUSDT', classe: 'cripto', contract_size: 1, pip_size: 0.01, digits: 2 }

// ── linhas REAIS de mtmauto_providers, lidas a 16/09 (só as colunas que a gestão lê) ─────────
const HOJE_PREMIUM = {
  slug: 'premium-ouro', ativo: true, apagado_em: null, be_gatilho: null,
  trailing_arranca_pips: null, trailing_distancia_pips: null, trailing_passo_pips: null, saidas_pct: null,
  sinais_config: { perfil: 'zona', beOffsetPips: 2, beGatilhoPips: 25, trailingPassoPips: 3, trailingInicioPips: 30, trailingDistanciaPips: 15 },
}
const HOJE_SENSEI = {
  slug: 'sensei', ativo: true, apagado_em: null, be_gatilho: 1,
  trailing_arranca_pips: '40', trailing_distancia_pips: null, trailing_passo_pips: null, saidas_pct: null,
  sinais_config: { perfil: 'zona', amostraFina: true, beOffsetPips: 2, beGatilhoPips: 35, trailingPassoPips: 4, trailingInicioPips: 40, trailingDistanciaPips: 20 },
}
const HOJE_GOLDKILLER = {
  slug: 'Goldkiller', ativo: true, apagado_em: null,
  trailing_arranca_pips: '40', trailing_distancia_pips: null, trailing_passo_pips: '20', saidas_pct: null, sinais_config: {},
}
const HOJE_AURUM = {
  slug: 'aurum-flow', ativo: true, apagado_em: null,
  trailing_arranca_pips: '40', trailing_distancia_pips: null, trailing_passo_pips: null, saidas_pct: null, sinais_config: {},
}

// ── o que a migração 105 escreve ─────────────────────────────────────────────────────────────
const DEPOIS_GOLDKILLER = {
  ...HOJE_GOLDKILLER,
  sinais_config: { perfil: 'risco', beFracaoDoRisco: 0.3, beOffsetFracaoDoRisco: 0.05 },
}
const DEPOIS_AURUM = {
  ...HOJE_AURUM,
  trailing_arranca_pips: null, // a migração limpa a coluna (os 40 eram 40 unidades de preço)
  sinais_config: { perfil: 'risco', beFracaoDoRisco: 0.75, beOffsetFracaoDoRisco: 0.05, trailingInicioFracaoDoRisco: 1, trailingFracaoDoRisco: 0.5 },
}

// ── 1. o perfil «zona» não se mexe: premium-ouro e sensei exactamente como estão ──────────────
{
  const p = configProviderDaLinha('premium-ouro', HOJE_PREMIUM)
  assert.deepEqual(
    [p.beGatilhoPips, p.beOffsetPips, p.trailingInicioPips, p.trailingDistanciaPips, p.trailingPassoPips],
    [25, 2, 30, 15, 3], 'premium-ouro 25/+2/30/15/3',
  )
  const s = configProviderDaLinha('sensei', HOJE_SENSEI)
  assert.deepEqual(
    [s.beGatilhoPips, s.beOffsetPips, s.trailingInicioPips, s.trailingDistanciaPips, s.trailingPassoPips],
    [35, 2, 40, 20, 4], 'sensei 35/+2/40/20/4',
  )
  // Nenhum dos dois ganhou fracções: continuam a decidir pelos pips, e o `be_gatilho = 1` do sensei
  // («BE no TP nº 1») continua a NÃO virar pips.
  for (const c of [p, s]) {
    assert.deepEqual([c.beFracaoDoRisco, c.beOffsetFracaoDoRisco, c.trailingInicioFracaoDoRisco], [null, null, null])
  }
  assert.notEqual(s.beGatilhoPips, 1)

  // E o comportamento tick a tick é o mesmo: BE aos 25 pips (+2) numa compra de ouro a 4000.
  const cfg = configProviderDaLinha('premium-ouro', HOJE_PREMIUM, 0)
  const pos: PosicaoProvider = { id: 'x', symbol: 'XAUUSD', type: 'POSITION_TYPE_BUY', openPrice: 4000, volume: 0.1, stopLoss: 3990 }
  let e: EstadoProvider = { ...ESTADO_PROVIDER_NOVO }
  const passo = (preco: number) => { const d = decidirProvider({ ...pos, currentPrice: preco }, cfg, e, 1_000); e = d.estado; return d }
  assert.equal(passo(4002.4).sl, null, 'premium: 24 pips ainda não arma')
  assert.equal(passo(4002.5).sl, 4000.2, 'premium: BE aos 25 pips fica em 4000,20 (+2 pips)')
  console.log('ok  perfil «zona» intacto: premium-ouro 25/+2/30/15/3 e sensei 35/+2/40/20/4')
}

// ── 2. o jsonb manda; as colunas antigas são o recurso ───────────────────────────────────────
{
  // Sem nada no jsonb, a coluna serve (é o GoldKiller de hoje: trailing a 40, passo 20, sem BE).
  const gk = configProviderDaLinha('goldkiller', HOJE_GOLDKILLER)
  assert.deepEqual([gk.trailingInicioPips, gk.trailingPassoPips, gk.beGatilhoPips], [40, 20, null])
  assert.equal(temGestaoProvider(gk), true, 'GoldKiller de hoje já é gerido (pelo trailing da coluna)')

  // Com o jsonb preenchido, é o jsonb que vale — mesmo quando a coluna diz outra coisa. É ESTE o
  // caso que estava invertido e que impedia a configuração nova do Aurum de vigorar.
  const conflito = configDoProvider({ trailing_arranca_pips: 40, trailing_distancia_pips: 99, trailing_passo_pips: 7, sinais_config: { trailingInicioPips: 12, trailingDistanciaPips: 6, trailingPassoPips: 1 } })
  assert.deepEqual([conflito.trailingInicioPips, conflito.trailingDistanciaPips, conflito.trailingPassoPips], [12, 6, 1], 'jsonb ganha à coluna')
  // …e sem jsonb continua a cair na coluna (nada do que já funcionava se perdeu).
  const soColuna = configDoProvider({ trailing_arranca_pips: 40, trailing_distancia_pips: 99, sinais_config: {} })
  assert.deepEqual([soColuna.trailingInicioPips, soColuna.trailingDistanciaPips], [40, 99])
  console.log('ok  precedência: jsonb manda, coluna antiga de recurso (sensei 40=40, GoldKiller inalterado)')
}

// ── 3. precedência da gestão: fracção do risco → pips → TP1 ──────────────────────────────────
{
  // Venda de ouro a 4418 com SL 4428: risco = 10,00 de preço (100 pips).
  const pedido = { simbolo: XAU, direcao: 'sell' as const, precoExecucao: 4418, volume: 0.01, sl: 4428, tps: [4415, 4412, 4409] }

  const porTp1 = gestaoDoSinal({ ...pedido, cfg: CONFIG_PADRAO })
  assert.deepEqual([porTp1.gestao.be_gatilho, porTp1.gestao.be_offset], [3, 0.2], 'sem nada: BE à distância do TP1')

  const porPips = gestaoDoSinal({ ...pedido, cfg: { ...CONFIG_PADRAO, beGatilhoPips: 25 } })
  assert.deepEqual([porPips.gestao.be_gatilho, porPips.gestao.be_offset], [2.5, 0.2], 'pips ganham ao TP1')

  const porFracao = gestaoDoSinal({ ...pedido, cfg: { ...CONFIG_PADRAO, beGatilhoPips: 25, beFracaoDoRisco: 0.3, beOffsetFracaoDoRisco: 0.05 } })
  assert.deepEqual([porFracao.gestao.be_gatilho, porFracao.gestao.be_offset], [3, 0.5], 'fracção ganha aos pips: 0,30×10 = 3,00 e folga 0,50')

  // Sem stop não há risco: a fracção não se pode resolver e cai-se nos pips (não fica sem gestão).
  const semSl = gestaoDoSinal({ ...pedido, sl: null, cfg: { ...CONFIG_PADRAO, beGatilhoPips: 25, beFracaoDoRisco: 0.3 } })
  assert.equal(semSl.gestao.be_gatilho, 2.5, 'sem SL a fracção cai nos pips')

  // A folga tem de ficar abaixo do gatilho (`validarGestao`, 072) — uma folga maior fecharia a
  // posição no instante em que o gatilho arma.
  const folgaAbsurda = gestaoDoSinal({ ...pedido, cfg: { ...CONFIG_PADRAO, beFracaoDoRisco: 0.3, beOffsetFracaoDoRisco: 0.9 } })
  assert.equal(folgaAbsurda.gestao.be_offset, 0, 'folga ≥ gatilho → zero')

  // Trailing: a fracção também manda sobre os pips e sobre a distância ao TP1.
  const tr = gestaoDoSinal({ ...pedido, cfg: { ...CONFIG_PADRAO, trailingInicioPips: 40, trailingInicioFracaoDoRisco: 1 } })
  assert.deepEqual([tr.gestao.trailing_ativacao, tr.gestao.trailing_distancia], [10, 5], 'trailing arranca a 1R (10,00) e segue a 0,5R (5,00)')
  console.log('ok  precedência da gestão: fracção do risco → pips → TP1 (BE e trailing)')
}

// ── 4. GoldKiller: BE a 0,30R, e o que muda em relação a hoje ────────────────────────────────
{
  const antes = configProviderDaLinha('goldkiller', HOJE_GOLDKILLER, 0)
  const depois = configProviderDaLinha('goldkiller', DEPOIS_GOLDKILLER, 0)
  assert.equal(antes.beGatilhoPips, null, 'hoje o GoldKiller não tem break-even nenhum')
  assert.deepEqual([depois.beFracaoDoRisco, depois.beOffsetFracaoDoRisco], [0.3, 0.05])
  // O trailing de hoje (coluna: arranca aos 40, passo 20) NÃO é mexido pela migração.
  assert.deepEqual([depois.trailingInicioPips, depois.trailingPassoPips], [40, 20], 'o trailing da coluna fica como está')

  // Compra de ouro a 4000 com SL 3990: risco 10,00 = 100 pips. BE a 0,30R = 30 pips; folga 0,05R = 5.
  const pos: PosicaoProvider = { id: 'g', symbol: 'XAUUSD', type: 'POSITION_TYPE_BUY', openPrice: 4000, volume: 0.1, stopLoss: 3990 }
  let e: EstadoProvider = { ...ESTADO_PROVIDER_NOVO }
  const passo = (preco: number) => { const d = decidirProvider({ ...pos, currentPrice: preco }, depois, e, 1_000); e = d.estado; return d }
  assert.equal(passo(4002.9).sl, null, '29 pips: ainda não')
  const be = passo(4003.0)
  assert.deepEqual([be.sl, be.motivo], [4000.5, 'be'], 'BE a 0,30R (30 pips) → stop na entrada +0,05R (5 pips)')

  // Hoje, com a mesma corrida, não acontecia nada até aos 40 pips do trailing.
  let e2: EstadoProvider = { ...ESTADO_PROVIDER_NOVO }
  assert.equal(decidirProvider({ ...pos, currentPrice: 4003 }, antes, e2, 1_000).sl, null, 'hoje aos 30 pips o GoldKiller não faz nada')
  console.log('ok  GoldKiller: BE a 0,30R arma aos 30 pips (risco 100) e põe o stop em +0,05R')
}

// ── 5. Aurum Flow: a unidade. A mesma fracção serve ONDO a 0,39 $ e BTC a 120 000 $ ──────────
{
  const cfgAntes = configProviderDaLinha('aurum-flow', HOJE_AURUM, 0)
  const cfgDepois = configProviderDaLinha('aurum-flow', DEPOIS_AURUM, 0)
  assert.equal(cfgAntes.trailingInicioPips, 40, 'hoje: 40 «pips» — que em cripto são 40 unidades de PREÇO')
  assert.equal(cfgDepois.trailingInicioPips, null, 'a coluna foi limpa: já não sobra nada em pips')
  assert.deepEqual([cfgDepois.beFracaoDoRisco, cfgDepois.trailingInicioFracaoDoRisco, cfgDepois.trailingFracaoDoRisco], [0.75, 1, 0.5])

  // O absurdo de hoje, medido: 40 unidades de preço.
  const ondoHoje: PosicaoProvider = { id: 'o', symbol: 'ONDOUSDT', type: 'POSITION_TYPE_BUY', openPrice: 0.39, volume: 100, stopLoss: 0.38, currentPrice: 0.78 }
  assert.equal(decidirProvider(ondoHoje, cfgAntes, { ...ESTADO_PROVIDER_NOVO }, 1_000).sl, null,
    'ONDO: nem a DOBRAR de preço o trailing de 40 unidades arma')
  const btcHoje: PosicaoProvider = { id: 'b', symbol: 'BTCUSDT', type: 'POSITION_TYPE_BUY', openPrice: 120_000, volume: 0.1, stopLoss: 118_000, currentPrice: 120_040 }
  assert.notEqual(decidirProvider(btcHoje, cfgAntes, { ...ESTADO_PROVIDER_NOVO }, 1_000).sl, null,
    'BTC: 40 unidades são 0,03% do preço — arma ao primeiro suspiro')

  // Com a fracção, os dois símbolos comportam-se IGUAL: BE a 0,75R do risco de cada um.
  const ondo = gestaoDoSinal({ simbolo: ONDO, direcao: 'buy', precoExecucao: 0.39, volume: 100, sl: 0.38, tps: [0.42], cfg: { ...CONFIG_PADRAO, beFracaoDoRisco: 0.75, beOffsetFracaoDoRisco: 0.05, trailingInicioFracaoDoRisco: 1 } })
  const btc = gestaoDoSinal({ simbolo: BTC, direcao: 'buy', precoExecucao: 120_000, volume: 0.1, sl: 118_000, tps: [126_000], cfg: { ...CONFIG_PADRAO, beFracaoDoRisco: 0.75, beOffsetFracaoDoRisco: 0.05, trailingInicioFracaoDoRisco: 1 } })
  // risco ONDO = 0,01 · risco BTC = 2 000. 0,75R, folga 0,05R, trailing a 1R e 0,5R de distância.
  assert.deepEqual([ondo.gestao.be_gatilho, ondo.gestao.be_offset, ondo.gestao.trailing_ativacao, ondo.gestao.trailing_distancia], [0.0075, 0.0005, 0.01, 0.005])
  assert.deepEqual([btc.gestao.be_gatilho, btc.gestao.be_offset, btc.gestao.trailing_ativacao, btc.gestao.trailing_distancia], [1500, 100, 2000, 1000])
  const emR = (g: { be_gatilho?: number | null; trailing_ativacao?: number | null }, risco: number) =>
    [Math.round((g.be_gatilho ?? 0) / risco * 100) / 100, Math.round((g.trailing_ativacao ?? 0) / risco * 100) / 100]
  assert.deepEqual(emR(ondo.gestao, 0.01), emR(btc.gestao, 2000), 'em R, ONDO e BTC são a MESMA gestão')
  console.log('ok  Aurum: 40 «pips» eram 40 unidades de preço; 0,75R vale o mesmo em ONDO e em BTC')
}

// ── 6. o risco fixa-se: depois do break-even, 1R continua a valer 1R ─────────────────────────
{
  const cfg = configProviderDaLinha('goldkiller', {
    ...HOJE_GOLDKILLER,
    trailing_arranca_pips: null, trailing_passo_pips: null,
    sinais_config: { beFracaoDoRisco: 0.3, beOffsetFracaoDoRisco: 0.05, trailingInicioFracaoDoRisco: 1, trailingFracaoDoRisco: 0.5 },
  }, 0)
  // Compra a 4000, SL 3990 (risco 100 pips). BE aos 30 pips põe o stop em 4000,50 — e é aí que o
  // risco medido «ao SL de agora» passaria a ser 5 pips: 1R de trailing armaria logo, a 2,5 pips.
  const pos: PosicaoProvider = { id: 'r', symbol: 'XAUUSD', type: 'POSITION_TYPE_BUY', openPrice: 4000, volume: 0.1, stopLoss: 3990 }
  let e: EstadoProvider = { ...ESTADO_PROVIDER_NOVO }
  const passo = (preco: number, sl: number) => { const d = decidirProvider({ ...pos, currentPrice: preco, stopLoss: sl }, cfg, e, 1_000); e = d.estado; return d }
  assert.equal(passo(4003, 3990).sl, 4000.5, 'BE a 0,30R')
  assert.equal(e.riscoPips, 100, 'o risco ficou fixado nos 100 pips de origem')
  // Agora o SL da corretora está em 4000,50 (é o que a MetaApi devolveria no tick seguinte).
  assert.equal(passo(4005, 4000.5).sl, null, 'aos 50 pips o trailing de 1R (100 pips) ainda NÃO arranca')
  const t = passo(4010, 4000.5)
  assert.deepEqual([t.sl, t.motivo], [4005, 'trailing'], 'aos 100 pips arranca e segue a 0,5R (50 pips)')
  console.log('ok  o risco fixa-se na origem: 1R depois do BE continua a ser 1R, não a folga do BE')
}

console.log('\nperfil em fracção do risco: todos certos')

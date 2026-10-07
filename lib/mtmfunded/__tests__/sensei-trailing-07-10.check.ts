/**
 * GESTÃO DO SENSEI desde 07/10/2026 — prova que a configuração gravada em
 * `mtmauto_providers.sinais_config` (provider 6de49c92, «MTM Auto Sensei») é a que chega às posições
 * da mestre e é a que o motor executa.
 *
 * Decisão do dono (07/10): mexer no trailing do Sensei. Estudo com velas de 1 min bid/ask (Dukascopy +
 * OANDA) sobre os 53 sinais de 07/09 a 07/10 (scripts/estudos/sensei-trailing-07-10/, local — scripts/
 * está no .gitignore): a vencedora,
 * nos dois períodos e nos dois modelos intra-vela, é
 *     BE a 0,75R (folga 0,2 USD) · trailing de 1R que arranca a +1R · parciais 50% TP1 / 25% TP2.
 * Era: BE a +3,5 USD · trailing de 2 USD a partir de +4 USD.
 *
 * O cano é um só: configDoProvider(linha) → gestaoDoSinal (gravado na posição em abrir.ts) →
 * decidirGestao (motor simulado, avancadas.ts). Este teste percorre-o com a linha EXACTA da base.
 *
 * REVERTER (uma linha, na base):
 *   update mtmauto_providers set sinais_config = (sinais_config - 'beFracaoDoRisco' - 'trailingInicioFracaoDoRisco' - 'trailingFracaoDoRisco' - 'gestaoAnterior') || (sinais_config->'gestaoAnterior') where id='6de49c92-1849-43c9-9ddd-1e45fcd57f63';
 *
 * Correr: npx tsx lib/mtmfunded/__tests__/sensei-trailing-07-10.check.ts
 */
import assert from 'node:assert/strict'
import { configDoProvider, gestaoDoSinal } from '../estrategias-sinais/calculo'
import { decidirGestao, GESTAO_VAZIA, type Gestao, type PosicaoGerida } from '../simulado/avancadas'
import type { Simbolo } from '../simulado/matematica'

const XAU: Simbolo = { symbol: 'XAUUSD', classe: 'metal', digits: 2, contract_size: 100, pip_size: 0.1, spread_pontos: 18, comissao_lote: 0, volume_min: 0.01, volume_step: 0.01, volume_max: 20, alavancagem_max: 100 }

// A linha como ficou na base a 07/10 (colunas antigas incluídas: `trailing_arranca_pips` = 40 continua
// lá e NÃO pode mandar — a fracção do risco tem precedência).
const LINHA_ACTUAL = {
  saidas_pct: null,
  trailing_arranca_pips: '40',
  trailing_distancia_pips: null,
  trailing_passo_pips: null,
  be_gatilho: 1,
  sinais_config: {
    perfil: 'zona', amostraFina: true, beOffsetPips: 2, trailingPassoPips: 4,
    beFracaoDoRisco: 0.75, trailingInicioFracaoDoRisco: 1, trailingFracaoDoRisco: 1,
    gestaoAnterior: { beGatilhoPips: 35, trailingInicioPips: 40, trailingDistanciaPips: 20, trocadaEm: '2026-10-07' },
  },
}

/** A reversão de uma linha, aplicada à mesma linha (o mesmo que o SQL do cabeçalho faz). */
function reverter(l: typeof LINHA_ACTUAL) {
  const { beFracaoDoRisco: _a, trailingInicioFracaoDoRisco: _b, trailingFracaoDoRisco: _c, gestaoAnterior, ...resto } = l.sinais_config
  void _a; void _b; void _c
  return { ...l, sinais_config: { ...resto, ...gestaoAnterior } }
}

// O sinal real de 07/10 08:00 (venda; a mestre entrou a 4132,53). Risco = 5,85 USD.
const pedido = (linha: Record<string, unknown>) => ({
  simbolo: XAU, direcao: 'sell' as const, precoExecucao: 4132.53, volume: 0.1,
  sl: 4138.38, tps: [4123.76, 4117.91, 4109.14, 4097.44], cfg: configDoProvider(linha),
})

// ── 1. A configuração nova é a que vai para a posição ─────────────────────────────────────
const cfg = configDoProvider(LINHA_ACTUAL)
assert.equal(cfg.beFracaoDoRisco, 0.75)
assert.equal(cfg.trailingInicioFracaoDoRisco, 1)
assert.equal(cfg.trailingDistanciaPips, null, 'sem distância em pips: a distância vem da fracção do risco')
assert.equal(cfg.trailingFracaoDoRisco, 1)
const { gestao: g, tpFinal } = gestaoDoSinal(pedido(LINHA_ACTUAL))
const risco = 5.85
assert.ok(Math.abs((g.be_gatilho ?? 0) - 0.75 * risco) < 0.011, `BE a 0,75R (${g.be_gatilho})`)
assert.equal(g.be_offset, 0.2, 'folga do BE: 2 pips')
assert.ok(Math.abs((g.trailing_ativacao ?? 0) - risco) < 0.011, `trailing arranca a +1R (${g.trailing_ativacao})`)
assert.ok(Math.abs((g.trailing_distancia ?? 0) - risco) < 0.011, `trailing de 1R (${g.trailing_distancia})`)
assert.deepEqual(g.tps?.map((t) => t.pct), [50, 25], 'parciais 50% no TP1 e 25% no TP2')
assert.equal(tpFinal, 4097.44, 'o resto fecha no TP4')

// ── 2. O motor executa esses números (decidirGestao, o mesmo que corre na VPS) ────────────
const gestao: Gestao = { ...GESTAO_VAZIA, ...g, be_offset: g.be_offset ?? 0, be_feito: false, volume_inicial: 0.1 } as Gestao
const pos: PosicaoGerida = { id: 'p', symbol: 'XAUUSD', direcao: 'sell', volume: 0.1, preco_entrada: 4132.53, sl: 4138.38, tp: 4097.44, gestao }
const precos = (ask: number) => ({ XAUUSD: { symbol: 'XAUUSD', bid: ask - 0.2, ask } })
// +3,5 USD a favor: com a gestão antiga já era BE e trailing a 2 USD; agora ainda nada.
let d = decidirGestao(pos, XAU, precos(4129.0).XAUUSD, precos(4129.0))
assert.equal(d.novoSl, null, 'a +3,5 USD (0,6R) ainda não há BE nem trailing')
// +4,5 USD (0,77R): BE.
d = decidirGestao(pos, XAU, precos(4128.0).XAUUSD, precos(4128.0))
assert.equal(d.motivoSl, 'break_even')
assert.equal(d.novoSl, 4132.33)
// TP1 (4123,76): parcial de 50% e o trailing já armado a 1R do preço.
const posBe = { ...pos, sl: 4132.33, gestao: { ...gestao, be_feito: true } }
d = decidirGestao(posBe, XAU, precos(4123.7).XAUUSD, precos(4123.7))
assert.equal(d.parciais.length, 1)
assert.equal(d.motivoSl, 'trailing')
assert.ok(Math.abs((d.novoSl ?? 0) - (4123.7 + risco)) < 0.011, `trailing a 1R do preço (${d.novoSl})`)

// ── 3. A reversão de uma linha devolve exactamente a gestão antiga ────────────────────────
const antiga = gestaoDoSinal(pedido(reverter(LINHA_ACTUAL))).gestao
assert.equal(antiga.be_gatilho, 3.5)
assert.equal(antiga.trailing_ativacao, 4)
assert.equal(antiga.trailing_distancia, 2)

console.log('sensei-trailing-07-10: a configuração da base chega à posição e ao motor; a reversão repõe a antiga ✓')

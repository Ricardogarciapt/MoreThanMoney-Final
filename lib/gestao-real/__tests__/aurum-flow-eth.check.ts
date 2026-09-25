/**
 * AURUM FLOW EM ETH — porque é que a gestão de hoje corta os ganhadores.
 *
 *   npx tsx lib/gestao-real/__tests__/aurum-flow-eth.check.ts
 *
 * O QUE ESTE FICHEIRO GUARDA (medido a 2026-09-24, ver o relatório do dia)
 * Entre 16/09 e 22/09 os MESMOS nove sinais de ETH do Aurum Flow correram em duas contas ao
 * mesmo tempo: a mestre (`1513604e…`, com a gestão de `sinais_config`) e um espelho sem gestão
 * nenhuma (`b95fec8f…`, só SL e TP do sinal). Nos seis sinais comuns às duas:
 *
 *   mestre (BE 0,75R · trailing arranca a 1R, a 0,5R de distância) ...... −0,83R
 *   espelho sem gestão (SL e TP1 do sinal, mais nada) .................. +1,67R
 *
 * A diferença está TODA nos dois ganhadores: o espelho levou-os ao TP1 (+2,50R e +2,99R), a
 * mestre saiu deles a +0,32R e +1,35R. Os perdedores perderam 1R nas duas — o BE aos 0,75R nunca
 * os apanha, porque morrem com picos de 0,06R a 0,21R.
 *
 * A CAUSA, e é geométrica: o TP1 do ORB em ETH está a 2,4–3,0R da entrada, e o trailing anda a
 * 0,5R do preço. O recuo normal de uma vela M30 de ETH é maior do que meio risco, por isso o stop
 * é tocado a caminho do alvo — todas as vezes, e sempre antes de o alvo pagar.
 *
 * O QUE ISTO TESTA
 * Não é história: é o motor. Dá-se ao `decidirProvider` real um caminho de preço com a forma do
 * que foi medido (sobe a 1,85R, recua meio risco, e só depois vai ao TP1 a 2,99R) e pergunta-se
 * onde é que cada configuração põe o stop. A de hoje sai no recuo; a proposta aguenta e chega ao
 * alvo. Se alguém mexer no motor e isto deixar de ser verdade, este ficheiro grita.
 *
 * NÃO é uma promessa de lucro: seis sinais, uma semana, ETH a subir e todos os sinais de COMPRA.
 * É a prova de que a distância do trailing é a peça errada, não de que a estratégia é boa.
 */
import assert from 'node:assert/strict'
import { configProviderDaLinha, decidirProvider, ESTADO_PROVIDER_NOVO, type EstadoProvider, type PosicaoProvider } from '../provider'

/** O sinal 9197117 (17/09 14:30) — o mais claro dos dois ganhadores. */
const ENTRADA = 2476.06
const SL_SINAL = 2422.38
const RISCO = ENTRADA - SL_SINAL // 53,68 pontos (o pip do ETH é 1)
const TP1 = 2636.35 // +2,99R

/** Configuração VIVA a 2026-09-24 em `mtmauto_providers.sinais_config` do Aurum Flow. */
const HOJE = {
  id: 'p-aurum', slug: 'aurum-flow', ativo: true, apagado_em: null,
  be_gatilho: 1, trailing_arranca_pips: null, trailing_distancia_pips: null, trailing_passo_pips: null, saidas_pct: null,
  sinais_config: {
    perfil: 'risco',
    beFracaoDoRisco: 0.75,
    beOffsetFracaoDoRisco: 0.05,
    trailingFracaoDoRisco: 0.5,
    trailingInicioFracaoDoRisco: 1.0,
  },
}

/**
 * A PROPOSTA — afastar as duas peças do preço, sem as desligar.
 *
 * BE aos 1,25R: os perdedores medidos picam entre 0,06R e 0,21R, por isso um BE mais tarde não
 * lhes custa nada; o que custa é o BE aos 0,75R, que transformou três trades da mestre em saídas
 * de +0,05R quando o alvo estava a 2,5R.
 *
 * Trailing só aos 2,0R e a 1,25R de distância: aos 2,0R a trade já está à porta do TP1, e a 1,25R
 * o stop deixa de estar ao alcance do recuo normal do M30. Quem chega ao alvo sai no alvo; quem
 * passa do alvo leva um stop que já protege mais de um risco de lucro.
 */
const PROPOSTA = {
  ...HOJE,
  sinais_config: {
    perfil: 'risco',
    beFracaoDoRisco: 1.25,
    beOffsetFracaoDoRisco: 0.1,
    trailingFracaoDoRisco: 1.25,
    trailingInicioFracaoDoRisco: 2.0,
  },
}

function posicao(preco: number, sl: number): PosicaoProvider {
  return { id: 'eth', symbol: 'ETHUSD', type: 'POSITION_TYPE_BUY', openPrice: ENTRADA, currentPrice: preco, stopLoss: sl, volume: 1 }
}

/**
 * Corre um caminho de preço pelo motor e devolve onde é que a posição saiu, em R.
 *
 * O stop que vale é o MAIOR entre o que a corretora tem e o que o motor já pediu — é assim que o
 * `decidirProvider` mede o ratchet, e é assim que a posição fecha na vida real. `agora` anda um
 * segundo por tick para não bater no travão de carga (`intervaloMinimoMs`).
 */
function correr(linha: Record<string, unknown>, caminho: number[]): { saidaR: number; motivo: string } {
  const cfg = configProviderDaLinha('aurum-flow', linha)
  let estado: EstadoProvider = { ...ESTADO_PROVIDER_NOVO }
  let sl = SL_SINAL
  let agora = 0
  for (const preco of caminho) {
    if (preco <= sl) return { saidaR: (sl - ENTRADA) / RISCO, motivo: 'stop' }
    if (preco >= TP1) return { saidaR: (TP1 - ENTRADA) / RISCO, motivo: 'alvo' }
    agora += 1_000
    const d = decidirProvider(posicao(preco, sl), cfg, estado, agora, preco)
    estado = d.estado
    if (d.sl != null && d.sl > sl) sl = d.sl
  }
  return { saidaR: (caminho[caminho.length - 1] - ENTRADA) / RISCO, motivo: 'fim do caminho' }
}

/** Sobe até `ateR`, recua até `voltaR`, e depois vai a direito ao alvo — o que foi medido. */
function caminhoMedido(ateR: number, voltaR: number): number[] {
  const passos: number[] = []
  const emR = (r: number) => ENTRADA + r * RISCO
  for (let r = 0.1; r <= ateR + 1e-9; r += 0.05) passos.push(emR(r))
  for (let r = ateR; r >= voltaR - 1e-9; r -= 0.05) passos.push(emR(r))
  for (let r = voltaR; r <= 3.1; r += 0.05) passos.push(emR(r))
  return passos
}

// ── o ganhador que a gestão de hoje corta ────────────────────────────────────
// Pico a 1,85R, recuo de meio risco até 1,35R, e só depois o alvo a 2,99R.
const CAMINHO = caminhoMedido(1.85, 1.35)

const hoje = correr(HOJE, CAMINHO)
assert.equal(hoje.motivo, 'stop', 'a configuração de hoje tem de sair no recuo, não no alvo')
assert.ok(
  hoje.saidaR > 1.0 && hoje.saidaR < 1.6,
  `hoje devia sair perto de +1,35R (o trailing a 0,5R do pico), saiu a ${hoje.saidaR.toFixed(2)}R`,
)
console.log(`ok  hoje  (BE 0,75R · trailing 1,0R/0,5R) → ${hoje.motivo} a +${hoje.saidaR.toFixed(2)}R`)

const proposta = correr(PROPOSTA, CAMINHO)
assert.equal(proposta.motivo, 'alvo', 'a proposta tem de aguentar o recuo e chegar ao TP1')
assert.ok(
  Math.abs(proposta.saidaR - 2.99) < 0.02,
  `a proposta devia sair no TP1 (+2,99R), saiu a ${proposta.saidaR.toFixed(2)}R`,
)
console.log(`ok  proposta (BE 1,25R · trailing 2,0R/1,25R) → ${proposta.motivo} a +${proposta.saidaR.toFixed(2)}R`)

// ── e o que a proposta CUSTA, que é a parte honesta ──────────────────────────
// Uma trade que pica a 1,45R e volta ao stop: hoje o trailing tira-a a +0,5R, a proposta só tem o
// BE aos 1,25R e tira-a a +0,1R. A proposta é PIOR aqui, e é este o preço de deixar correr.
const PICO_E_VOLTA = caminhoMedido(1.45, -1.2)

const hojePico = correr(HOJE, PICO_E_VOLTA)
const propostaPico = correr(PROPOSTA, PICO_E_VOLTA)
assert.ok(hojePico.saidaR > propostaPico.saidaR, 'neste caso a gestão de hoje é melhor — é o custo da proposta')
assert.ok(propostaPico.saidaR > 0, 'mas o BE aos 1,25R ainda apanha a trade antes do stop original')
console.log(
  `ok  pico 1,45R e volta: hoje +${hojePico.saidaR.toFixed(2)}R vs proposta +${propostaPico.saidaR.toFixed(2)}R ` +
    `(a proposta custa ${(hojePico.saidaR - propostaPico.saidaR).toFixed(2)}R neste caso)`,
)

// ── e o perdedor puro, onde as duas têm de empatar ───────────────────────────
// Pico de 0,2R e vai ao stop: nenhum BE dispara em nenhuma das duas, as duas perdem 1R inteiro.
const PERDEDOR = caminhoMedido(0.2, -1.2)
assert.equal(correr(HOJE, PERDEDOR).saidaR, -1, 'perdedor: hoje perde o risco inteiro')
assert.equal(correr(PROPOSTA, PERDEDOR).saidaR, -1, 'perdedor: a proposta perde o mesmo — não piora nada')
console.log('ok  perdedor (pico 0,2R): as duas perdem −1,00R, a proposta não piora os perdedores')

console.log('\nAurum Flow ETH: ok')

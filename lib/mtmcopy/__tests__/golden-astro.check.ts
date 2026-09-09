/**
 * GOLDEN ASTRO — os níveis nascem em PIPS, e é aí que isto se parte.
 *
 * No ouro 1 pip = 0,10 no preço. 100 pips são 10,00 — não 100 (que punha o stop a 4311 numa
 * entrada a 4411) nem 1,00 (que o punha a 10 pips da entrada e morria no primeiro spread).
 * Estes testes existem para essa confusão não passar em silêncio.
 */
import {
  planoGoldenAstro,
  direcaoGoldenAstro,
  dentroDaJanela,
  minutosEmLondres,
  GOLDENASTRO_STOP_PIPS,
  GOLDENASTRO_ALVOS_PIPS,
  GOLDENASTRO_SAIDAS,
} from '../golden-astro'

let ok = 0
let mau = 0
function eq(nome: string, a: unknown, b: unknown) {
  if (a === b) { ok++; return }
  mau++
  console.error(`✗ ${nome}\n   esperado: ${String(b)}\n   obtido:   ${String(a)}`)
}

// ── O gatilho ────────────────────────────────────────────────────────────────────────────
eq('Gold Buy', direcaoGoldenAstro('Gold Buy 📈'), 'buy')
eq('Gold sell minúsculo', direcaoGoldenAstro('Gold sell📉'), 'sell')
eq('texto da estratégia não é sinal', direcaoGoldenAstro('Fixed stop loss: 100 pips'), null)
eq('outro ativo não passa', direcaoGoldenAstro('Silver buy'), null)

// ── Os níveis de uma COMPRA a 4411 ───────────────────────────────────────────────────────
const c = planoGoldenAstro('buy', 4411)!
eq('entrada', c.entrada, 4411)
eq('stop 100 pips ABAIXO (10,00 no preço)', c.sl, 4401)
eq('TP1 +25 pips', c.tp[0], 4413.5)
eq('TP2 +50 pips', c.tp[1], 4416)
eq('TP3 +75 pips', c.tp[2], 4418.5)
eq('TP4 +100 pips', c.tp[3], 4421)
eq('TP5 +150 pips', c.tp[4], 4426)
eq('cinco alvos', c.tp.length, 5)
eq('stop a metade do risco depois do TP2', c.slAposTp2, 4406)

// ── E de uma VENDA, que é o espelho ──────────────────────────────────────────────────────
const v = planoGoldenAstro('sell', 4411)!
eq('venda: stop ACIMA', v.sl, 4421)
eq('venda: TP2 abaixo', v.tp[1], 4406)
eq('venda: stop encurtado fica acima da entrada', v.slAposTp2, 4416)

// O stop está sempre do lado certo — a rede que apanha um sinal trocado.
eq('compra: stop abaixo da entrada', c.sl < c.entrada, true)
eq('venda: stop acima da entrada', v.sl > v.entrada, true)
eq('compra: o stop encurtado aproxima-se da entrada', c.entrada - c.slAposTp2 < c.entrada - c.sl, true)

// Um setup com stop próprio manda mais do que o fixo.
eq('stop do setup manda', planoGoldenAstro('buy', 4411, { stopPips: 60 })!.sl, 4405)
eq('entrada inválida não dá plano', planoGoldenAstro('buy', 0), null)
eq('stop inválido não dá plano', planoGoldenAstro('buy', 4411, { stopPips: 0 }), null)

// ── As janelas, em hora de LONDRES ───────────────────────────────────────────────────────
// 2026-09-04 é verão (BST = UTC+1): 07:30 UTC são 08:30 em Londres, dentro da 1ª janela.
eq('verão: 07:30 UTC = 08:30 Londres', minutosEmLondres(new Date('2026-09-04T07:30:00Z')), 8 * 60 + 30)
eq('08:30 de Londres está na 1ª janela', dentroDaJanela(new Date('2026-09-04T07:30:00Z')), true)
eq('06:00 de Londres está fora', dentroDaJanela(new Date('2026-09-04T05:00:00Z')), false)
eq('limite exato 09:30 conta', dentroDaJanela(new Date('2026-09-04T08:30:00Z')), true)
eq('09:31 já não', dentroDaJanela(new Date('2026-09-04T08:31:00Z')), false)
eq('13:30 de Londres está na 2ª janela', dentroDaJanela(new Date('2026-09-04T12:30:00Z')), true)
eq('14:15 cai no intervalo entre janelas', dentroDaJanela(new Date('2026-09-04T13:15:00Z')), false)
eq('15:00 de Londres está na 3ª janela', dentroDaJanela(new Date('2026-09-04T14:00:00Z')), true)
// Inverno (GMT = UTC): a mesma hora UTC é outra hora de Londres.
eq('inverno: 08:30 UTC = 08:30 Londres', minutosEmLondres(new Date('2026-01-15T08:30:00Z')), 8 * 60 + 30)
eq('inverno: 07:30 UTC está FORA', dentroDaJanela(new Date('2026-01-15T07:30:00Z')), false)

// ── Gestão ───────────────────────────────────────────────────────────────────────────────
eq('não fecha nada no TP1', GOLDENASTRO_SAIDAS.tp1, 0)
eq('fecha metade no TP2', GOLDENASTRO_SAIDAS.tp2, 50)
eq('o resto corre com trailing', GOLDENASTRO_SAIDAS.tp3, 0)
eq('stop fixo publicado', GOLDENASTRO_STOP_PIPS, 100)
eq('alvos publicados', GOLDENASTRO_ALVOS_PIPS.join(','), '25,50,75,100,150')

// ── Falha fechada enquanto não houver conta ──────────────────────────────────────────────
import {
  GOLDENASTRO_PROVIDER_ACCOUNT_ID,
  GOLDENASTRO_PROVIDER_STRATEGY_ID,
  goldenAstroPronta,
  goldenAstroColideCom,
  SENSEI_PROVIDER_ACCOUNT_ID,
  ehContaDeMotor,
  CONTAS_MOTOR_TEMPO_REAL,
} from '../provider-constants'

eq('tem conta', GOLDENASTRO_PROVIDER_ACCOUNT_ID.length > 0, true)
// O Sensei foi reformado dessa conta a 04/09, logo a colisão desapareceu. Se alguém lhe
// devolver a conta, o guarda volta a disparar e a Golden Astro deixa de executar.
eq('já não colide com ninguém', goldenAstroColideCom(), null)
eq('e por isso pode executar', goldenAstroPronta(), true)
eq('o Sensei já não está nessa conta', SENSEI_PROVIDER_ACCOUNT_ID === GOLDENASTRO_PROVIDER_ACCOUNT_ID, false)
eq('uma conta vazia nunca é conta de motor', ehContaDeMotor(''), false)
eq('a lista do motor não tem buracos', CONTAS_MOTOR_TEMPO_REAL.every((c) => Boolean(c && c.trim())), true)
eq('a estratégia dela tem id', String(GOLDENASTRO_PROVIDER_STRATEGY_ID).length > 0, true)

console.log(`\n${ok} passaram, ${mau} falharam`)
if (mau) process.exit(1)

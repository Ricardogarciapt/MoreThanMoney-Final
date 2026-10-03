/**
 * GUARDA DO RETORNO DE UMA CARTEIRA — o caso mau que torna o defeito invisível.
 *
 * O defeito: `app/portfolios/page.tsx` media o desempenho com a MÉDIA SIMPLES das percentagens de
 * cada activo. Uma carteira com um activo pequeno muito positivo e um grande negativo dá «ganha»
 * nessa conta e «perde» na certa — e o ecrã anunciava +60,37 % numa conta que fez +39,52 %.
 *
 * Mostrar uma perda como ganho é o pior defeito possível numa página de portefólios. É por isso
 * que a fórmula vive num módulo com guarda, e não em três ecrãs.
 *
 *   npx tsx lib/portfolios/retorno.check.ts
 */
import assert from 'node:assert/strict'
import {
  pctFormatada, potencialPonderado, resultadoDaConta, resultadoDasContas, resultadoEmDinheiro,
  retornoDaCarteira,
} from './retorno'

let falhas = 0
function teste(nome: string, f: () => void) {
  try {
    f()
    console.log(`  ok  ${nome}`)
  } catch (e) {
    falhas++
    console.error(`  ✗   ${nome}\n      ${(e as Error).message}`)
  }
}

// ── O CASO MAU ──────────────────────────────────────────────────────────────────────────────
teste('CASO MAU: activo pequeno a +200 % e grande a −10 % — a média simples diz que ganha', () => {
  const carteira = [
    { symbol: 'PEQUENO', current_price: 3, total_invested: 50, current_value: 150 },
    { symbol: 'GRANDE', current_price: 90, total_invested: 5_000, current_value: 4_500 },
  ]
  // A média simples das percentagens — o que o ecrã fazia:
  const pcts = [((150 - 50) / 50) * 100, ((4_500 - 5_000) / 5_000) * 100] // +200 % e −10 %
  const mediaSimples = pcts.reduce((a, b) => a + b, 0) / pcts.length
  assert.equal(Math.round(mediaSimples), 95, 'a média simples destes dois dá +95 %')
  assert.ok(mediaSimples > 0, 'e por isso o ecrã pintava a carteira de verde')

  // O retorno verdadeiro: 5 050 investidos valem 4 650 — a carteira PERDEU 400.
  const r = retornoDaCarteira(carteira)
  assert.equal(r.investido, 5_050)
  assert.equal(r.valor, 4_650)
  assert.equal(r.resultado, -400)
  assert.equal(r.resultadoPct, -7.92)
  assert.ok(r.resultadoPct! < 0, 'o cálculo certo diz que PERDE — é este o número que se mostra')

  // O sinal tem de chegar ao ecrã: um «7,92 %» sem sinal já foi lido como ganho.
  assert.equal(pctFormatada(r.resultadoPct), '−7.92%')
  assert.equal(pctFormatada(mediaSimples), '+95.00%')
})

teste('CASO MAU: a média dos RESULTADOS DAS CONTAS esconde o mesmo erro um nível acima', () => {
  // As duas contas reais do dono, como a base as tem.
  const contas = [
    { chave: 'PORTF-CRIPTO', contribuido: 7_230, valor: 4_598 },
    { chave: 'PORTF-ETF', contribuido: 7_700, valor: 10_743 },
  ]
  const media = contas.map((c) => resultadoDaConta(c)!).reduce((a, b) => a + b, 0) / 2
  assert.equal(Math.round(media * 100) / 100, 1.56, 'a média dos dois resultados dá +1,56 %')

  const t = resultadoDasContas(contas)
  assert.equal(t.contribuido, 14_930)
  assert.equal(t.valor, 15_341)
  assert.equal(t.resultadoPct, 2.75, 'somar os dinheiros e medir UMA fracção dá +2,75 %')
  assert.notEqual(t.resultadoPct, Math.round(media * 100) / 100)
})

// ── A VERDADE DA BASE, confirmada a 01/10/2026 ──────────────────────────────────────────────
teste('as duas contas do dono dão exactamente −36,40 % e +39,52 %', () => {
  assert.equal(resultadoDaConta({ contribuido: 7_230, valor: 4_598 }), -36.4)
  assert.equal(resultadoDaConta({ contribuido: 7_700, valor: 10_743 }), 39.52)
  assert.equal(resultadoEmDinheiro({ contribuido: 7_230, valor: 4_598 }), -2_632)
  assert.equal(resultadoEmDinheiro({ contribuido: 7_700, valor: 10_743 }), 3_043)
  assert.equal(pctFormatada(resultadoDaConta({ contribuido: 7_230, valor: 4_598 })), '−36.40%')
})

// ── As bordas: nunca um número que ninguém mediu ────────────────────────────────────────────
teste('sem contribuído não há percentagem — `null`, nunca 0,00 %', () => {
  assert.equal(resultadoDaConta({ contribuido: 0, valor: 500 }), null)
  assert.equal(resultadoDaConta({ contribuido: null, valor: 500 }), null)
  assert.equal(pctFormatada(null), '—')
  assert.equal(retornoDaCarteira([]).resultadoPct, null)
  assert.equal(retornoDaCarteira(null).resultadoPct, null)
})

teste('um activo SEM cotação fica fora das duas somas, e a cobertura é declarada', () => {
  const r = retornoDaCarteira([
    { symbol: 'COM', current_price: 10, total_invested: 1_000, current_value: 1_200 },
    { symbol: 'SEM', current_price: null, total_invested: 9_000, current_value: 0 },
  ])
  // Se o «SEM» entrasse no investido e não no valor, a carteira dizia −88 % — uma perda inventada.
  assert.equal(r.investido, 1_000)
  assert.equal(r.valor, 1_200)
  assert.equal(r.resultadoPct, 20)
  assert.equal(r.comCotacao, 1)
  assert.equal(r.activos, 2, 'quem mostra o número tem de poder dizer «1 de 2 activos»')
})

teste('preço zero conta como sem cotação (é o que a API devolve quando falha)', () => {
  const r = retornoDaCarteira([{ symbol: 'X', current_price: 0, total_invested: 500, current_value: 0 }])
  assert.equal(r.comCotacao, 0)
  assert.equal(r.resultadoPct, null)
})

teste('o POTENCIAL é ponderado pelo investido — e não se inventa peso', () => {
  // Um activo de 50 $ com «+500 %» ao lado de um de 5 000 $ com «+20 %».
  const activos = [
    { symbol: 'PEQUENO', total_invested: 50, potential_growth: 500 },
    { symbol: 'GRANDE', total_invested: 5_000, potential_growth: 20 },
  ]
  const mediaSimples = (500 + 20) / 2
  assert.equal(mediaSimples, 260, 'a média simples prometia +260 %')
  assert.equal(potencialPonderado(activos), 24.75, 'ponderado pelo dinheiro posto dá +24,75 %')
  // Sem investido conhecido não há peso: antes de inventar um, não se mostra número.
  assert.equal(potencialPonderado([{ symbol: 'A', potential_growth: 300 }]), null)
  assert.equal(potencialPonderado([]), null)
})

if (falhas) {
  console.error(`\nretorno de carteira: ${falhas} falha(s).`)
  process.exit(1)
}
console.log('\nretorno de carteira OK — a média simples nunca volta a passar por desempenho')

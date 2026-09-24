/**
 * `npx tsx lib/__tests__/pips-proof-vies.check.ts`
 *
 * A NOTA DO VIÉS DE PREÇO — e, sobretudo, o dia em que ela tem de se calar.
 *
 * O que se protege aqui não é a frase (essa muda). São três coisas que, se alguém partir, ninguém
 * dá por elas até ser tarde:
 *
 *  1. a nota APARECE enquanto a amostra tiver trades abertas antes da correcção de 24/09;
 *  2. a nota DESAPARECE SOZINHA quando a amostra for toda posterior — sem interruptor, sem
 *     alguém se lembrar de a tirar. Uma ressalva que fica para sempre deixa de ser lida, e daqui
 *     a duas semanas já nem é verdade. É este o teste que o dono pediu que prendesse isto;
 *  3. a nota vai COLADA ao número, em todos os textos que saem — total, bloco e conversa de lead.
 *
 * E a fronteira é uma HORA, não um dia: a manhã de 24/09 é a parte mais viciada da amostra (foi
 * ela que se mediu) e tem de continuar a ser assinalada depois de a correcção entrar à tarde.
 */

import assert from 'node:assert/strict'
import {
  FRONTEIRA_VIES_PRECO,
  amostraAtravessaViesDePreco,
  blocoPips,
  linhaPips,
  notaViesPreco,
  provaParaLead,
  type PipsProof,
} from '@/lib/pips-proof'

const FRONTEIRA = Date.parse(FRONTEIRA_VIES_PRECO)
const DIA = 86_400_000
const iso = (ms: number) => new Date(ms).toISOString()

/** Uma prova mínima mas realista: 40 trades, fonte boa, amostra publicável. */
function prova(over: Partial<PipsProof> = {}): PipsProof {
  return {
    dias: 30,
    desdeReal: iso(FRONTEIRA - 10 * DIA),
    entradaMaisAntiga: iso(FRONTEIRA - 10 * DIA),
    executado: {
      trades: 40,
      winRatePct: 62.5,
      pips: 1240,
      pipsPorTrade: 31,
      comParciais: 12,
      ouro: { trades: 20, winRatePct: 65, pips: 900 },
      porSimbolo: [{ symbol: 'XAUUSD', trades: 20, winRatePct: 65, pips: 900 }],
      aindaAbertas: 2,
    },
    ideias: null,
    fonte: 'espelho_sim',
    loteEspelho: 0.03,
    asOf: iso(FRONTEIRA).slice(0, 10),
    ...over,
  }
}

// ── 1. A fronteira é uma HORA, não um dia ────────────────────────────────────────────────────
//
// Arredondar para a meia-noite de 24/09 daria por limpas as trades da manhã — precisamente as
// que se mediram e que mostraram +1,79 USD por trade a favor da casa.
const manha24 = prova({ entradaMaisAntiga: iso(FRONTEIRA - 4 * 3_600_000) })
assert.ok(
  amostraAtravessaViesDePreco(manha24),
  'uma trade aberta na manhã de 24/09 está do lado viciado da fronteira',
)
const tarde24 = prova({ entradaMaisAntiga: iso(FRONTEIRA + 60_000), desdeReal: iso(FRONTEIRA + 60_000) })
assert.equal(
  amostraAtravessaViesDePreco(tarde24),
  false,
  'um minuto depois da correcção já não há viés para assinalar',
)

// ── 2. Mede-se pela ENTRADA, não pelo fecho ──────────────────────────────────────────────────
//
// O defeito estava no preenchimento: no preço a que a posição ABRIU. Uma trade que abriu antes da
// correcção e fechou depois leva o viés com ela, e um fecho limpo não a redime.
const abriuAntesFechouDepois = prova({
  entradaMaisAntiga: iso(FRONTEIRA - 6 * 3_600_000),
  desdeReal: iso(FRONTEIRA + 8 * 3_600_000),
})
assert.ok(
  amostraAtravessaViesDePreco(abriuAntesFechouDepois),
  'abriu antes da correcção: conta como viciada mesmo que só feche depois',
)

// ── 3. Só a fonte que o defeito tocou ────────────────────────────────────────────────────────
//
// O viés era do preenchimento das contas MTM Funded em motor `sim`. O histórico do broker vem de
// uma conta preenchida pela corretora e o registo vem de contas reais — pôr lá a nota seria pôr
// uma ressalva onde ela não se aplica, e é assim que se ensina o leitor a saltá-la.
for (const fonte of ['broker', 'registo', 'nenhuma'] as const) {
  assert.equal(
    amostraAtravessaViesDePreco(prova({ fonte })),
    false,
    `a fonte «${fonte}» não passa pelo motor simulado — não leva nota`,
  )
}

// Sem trades não há prova nenhuma, logo também não há nota.
assert.equal(amostraAtravessaViesDePreco(prova({ executado: { ...prova().executado, trades: 0 } })), false)
assert.equal(notaViesPreco(null), null)
assert.equal(notaViesPreco(undefined), null)

// ── 4. Provas gravadas antes deste campo existir ─────────────────────────────────────────────
//
// `entradaMaisAntiga` só passou a ser gravado hoje. As provas já em base não o têm, e o fallback
// tem de errar para o lado de AVISAR: na dúvida sobre se a amostra está limpa, avisa-se.
assert.ok(
  amostraAtravessaViesDePreco(prova({ entradaMaisAntiga: null, desdeReal: iso(FRONTEIRA - DIA) })),
  'sem entrada gravada, o fecho mais antigo decide',
)
assert.ok(
  amostraAtravessaViesDePreco(
    prova({ entradaMaisAntiga: null, desdeReal: null, asOf: iso(FRONTEIRA + 5 * DIA).slice(0, 10), dias: 30 }),
  ),
  'sem datas nenhumas, uma janela de 30 dias que ainda apanha a fronteira leva nota',
)
assert.equal(
  amostraAtravessaViesDePreco(
    prova({ entradaMaisAntiga: null, desdeReal: null, asOf: iso(FRONTEIRA + 90 * DIA).slice(0, 10), dias: 30 }),
  ),
  false,
  'sem datas nenhumas, uma janela de 30 dias que já nem toca a fronteira não leva nota',
)

// ── 5. A FRASE, exactamente como vai sair ────────────────────────────────────────────────────
const nota = notaViesPreco(manha24)
assert.equal(
  nota,
  'Nota: os resultados até 24/09 podem estar inflacionados por um defeito de preço já corrigido.',
)
// A data sai da fronteira, não está escrita à mão em lado nenhum: mudar a fronteira muda o texto.
assert.ok(nota!.includes('24/09'), 'a data vem da fronteira')

// ── 6. A nota CHEGA aos textos que saem ──────────────────────────────────────────────────────
//
// De nada serve calculá-la se o total, o bloco publicado e a conversa com o lead a deixarem de
// fora. Quem cita a linha tem de levar a ressalva com ela.
assert.ok(linhaPips(manha24).includes(nota!), 'o total leva a nota')
assert.ok(linhaPips(manha24, { comExemplos: false }).includes(nota!), 'o total sem exemplos também')
assert.ok(blocoPips(manha24).includes(nota!), 'o bloco publicado leva a nota')
assert.ok(provaParaLead(manha24)!.includes(nota!), 'a prova dita a um lead leva a nota')

// ── 7. O QUE INTERESSA: a nota cala-se sozinha ───────────────────────────────────────────────
//
// Não há interruptor nem data em template. À medida que a janela de 30 dias anda para a frente,
// a trade mais antiga deixa de ser anterior à correcção e a nota apaga-se por si. Isto é o teste
// que impede que uma ressalva de duas semanas se transforme em mobília permanente.
for (const diasDepois of [1, 3, 14, 30, 365]) {
  const futuro = prova({
    entradaMaisAntiga: iso(FRONTEIRA + diasDepois * DIA),
    desdeReal: iso(FRONTEIRA + diasDepois * DIA),
    asOf: iso(FRONTEIRA + (diasDepois + 1) * DIA).slice(0, 10),
  })
  assert.equal(notaViesPreco(futuro), null, `+${diasDepois} dias: a amostra já é toda limpa`)
  assert.ok(!linhaPips(futuro).includes('defeito de preço'), `+${diasDepois} dias: o total não repete a ressalva`)
  assert.ok(!blocoPips(futuro).includes('defeito de preço'), `+${diasDepois} dias: o bloco não repete a ressalva`)
  assert.ok(
    !provaParaLead(futuro)!.includes('defeito de preço'),
    `+${diasDepois} dias: o bot de leads não repete a ressalva`,
  )
}

// E o total continua a dizer o que sempre disse — a nota some-se, os números ficam.
assert.ok(linhaPips(prova({ entradaMaisAntiga: iso(FRONTEIRA + 60 * DIA) })).includes('40 trades executadas'))

// ── 8. A nota não substitui a ressalva legal ─────────────────────────────────────────────────
//
// São coisas diferentes: uma é o risco de sempre, a outra é um defeito datado. O dia em que
// alguém trocar uma pela outra, isto falha.
assert.ok(blocoPips(manha24).includes('Resultados passados não garantem resultados futuros'))

console.log('pips-proof-vies: ok')
